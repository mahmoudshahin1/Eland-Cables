import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InquiryAutomaticProcessingPanel } from './InquiryAutomaticProcessingPanel';
import type { VipCalculateResultDto } from '../../services/v2InquiryConfigurationApiService';
import { htmlContainsCustomerCostingLeak } from '../v2/customer/v2CustomerInquiryPresentation';

const completed: VipCalculateResultDto = {
  status: 'COMPLETED',
  inquiryId: 'inq-1',
  inquiryNumber: 'INQ-1',
  gates: [],
  blockingReasons: [],
  optionalComponents: [],
  optionalWarnings: [],
  lines: [],
  quotation: {
    id: 'q-1',
    quotationNumber: 'QT-26-00001',
    versionNo: 1,
    status: 'OPEN',
    created: true,
  },
  financialOffer: {
    id: 'fo-1',
    inquiryTotal: '125000',
    created: true,
  },
  decision5Status: 'OPEN',
  idempotent: false,
};

const blocked: VipCalculateResultDto = {
  ...completed,
  status: 'BLOCKED',
  blockingReasons: ['Configuration snapshot is missing.'],
  quotation: null,
  financialOffer: null,
};

const offerBlocked: VipCalculateResultDto = {
  ...completed,
  status: 'QUOTATION_BLOCKED',
  blockingReasons: ['Financial offer requires a current unissued quotation (DRAFT or OPEN) hosting CommercialPricingSnapshot rows.'],
  quotation: {
    id: 'q-hidden',
    quotationNumber: 'QT-26-HIDDEN',
    versionNo: 1,
    status: 'OPEN',
    created: true,
  },
  financialOffer: null,
};

describe('InquiryAutomaticProcessingPanel', () => {
  it('renders completed stages from backend result without fake delays', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryAutomaticProcessingPanel, { result: completed })
    );
    assert.match(html, /Processing inquiry/);
    assert.match(html, /Engineering validation/);
    assert.match(html, /Cost calculation/);
    assert.match(html, /Pricing/);
    assert.match(html, /Financial offer/);
    assert.match(html, /QT-26-00001/);
  });

  it('uses customer-safe labels without costing leakage', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryAutomaticProcessingPanel, {
        result: completed,
        customerSafe: true,
      })
    );
    assert.match(html, /Commercial calculation/);
    assert.doesNotMatch(html, /Cost calculation/);
    assert.equal(htmlContainsCustomerCostingLeak(html), false);
  });

  it('shows the failed engineering stage and reason', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryAutomaticProcessingPanel, { result: blocked, customerSafe: true })
    );
    assert.match(html, /Configuration snapshot is missing/);
    assert.doesNotMatch(html, /QT-26-00001/);
  });

  it('does not present quotation success when the financial offer snapshot is missing', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryAutomaticProcessingPanel, {
        result: offerBlocked,
        onViewQuotation: () => undefined,
      })
    );
    assert.match(html, /financial offer snapshot was not created/i);
    assert.doesNotMatch(html, /QT-26-HIDDEN/);
    assert.doesNotMatch(html, /View quotation/);
  });
});
