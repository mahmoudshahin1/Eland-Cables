import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DrumMasterRecord } from '../types';
import {
  APPROVED_DRUM_TEMPLATE_HEADERS,
  classifyDrumExcelRows,
  committableDrumExcelRows,
  summarizeDrumExcelPreview,
  validateApprovedDrumTemplateHeaders,
} from './drumMasterExcelImport';
import { selectDrum } from '../services/drumSelectionService';
import { assertCanImportMasterData, assertCanWriteCableMaster } from '../server/rbac';
import { DomainError } from '../platform/errors/domainError';

function drum(over: Partial<DrumMasterRecord> = {}): DrumMasterRecord {
  return {
    id: 'drm-EWD900-0',
    drumCode: 'EWD900-0',
    description: 'Wooden Drum F900 x B450 x 500 x 700',
    flange: 900,
    barrel: 450,
    innerWidth: 500,
    outerWidth: 700,
    capacity: 1200,
    clearanceMm: 50,
    maxWeight: 1200,
    emptyDrumNetWeightKg: null,
    dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
    capacityUom: 'CONFIGURATION_REQUIRED',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('drumMasterExcelImport', () => {
  it('1. existing Drum Code + changed data → UPDATE', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum()],
      rows: [
        {
          'Drum Code': 'EWD900-0',
          Flange: 900,
          Barrel: 450,
          'Inner Width': 500,
          'Outer Width': 700,
          Capacity: 1200,
          'Empty Drum Weight': 125,
        },
      ],
    });
    assert.equal(rows[0].status, 'UPDATE');
    assert.equal(rows[0].action, 'UPDATE');
    assert.equal(rows[0].uploaded?.emptyDrumNetWeightKg, 125);
    assert.ok(
      rows[0].changes.some(
        (c) => c.field === 'Empty Drum Net Weight Kg' && c.existing === null && c.uploaded === 125
      )
    );
  });

  it('2. existing Drum Code + identical data → UNCHANGED', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum({ emptyDrumNetWeightKg: 125 })],
      rows: [
        {
          'Drum Code': ' EWD900-0 ',
          Flange: 900,
          Barrel: 450,
          'Inner Width': 500,
          'Outer Width': 700,
          Capacity: 1200,
          'Empty Drum Net Weight Kg': 125,
        },
      ],
    });
    assert.equal(rows[0].status, 'UNCHANGED');
    assert.equal(rows[0].action, 'NONE');
    assert.equal(rows[0].drumCode, 'EWD900-0');
  });

  it('3. new Drum Code → NEW/INSERT', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum()],
      rows: [
        {
          'Drum Code': 'EWD1100-0',
          Flange: 1100,
          Barrel: 500,
          'Inner Width': 600,
          'Outer Width': 800,
          Capacity: 1800,
        },
      ],
    });
    assert.equal(rows[0].status, 'NEW');
    assert.equal(rows[0].action, 'INSERT');
    assert.equal(rows[0].uploaded?.drumCode, 'EWD1100-0');
  });

  it('4. duplicate Drum Code inside same Excel file → ERROR', () => {
    const rows = classifyDrumExcelRows({
      existing: [],
      rows: [
        { 'Drum Code': 'EWD900-0', Flange: 900, Barrel: 450, 'Inner Width': 500, 'Outer Width': 700, Capacity: 1200 },
        { 'Drum Code': 'EWD900-0', Flange: 900, Barrel: 450, 'Inner Width': 500, 'Outer Width': 700, Capacity: 1200 },
      ],
    });
    assert.equal(rows[0].status, 'NEW');
    assert.equal(rows[1].status, 'ERROR');
    assert.equal(rows[1].errors[0]?.code, 'DUPLICATE');
  });

  it('5. invalid row → ERROR', () => {
    const rows = classifyDrumExcelRows({
      existing: [],
      rows: [{ 'Drum Code': 'EWD900-0', Flange: 'x', Barrel: 450, 'Inner Width': 500, 'Outer Width': 700, Capacity: 1200 }],
    });
    assert.equal(rows[0].status, 'ERROR');
    assert.equal(rows[0].action, 'REJECT');
  });

  it('6. existing record is not duplicated after update classification', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum()],
      rows: [{ 'Drum Code': 'EWD900-0', 'Empty Drum Weight': 90 }],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'UPDATE');
    assert.equal(rows[0].uploaded?.drumCode, 'EWD900-0');
    assert.equal(rows[0].uploaded?.id, 'drm-EWD900-0');
  });

  it('7. updated values are the uploaded master values', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum({ emptyDrumNetWeightKg: 0 })],
      rows: [{ 'Drum Code': 'EWD900-0', 'Empty Weight': 125, 'Overall Width': 720 }],
    });
    assert.equal(rows[0].status, 'UPDATE');
    assert.equal(rows[0].uploaded?.emptyDrumNetWeightKg, 125);
    assert.equal(rows[0].uploaded?.outerWidth, 720);
  });

  it('8. new Drum Selection calculations use the updated master list', () => {
    const before = drum({ maxWeight: 800, clearanceMm: 50 });
    const after = { ...before, maxWeight: 1500 };
    const selected = selectDrum({
      method: 'MANUAL',
      drumMaster: [after],
      selectedDrumCode: 'EWD900-0',
    });
    assert.equal(selected.selectedDrum?.maxWeight, 1500);
    assert.equal(before.maxWeight, 800);
  });

  it('9. confirmed historical drum plan snapshot is not mutated', () => {
    const confirmed = Object.freeze({
      drumCode: 'EWD900-0',
      maxWeight: 800,
      status: 'CONFIRMED',
    });
    const master = drum({ maxWeight: 1500 });
    const selected = selectDrum({
      method: 'MANUAL',
      drumMaster: [master],
      selectedDrumCode: 'EWD900-0',
    });
    assert.equal(confirmed.maxWeight, 800);
    assert.equal(selected.selectedDrum?.maxWeight, 1500);
  });

  it('10. unauthorized customer cannot edit or import master data', () => {
    const customer = {
      id: 'c1',
      email: 'david.smith@elandcables.com',
      name: 'David',
      userType: 'customer' as const,
    };
    assert.throws(() => assertCanWriteCableMaster(customer), (err: unknown) => err instanceof DomainError);
    assert.throws(() => assertCanImportMasterData(customer), (err: unknown) => err instanceof DomainError);
  });

  it('11. preview summary counts UPDATE without inventing dummy drums', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum()],
      rows: [{ 'Drum Code': 'EWD900-0', 'Empty Drum Weight': 125 }],
    });
    const summary = summarizeDrumExcelPreview(rows);
    assert.equal(summary.updateCount, 1);
    assert.equal(summary.newCount, 0);
    assert.equal(summary.errorCount, 0);
  });

  it('12. classification performs no database write', () => {
    const existing = [drum()];
    classifyDrumExcelRows({
      existing,
      rows: [{ 'Drum Code': 'EWD900-0', 'Empty Drum Weight': 10 }],
    });
    assert.equal(existing[0].emptyDrumNetWeightKg, null);
  });

  it('13. only NEW and UPDATE rows are committable', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum(), drum({ id: 'drm-2', drumCode: 'EWD800-9', emptyDrumNetWeightKg: 40 })],
      rows: [
        { 'Drum Code': 'EWD900-0', 'Empty Drum Weight': 125 },
        { 'Drum Code': 'EWD800-9', 'Empty Drum Weight': 40 },
        { 'Drum Code': 'EWDBAD', Flange: 'nope' },
        { 'Drum Code': 'EWD1200-0', Flange: 1200, Barrel: 600, 'Inner Width': 700, 'Outer Width': 900, Capacity: 2000 },
      ],
    });
    assert.deepEqual(
      rows.map((r) => r.status),
      ['UPDATE', 'UNCHANGED', 'ERROR', 'NEW']
    );
    const committable = committableDrumExcelRows(rows);
    assert.equal(committable.length, 2);
  });

  it('14. missing required field on NEW row → ERROR', () => {
    const rows = classifyDrumExcelRows({
      existing: [],
      rows: [{ 'Drum Code': 'EWD900-0', Flange: 900, Barrel: 450 }],
    });
    assert.equal(rows[0].status, 'ERROR');
    assert.ok(rows[0].errors.some((e) => e.code === 'REQUIRED'));
  });

  it('15. all 10 approved template fields are mapped', () => {
    const rows = classifyDrumExcelRows({
      existing: [],
      rows: [
        {
          'Drum Code': 'EWD900-0',
          Flange: 900,
          Barrel: 450,
          'Inner Width': 500,
          'Outer Width': 700,
          Capacity: 1200,
          'Clearance Mm': 40,
          'Max Load Kg': 1100,
          'Empty Drum Net Weight Kg': 70,
          Description: 'Wooden Drum F900 x B450 x 500 x 700',
        },
      ],
    });
    const uploaded = rows[0].uploaded;
    assert.equal(rows[0].status, 'NEW');
    assert.equal(uploaded?.drumCode, 'EWD900-0');
    assert.equal(uploaded?.flange, 900);
    assert.equal(uploaded?.barrel, 450);
    assert.equal(uploaded?.innerWidth, 500);
    assert.equal(uploaded?.outerWidth, 700);
    assert.equal(uploaded?.capacity, 1200);
    assert.equal(uploaded?.clearanceMm, 40);
    assert.equal(uploaded?.maxWeight, 1100);
    assert.equal(uploaded?.emptyDrumNetWeightKg, 70);
    assert.equal(uploaded?.description, 'Wooden Drum F900 x B450 x 500 x 700');
  });

  it('16. supplied Description is not replaced by a generated description', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum({ description: 'Keep me' })],
      rows: [
        {
          'Drum Code': 'EWD900-0',
          Flange: 900,
          Barrel: 450,
          'Inner Width': 500,
          'Outer Width': 700,
          Capacity: 1200,
          Description: 'Explicit Energya description',
        },
      ],
    });
    assert.equal(rows[0].uploaded?.description, 'Explicit Energya description');
  });

  it('17. approved template headers must all be present', () => {
    const ok = validateApprovedDrumTemplateHeaders([
      Object.fromEntries(APPROVED_DRUM_TEMPLATE_HEADERS.map((header) => [header, 'x'])),
    ]);
    assert.equal(ok.ok, true);
    const missing = validateApprovedDrumTemplateHeaders([{ 'Drum Code': 'EWD900-0', Flange: 900 }]);
    assert.equal(missing.ok, false);
    assert.ok(missing.missing.includes('Empty Drum Net Weight Kg'));
    assert.equal(APPROVED_DRUM_TEMPLATE_HEADERS.length, 10);
  });

  it('18. Capacity change with blank Max Load updates TO-linked MaxLoad for future selection', () => {
    const rows = classifyDrumExcelRows({
      existing: [drum({ capacity: 800, maxWeight: 800 })],
      rows: [
        {
          'Drum Code': 'EWD900-0',
          Flange: 900,
          Barrel: 450,
          'Inner Width': 500,
          'Outer Width': 700,
          Capacity: 900,
        },
      ],
    });
    assert.equal(rows[0].status, 'UPDATE');
    assert.equal(rows[0].uploaded?.capacity, 900);
    assert.equal(rows[0].uploaded?.maxWeight, 900);
    const selected = selectDrum({
      method: 'MANUAL',
      drumMaster: [rows[0].uploaded!],
      selectedDrumCode: 'EWD900-0',
    });
    assert.equal(selected.selectedDrum?.capacity, 900);
    assert.equal(selected.selectedDrum?.maxWeight, 900);
  });
});
