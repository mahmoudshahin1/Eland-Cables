# Costing Formula Security Model

## Threat model

Costing formulas are authored by internal administrators but must be safe to evaluate server-side without code injection risk.

## Forbidden constructs

| Construct | Rejection |
|---|---|
| `eval()` | `INVALID_SYNTAX` before tokenization |
| `new Function()` | `INVALID_SYNTAX` |
| `require()`, `import` | `INVALID_SYNTAX` |
| Semicolons (`;`) | `INVALID_SYNTAX` |
| Brackets (`[]`, `{}`) | `INVALID_SYNTAX` |
| Backticks | `INVALID_SYNTAX` |
| `__proto__`, `constructor` | `INVALID_SYNTAX` |
| `window`, `document`, `process` | `INVALID_SYNTAX` |

## Enforcement layers

1. **Pre-scan** — `assertSafeExpression()` rejects forbidden patterns
2. **Tokenizer** — whitelist character set only
3. **Parser** — AST limited to arithmetic nodes
4. **Validator** — variable references must exist in governed registry
5. **Evaluator** — no dynamic code execution; decimal arithmetic only

## RBAC

| Action | Permission |
|---|---|
| View formulas/variables | `COSTING:FORMULA:VIEW` |
| Create/edit formulas | `COSTING:FORMULA:CREATE`, `UPDATE` |
| Activate/deactivate | `COSTING:FORMULA:ACTIVATE`, `DEACTIVATE` |
| Validate/preview | `COSTING:FORMULA:VALIDATE`, `PREVIEW` |

Customer users: **denied all** costing admin routes.

## Preview safety

`POST /api/admin/costing/formulas/preview` is a **pure evaluation** — no database writes, no formula persistence, no audit of calculation results.

## Customer data isolation

Costing formulas, variables, and configuration are never exposed through customer projection layers. Internal-only.

## Audit

Mutations (create, update, activate, deactivate) append immutable `AuditEvent` records. Preview/validate do not mutate configuration state.
