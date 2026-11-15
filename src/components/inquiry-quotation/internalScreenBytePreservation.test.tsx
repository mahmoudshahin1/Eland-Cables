import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext';
import { InquiryHeaderForm } from './InquiryHeaderForm';
import type { CommercialInquiryDto } from '../../services/commercialInquiryApiService';
import { buildHeaderFormFromInquiry } from '../../services/inquiryHeaderFormService';
import { INQUIRY_HEADER_FIELDS } from '../../services/inquiryFieldManifest';
import { ICC_INCOTERMS_2020 } from '../../domain/globalIncotermMaster';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sampleInquiry = {
  id: 'inq-internal-1',
  inquiryNumber: 'INQ26-99999',
  customerId: 'C-ELAND',
  customerName: 'ELAND Cables Internal',
  inquiryDate: '2026-10-01',
  currency: 'USD',
  status: 'DRAFT',
  incoterms: 'FOB',
  lines: [],
} as CommercialInquiryDto;

function renderInternalHeader() {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(
        AuthProvider,
        null,
        React.createElement(InquiryHeaderForm, {
          form: buildHeaderFormFromInquiry(sampleInquiry),
          inquiry: sampleInquiry,
          visibleFields: INQUIRY_HEADER_FIELDS,
          isEditable: true,
          isCustomer: false,
          onChange: () => undefined,
          incotermMasters: ICC_INCOTERMS_2020.map((row) => ({ code: row.code, name: row.name, active: true })),
        })
      )
    )
  );
}

describe('Internal Screen Preservation Proof', () => {
  const snapshotPath = path.join(__dirname, 'internal_header_baseline.snap.html');

  it('renders internal staff header identically without customer portal styles leaking', () => {
    const internalHtml = renderInternalHeader();

    if (!fs.existsSync(snapshotPath)) {
      fs.writeFileSync(snapshotPath, internalHtml, 'utf8');
    }

    const baselineHtml = fs.readFileSync(snapshotPath, 'utf8');
    assert.equal(internalHtml, baselineHtml, 'Internal staff header markup MUST be byte-for-byte identical to baseline!');
  });
});
