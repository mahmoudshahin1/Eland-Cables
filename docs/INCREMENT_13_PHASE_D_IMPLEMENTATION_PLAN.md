# Increment 13 — Phase D Implementation Plan

> **Stage D — Configuration UI + BOM Orchestration + Preview + Approval**  
> Status: **IMPLEMENTED**  
> Date: 2026-08-22  
> Prerequisites: Phase B+C (`INCREMENT_13_PHASE_BC_IMPLEMENTATION_PLAN.md`)

Companion documents: [`COSTING_CONFIGURATION_VERSIONING.md`](./COSTING_CONFIGURATION_VERSIONING.md), [`BOM_COSTING_INTEGRATION.md`](./BOM_COSTING_INTEGRATION.md), [`SCRAP_RULE_ENGINE.md`](./SCRAP_RULE_ENGINE.md), [`COSTING_UI.md`](./COSTING_UI.md), [`INCREMENT_13_PHASE_D_IMPLEMENTATION_LOG.md`](./INCREMENT_13_PHASE_D_IMPLEMENTATION_LOG.md)

---

## Executive summary

Phase D delivers the **Administration → Costing Configuration** hub, extends admin APIs with approval workflow and costing preview, and implements **BOM orchestration** (cable → approved BOM → quantities → raw materials → approved prices → governed scrap → material cost) without commercial pricing or inquiry UI redesign.

**Delivered:**
- Costing Configuration UI (Methods, Variables, Formulas, Scrap Rules, Layers, Preview, Approval Queue, Change History)
- Extended `/api/admin/costing/*` APIs with workflow transitions, scrap rules, layers, preview, audit
- `costingOrchestrationService` — diagnostic preview with NOT_READY reasons
- `costingRequestService` — structured request contract for inquiry integration (Phase I)
- `CostingScrapRule` model — governed, versioned, audited; rates only from approved data
- RBAC extensions, AuditEvent on all config mutations
- 41+ Phase D automated tests

**Out of scope:** Commercial margin/discount/selling price, incoterm/shipping execution, customer-facing costing, eval/JS/SQL, ELAND workbook fabrication, historical quotation recalculation.

---

## 1. Existing costing architecture (Phase B+C)

| Layer | Location | Phase D impact |
|---|---|---|
| Formula engine | `src/domain/costingFormulaEngine.ts` | Used by preview layer evaluation |
| Decimal arithmetic | `src/domain/costingDecimal.ts` | Scrap and layer totals |
| Material engine (Inc 10) | `src/domain/costingEngine.ts` | Unchanged — orchestration wraps it |
| Config repository | `src/server/costingFormulaRepository.ts` | Extended with workflow transitions |
| Admin routes | `src/server/costingAdminRoutes.ts` | Extended endpoints |
| Orchestration (new) | `src/server/costingOrchestrationService.ts` | BOM + scrap + layers preview |
| Request service (new) | `src/services/costingRequestService.ts` | Inquiry-ready request shape |

---

## 2. Existing BOM architecture

Consume **GovernedBomLine** only for production preview. `scrapPercentage` on governed lines is the primary scrap source when populated. Unresolved `BomDuplicateObservation` → NOT_READY. No parallel BOM.

---

## 3. Existing raw material pricing architecture

`RawMaterialPrice` with `workflowStatus = APPROVED` and `status = ACTIVE` only. `getValidRawMaterialPrice` enforces date/UOM/currency. No duplicate price master. No admin override in preview.

---

## 4. Existing costing readiness architecture

Gates 1–4 unchanged. Phase D preview adds informational Gate 5 when a configuration version is requested: version must be ACTIVE and effective. Missing governed price → NOT_READY.

---

## 5. Existing inquiry/quotation architecture

`costingRequestService` prepares structured requests from inquiry line fields. **No inquiry UI redesign.** Calculate-cost wiring deferred to Phase I.

---

## 6. Existing customer architecture

