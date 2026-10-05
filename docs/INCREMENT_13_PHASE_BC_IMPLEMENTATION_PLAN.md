# Increment 13 — Phase B + C Implementation Plan

> **Stage B + C — Schema + Safe Formula Engine**  
> Status: **IMPLEMENTED**  
> Date: 2026-08-22  
> Prerequisites: Phase A (`INCREMENT_13_IMPLEMENTATION_PLAN.md`, `INCREMENT_13_COSTING_RULE_DISCOVERY.md`)

Companion documents: [`COSTING_ENGINE_ARCHITECTURE.md`](./COSTING_ENGINE_ARCHITECTURE.md), [`COSTING_FORMULA_LANGUAGE.md`](./COSTING_FORMULA_LANGUAGE.md), [`COSTING_FORMULA_SECURITY.md`](./COSTING_FORMULA_SECURITY.md)

---

## Executive summary

Phase B + C delivers the **costing configuration control plane** and a **safe formula parser/evaluator** without BOM execution, scrap execution, incoterm/shipping, commercial pricing, or customer-facing costing integration. Increment 10 material costing remains unchanged when no published configuration exists.

**Delivered in this phase:**
- Prisma schema for costing configuration, variables, components, formulas, dependencies, and snapshot contracts
- Safe expression engine: Tokenizer → Parser → AST → Validation → Evaluation (no `eval()`)
- Admin API routes with RBAC and audit
- 25+ automated tests
- Architecture documentation

**Deferred to Phase D+:** Configuration CRUD UI, approval workflow UI, BOM/scrap/incoterm orchestration, inquiry calculate-cost wiring.

---

## 1. Existing costing architecture

| Layer | Location | Phase B+C impact |
|---|---|---|
| Domain (Increment 10) | `src/domain/costingEngine.ts` | Unchanged — material-only path preserved |
| Formula engine (new) | `src/domain/costingFormulaEngine.ts` | Tokenizer, parser, AST, validator, evaluator |
| Decimal arithmetic | `src/domain/costingDecimal.ts` | String-based fixed-precision (no JS float) |
| Repository | `src/server/costingFormulaRepository.ts` | Config/formula/variable persistence |
| Routes | `src/server/costingAdminRoutes.ts` | `/api/admin/costing/*` |
| RBAC | `src/server/rbac.ts` | `assertCanManageCostingFormulas`, etc. |
| Tests | `increment13.costing.test.ts`, `costingFormulaEngine.test.ts` | 25+ scenarios |

---

## 2. Existing BOM architecture

No changes. `GovernedBomLine.scrapPercentage` remains stored but not consumed until Phase E. Formula engine may reference `MATERIAL_COST` as a governed input variable sourced from Increment 10 in later phases.

---

## 3. Existing raw material pricing architecture

`RawMaterialPrice` remains authoritative. No duplicate price master. Variables like `RM_UNIT_PRICE` are registry placeholders for Phase H integration; Phase B+C seeds metadata only.

---

## 4. Existing costing readiness architecture

4 gates unchanged. **Gate 5** (published costing configuration) is schema-ready via `CostingConfigurationVersion.status = ACTIVE` but not enforced in Increment 10 calculate path until Phase H.

---

## 5. Existing inquiry/quotation architecture

No inquiry integration in Phase B+C. `CostingCalculation` and `CostingCalculationSnapshot` models define snapshot contracts for Phase I.

---

## 6. Existing customer architecture

Customers have no costing formula permissions. All `/api/admin/costing/*` routes reject `userType === 'customer'`.

---

## 7. Existing low-code architecture

Costing-specific metadata models introduced first. No generic `CustomFieldDefinition` duplication. Formula expressions stored as governed strings parsed by whitelist engine only.

---

## 8. RBAC architecture

New permissions in `permissionCatalog.ts`:

| Permission | Purpose |
|---|---|
| `COSTING:FORMULA:VIEW` | List/view formulas |
| `COSTING:FORMULA:CREATE` | Create draft formulas |
| `COSTING:FORMULA:UPDATE` | Edit draft formulas |
| `COSTING:FORMULA:ACTIVATE` | Activate formula versions |
| `COSTING:FORMULA:DEACTIVATE` | Deactivate formulas |
| `COSTING:FORMULA:VALIDATE` | Validate expressions |
| `COSTING:FORMULA:PREVIEW` | Preview evaluation (no persist) |
| `COSTING:VARIABLE:VIEW/CREATE/UPDATE` | Variable registry admin |
| `COSTING:COMPONENT:VIEW/CREATE/UPDATE` | Component registry admin |
| `COSTING:CONFIGURATION:VIEW/CREATE/UPDATE/APPROVE` | Configuration versions |

