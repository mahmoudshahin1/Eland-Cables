import { CostingDecimal } from './costingDecimal';

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type FormulaErrorCode =
  | 'INVALID_SYNTAX'
  | 'UNKNOWN_VARIABLE'
  | 'INACTIVE_VARIABLE'
  | 'CIRCULAR_DEPENDENCY'
  | 'SELF_REFERENCE'
  | 'DIVISION_BY_ZERO'
  | 'MISSING_VARIABLE_VALUE'
  | 'EMPTY_EXPRESSION'
  | 'UNEXPECTED_TOKEN'
  | 'INVALID_IDENTIFIER';

export class FormulaError extends Error {
  constructor(
    public readonly code: FormulaErrorCode,
    message: string,
    public readonly position?: number
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

export type TokenType = 'NUMBER' | 'IDENTIFIER' | 'OPERATOR' | 'LPAREN' | 'RPAREN' | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const OPERATORS = new Set(['+', '-', '*', '/']);

export function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = expression.trim();

  if (!src) {
    throw new FormulaError('EMPTY_EXPRESSION', 'Formula expression cannot be empty.');
  }

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'LPAREN', value: '(', position: i });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'RPAREN', value: ')', position: i });
      i++;
      continue;
    }

    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'OPERATOR', value: ch, position: i });
      i++;
      continue;
    }

    if (/\d/.test(ch) || (ch === '.' && i + 1 < src.length && /\d/.test(src[i + 1]))) {
      const start = i;
      let hasDot = ch === '.';
      i++;
      while (i < src.length && (/[\d]/.test(src[i]) || (!hasDot && src[i] === '.'))) {
        if (src[i] === '.') hasDot = true;
        i++;
      }
      const num = src.slice(start, i);
      if (!/^\d+(\.\d+)?$/.test(num)) {
        throw new FormulaError('INVALID_SYNTAX', `Invalid number literal "${num}".`, start);
      }
      tokens.push({ type: 'NUMBER', value: num, position: start });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      i++;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
      const ident = src.slice(start, i);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ident)) {
        throw new FormulaError('INVALID_IDENTIFIER', `Invalid identifier "${ident}".`, start);
      }
      tokens.push({ type: 'IDENTIFIER', value: ident.toUpperCase(), position: start });
      continue;
    }

    throw new FormulaError('UNEXPECTED_TOKEN', `Unexpected character "${ch}" at position ${i}.`, i);
  }

  tokens.push({ type: 'EOF', value: '', position: i });
  return tokens;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type AstNode =
  | { type: 'NumberLiteral'; value: string }
  | { type: 'VariableRef'; name: string }
  | { type: 'BinaryOp'; operator: '+' | '-' | '*' | '/'; left: AstNode; right: AstNode }
  | { type: 'UnaryOp'; operator: '-'; operand: AstNode };

