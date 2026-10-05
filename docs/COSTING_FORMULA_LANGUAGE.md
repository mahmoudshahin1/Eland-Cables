# Costing Formula Language

## Grammar (Phase C)

```
expression  → addSub
addSub      → mulDiv (('+' | '-') mulDiv)*
mulDiv      → unary (('*' | '/') unary)*
unary       → '-' unary | primary
primary     → NUMBER | IDENTIFIER | '(' expression ')'
```

## Operators

| Operator | Precedence | Associativity |
|---|---|---|
| `+` `-` | 1 (lowest) | Left |
| `*` `/` | 2 | Left |
| Unary `-` | 3 | Right |
| `()` | Grouping | — |

## Identifiers

- Must match `[A-Za-z_][A-Za-z0-9_]*`
- Normalized to UPPER_SNAKE_CASE at parse time
- Must exist in `CostingVariable` registry with `status = ACTIVE`

## Numeric literals

- Decimal format: `123`, `123.45`, `.5` (leading dot with digit)
- Evaluated with fixed-precision decimal arithmetic (10 decimal places)

## Example expressions

### Ex-work loading (configurable rate)

```
MATERIAL_COST / (1 - EX_WORK_RATE)
```

Where `EX_WORK_RATE` is an admin-configured input (e.g. `0.06` for 6% — **not hard-coded in engine**).

### Material line aggregation (Phase H)

```
MATERIAL_COST + SCRAP_COST
```

### Simple arithmetic

```
(MATERIAL_COST + QUANTITY) * 0.05
```

## Variable kinds

| Kind | Description |
|---|---|
| `INPUT` | Provided at calculation time (inquiry, config) |
| `OUTPUT` | Formula target variable |
| `INTERMEDIATE` | Computed by another formula |
| `CONSTANT` | Fixed default in registry |
| `REFERENCE` | Sourced from governed data (e.g. `MATERIAL_COST` from Increment 10) |

## Not supported (Phase C)

- Function calls (`ROUND`, `IF`, etc.)
- String literals
- Property/array access
- Multiple statements
- User-defined operators

See [`COSTING_FORMULA_SECURITY.md`](./COSTING_FORMULA_SECURITY.md) for security constraints.
