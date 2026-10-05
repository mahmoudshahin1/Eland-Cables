import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { InquiryHeaderForm } from './InquiryHeaderForm';
import type { CommercialInquiryDto } from '../../services/commercialInquiryApiService';
import { buildHeaderFormFromInquiry } from '../../services/inquiryHeaderFormService';
import { INQUIRY_HEADER_FIELDS } from '../../services/inquiryFieldManifest';
import { uniqueIncotermsFromCombinations } from '../../domain/customerDeliveryCombination';
import { ICC_INCOTERMS_2020 } from '../../domain/globalIncotermMaster';

const inquiry = {
  id: 'inq-1',
  inquiryNumber: 'INQ26-03447',
  customerId: 'C-ELAND',
  customerName: 'ELAND Cables',
  inquiryDate: '2026-09-01',
  currency: 'USD',
  status: 'DRAFT',
  incoterms: 'FOB',
  lines: [],
} as CommercialInquiryDto;

describe('InquiryHeaderForm delivery masters', () => {
  it('populates Incoterm from the global master and does not restrict to Eland combinations', () => {
    const elandCombinations = [
      {
        countryCode: 'UK',
        countryLabel: 'UK',
        incotermCode: 'DAP',
        destinationPortCode: 'DONCASTER',
        destinationPortName: 'DONCASTER',
      },
      {
        countryCode: 'NL',
        countryLabel: 'NETHERLANDS',
        incotermCode: 'CIF',
        destinationPortCode: 'ROTTERDAM',
        destinationPortName: 'ROTTERDAM',
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(InquiryHeaderForm, {
        form: buildHeaderFormFromInquiry(inquiry),
        inquiry,
        visibleFields: INQUIRY_HEADER_FIELDS,
        isEditable: true,
        isCustomer: false,
        onChange: () => undefined,
        incotermMasters: [
          { code: 'CIF', name: 'CIF' },
          { code: 'DAP', name: 'DAP' },
          { code: 'FOB', name: 'FOB' },
        ],
        deliveryCombinations: elandCombinations,
      })
    );
    assert.match(html, /Select Incoterm/);
    assert.match(html, /value="FOB"/);
    assert.match(html, /value="DAP"/);
    assert.match(html, /value="CIF"/);
    assert.doesNotMatch(html, /approved Eland delivery options/);
    assert.equal(uniqueIncotermsFromCombinations(elandCombinations).some((row) => row.code === 'FOB'), false);
    assert.match(html, /DONCASTER/);
    assert.match(html, /ROTTERDAM/);
    assert.match(html, /Select approved delivery option/);
  });

  it('does not invent FOB when it is absent from the approved Incoterm Master', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryHeaderForm, {
        form: buildHeaderFormFromInquiry({ ...inquiry, incoterms: 'DAP' }),
        inquiry: { ...inquiry, incoterms: 'DAP' },
        visibleFields: INQUIRY_HEADER_FIELDS,
        isEditable: true,
        isCustomer: false,
        onChange: () => undefined,
        incotermMasters: [
          { code: 'CIF', name: 'CIF' },
          { code: 'DAP', name: 'DAP' },
        ],
      })
    );
    assert.match(html, /value="DAP"/);
    assert.match(html, /value="CIF"/);
    assert.doesNotMatch(html, /<option value="FOB">/);
  });

  it('renders Select plus all 11 ICC Incoterms from the global master', () => {
    const html = renderToStaticMarkup(
      React.createElement(InquiryHeaderForm, {
        form: buildHeaderFormFromInquiry({ ...inquiry, incoterms: 'CIF' }),
        inquiry: { ...inquiry, incoterms: 'CIF' },
        visibleFields: INQUIRY_HEADER_FIELDS,
        isEditable: true,
        isCustomer: false,
        onChange: () => undefined,
        incotermMasters: ICC_INCOTERMS_2020.map((row) => ({ code: row.code, name: row.name, active: true })),
      })
    );
    assert.match(html, /Select Incoterm/);
    for (const code of ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']) {
      assert.match(html, new RegExp(`value="${code}"`));
    }
  });

  it('hides exchange-rate fields on the customer header and uses the four reference cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(InquiryHeaderForm, {
          form: buildHeaderFormFromInquiry(inquiry),
          inquiry,
          visibleFields: INQUIRY_HEADER_FIELDS,
          isEditable: true,
          isCustomer: true,
          onChange: () => undefined,
          incotermMasters: [{ code: 'CIF', name: 'CIF' }],
          customerProfile: {
            customerCode: 'ELD-001',
            companyName: 'ELAND Cables',
            email: 'david.smith@elandcables.com',
            phone: '+20 10 1234 5678',
          },
        })
      )
    );
    assert.match(html, /Customer Information/);
    assert.match(html, /Project &amp; Inquiry Information/);
    assert.match(html, /Pricing &amp; Currency/);
    assert.match(html, /Delivery &amp; Commercial/);
    assert.match(html, /Copper Price \(MT\)/);
    assert.match(html, /Aluminum Price \(MT\)/);
    assert.doesNotMatch(html, />Exchange Rate</);
    assert.doesNotMatch(html, /Raw Material Exchange Rate/);
    assert.match(html, /ELAND Cables/);
  });

  it('shows scoped Customer Master name instead of a leftover inquiry customerName', () => {
    const leftover = {
      ...inquiry,
      customerName: 'Cable selection recovery',
    } as CommercialInquiryDto;
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(InquiryHeaderForm, {
          form: buildHeaderFormFromInquiry(leftover),
          inquiry: leftover,
          visibleFields: INQUIRY_HEADER_FIELDS,
          isEditable: true,
          isCustomer: true,
          onChange: () => undefined,
          incotermMasters: [{ code: 'CIF', name: 'CIF' }],
          customerProfile: {
            customerCode: 'C-ELAND',
            companyName: 'ELAND Cables',
            email: 'david.smith@elandcables.com',
          },
        })
      )
    );
    assert.match(html, /ELAND Cables/);
    assert.doesNotMatch(html, /Cable selection recovery/);
  });

  it('does not pre-select Rotterdam when destination is unsaved Alexandria', () => {
    const elandCombinations = [
      {
        countryCode: 'UK',
        countryLabel: 'UK',
        incotermCode: 'DAP',
        destinationPortCode: 'DONCASTER',
        destinationPortName: 'DONCASTER',
        isDefault: false,
      },
      {
        countryCode: 'NL',
        countryLabel: 'NETHERLANDS',
        incotermCode: 'CIF',
        destinationPortCode: 'ROTTERDAM',
        destinationPortName: 'ROTTERDAM',
        isDefault: false,
      },
    ];
    const html = renderToStaticMarkup(
      React.createElement(InquiryHeaderForm, {
        form: buildHeaderFormFromInquiry({
          ...inquiry,
          incoterms: 'CIF',
          commercialMetadata: { deliveryDestination: 'Alexandria' },
        }),
        inquiry: { ...inquiry, incoterms: 'CIF', commercialMetadata: { deliveryDestination: 'Alexandria' } },
        visibleFields: INQUIRY_HEADER_FIELDS,
        isEditable: true,
        isCustomer: false,
        onChange: () => undefined,
        incotermMasters: [
          { code: 'CIF', name: 'CIF' },
          { code: 'DAP', name: 'DAP' },
        ],
        deliveryCombinations: elandCombinations,
      })
    );
    assert.match(html, /Select approved delivery option/);
    assert.match(html, /value="NL\|CIF\|ROTTERDAM"/);
    assert.doesNotMatch(html, /value="NL\|CIF\|ROTTERDAM"[^>]*selected/);
    assert.match(html, /option value="" selected="">Select approved delivery option/);
  });
});
