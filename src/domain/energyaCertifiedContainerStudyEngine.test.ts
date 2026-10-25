import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCertifiedContainerStudy,
  resolveDrumMasterPhysicalDimensions,
} from './energyaCertifiedContainerStudyEngine';

describe('Energya Certified Container Study Engine (Container Study.xlsm Parity)', () => {
  it('matches Container Study.xlsm sample workbook exactly (24 containers total: 14x 40HQ, 9x 40STD, 1x 20STD)', () => {
    const sampleInput = [
      { drumCode: 'EWD2400', flangeMm: 2400, widthMm: 1632, grossWeightKg: 6371, quantity: 55 },
      { drumCode: 'EWD2100', flangeMm: 2100, widthMm: 1632, grossWeightKg: 4537, quantity: 5 },
      { drumCode: 'EWD1600', flangeMm: 1600, widthMm: 1120, grossWeightKg: 1930, quantity: 65 },
      { drumCode: 'EWD1400', flangeMm: 1400, widthMm: 982, grossWeightKg: 1039, quantity: 60 },
    ];

    const result = calculateCertifiedContainerStudy(sampleInput, 'Rolling');

    assert.equal(result.totalContainers, 24, 'Total containers should match 24');
    assert.equal(result.count40HQ, 14, '40 HQ containers count should be 14');
    assert.equal(result.count40STD, 9, '40 STD containers count should be 9');
    assert.equal(result.count20STD, 1, '20 STD containers count should be 1');
    assert.equal(result.count40OT, 0, '40 Open Top containers count should be 0');
  });

  it('correctly calculates active VIP customer inquiry (4 drums of EWD1700-10 packed in 1x 20STD container)', () => {
    const activeInquiry = [
      {
        drumCode: 'EWD1700-10',
        flangeMm: 1700,
        widthMm: 1080,
        grossWeightKg: 3526,
        quantity: 4,
        cuttingLengthM: 500,
        cableDesc: 'Cu / XLPE / LSHF 0.6/1 kV 1X630 mm2 RMC',
      },
    ];

    const result = calculateCertifiedContainerStudy(activeInquiry, 'Rolling');

    assert.equal(result.totalContainers, 1, 'Should require exactly 1 container');
    assert.equal(result.optimalContainerType, '20STD', 'Optimal container should be 20 STD');
    assert.equal(result.count20STD, 1, 'Should be 1x 20 STD container');

    const container1 = result.containers[0];
    assert.equal(container1.containerType, '20 STD');
    assert.equal(container1.usableLengthMm, 5900);
    assert.equal(container1.rows.length, 2, 'Should pack into 2 rows along length');
    assert.equal(container1.rows[0].drums.length, 2, 'Row 1 should have 2 drums side-by-side');
    assert.equal(container1.rows[1].drums.length, 2, 'Row 2 should have 2 drums side-by-side');

    // Total used length = 2 * 1700 = 3400 mm
    assert.equal(container1.usedLengthMm, 3400);
    assert.equal(container1.remainingLengthMm, 2500);

    // Total gross weight = 4 * 3526 = 14104 kg
    assert.equal(container1.totalGrossWeightKg, 14104);
    assert.equal(container1.remainingWeightKg, 11896);
    assert.equal(container1.cwlePercent, 54);
    assert.equal(container1.cllePercent, 58);
  });

  it('correctly resolves physical drum dimensions and tare from master data', () => {
    const resolved = resolveDrumMasterPhysicalDimensions('EWD1700-10', 500, 6532);
    assert.equal(resolved.flangeMm, 1700);
    assert.equal(resolved.widthMm, 1080);
    assert.equal(resolved.tareWeightKg, 260);
    assert.equal(resolved.grossWeightKg, 3526);
  });
});
