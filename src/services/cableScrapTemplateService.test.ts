import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CABLE_BOM_SCRAP_HEADERS,
  CABLE_MASTER_EXPORT_HEADERS,
  CABLE_SCRAP_TEMPLATE_HEADERS,
  COSTING_REFERENCE_HEADERS,
  COSTING_WORKBOOK_SHEETS,
  cableScrapTemplateRowToArray,
  deriveMetalFromConductor,
  parseScrapPercentInput,
  resolveScrapImportSheetName,
} from './cableScrapTemplateService';

describe('cable scrap template service', () => {
  it('exposes legacy template headers for backward compatibility', () => {
    assert.equal(CABLE_SCRAP_TEMPLATE_HEADERS.length, 11);
    assert.equal(CABLE_SCRAP_TEMPLATE_HEADERS[2], 'Cable Material Number');
  });

  it('defines separated workbook sheet names and headers', () => {
    assert.equal(COSTING_WORKBOOK_SHEETS.cableBom, 'Cable_BOM');
    assert.equal(CABLE_BOM_SCRAP_HEADERS[0], 'Cable Material Number');
    assert.equal(CABLE_BOM_SCRAP_HEADERS[3], 'Scrap %');
    assert.equal(CABLE_MASTER_EXPORT_HEADERS[2], 'Cable Material Number');
    assert.equal(COSTING_REFERENCE_HEADERS[0], 'Cable Material Number');
  });

  it('resolves scrap import sheet from multi-sheet workbook names', () => {
    assert.equal(
      resolveScrapImportSheetName(['Cable_Master', 'Cable_BOM', 'Instructions']),
      'Cable_BOM'
    );
    assert.equal(
      resolveScrapImportSheetName(['Cable Scrap Rates', 'Instructions']),
      'Cable Scrap Rates'
    );
  });

  it('derives CU and AL metal codes from conductor text', () => {
    assert.equal(deriveMetalFromConductor('Copper'), 'CU');
    assert.equal(deriveMetalFromConductor('Cu'), 'CU');
    assert.equal(deriveMetalFromConductor('Aluminium'), 'AL');
    assert.equal(deriveMetalFromConductor('AL'), 'AL');
  });

  it('parses scrap percent from plain numbers and percent strings', () => {
    assert.deepEqual(parseScrapPercentInput('1.5%'), { ok: true, percent: 1.5 });
    assert.deepEqual(parseScrapPercentInput(1.5), { ok: true, percent: 1.5 });
    assert.deepEqual(parseScrapPercentInput(0.015), { ok: true, percent: 1.5 });
    assert.equal(parseScrapPercentInput('').ok, false);
    assert.equal(parseScrapPercentInput(-1).ok, false);
  });

  it('serializes template rows for Excel export', () => {
    const row = cableScrapTemplateRowToArray({
      specificationCode: 'N2XH',
      itemCode: 'ICO117X101C0002',
      cableMaterialNumber: '10009487',
      elandItemNumber: '',
      cableDescription: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2',
      totalCableWeight: 268,
      cableDiameter: 10.9,
      metal: 'CU',
      family: 'LV',
      qtyMeters: 1000,
      scrapPercent: 1.5,
    });
    assert.equal(row[0], 'N2XH');
    assert.equal(row[2], '10009487');
    assert.equal(row[7], 'CU');
    assert.equal(row[8], 'LV');
    assert.equal(row[10], '1.5%');
  });
});
