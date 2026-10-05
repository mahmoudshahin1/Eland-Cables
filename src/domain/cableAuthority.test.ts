import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CableMasterSnapshot,
  CableParameterSnapshot,
  CompatibilitySnapshot,
  evaluateCableAuthority,
} from './cableAuthority';

const parameters: CableParameterSnapshot[] = [
  { kind: 'FAMILY', code: 'LV', status: 'ACTIVE' },
  { kind: 'FAMILY', code: 'HV', status: 'ACTIVE' },
  { kind: 'VOLTAGE', code: '600/1000V', status: 'ACTIVE' },
  { kind: 'VOLTAGE', code: '300/500V', status: 'ACTIVE' },
  { kind: 'CONDUCTOR', code: 'CU', status: 'ACTIVE' },
  { kind: 'INSULATION', code: 'XLPE', status: 'ACTIVE' },
  { kind: 'SCREEN', code: 'Copper Tape', status: 'ACTIVE' },
];

const compatibility: CompatibilitySnapshot[] = [
  { fromKind: 'VOLTAGE', fromCode: '600/1000V', toKind: 'FAMILY', toCode: 'LV', relation: 'ALLOWED' },
  { fromKind: 'VOLTAGE', fromCode: '300/500V', toKind: 'FAMILY', toCode: 'LV', relation: 'ALLOWED' },
];

const approved: CableMasterSnapshot = {
  id: 'c1',
  materialNumber: '10009487',
  itemCode: 'ICO117X101C0002',
  customerCode: 'N2XH',
  description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2',
  family: 'LV',
  voltage: '600/1000V',
  conductor: 'Copper',
  conductorSize: '16',
  cores: '1C',
  insulation: 'XLPE',
  status: 'ACTIVE',
  approvalStatus: 'IMPORTED',
};

const baseConfig = {
  family: 'LV',
  voltage: '600/1000V',
  conductor: 'Copper',
  conductorSize: 16,
  cores: 1,
  insulation: 'XLPE',
};

describe('cableAuthority three-state decision', () => {
  it('Test A: known approved Cable Master configuration is EXISTING_CABLE', () => {
    const decision = evaluateCableAuthority(baseConfig, {
      cables: [approved],
      parameters,
      compatibility,
    });
    assert.equal(decision.code, 'EXISTING_CABLE');
    assert.equal(decision.cable?.materialNumber, '10009487');
    assert.equal(decision.quotationAllowed, true);
    assert.equal(decision.technicalOfficeEligible, false);
  });

  it('Test B: engineering-valid configuration absent from Cable Master', () => {
    const decision = evaluateCableAuthority(
      { ...baseConfig, conductorSize: 95 },
      { cables: [approved], parameters, compatibility }
    );
    assert.equal(decision.code, 'TECHNICALLY_VALID_NOT_MASTER');
    assert.equal(decision.technicalOfficeEligible, true);
    assert.equal(decision.quotationAllowed, false);
    assert.match(decision.message, /Cable Master record not found/);
  });

  it('Test C: family/voltage incompatibility is INVALID_CONFIGURATION', () => {
    const decision = evaluateCableAuthority(
      { ...baseConfig, family: 'HV', voltage: '300/500V' },
      { cables: [approved], parameters, compatibility }
    );
    assert.equal(decision.code, 'INVALID_CONFIGURATION');
    assert.equal(decision.quotationAllowed, false);
    assert.ok(decision.failedRules.length > 0);
  });

  it('Test D: missing CORE_COLOUR/FAMILY compatibility is CONFIGURATION_REQUIRED', () => {
    const decision = evaluateCableAuthority(
      { ...baseConfig, coreColour: 'Red' },
      { cables: [approved], parameters, compatibility }
    );
    assert.equal(decision.code, 'CONFIGURATION_REQUIRED');
    assert.equal(decision.technicalOfficeEligible, false);
  });

  it('does not treat an unmapped official cable as structured EXISTING_CABLE', () => {
    const unmapped: CableMasterSnapshot = {
      ...approved,
      family: null,
      voltage: null,
      conductor: null,
      conductorSize: null,
      cores: null,
      insulation: null,
    };
    const decision = evaluateCableAuthority(baseConfig, {
      cables: [unmapped],
      parameters,
      compatibility,
    });
    assert.notEqual(decision.code, 'EXISTING_CABLE');
  });

  it('maps identity + incomplete engineering to CONFIGURATION_REQUIRED', () => {
    const unmapped: CableMasterSnapshot = {
      ...approved,
      family: null,
      voltage: null,
      conductor: null,
      conductorSize: null,
      cores: null,
      insulation: null,
    };
    const decision = evaluateCableAuthority(
      { ...baseConfig, materialNumber: '10009487' },
      { cables: [unmapped], parameters, compatibility }
    );
    assert.equal(decision.code, 'CONFIGURATION_REQUIRED');
  });
});
