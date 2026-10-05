export type FormulaAssignmentScope = 'GLOBAL' | 'FAMILY' | 'CABLE';

export interface FormulaAssignmentFields {
  assignmentScope?: string | null;
  assignmentValue?: string | null;
  outputVariableCode: string;
}

export function normalizeAssignmentScope(scope?: string | null): FormulaAssignmentScope {
  const value = (scope || 'GLOBAL').trim().toUpperCase();
  if (value === 'FAMILY' || value === 'CABLE') return value;
  return 'GLOBAL';
}

export function formulaAppliesToCable(
  formula: FormulaAssignmentFields,
  cable: { materialNumber: string; family?: string | null }
): boolean {
  const scope = normalizeAssignmentScope(formula.assignmentScope);
  if (scope === 'GLOBAL') return true;
  const assigned = (formula.assignmentValue || '').trim();
  if (!assigned) return false;
  if (scope === 'FAMILY') return Boolean(cable.family && assigned === cable.family);
  return assigned === cable.materialNumber;
}

/** Cable-specific formula wins over family/global for the same output variable. */
export function selectFormulasForCable<T extends FormulaAssignmentFields>(
  formulas: T[],
  cable: { materialNumber: string; family?: string | null }
): T[] {
  const applicable = formulas.filter((formula) => formulaAppliesToCable(formula, cable));
  const cableOutputs = new Set(
    applicable
      .filter((formula) => normalizeAssignmentScope(formula.assignmentScope) === 'CABLE')
      .map((formula) => formula.outputVariableCode)
  );
  return applicable.filter((formula) => {
    const scope = normalizeAssignmentScope(formula.assignmentScope);
    if (cableOutputs.has(formula.outputVariableCode) && scope !== 'CABLE') return false;
    return true;
  });
}
