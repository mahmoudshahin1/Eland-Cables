# Costing Formula Guide

Parser: `src/domain/costingFormulaEngine.ts` (tokenizer → AST → validation → evaluation).

Allowed: numbers, registered `CostingVariable` codes, `+ - * / ( )`.

Rejected: JavaScript, SQL, `eval`, functions, unknown identifiers, division by zero, circular references.

Material cost is computed by the BOM engine without a formula:

`gross quantity = net × (1 + scrap% / 100)` then `× governed unit price`.

Optional manufacturing example (only if `EX_WORK_RATE` is a governed variable with a real value):

`MATERIAL_COST / (1 - EX_WORK_RATE)`

Do not hard-code 6% or ELAND additives in expressions.
