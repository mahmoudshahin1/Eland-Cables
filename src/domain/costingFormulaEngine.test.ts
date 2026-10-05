import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CostingDecimal } from './costingDecimal';
import {
  assertSafeExpression,
  detectCircularDependencies,
  evaluateAst,
  FormulaError,
  parseExpression,
  previewFormula,
  tokenize,
  validateFormula,
  VariableDefinition,
} from './costingFormulaEngine';

const registry: VariableDefinition[] = [
  { code: 'MATERIAL_COST', name: 'Material Cost', kind: 'REFERENCE', status: 'ACTIVE' },
  { code: 'EX_WORK_RATE', name: 'Ex-Work Rate', kind: 'INPUT', status: 'ACTIVE' },
  { code: 'EX_WORK_COST', name: 'Ex-Work Cost', kind: 'OUTPUT', status: 'ACTIVE' },
  { code: 'QUANTITY', name: 'Quantity', kind: 'INPUT', status: 'ACTIVE' },
  { code: 'INACTIVE_VAR', name: 'Inactive', kind: 'INPUT', status: 'INACTIVE' },
];

describe('CostingDecimal', () => {
  it('1. adds without float error', () => {
    const a = new CostingDecimal('0.1');
    const b = new CostingDecimal('0.2');
    assert.equal(a.add(b).toString(), '0.3');
  });

  it('2. multiplies with precision', () => {
    const a = new CostingDecimal('135.23');
    const b = new CostingDecimal('9.5');
    assert.equal(a.mul(b).toString(), '1284.685');
  });

  it('3. divides and throws on zero', () => {
    const a = new CostingDecimal('100');
    const b = new CostingDecimal('4');
    assert.equal(a.div(b).toString(), '25');
    assert.throws(() => new CostingDecimal('10').div(new CostingDecimal('0')));
  });
});

describe('CostingFormulaEngine — Tokenizer', () => {
  it('4. tokenizes numbers, identifiers, operators', () => {
    const tokens = tokenize('MATERIAL_COST + 100 * 2');
    assert.equal(tokens[0].type, 'IDENTIFIER');
    assert.equal(tokens[0].value, 'MATERIAL_COST');
    assert.equal(tokens[2].type, 'NUMBER');
    assert.equal(tokens[2].value, '100');
  });

  it('5. rejects empty expression', () => {
    assert.throws(() => tokenize('   '), (err: Error) => err instanceof FormulaError && (err as FormulaError).code === 'EMPTY_EXPRESSION');
  });

  it('6. rejects unexpected characters', () => {
    assert.throws(() => tokenize('MATERIAL_COST @ 5'));
  });
});

describe('CostingFormulaEngine — Parser', () => {
  it('7. respects operator precedence', () => {
    const ast = parseExpression('2 + 3 * 4');
    assert.equal(ast.type, 'BinaryOp');
    assert.equal((ast as { operator: string }).operator, '+');
  });

  it('8. parses parentheses', () => {
    const ast = parseExpression('(2 + 3) * 4');
    assert.equal(ast.type, 'BinaryOp');
    const result = previewFormula({
      expression: '(2 + 3) * 4',
      registry: [],
      variableValues: {},
    });
    assert.equal(result.result, '20');
  });

  it('9. parses unary minus', () => {
    const result = previewFormula({
      expression: '-5 + 10',
      registry: [],
      variableValues: {},
    });
    assert.equal(result.result, '5');
  });
});

describe('CostingFormulaEngine — Validation', () => {
  it('10. detects unknown variable', () => {
    const result = validateFormula({
      expression: 'UNKNOWN_X + 1',
      registry,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'UNKNOWN_VARIABLE'));
  });

  it('11. detects inactive variable', () => {
    const result = validateFormula({
      expression: 'INACTIVE_VAR + 1',
      registry,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'INACTIVE_VARIABLE'));
  });

  it('12. detects self-reference', () => {
    const result = validateFormula({
      expression: 'EX_WORK_COST + MATERIAL_COST',
      outputVariable: 'EX_WORK_COST',
      registry,
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'SELF_REFERENCE'));
  });

  it('13. detects circular dependency', () => {
    const cycles = detectCircularDependencies([
      { outputVariable: 'A', dependencies: ['B'] },
      { outputVariable: 'B', dependencies: ['A'] },
    ]);
    assert.ok(cycles.length > 0);
    assert.ok(cycles[0].includes('CIRCULAR_DEPENDENCY'));
  });
});

describe('CostingFormulaEngine — Evaluator', () => {
  it('14. evaluates ex-work formula (configurable, not hard-coded)', () => {
    const result = previewFormula({
      expression: 'MATERIAL_COST / (1 - EX_WORK_RATE)',
      outputVariable: 'EX_WORK_COST',
      registry,
      variableValues: { MATERIAL_COST: '1000', EX_WORK_RATE: '0.06' },
    });
    assert.equal(result.valid, true);
    // 1000 / 0.94 ≈ 1063.829787234
    assert.ok(Number(result.result) > 1063 && Number(result.result) < 1064);
  });

  it('15. detects division by zero', () => {
    const result = previewFormula({
      expression: 'MATERIAL_COST / EX_WORK_RATE',
      registry,
      variableValues: { MATERIAL_COST: '100', EX_WORK_RATE: '0' },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'DIVISION_BY_ZERO'));
  });

  it('16. detects missing variable value', () => {
    const result = previewFormula({
      expression: 'MATERIAL_COST + QUANTITY',
      registry,
      variableValues: { MATERIAL_COST: '100' },
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.code === 'MISSING_VARIABLE_VALUE'));
  });
});

describe('CostingFormulaEngine — Security', () => {
  it('17. rejects eval injection', () => {
    assert.throws(() => assertSafeExpression('eval("1+1")'));
  });

  it('18. rejects Function constructor', () => {
    assert.throws(() => assertSafeExpression('new Function("return 1")()'));
  });

  it('19. rejects semicolons and brackets', () => {
    assert.throws(() => assertSafeExpression('MATERIAL_COST; alert(1)'));
    assert.throws(() => assertSafeExpression('MATERIAL_COST[0]'));
  });

  it('20. rejects require/import', () => {
    assert.throws(() => assertSafeExpression('require("fs")'));
    assert.throws(() => assertSafeExpression('import("x")'));
  });
});

describe('CostingFormulaEngine — Trace', () => {
  it('21. produces evaluation trace', () => {
    const ast = parseExpression('2 + 3');
    const { trace } = evaluateAst(ast, { variables: {} });
    assert.ok(trace.length >= 3);
    assert.equal(trace[trace.length - 1].result, '5');
  });
});

describe('CostingFormulaEngine — Complex expressions', () => {
  it('22. evaluates nested arithmetic', () => {
    const result = previewFormula({
      expression: '(MATERIAL_COST + QUANTITY) * EX_WORK_RATE',
      registry,
      variableValues: { MATERIAL_COST: '500', QUANTITY: '10', EX_WORK_RATE: '0.05' },
    });
    assert.equal(result.result, '25.5');
  });

  it('23. handles decimal literals', () => {
    const result = previewFormula({
      expression: '0.1 + 0.2',
      registry: [],
      variableValues: {},
    });
    assert.equal(result.result, '0.3');
  });
});
