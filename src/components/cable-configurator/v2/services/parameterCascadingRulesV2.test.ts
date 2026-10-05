import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MV_VOLTAGE_OPTIONS,
  REMOVED_UI_FIELDS,
  GRID_PARAMETER_ORDER,
  resolveParameterOptionsV2,
  isParameterUnlocked,
  sanitizeSelectionsAfterChange,
  getVisibleSpecialAdditives,
} from './parameterCascadingRulesV2';
import { SelectionStateV2 } from '../types';

const baseMvSelections: SelectionStateV2 = {
  selectionMode: 'TECHNICAL',
  family: 'UGC',
  familySubType: 'MV',
  voltageClass: 'MV',
  voltage: '6/10 kV (6.35/11 kV)',
  standard: 'IEC 60502-2 (6 kV to 30 kV)',
  conductorMaterial: 'CU',
  conductorClass: 'Class 2 — Stranded',
  conductorSize: '120',
  cores: '1 Core',
  coresCount: 1,
  insulation: 'XLPE',
};

describe('parameterCascadingRulesV2', () => {
  it('exposes exactly five MV voltage ratings', () => {
    assert.equal(MV_VOLTAGE_OPTIONS.length, 5);
    assert.deepEqual(
      resolveParameterOptionsV2('voltage', { ...baseMvSelections, voltage: undefined }),
      [...MV_VOLTAGE_OPTIONS]
    );
  });

  it('removes fourteen legacy fields from the grid (sixteen incl. two additives)', () => {
    assert.equal(REMOVED_UI_FIELDS.length, 14);
    assert.equal(GRID_PARAMETER_ORDER.length, 27);
    assert.equal(getVisibleSpecialAdditives().length, 6);
  });

  it('filters PVC and LSHF insulation for MV selections', () => {
    const options = resolveParameterOptionsV2('insulation', baseMvSelections);
    assert.ok(options.includes('XLPE'));
    assert.ok(options.includes('EPR'));
    assert.equal(options.includes('PVC'), false);
    assert.equal(options.includes('LSHF'), false);
  });

  it('places bedding before armour in grid order', () => {
    const beddingIdx = GRID_PARAMETER_ORDER.indexOf('bedding');
    const armourIdx = GRID_PARAMETER_ORDER.indexOf('armour');
    assert.ok(beddingIdx >= 0);
    assert.ok(armourIdx >= 0);
    assert.ok(beddingIdx < armourIdx);
  });

  it('blocks magnetic SWA for single-core armour options', () => {
    const options = resolveParameterOptionsV2('armour', {
      ...baseMvSelections,
      cores: '1 Core',
      coresCount: 1,
    });
    assert.ok(options.some((o) => o.includes('AWA')));
    assert.equal(
      options.some((o) => o === 'SWA'),
      false
    );
  });

  it('requires screen options for MV (no None / No Screen)', () => {
    const options = resolveParameterOptionsV2('screenType', baseMvSelections);
    assert.equal(options.includes('None'), false);
    assert.ok(options.includes('Copper Wire'));
  });

  it('sanitizes invalid downstream voltage after class change', () => {
    const dirty: SelectionStateV2 = {
      ...baseMvSelections,
      voltageClass: 'LV',
      voltage: '6/10 kV (6.35/11 kV)',
    };
    const cleaned = sanitizeSelectionsAfterChange(dirty, 'voltageClass');
    assert.equal(cleaned.voltage, undefined);
  });

  it('hides removed special additives', () => {
    const visible = getVisibleSpecialAdditives();
    assert.equal(visible.includes('Substation Grade Anti-Vibration'), false);
    assert.equal(visible.includes('Low Temperature Resistant (-40°C)'), false);
  });

  it('unlocks bedding after screen type is selected', () => {
    assert.equal(
      isParameterUnlocked('bedding', { ...baseMvSelections, screenType: undefined }),
      false
    );
    assert.equal(
      isParameterUnlocked('bedding', { ...baseMvSelections, screenType: 'Copper Wire' }),
      true
    );
  });
});