`COSTING_MANAGER` role receives formula admin permissions. `COSTING_USER` receives VIEW, VALIDATE, PREVIEW only.

---

## 9. Audit architecture

`AuditEvent` records for:
- Formula create/update/activate/deactivate
- Variable/component create/update
- Configuration version create/approve/activate
- Preview and validate actions logged at INFO level (no side effects)

Uses PostgreSQL `auditEvent.create()` pattern from `commercialRepository.ts`.

---

## 10. Costing data analysis summary

See [`INCREMENT_13_COSTING_RULE_DISCOVERY.md`](./INCREMENT_13_COSTING_RULE_DISCOVERY.md). Phase B+C encodes **structure only** — no fake scrap rates, LME additives, ex-work 6%, or container rates.

---

## 11. Costing method discovered from source data

ELAND pipeline documented but not encoded. `EX_WORK` component is **configurable** — expression like `MATERIAL_COST / (1 - EX_WORK_RATE)` may be configured by costing team after approval; **not hard-coded 6%**.

---

## 12. Scrap methodology discovered

`ScrapRule` model deferred to Phase E. Variable `SCRAP_RATE` registered as inactive placeholder.

---

## 13. Incoterm methodology discovered

`IncotermCostRule` deferred to Phase G. No incoterm models in Phase B+C schema.

---

## 14. Formula engine architecture

### Pipeline

```
Expression string
    → Tokenizer (numbers, identifiers, operators, parens)
    → Parser (recursive descent → AST)
    → Reference validator (variable registry)
    → Dependency graph (topological sort, cycle detection)
    → Evaluator (decimal arithmetic)
    → Result + trace
```

### Allowed

- Operators: `+ - * /` and parentheses
- Numeric constants (decimal)
- Named variables from `CostingVariable` registry
- Component output variables (e.g. `EX_WORK_COST`)

### Forbidden

- `eval()`, `new Function()`, arbitrary JS
- SQL execution
- Function calls (Phase C — no `ROUND`/`IF` until security-reviewed)
- String literals, property access, arrays

### Error codes

| Code | Meaning |
|---|---|
| `INVALID_SYNTAX` | Parse failure |
| `UNKNOWN_VARIABLE` | Reference not in registry |
| `INACTIVE_VARIABLE` | Variable status INACTIVE |
| `CIRCULAR_DEPENDENCY` | Dependency cycle detected |
| `SELF_REFERENCE` | Formula references its own output |
| `DIVISION_BY_ZERO` | Evaluator divide by zero |
| `MISSING_VARIABLE_VALUE` | Required input not provided |
| `EMPTY_EXPRESSION` | Blank formula |

---

## 15. Database changes

Migration: `20260822120000_increment13_costing_configuration`

### New models

| Model | Purpose |
|---|---|
| `CostingConfiguration` | Logical config header (code, name) |
| `CostingConfigurationVersion` | Versioned config (DRAFT/ACTIVE/INACTIVE/SUPERSEDED) |
| `CostingVariable` | Governed variable registry |
| `CostingComponent` | Cost component definitions (EX_WORK configurable) |
| `CostingFormula` | Formula header linked to config version + component |
| `CostingFormulaVersion` | Expression versions with status lifecycle |
| `CostingFormulaDependency` | Parsed dependency edges |
| `CostingCalculation` | Calculation header contract (Phase I) |
| `CostingCalculationSnapshot` | Immutable snapshot payload contract |

### Extend existing

| Model | Addition |
|---|---|
| `CostingRun` | `configurationVersionId String?` (nullable, backward compatible) |

### Reuse, do not duplicate

- `RawMaterial`, `RawMaterialPrice`, `GovernedBomLine`, `CostingRun`, `CostingLine`, `AuditEvent`

---

## 16. API changes

Base path: `/api/admin/costing`

