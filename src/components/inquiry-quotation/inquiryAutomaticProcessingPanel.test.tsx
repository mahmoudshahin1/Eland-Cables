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

  it('hides the processing card from customers after a completed calculation', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryAutomaticProcessingPanel, {
        result: completed,
        customerSafe: true,
      })
    );
    assert.equal(html, '');
    assert.equal(htmlContainsCustomerCostingLeak(html), false);
  });

  it('shows the failed engineering stage and reason', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryAutomaticProcessingPanel, { result: blocked, customerSafe: true })
    );
    assert.match(html, /Configuration snapshot is missing/);
    assert.doesNotMatch(html, /QT-26-00001/);
  });

  it('keeps engineering moving and marks pricing incomplete when a metal price is missing', () => {
    const pending: VipCalculateResultDto = {
      ...blocked,
      status: 'PARTIAL',
      blockingReasons: [],
      gates: [
        {
          gate: 'HEADER_COMMERCIAL_CONFIG',
          status: 'WARN',
          message: 'Copper Price is missing for 2026-11-08. Pricing stays incomplete until a published cash ask is available.',
          code: 'COPPER_PRICE_REQUIRED',
        },
        {
          gate: 'CONFIGURATION_SNAPSHOT',
          status: 'PASS',
          message: 'Line 1: approved catalog cable.',
        },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(InquiryAutomaticProcessingPanel, { result: pending, customerSafe: true })
    );
    assert.match(html, /Cable configuration, cutting plan, and drum plan were validated/);
    assert.match(html, /Copper Price is missing for 2026-11-08/);
    assert.match(html, /Pricing is incomplete/);
    assert.match(html, /Waiting for the missing metal price/);
    assert.doesNotMatch(html, /Header commercial config incomplete/);
    assert.doesNotMatch(html, /125000/);
    assert.doesNotMatch(html, /Costing could not complete/);
  });

  it('shows a metal-price warning when the result only carries the warning text', () => {
    const pending: VipCalculateResultDto = {
      ...blocked,
      status: 'PARTIAL',
      blockingReasons: [
        'Copper Price is missing for 2026-11-08. Pricing stays incomplete until a published cash ask is available.',
      ],
      gates: [],
    };
    const html = renderToStaticMarkup(
      React.createElement(InquiryAutomaticProcessingPanel, { result: pending, customerSafe: true })
    );
    assert.match(html, /Copper Price is missing for 2026-11-08/);
    assert.match(html, /Pricing is incomplete/);
    assert.doesNotMatch(html, /Costing could not complete/);
    assert.doesNotMatch(html, /Commercial calculation is incomplete/);
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