All `/api/admin/costing/*` routes reject `userType === 'customer'`. Preview responses are internal-only.

---

## 7. Existing low-code architecture

Formula expressions stored as governed strings. UI provides safe editor (variables + operators only). No eval/Function/SQL.

---

## 8. RBAC architecture

Extended permissions:

| Permission | Purpose |
|---|---|
| `COSTING:SCRAP_RULE:VIEW/CREATE/UPDATE/APPROVE` | Scrap rule governance |
| `COSTING:PREVIEW:EXECUTE` | Run costing preview |
| `COSTING:AUDIT:VIEW` | View costing change history |

`COSTING_MANAGER` receives scrap and approve permissions. `COSTING_USER` receives VIEW, VALIDATE, PREVIEW.

---

## 9. Audit architecture

`AuditEvent` for: configuration/formula/scrap-rule create/update/submit/approve/activate; preview runs logged at INFO (no config mutation).

---

## 10. Costing data analysis summary

See [`INCREMENT_13_COSTING_RULE_DISCOVERY.md`](./INCREMENT_13_COSTING_RULE_DISCOVERY.md). Phase D encodes **structure and orchestration** — no fake scrap rates, LME additives, or container rates.

---

## 11. Costing method discovered from source data

ELAND pipeline documented. Phase D preview: material layer from Inc 10 + governed scrap; optional EX_WORK layer via active approved formula when configuration version supplied.

---

## 12. Scrap methodology discovered

| Source | Phase D usage |
|---|---|
| `GovernedBomLine.scrapPercentage` | Applied when populated on approved BOM line |
| `CostingScrapRule` | Governed rules with nullable `scrapRate` until approved |
| ELAND static 1% / dynamic MV | **Not invented** — rules created without rates until business approves |

Ambiguous scrap resolution → NOT_READY with reason.

---

## 13. Incoterm methodology discovered

**Extension point only.** `SHIPPING` component exists in registry; no rates or rules encoded. Documented in [`COSTING_ENGINE_ARCHITECTURE.md`](./COSTING_ENGINE_ARCHITECTURE.md).

---

## 14. Formula engine architecture

Unchanged from Phase B+C. Preview evaluates active formulas in component sort order using `costingDecimal`. Layer trace included in preview output.

---

## 15. Database changes

Migration: `20260822130000_increment13_phase_d_scrap_workflow`

| Change | Purpose |
|---|---|
| Extend `CostingConfigStatus` enum | Add VALIDATION, SUBMITTED, APPROVED |
| `CostingScrapRule` model | Governed scrap policies |
| `workflowStatus` on `CostingConfigurationVersion` | Approval pipeline tracking |

Reuse Phase B+C models. No duplicate price or BOM tables.

---

## 16. API changes

Base: `/api/admin/costing`

| Method | Route | Purpose |
|---|---|---|
| GET | `/methods` | Alias for configurations (costing methods) |
| GET/POST/PATCH | `/scrap-rules` | Scrap rule CRUD |
| POST | `/scrap-rules/:id/submit\|approve\|activate` | Scrap workflow |
| GET | `/layers` | Active costing components (layers) |
| POST | `/preview` | Diagnostic costing preview (no persist) |
| GET | `/audit` | Costing entity change history |
| POST | `/configurations/:id/versions/:versionId/submit\|validate\|approve` | Config workflow |
| POST | `/formulas/:id/submit\|approve` | Formula workflow |

---

## 17. UI changes

**Administration → Costing** (`AdministrationCostingPanel.tsx`):

| Tab | Function |
|---|---|
| Overview | Summary counts, active config, readiness |
| Methods | Configuration CRUD |
| Variables | Variable registry |
| Formulas | Safe formula editor + validate/preview |
| Scrap Rules | Governed scrap policies |
| Layers | Component/layer registry |
| Calculation Preview | Material + layer diagnostic |
| Approval Queue | SUBMITTED items awaiting approve |
| Change History | AuditEvent list |

