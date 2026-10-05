# Increment 14 — Costing Test Results

**Date:** 2026-08-23

## Automated

| Suite | Result |
|-------|--------|
| `src/domain/costingFormulaAssignment.test.ts` | PASS (4) |
| `src/domain/costingFormulaEngine.test.ts` | PASS (existing parser/security) |

Full `npm test` should still include Increments 9–13. Apply migration `20260823120000_increment14_formula_assignment` before `/api/admin/costing` assignment/readiness tests against PostgreSQL:

```bash
npx prisma migrate deploy
npx tsc --noEmit
npm test -- --test-concurrency=1
```

## Four ELAND regression cables

| Cable | Identity source | Numeric total |
|-------|-----------------|---------------|
| 10009487 | ELAND Cost Sheet Required.xlsx | Not invented — expect NOT_READY until APPROVED RM prices exist |
| 10009546 | same | same |
| 10010347 | same | same |
| 10010439 | same | same |

`GET /api/admin/costing/readiness` lists missing prices, unpublished formulas, and `LOGISTICS_NOT_CONFIGURED` / `PACKING_NOT_CONFIGURED` without substituting zeros.

## Browser

Restart `npm run dev` after migrate. Walk: Administration → Costing → prices/scrap/formulas/assignment/validation/preview → Customer inquiry Calculate. Preview must not create a `CostingCalculation` row.