| Method | Route | RBAC |
|---|---|---|
| GET/POST | `/configurations` | CONFIGURATION VIEW/CREATE |
| GET/PATCH | `/configurations/:id` | CONFIGURATION VIEW/UPDATE |
| POST | `/configurations/:id/versions` | CONFIGURATION CREATE |
| POST | `/configurations/:id/versions/:versionId/activate` | CONFIGURATION APPROVE |
| GET/POST | `/variables` | VARIABLE VIEW/CREATE |
| PATCH | `/variables/:id` | VARIABLE UPDATE |
| GET/POST | `/components` | COMPONENT VIEW/CREATE |
| PATCH | `/components/:id` | COMPONENT UPDATE |
| GET/POST | `/formulas` | FORMULA VIEW/CREATE |
| GET/PATCH | `/formulas/:id` | FORMULA VIEW/UPDATE |
| POST | `/formulas/:id/activate` | FORMULA ACTIVATE |
| POST | `/formulas/:id/deactivate` | FORMULA DEACTIVATE |
| POST | `/formulas/validate` | FORMULA VALIDATE |
| POST | `/formulas/preview` | FORMULA PREVIEW (no persist) |

---

## 17. UI

**Out of scope for Phase B+C.** API-only delivery. Administration Costing hub deferred to Phase K.

---

## 18. Configuration versioning

```
DRAFT → ACTIVE → INACTIVE
              ↘ SUPERSEDED (when new version activated)
```

- `effectiveFrom` / `effectiveTo` on versions
- Only one `isCurrent = true` ACTIVE version per configuration
- Historical versions immutable after activation

---

## 19. Calculation snapshot architecture

`CostingCalculation` + `CostingCalculationSnapshot` define contracts:

1. **INPUT** — inquiry/header inputs, qty, length, metal prices
2. **REFERENCE** — BOM version, RM price IDs, config version, formula IDs
3. **OUTPUT** — component costs, totals, formula trace

No runtime population in Phase B+C. See [`COSTING_SNAPSHOT_MODEL.md`](./COSTING_SNAPSHOT_MODEL.md).

---

## 20. Security model

| Rule | Enforcement |
|---|---|
| No eval/Function | Parser whitelist only |
| Customer isolation | Admin routes reject customer actors |
| Preview no side effects | `previewFormula` pure function, no DB writes |
| RBAC on all admin routes | `assertCan*` in `rbac.ts` |
| Injection attempts | Rejected as `INVALID_SYNTAX` |

See [`COSTING_FORMULA_SECURITY.md`](./COSTING_FORMULA_SECURITY.md).

---

## 21. Migration strategy

1. New migration only — `20260822120000_increment13_costing_configuration`
2. Nullable `CostingRun.configurationVersionId`
3. Seed: system variables and EX_WORK component shell (no rates)
4. No backfill required

---

## 22. Backward compatibility

| Area | Strategy |
|---|---|
| Increment 10 API | Unchanged |
| Existing CostingRuns | `configurationVersionId` null = legacy |
| Commercial pricing | Unchanged |
| Tests 1–12 | Must remain green |

---

## 23. Test strategy

### Unit (`costingFormulaEngine.test.ts`)

- Tokenizer: numbers, identifiers, operators
- Parser: precedence, parentheses
- Evaluator: arithmetic, division by zero
- Security: injection attempts rejected
- Dependency: cycle detection, self-reference
- Decimal precision

### Integration (`increment13.costing.test.ts`)

- RBAC: unauthorized, customer denied
- CRUD: variables, components, formulas
- Validate/preview endpoints
- Activate/deactivate lifecycle
- Audit events on mutations
- Preview has no side effects

Minimum 25 test cases per spec.

---

## 24. Risks

| Risk | Mitigation |
|---|---|
| EX_WORK vs commercial margin | Documented separation in BUSINESS_RULES.md |
| ELAND workbook absent | Placeholder regression doc only |
| Scope creep | Explicit out-of-scope list enforced |
| Decimal precision | String-based decimal module |

---

## 25. Explicit out-of-scope (Phase B+C)

| Item | Phase |
|---|---|
| BOM execution integration | H |
| Scrap rule engine | E |
| Incoterm/shipping | G |
| Commercial margin/selling price | Never in costing engine |
| Customer-facing costing | I+ |
| Formula Builder UI | L |
| Full approval workflow UI | D |
| LME price build-up | H |
| Hard-coded 6% ex-work | Never — configurable only |

---

## 26. Phase D readiness

Phase D (Configuration CRUD + versioning + approval workflow) can proceed when:

- [x] Schema migrated and validated
- [x] Formula engine unit-tested
- [x] Admin API routes operational
- [x] RBAC permissions seeded
- [x] Audit trail on mutations
- [ ] Business sign-off on EX_WORK as costing layer (D1)
- [ ] ELAND workbook obtained for golden regression (D3)

**Next phase:** D — Configuration CRUD UI + approval workflow + publish gate enforcement.

---

**End of Phase B + C plan.**
