import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formulaAppliesToCable, selectFormulasForCable } from './costingFormulaAssignment';

describe('Increment 14 formula assignment', () => {
  it('GLOBAL formulas apply to every cable', () => {
    assert.equal(
      formulaAppliesToCable(
        { assignmentScope: 'GLOBAL', assignmentValue: null, outputVariableCode: 'EX_WORK_COST' },
        { materialNumber: '10009487', family: 'LV' }
      ),
      true
    );
  });

  it('FAMILY formulas apply only to matching family', () => {
    const formula = { assignmentScope: 'FAMILY', assignmentValue: 'LV', outputVariableCode: 'EX_WORK_COST' };
    assert.equal(formulaAppliesToCable(formula, { materialNumber: '10009487', family: 'LV' }), true);
    assert.equal(formulaAppliesToCable(formula, { materialNumber: '10010347', family: 'MV' }), false);
  });

  it('CABLE formulas override family and global for the same output', () => {
    const selected = selectFormulasForCable(
      [
        { assignmentScope: 'GLOBAL', assignmentValue: null, outputVariableCode: 'EX_WORK_COST', code: 'G' },
        { assignmentScope: 'FAMILY', assignmentValue: 'LV', outputVariableCode: 'EX_WORK_COST', code: 'F' },
        { assignmentScope: 'CABLE', assignmentValue: '10009487', outputVariableCode: 'EX_WORK_COST', code: 'C' },
      ],
      { materialNumber: '10009487', family: 'LV' }
    );
    assert.deepEqual(
      selected.map((f) => f.code),
      ['C']
    );
  });

  it('keeps global formulas when no cable-specific output exists', () => {
    const selected = selectFormulasForCable(
      [{ assignmentScope: 'GLOBAL', assignmentValue: null, outputVariableCode: 'EX_WORK_COST', code: 'G' }],
      { materialNumber: '10009487', family: 'LV' }
    );
    assert.equal(selected.length, 1);
    assert.equal(selected[0].code, 'G');
  });
});
