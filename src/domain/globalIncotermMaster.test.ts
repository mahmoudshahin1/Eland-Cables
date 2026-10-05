import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  canonicalizeIncotermCode,
  defaultNewInquiryIncoterm,
  ICC_INCOTERM_CODES_2020,
  ICC_INCOTERMS_2020,
  inquiryIncotermForDownstream,
  matchIncotermMaster,
  resolveCurrentInquiryIncotermCode,
  selectableGlobalIncoterms,
} from './globalIncotermMaster';
import {
  buildApprovedMasterSelectState,
  expandPhysicalDrumsFromPlanLines,
  presentCurrentInquiryIncoterm,
} from './inquiryContainerStudyPresentation';
import { mergeInquiryHeaderIntoCommercialMetadata } from '../services/costingRequestService';
import { buildCommercialOfferSnapshot, buildInquiryHeaderSnapshot } from './v2QuotationService';
import { normalizeResolveInput } from './shippingCostResolver';

const GLOBAL_MASTER = [
  { code: 'CIF', name: 'CIF', active: true },
  { code: 'DAP', name: 'DAP', active: true },
  { code: 'FOB', name: 'FOB', active: true },
  { code: 'EXW', name: 'Ex Works', active: false },
];

describe('global Incoterm Master', () => {
  it('1. inquiry Incoterm lookup comes from the global Incoterm Master', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'CIF',
      incotermMaster: GLOBAL_MASTER,
    });
    assert.equal(presented.incotermCode, 'CIF');
    assert.equal(matchIncotermMaster('CIF', GLOBAL_MASTER)?.code, 'CIF');
  });

  it('2. all active global Incoterms are available for new selection', () => {
    const selectable = selectableGlobalIncoterms(GLOBAL_MASTER).map((row) => row.code);
    assert.deepEqual(selectable.sort(), ['CIF', 'DAP', 'FOB']);
    const dropdown = buildApprovedMasterSelectState({ currentValue: '', records: GLOBAL_MASTER });
    assert.deepEqual(dropdown.options.map((opt) => opt.value).sort(), ['CIF', 'DAP', 'FOB']);
  });

  it('3. inactive Incoterms cannot be selected for a new inquiry', () => {
    const dropdown = buildApprovedMasterSelectState({ currentValue: '', records: GLOBAL_MASTER });
    assert.equal(dropdown.options.some((opt) => opt.value === 'EXW'), false);
    assert.equal(matchIncotermMaster('EXW', GLOBAL_MASTER), null);
  });

  it('4. existing inquiry value remains readable if its Incoterm becomes inactive', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'EXW',
      incotermMaster: GLOBAL_MASTER,
    });
    assert.equal(presented.incotermCode, 'EXW');
    assert.equal(presented.label, 'EXW');
    assert.equal(presented.configured, true);
    const dropdown = buildApprovedMasterSelectState({ currentValue: 'EXW', records: GLOBAL_MASTER });
    assert.equal(dropdown.selectedCode, 'EXW');
    assert.equal(dropdown.configured, true);
  });

  it('5. inquiry CIF → Container Study CIF', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'CIF',
      shipmentGroupIncoterm: 'DAP',
      incotermMaster: GLOBAL_MASTER,
    });
    assert.equal(presented.label, 'CIF');
    assert.equal(presented.incotermCode, 'CIF');
  });

  it('6. inquiry DAP → Container Study DAP', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'DAP',
      shipmentGroupIncoterm: 'CIF',
      incotermMaster: GLOBAL_MASTER,
    });
    assert.equal(presented.incotermCode, 'DAP');
  });

  it('7. inquiry FOB → Container Study FOB when FOB exists on the master', () => {
    const presented = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'FOB',
      shipmentGroupIncoterm: 'DAP',
      incotermMaster: GLOBAL_MASTER,
    });
    assert.equal(presented.incotermCode, 'FOB');
    const withoutFob = presentCurrentInquiryIncoterm({
      inquiryIncoterms: 'FOB',
      incotermMaster: GLOBAL_MASTER.filter((row) => row.code !== 'FOB'),
    });
    assert.equal(withoutFob.incotermCode, null);
    assert.match(withoutFob.label, /FOB/);
  });

  it('8. customer preference does not override an explicit inquiry selection', () => {
    assert.equal(
      resolveCurrentInquiryIncotermCode({
        inquiryIncoterms: 'CIF',
        customerPreferenceIncoterm: 'DAP',
        defaultIncoterm: 'DAP',
      }),
      'CIF'
    );
    assert.equal(
      defaultNewInquiryIncoterm({
        explicitIncoterm: 'CIF',
        customerPreferenceIncoterm: 'DAP',
        activeMaster: GLOBAL_MASTER,
      }),
      'CIF'
    );
  });

  it('9. no hardcoded DAP fallback', () => {
    assert.equal(resolveCurrentInquiryIncotermCode({ defaultIncoterm: 'DAP' }), null);
    assert.equal(
      defaultNewInquiryIncoterm({
        customerPreferenceIncoterm: 'FOB',
        activeMaster: GLOBAL_MASTER.filter((row) => row.code !== 'FOB'),
      }),
      null
    );
    assert.equal(canonicalizeIncotermCode('DAP'), 'DAP');
  });

  it('10. no localStorage Incoterm override', () => {
    assert.equal(
      resolveCurrentInquiryIncotermCode({
        inquiryIncoterms: 'CIF',
        localStorageIncoterm: 'DAP',
      }),
      'CIF'
    );
  });

  it('11. pricing reads inquiry Incoterm', () => {
    const meta = mergeInquiryHeaderIntoCommercialMetadata({
      incoterms: 'CIF',
      commercialMetadata: { incoterms: 'DAP' },
    });
    assert.equal(meta?.incoterms, 'CIF');
    assert.equal(inquiryIncotermForDownstream('CIF'), 'CIF');
  });

  it('12. logistics / shipping cost reads inquiry Incoterm', () => {
    const resolved = normalizeResolveInput({
      destinationPortCode: 'ROTTERDAM',
      incotermCode: inquiryIncotermForDownstream('CIF'),
      containerTypeCode: '40HQ',
      asOfDate: '2026-09-13',
    });
    assert.equal(resolved.incotermCode, 'CIF');
  });

  it('13. commercial offer reads inquiry Incoterm', () => {
    const offer = buildCommercialOfferSnapshot({
      quotationNumber: 'Q-1',
      versionNo: 1,
      currency: 'USD',
      incoterms: inquiryIncotermForDownstream('CIF'),
      lines: [],
    });
    assert.equal(offer.incoterms, 'CIF');
  });

  it('14. historical quotation snapshot remains unchanged after master edit', () => {
    const snapshot = Object.freeze(
      buildInquiryHeaderSnapshot({
        inquiryNumber: 'INQ-1',
        versionNo: 1,
        currency: 'USD',
        incoterms: 'CIF',
      })
    );
    const masterAfterEdit = GLOBAL_MASTER.map((row) =>
      row.code === 'CIF' ? { ...row, name: 'Renamed CIF' } : row
    );
    assert.equal(snapshot.incoterms, 'CIF');
    assert.equal(matchIncotermMaster('CIF', masterAfterEdit)?.name, 'Renamed CIF');
    assert.equal(snapshot.incoterms, 'CIF');
  });

  it('15. physical container calculation does not change merely because Incoterm changes', () => {
    const lines = [
      {
        id: 'l1',
        drumPlanId: 'p1',
        inquiryLineId: 'line-1',
        drumCode: 'EWD900-0',
        numberOfDrums: 2,
        cuttingLengthM: 500,
        grossLoadedDrumWeightKg: 1200,
      },
    ];
    const cif = expandPhysicalDrumsFromPlanLines(lines);
    const dap = expandPhysicalDrumsFromPlanLines(lines);
    assert.equal(cif.length, 2);
    assert.deepEqual(
      cif.map((row) => row.physicalDrumKey),
      dap.map((row) => row.physicalDrumKey)
    );
  });

  it('16. no duplicate Incoterm master is created', () => {
    const schema = readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const matches = schema.match(/^model Incoterm \{/gm);
    assert.equal(matches?.length, 1);
    assert.equal(schema.includes('model InquiryIncoterm'), false);
    assert.equal(schema.includes('model ContainerStudyIncoterm'), false);
  });

  it('17. ICC Incoterms 2020 catalog is exactly the official 11 codes', () => {
    assert.equal(ICC_INCOTERMS_2020.length, 11);
    assert.deepEqual(
      [...ICC_INCOTERM_CODES_2020],
      ['EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP', 'FAS', 'FOB', 'CFR', 'CIF']
    );
    assert.equal(new Set(ICC_INCOTERM_CODES_2020).size, 11);
    assert.equal(ICC_INCOTERMS_2020.every((row) => row.active === true), true);
  });
});