EN/AR i18n via `adminLang` prop. Matches AdministrationHub design patterns.

---

## 18. Configuration versioning & approval workflow

```
DRAFT → VALIDATION → SUBMITTED → APPROVED → ACTIVE
                                      ↘ INACTIVE / SUPERSEDED
```

- Active formulas immutable — new version for changes
- Only ACTIVE configuration versions used in preview when explicitly selected
- Historical versions immutable after activation

---

## 19. Calculation preview architecture

Preview pipeline (diagnostic, no quotation/BOM/price modification):

1. Validate request inputs
2. Load cable, engineering mapping, governed BOM, conflicts, RM master, approved prices
3. Evaluate gates 1–4 (+ optional gate 5)
4. Calculate material lines with governed scrap
5. Evaluate active formula layers when config version provided
6. Return breakdown + NOT_READY reasons + formula trace

Does not persist `CostingRun` unless explicitly requested in Phase I.

---

## 20. Security model

| Rule | Enforcement |
|---|---|
| No eval/JS/SQL | Parser whitelist + UI safe editor |
| Customer isolation | Admin routes reject customer actors |
| Preview no side effects | Read-only context load |
| RBAC on all routes | `assertCan*` in rbac.ts |
| Cost ≠ commercial price | No selling price in preview |

---

## 21. Migration strategy

1. Additive migration only — `20260822130000_increment13_phase_d_scrap_workflow`
2. Enum extension for workflow states
3. No backfill of scrap rates
4. Seed: no fake rates

---

## 22. Backward compatibility

| Area | Strategy |
|---|---|
| Inc 10 `/api/costing/calculate` | Unchanged |
| Phase B+C tests (40) | Must remain green |
| Legacy CostingRuns | `configurationVersionId` null = legacy |
| Commercial pricing | Unchanged |

---

## 23. Test strategy

`src/server/increment13.phaseD.test.ts` — minimum 41 scenarios:

- Scrap rule CRUD and workflow
- Preview NOT_READY paths (BOM conflict, missing price, unapproved BOM)
- Preview READY with material breakdown
- Scrap from GovernedBomLine.scrapPercentage
- Layer formula evaluation in preview
- Approval workflow transitions
- Audit events on mutations
- RBAC deny paths
- API alias routes (methods, layers)
- costingRequestService unit cases

---

## 24. Risks

| Risk | Mitigation |
|---|---|
| Scrap rate invention | Nullable rates; NOT_READY when ambiguous |
| ELAND workbook absent | Placeholder regression doc |
| Scope creep to commercial | Explicit out-of-scope |
| UI complexity | Tabbed hub matching Administration patterns |

---

## 25. Explicit out-of-scope (Phase D)

| Item | Phase |
|---|---|
| Commercial margin/selling price | Never in costing engine |
| Incoterm/shipping execution | G |
| Customer-facing costing | I+ |
| Inquiry calculate-cost wiring | I |
| ELAND golden regression | When workbook available |
| Historical quotation recalc | Never automatic |

---

## 26. Phase E readiness

Phase E (full scrap rule engine with dynamic MV formulas) can proceed when:

- [x] ScrapRule model and admin UI operational
- [x] BOM scrapPercentage consumed in preview
- [x] Approval workflow proven
- [ ] Business sign-off on dynamic scrap formula encoding
- [ ] ELAND RULE-S002 test vectors obtained

---

## 27. Related documentation

| Document | Status |
|---|---|
| `COSTING_CONFIGURATION_VERSIONING.md` | Created |
| `BOM_COSTING_INTEGRATION.md` | Created |
| `SCRAP_RULE_ENGINE.md` | Created |
| `COSTING_UI.md` | Created |
| `INCREMENT_13_PHASE_D_IMPLEMENTATION_LOG.md` | Created |

---

**End of Phase D plan.**