// ---------------------------------------------------------------------------
// Parser (recursive descent)
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): AstNode {
    const node = this.parseExpression();
    if (this.current().type !== 'EOF') {
      throw new FormulaError('INVALID_SYNTAX', `Unexpected token "${this.current().value}".`, this.current().position);
    }
    return node;
  }

  private current(): Token {
    return this.tokens[this.pos] ?? { type: 'EOF', value: '', position: 0 };
  }

  private advance(): Token {
    const tok = this.current();
    this.pos++;
    return tok;
  }

  private parseExpression(): AstNode {
    return this.parseAddSub();
  }

  private parseAddSub(): AstNode {
    let left = this.parseMulDiv();
    while (this.current().type === 'OPERATOR' && (this.current().value === '+' || this.current().value === '-')) {
      const op = this.advance().value as '+' | '-';
      const right = this.parseMulDiv();
      left = { type: 'BinaryOp', operator: op, left, right };
    }
    return left;
  }

  private parseMulDiv(): AstNode {
    let left = this.parseUnary();
    while (this.current().type === 'OPERATOR' && (this.current().value === '*' || this.current().value === '/')) {
      const op = this.advance().value as '*' | '/';
      const right = this.parseUnary();
      left = { type: 'BinaryOp', operator: op, left, right };
    }
    return left;
  }

  private parseUnary(): AstNode {
    if (this.current().type === 'OPERATOR' && this.current().value === '-') {
      this.advance();
      return { type: 'UnaryOp', operator: '-', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const tok = this.current();

    if (tok.type === 'NUMBER') {
      this.advance();
      return { type: 'NumberLiteral', value: tok.value };
    }

    if (tok.type === 'IDENTIFIER') {
      this.advance();
      return { type: 'VariableRef', name: tok.value };
    }

    if (tok.type === 'LPAREN') {
      this.advance();
      const expr = this.parseExpression();
      if (this.current().type !== 'RPAREN') {
        throw new FormulaError('INVALID_SYNTAX', 'Expected closing parenthesis.")', tok.position);
      }
      this.advance();
      return expr;
    }

    throw new FormulaError('INVALID_SYNTAX', `Unexpected token at position ${tok.position}.`, tok.position);
  }
}

export function parseExpression(expression: string): AstNode {
  const tokens = tokenize(expression);
  return new Parser(tokens).parse();
}

// ---------------------------------------------------------------------------
// Variable registry
// ---------------------------------------------------------------------------

export interface VariableDefinition {
  code: string;
  name: string;
  kind: 'INPUT' | 'OUTPUT' | 'INTERMEDIATE' | 'CONSTANT' | 'REFERENCE';
  status: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
  defaultValue?: string | number | null;
}

export function extractVariableReferences(ast: AstNode): string[] {
  const refs = new Set<string>();
  function walk(node: AstNode) {
    if (node.type === 'VariableRef') refs.add(node.name);
    else if (node.type === 'BinaryOp') {
      walk(node.left);
      walk(node.right);
    } else if (node.type === 'UnaryOp') walk(node.operand);
  }
  walk(ast);
  return [...refs];
}

export function validateReferences(
  ast: AstNode,
  registry: Map<string, VariableDefinition>,
  outputVariable?: string
): string[] {
  const refs = extractVariableReferences(ast);
  const errors: string[] = [];

  for (const ref of refs) {
    if (outputVariable && ref === outputVariable.toUpperCase()) {
      errors.push(`SELF_REFERENCE: Formula cannot reference its own output variable "${ref}".`);
      continue;
    }
    const def = registry.get(ref);
    if (!def) {
      errors.push(`UNKNOWN_VARIABLE: Variable "${ref}" is not in the governed registry.`);
    } else if (def.status !== 'ACTIVE') {
      errors.push(`INACTIVE_VARIABLE: Variable "${ref}" is ${def.status}.`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Dependency graph & cycle detection
// ---------------------------------------------------------------------------

export interface FormulaGraphNode {
  outputVariable: string;
  dependencies: string[];
}

export function detectCircularDependencies(nodes: FormulaGraphNode[]): string[] {
  const errors: string[] = [];
  const graph = new Map<string, string[]>();
  const outputSet = new Set(nodes.map((n) => n.outputVariable.toUpperCase()));

  for (const node of nodes) {
    graph.set(node.outputVariable.toUpperCase(), node.dependencies.map((d) => d.toUpperCase()));
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(varName: string, path: string[]): void {
    if (visiting.has(varName)) {
      const cycleStart = path.indexOf(varName);
      const cycle = [...path.slice(cycleStart), varName].join(' → ');
      errors.push(`CIRCULAR_DEPENDENCY: Cycle detected: ${cycle}`);
      return;
    }
    if (visited.has(varName)) return;

    visiting.add(varName);
    path.push(varName);

    const deps = graph.get(varName) || [];
    for (const dep of deps) {
      if (outputSet.has(dep)) {
        dfs(dep, [...path]);
      }
    }

    visiting.delete(varName);
    visited.add(varName);
  }

  for (const node of nodes) {
    dfs(node.outputVariable.toUpperCase(), []);
  }

  return [...new Set(errors)];
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export interface EvaluationContext {
  variables: Record<string, string | number>;
}

export interface EvaluationTraceNode {
  node: string;
  result: string;
  operator?: string;
  left?: string;
  right?: string;
}

export interface EvaluationResult {
  value: string;
  trace: EvaluationTraceNode[];
}

export function evaluateAst(ast: AstNode, ctx: EvaluationContext): EvaluationResult {
  const trace: EvaluationTraceNode[] = [];

  function resolveVariable(name: string): CostingDecimal {
    const key = name.toUpperCase();
    if (!(key in ctx.variables)) {
      throw new FormulaError('MISSING_VARIABLE_VALUE', `No value provided for variable "${name}".`);
    }
    const raw = ctx.variables[key];
    if (raw === null || raw === undefined || raw === '') {
      throw new FormulaError('MISSING_VARIABLE_VALUE', `Variable "${name}" has no value.`);
    }
    return new CostingDecimal(raw);
  }

  function evalNode(node: AstNode): CostingDecimal {
    if (node.type === 'NumberLiteral') {
      const val = new CostingDecimal(node.value);
      trace.push({ node: 'NumberLiteral', result: val.toString() });
      return val;
    }

    if (node.type === 'VariableRef') {
      const val = resolveVariable(node.name);
      trace.push({ node: `Variable(${node.name})`, result: val.toString() });
      return val;
    }

    if (node.type === 'UnaryOp') {
      const operand = evalNode(node.operand);
      const val = operand.neg();
      trace.push({ node: 'Unary(-)', result: val.toString() });
      return val;
    }

    const left = evalNode(node.left);
    const right = evalNode(node.right);
    let val: CostingDecimal;

    switch (node.operator) {
      case '+':
        val = left.add(right);
        break;
      case '-':
        val = left.sub(right);
        break;
      case '*':
        val = left.mul(right);
        break;
      case '/':
        try {
          val = left.div(right);
        } catch (err) {
          if ((err as Error & { code?: string }).code === 'DIVISION_BY_ZERO') {
            throw new FormulaError('DIVISION_BY_ZERO', 'Division by zero in formula evaluation.');
          }
          throw err;
        }
        break;
      default:
        throw new FormulaError('INVALID_SYNTAX', `Unknown operator "${(node as { operator: string }).operator}".`);
    }

    trace.push({
      node: `Binary(${node.operator})`,
      result: val.toString(),
      operator: node.operator,
      left: left.toString(),
      right: right.toString(),
    });
    return val;
  }

  const result = evalNode(ast);
  return { value: result.toString(), trace };
}

// ---------------------------------------------------------------------------
// High-level API
// ---------------------------------------------------------------------------

export interface ValidateFormulaInput {
  expression: string;
  outputVariable?: string;
  registry: VariableDefinition[];
  existingFormulas?: FormulaGraphNode[];
}

export interface ValidateFormulaResult {
  valid: boolean;
  ast?: AstNode;
  dependencies: string[];
  errors: Array<{ code: FormulaErrorCode; message: string }>;
}

export function validateFormula(input: ValidateFormulaInput): ValidateFormulaResult {
  const errors: Array<{ code: FormulaErrorCode; message: string }> = [];
  let ast: AstNode | undefined;
  let dependencies: string[] = [];

  try {
    ast = parseExpression(input.expression);
    dependencies = extractVariableReferences(ast);
  } catch (err) {
    if (err instanceof FormulaError) {
      errors.push({ code: err.code, message: err.message });
      return { valid: false, dependencies: [], errors };
    }
    errors.push({ code: 'INVALID_SYNTAX', message: (err as Error).message });
    return { valid: false, dependencies: [], errors };
  }

  const registryMap = new Map(input.registry.map((v) => [v.code.toUpperCase(), v]));
  const refErrors = validateReferences(ast, registryMap, input.outputVariable);
  for (const msg of refErrors) {
    const code = msg.startsWith('SELF_REFERENCE')
      ? 'SELF_REFERENCE'
      : msg.startsWith('INACTIVE_VARIABLE')
        ? 'INACTIVE_VARIABLE'
        : 'UNKNOWN_VARIABLE';
    errors.push({ code, message: msg });
  }

  if (input.existingFormulas && input.outputVariable) {
    const graphNodes: FormulaGraphNode[] = [
      ...input.existingFormulas,
      { outputVariable: input.outputVariable.toUpperCase(), dependencies },
    ];
    const cycleErrors = detectCircularDependencies(graphNodes);
    for (const msg of cycleErrors) {
      errors.push({ code: 'CIRCULAR_DEPENDENCY', message: msg });
    }
  }

  return { valid: errors.length === 0, ast, dependencies, errors };
}

export interface PreviewFormulaInput extends ValidateFormulaInput {
  variableValues: Record<string, string | number>;
}

export interface PreviewFormulaResult extends ValidateFormulaResult {
  result?: string;
  trace?: EvaluationTraceNode[];
}

export function previewFormula(input: PreviewFormulaInput): PreviewFormulaResult {
  const validation = validateFormula(input);
  if (!validation.valid || !validation.ast) {
    return validation;
  }

  try {
    const evalResult = evaluateAst(validation.ast, { variables: input.variableValues });
    return { ...validation, result: evalResult.value, trace: evalResult.trace };
  } catch (err) {
    if (err instanceof FormulaError) {
      return {
        ...validation,
        valid: false,
        errors: [...validation.errors, { code: err.code, message: err.message }],
      };
    }
    return {
      ...validation,
      valid: false,
      errors: [...validation.errors, { code: 'INVALID_SYNTAX', message: (err as Error).message }],
    };
  }
}

/** Reject known injection / unsafe patterns before tokenization. */
export function assertSafeExpression(expression: string): void {
  const forbidden = [
    /\beval\b/i,
    /\bFunction\b/,
    /\bnew\s+Function/i,
    /\brequire\b/i,
    /\bimport\b/i,
    /\bwindow\b/i,
    /\bdocument\b/i,
    /\bprocess\b/i,
    /\b__proto__\b/i,
    /\bconstructor\b/i,
    /;/,
    /`/,
    /\[/,
    /\]/,
    /\{/,
    /\}/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(expression)) {
      throw new FormulaError('INVALID_SYNTAX', 'Expression contains forbidden syntax.');
    }
  }
}

export function validateAndPreview(input: PreviewFormulaInput): PreviewFormulaResult {
  assertSafeExpression(input.expression);
  return previewFormula(input);
}
