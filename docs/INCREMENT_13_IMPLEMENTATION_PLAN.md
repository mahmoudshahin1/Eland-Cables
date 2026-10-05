# Increment 13 — Low-Code Costing Formula Engine + BOM + Scrap + Incoterm

> **Stage A — Architectural Review & Implementation Plan ONLY**  
> Status: **ANALYSIS COMPLETE. STAGE B NOT STARTED.**  
> Date: 2026-08-21  
> Prerequisites: Increments 1–12 (including Increment 10 costing foundation, Increment 11/12 commercial modules, Increment 12 B1/B2 security)

**STOP after this document. Do not implement until explicit approval.**

Companion document: [`INCREMENT_13_COSTING_RULE_DISCOVERY.md`](./INCREMENT_13_COSTING_RULE_DISCOVERY.md)

---

## Executive summary

Increment 13 adds a **governed, configurable costing control plane** on top of the existing Increment 10 raw-material costing engine. The platform already calculates **BOM × approved RM price × length × quantity** with 4-gate readiness and immutable `CostingRun` snapshots. It does **not** yet apply scrap, FX, process cost, overhead, drum cost, ex-work uplift, or incoterm logistics — by explicit Increment 10 design.

Company costing methodology (primarily documented from `ELAND_Cost_Sheet_Required.xlsx`, not in repo) requires scrap-adjusted consumption, multi-currency price build-ups, ex-work uplift, and DAP shipping components. These must become **configuration-driven**, not hard-coded assumptions.

**Architectural mandate:** Extend Increment 10. Do not replace Cable Master, BOM governance, price governance, readiness gates, inquiry/quotation versioning, RBAC, audit, or commercial pricing separation.

---

## 1. Existing costing architecture

| Layer | Location | Responsibility |
|---|---|---|
| Domain | `src/domain/costingEngine.ts` | Pure calculation + 4-gate validation |
| Repository | `src/server/costingRepository.ts` | Load context, persist `CostingRun`/`CostingLine`, recalculate |
| Routes | `src/server/costingRoutes.ts` | `/api/costing/calculate`, `/readiness`, list/get |
| Readiness | `src/server/governanceRepository.ts` | `evaluateCableCostingReadiness` |
| RBAC | `src/server/rbac.ts` | `assertCanCalculateCosting` |
| UI | `TechnicalOfficeCostingWorkbench.tsx`, `CostingPricing.tsx` | Display / mock (not authoritative) |
| Tests | `increment10.costing.test.ts`, `costingEngine.test.ts` | 25+ domain/integration tests |

**Today’s formula:**

```
materialCost = Σ (consumptionPerKm × lengthKm × qty × unitPrice)
```

**Snapshot model:** `CostingRun` + `CostingLine`; recalculation marks prior run `isCurrent=false`; historical runs immutable.

**Commercial link:** `CommercialInquiryLine.costingRunId`, `materialCost`, `costingReadinessStatus`; auto-costing on Path A line add when ready.

---

## 2. Existing BOM architecture

| Model | Role |
|---|---|
| `CableBomLine` | Imported source BOM (may have duplicates) |
| `BomDuplicateObservation` | Conflict register (~81 groups from master extract) |
| `GovernedBomLine` | Approved resolution; includes `scrapPercentage` (**unused**) |
| `CableBomLine.scrap` | Legacy column (**unused**) |

**Governance:** Investigate → classify → approve workflow in `governanceRepository.ts`. Costing blocks on unresolved conflicts.

**Increment 13 stance:** Consume governed BOM only. No parallel BOM. No averaging conflicts.

---

## 3. Existing raw material pricing architecture

| Model | Role |
|---|---|
| `RawMaterial` | Master data |
| `RawMaterialPrice` | Versioned prices with workflow (DRAFT→APPROVED) |
| `rawMaterialPriceGovernanceService.ts` | `getValidRawMaterialPrice`, overlap detection, UOM/basis validation |

**Constraints:** No FX conversion; PER_KG basis enforced in engine gates; expired/unapproved prices block costing.

**Source data gap:** Official `Raw Material List.xlsx` has blank prices — production costing requires governed price entry or approved price-build-up policies (ELAND LME formulas).

---

## 4. Existing costing readiness architecture

**4 gates** (authoritative — must remain):

1. Engineering mapping APPROVED  
2. BOM conflicts resolved + lines exist  
3. All consumed RMs exist in master  
4. Valid approved price for costing date/UOM/currency  

**API:** `GET /api/costing/readiness/:materialNumber`

**Increment 13:** Add **Gate 5 — Published Costing Configuration** exists and is effective for costing date. Existing gates unchanged.

---

## 5. Existing inquiry/quotation architecture

| Feature | Status (Increment 12) |
|---|---|
| `CommercialInquiry` + lines persisted | ✅ PostgreSQL |
| Header: currency, incoterms, delivery terms, `commercialMetadata` | ✅ Partial (metadata JSON for rates/metal prices) |
| Line: qty, length, cutting length, drum, material | ✅ |
| Auto material cost on line add | ✅ When READY_FOR_COSTING |
| Inquiry versioning | ✅ `versionNo`, `isCurrent`, `inquiryGroupKey` |
| Quotation versioning + pricing snapshots | ✅ Increment 11/12 |
| Customer cost hiding | ✅ `commercialProjection.ts` |
| Calculate Cost button (full engine) | ❌ Not wired |
| Costing tab on inquiry detail | ❌ Not implemented |

**Increment 13:** Wire inquiry-triggered costing through new engine orchestrator; add Costing tab; persist calculation snapshots linked to inquiry line.

---

## 6. Existing customer architecture

- Increment 12 B2: `Customer` master, `CustomerUser` assignments, `resolveCustomerScope`.
- Inquiry/quotation customer isolation enforced server-side.
- Customers must never receive: material cost, scrap, process cost, formulas, configuration.

---

## 7. Existing low-code architecture

| Capability | Status |
|---|---|
| Inquiry field manifest (`inquiryFieldManifest.ts`) | Static TS + personal localStorage prefs |
| Admin Field Configuration (Inc 12 B3) | **Not started** — no `CustomFieldDefinition` in Prisma |
| Formula builder | **Does not exist** |
| Configuration versioning | **Does not exist** for costing |
| Number sequences | Stamp+random (`INQ-`, `CR-`) — no `NumberSequence` table |

**Increment 13:** Introduce costing-specific configuration models first; align field-definition patterns with Increment 12 B3 when that ships — do not duplicate competing metadata systems.

---

## 8. Existing RBAC architecture

**Current:** Module booleans + `assert*` functions in `rbac.ts`.

**Increment 13 proposed permissions** (map to existing pattern until B3 permission catalog):

| Permission | Purpose |
|---|---|
| `costingPricing` (existing) | View/run costing (internal) |
| New: `costingConfiguration` | Admin costing config CRUD |
| New: `costingConfigurationApprove` | Approve/publish configs |
| New: `costingSimulate` | Run simulations |

Customers: **no costing permissions**. Server-side projection on all calculation responses.

---

## 9. Existing audit architecture

- Prisma `AuditEvent` append-only (Increment 12 B1 hardened).
- Repositories call `appendAudit` for costing calculate/recalculate today.

**Increment 13:** Audit config create/update/approve/publish/retire, rule changes, calculate/recalculate, unauthorized access. Never audit passwords/tokens.

---

## 10. Costing data analysis summary

See [`INCREMENT_13_COSTING_RULE_DISCOVERY.md`](./INCREMENT_13_COSTING_RULE_DISCOVERY.md) for full detail.

**In repo:**

- ENERGYA master extracts: BOM kg/km, RM codes, drums (no costs/scrap/incoterm).
- ELAND workbook: **documented, not in repo** — scrap, FX, ex-work, shipping formulas.

**Not inventable:** global scrap %, LME additives, ex-work 6%, container rates, per-cable DAP split, process/overhead rates.

---

## 11. Costing method discovered from source data

**ELAND workbook pipeline (verified aggregates):**

```
BOM kg/km → scrap-adjusted kg/km → RM LE/kg price → line LE/EUR cost
→ material EUR/km → ex-work (÷0.94) → shipping (container + insurance if DAP)
→ DAP total (aggregate)
```

**Increment 10 (implemented):**

```
BOM kg/km → RM approved price → material cost (single currency)
```

---

## 12. Scrap methodology discovered

| Type | Source | Implementation today |
|---|---|---|
| Static 1% | ELAND Materials List / cables 1–2 | Not applied |
| Dynamic MV | ELAND cables 3–4 (qty, cutting length, material class) | Not applied |
| Schema field | `GovernedBomLine.scrapPercentage` | Stored, unused |

**Plan:** `ScrapRule` configuration with scope dimensions, priority, effective dates, approval workflow. Deterministic rule resolution — ambiguity → `COSTING_NOT_READY`.

---

## 13. Incoterm methodology discovered

Incoterm selects **which cost components apply**, not a fixed cost:

- DAP: container + 0.3% insurance on ex-work total (workbook-proven)
- FOB/EX WORK: container only

Requires: `IncotermCostRule`, optional `ShippingRate` master, destination when rule requires it.

**Not in repo:** USD 3,500 container rate, per-cable allocation formula.

---

## 14. Proposed formula engine architecture

### Three layers (mandatory separation)

```
LAYER 1 — Configuration (admin, versioned, approved)
LAYER 2 — Governed data (BOM, prices, inquiry inputs, readiness)
LAYER 3 — Engine (normalize → resolve → evaluate → snapshot)
```

### Safe expression parser (new module)

**Proposed path:** `src/domain/costingFormulaEngine.ts`

| Allowed | Forbidden |
|---|---|
| `+ - * /` | `eval()`, `Function()`, arbitrary JS |
| Numeric constants | SQL execution |
| Field/variable references from catalog | Arbitrary function calls (except whitelisted) |
| Parentheses | User-defined scripts |

**Whitelisted functions (if needed, explicit implementation only):**

- `ROUND(value, decimals)`
- `IF(condition, a, b)` — only after security review
- Unit conversion helpers registered in catalog

**Parse pipeline:**

1. Tokenize → AST  
2. Validate references against published config + variable catalog  
3. Detect circular dependencies (topological sort)  
4. Type/unit compatibility check  
5. Evaluate with calculation context  
6. Produce trace nodes for explainability  

---

## 15. Proposed database changes

**Inspect first. Add only where no existing model fits. Never edit historical migrations.**

### New models (proposed)

| Model | Purpose |
|---|---|
| `CostingConfiguration` | Logical config header (code, name, status) |
| `CostingConfigurationVersion` | Versioned snapshot (DRAFT→PUBLISHED), effective dates |
| `CostingFieldDefinition` | Low-code field metadata (input/output/intermediate) |
| `CostingFormula` | Formula expression + target field |
| `CostingFormulaDependency` | Parsed dependency edges (cycle detection) |
| `ScrapRule` | Scoped scrap policy |
| `ProcessCostRule` | Process cost (FIXED, PER_METER, FORMULA, …) |
| `IncotermCostRule` | Incoterm → component mapping |
| `CurrencyConversionRule` | Governed FX (optional if not inquiry-snapshot-only) |
| `UnitConversionRule` | Explicit UOM conversions |
| `CostingCalculation` | Inquiry-line calculation header (links to inquiry) |
| `CostingCalculationLine` | Breakdown lines (material, scrap, process, …) |
| `CostingCalculationInput` | Input snapshot key/values |
| `CostingCalculationSnapshot` | Immutable JSON snapshot of full context |
| `CostingSimulation` | Admin simulation runs |
| `CostingConfigurationApproval` | Approval audit trail |

### Extend existing models (nullable, backward compatible)

| Model | Proposed addition |
|---|---|
| `CostingRun` | `configurationVersionId`, `inquiryLineId?`, `calculationType` |
| `CostingLine` | `scrapRate`, `scrapQuantity`, `baseConsumption`, `scrapCost` |
| `CommercialInquiryLine` | FK to `CostingCalculation` (replace loose `costingRunId` string over time) |
| `CommercialInquiry` | `destinationCountry`, `destinationCity` (if not in metadata) |

### Reuse, do not duplicate

- `CostingRun` / `CostingLine` — extend for manufacturing material layer  
- `GovernedBomLine` — consumption source  
- `RawMaterialPrice` — price source (unless price-build-up policy adds derived price snapshot)  
- `AuditEvent` — audit trail  

### Number sequences

Increment 12 plan references `NumberSequence` — **not yet in schema**. Stage B should add `NumberSequence` table (reusable across modules) before costing config codes, or use governed prefix + sequential counter in transaction.

---

## 16. Proposed API changes

Follow existing conventions under `/api/costing` and `/api/admin`.

### Runtime costing

| Method | Route | Notes |
|---|---|---|
| POST | `/api/costing/calculate` | Extend: accept inquiry line context, incoterm, destination, metal prices |
| POST | `/api/costing/recalculate` | New calculation record; preserve history |
| GET | `/api/costing/calculations/:id` | Full result + status |
| GET | `/api/costing/calculations/:id/breakdown` | Component drill-down |
| GET | `/api/costing/calculations/:id/snapshot` | Immutable snapshot |
| POST | `/api/inquiries/:id/lines/:lineId/calculate-cost` | Inquiry integration (or via costing route with inquiryLineId) |

### Admin configuration (RBAC gated)

| Method | Route |
|---|---|
| GET/POST | `/api/admin/costing/configurations` |
| PATCH | `/api/admin/costing/configurations/:id` |
| POST | `/api/admin/costing/configurations/:id/submit|approve|publish|retire` |
| CRUD | `/api/admin/costing/formulas`, `/scrap-rules`, `/process-rules`, `/incoterm-rules` |
| POST | `/api/admin/costing/simulations` |

All sensitive responses pass through **cost projection** (strip internal fields for customers).

---

## 17. Proposed UI

### Administration → Costing (new hub)

- Overview, Configurations, Formula Builder, Scrap Rules, Process Rules, Incoterm Rules, Currency Rules, Simulation, Versions, Audit
- Reuse Energya design system; EN/AR RTL

### Inquiry detail (extend Increment 12 UI)

- Preserve existing header + tabs  
- Add **Costing** tab  
- Line grid: Costing Status, Cost (internal only), Calculate / Recalculate  
- Breakdown drawer: material → scrap → price trace  
- Readiness panel before calculate  

### Formula Builder

- Visual field/operator picker (no free-text code)  
- Validation preview, dependency list  
- Draft vs published comparison in simulator  

**Do not revert** to old `ErpCustomerRequestView` design.

---

## 18. Configuration versioning

Mirror quotation/config patterns:

```
DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → SUPERSEDED → RETIRED
```

- Only **PUBLISHED** configs used for production inquiry costing  
- Historical calculations store `configurationVersionId` + full snapshot  
- Admin changes never mutate past snapshots  

---

## 19. Calculation snapshot architecture

Every production calculation persists:

1. **Input snapshot** — inquiry header inputs, line qty/length/cutting/drum, metal prices, FX rates, incoterm, destination  
2. **Reference snapshot** — BOM version, RM price IDs/revisions, scrap rule IDs, process rule IDs, incoterm rule IDs, config version  
3. **Output snapshot** — component costs, totals, per-meter metrics, formula trace  
4. **Link** — `inquiryLineId`, optional `CostingRun.id`, `CostingCalculation.id`  

Immutability: no UPDATE on snapshot tables after COMMIT (append-only corrections via new calculation version).

---

## 20. Security model

| Rule | Enforcement |
|---|---|
| Customer never sees cost | `commercialProjection` + costing projection layer |
| Costing config admin only | RBAC on `/api/admin/costing/*` |
| Customer cannot POST cost fields | Strip/ignore on inquiry PATCH |
| Customer A ≠ Customer B | `resolveCustomerScope` on all calculation GETs |
| Formula security | Parser whitelist only; no eval |
| Low-code cannot override gates | Readiness, BOM approval, price approval remain domain-controlled |

---

## 21. Migration strategy

1. **Backup** production/dev DB before Stage B migrations.  
2. **New migration only** — `20260822_increment13_costing_configuration` (name TBD).  
3. **Nullable new columns** on existing tables; backfill not required for historical runs.  
4. **No DELETE** of existing `CostingRun` rows.  
5. **Dual-run period (optional):** Increment 10 material-only path remains until published config exists; then orchestrator selects path by config availability.  
6. **Seed:** No fake scrap/process/incoterm rates — empty configuration shell only.  

---

## 22. Backward compatibility

| Area | Strategy |
|---|---|
| Increment 10 API | `/api/costing/calculate` continues to work; extended payload optional |
| Existing CostingRuns | Remain valid; `configurationVersionId` null = legacy material-only |
| Inquiry lines with `costingRunId` | Continue to resolve; migrate to FK gradually |
| Commercial pricing | Unchanged — cost ≠ price |
| Increment 12 inquiry UI | Extend, do not replace |
| Tests 1–12 | Must remain green after each Stage B phase |

---

## 23. Test strategy

### Unit tests

- Formula parser: operators, parentheses, invalid syntax, injection attempts  
- Dependency graph: cycle detection, missing variable  
- Scrap rule resolution: priority, effective dates  
- Incoterm rule: DAP vs FOB component selection  
- Currency conversion trace  

### Integration tests

- `increment13.costing.test.ts` — minimum 50 scenarios per spec section 47  
- Extend `increment10.costing.test.ts` — ensure material-only path unchanged when no config published  
- Inquiry line calculate-cost E2E  
- Customer isolation on calculation GET  
- Snapshot immutability after config publish  
- Concurrent calculation number uniqueness  

### Regression

```
npx tsc --noEmit
npm test -- --test-concurrency=1
npm run build
```

---

## 24. Risks

| Risk | Mitigation |
|---|---|
| ELAND workbook not in repo | Obtain governed copy; add to secure artifact store; cell-level regression tests |
| Ex-work 6% overlaps commercial pricing | Business decision before encoding; document in `BUSINESS_RULES.md` |
| Two pricing paradigms (flat RM price vs LME build-up) | Price-build-up as optional `CostingPricePolicy`; never silent override |
| Scope creep (full ERP costing) | Phase delivery; explicit out-of-scope list |
| Low-code security | No eval; parser whitelist; admin-only publish |
| Performance (formula graph) | Cache published config; single transaction per calculation |
| Missing NumberSequence | Implement sequence table in Stage B Phase D or reuse quotation numbering pattern |

---

## 25. Explicit out-of-scope items

| Item | Reason |
|---|---|
| Replace Increment 10 engine | Extend only |
| Commercial selling price / margin | Increment 12 commercial pricing |
| D365 integration | Not in source data |
| Automatic drum optimization formulas | Drum cost not configured |
| Arbitrary JavaScript/SQL in formulas | Security |
| Global default scrap 1% without approval | Source scope limited |
| Hard-coded LME additives (505, 725, 50) | Unresolved constants |
| Per-cable DAP allocation | Not reproducible from workbook |
| Customer-visible internal cost | Security violation |
| Replacing BOM/price approval workflows | Domain-controlled |
| Full Increment 12 B3 generic field admin | May integrate later; costing config is first consumer |

---

## 26. Execution phases (Stage B — after approval)

| Phase | Deliverable |
|---|---|
| **A** ✅ | This plan + discovery doc |
| **B** | Schema design + migration (config models, snapshot extensions) |
| **C** | Safe formula parser + variable catalog + dependency validator |
| **D** | Configuration CRUD + versioning + approval workflow |
| **E** | Scrap rule engine |
| **F** | Process cost rule engine (configuration shell; no fake rates) |
| **G** | Incoterm rule engine + destination validation |
| **H** | BOM + RM price integration (extend Increment 10 orchestrator) |
| **I** | Calculation persistence + snapshot + inquiry line link |
| **J** | Inquiry UI: Calculate, Costing tab, readiness, breakdown |
| **K** | Administration Costing hub |
| **L** | Formula Builder UI |
| **M** | Simulation UI (draft vs published) |
| **N** | Security/RBAC/audit hardening |
| **O** | Automated tests (50+ scenarios) |
| **P** | Regression + documentation |
| **Q** | Costing team + sales acceptance tests |

Each phase: inspect → implement → test → verify migration → update `INCREMENT_13_IMPLEMENTATION_LOG.md`.

---

## 27. Decision points requiring approval before Stage B

| # | Decision | Options |
|---|---|---|
| D1 | Ex-work 6% uplift | Costing layer / Commercial pricing / Exclude |
| D2 | LME price build-up | New PricePolicy vs manual RM prices only |
| D3 | ELAND workbook | Add to repo vs external artifact + test vectors |
| D4 | Default scrap | No global default / LV 1% as sample config only |
| D5 | Incoterm shipping | Full IncotermRule engine in v1 vs material-only v1 |
| D6 | NumberSequence | Implement shared table vs costing-specific counter |
| D7 | Config + Inc 12 B3 | Costing-first models vs wait for generic CustomFieldDefinition |

---

## 28. Definition of done (Increment 13)

Increment 13 is complete only when all items in spec section 68 are satisfied **and**:

- Company methodology documented (discovery doc maintained)  
- No fake costs in UI or API  
- Increment 10 tests still pass  
- 50+ new costing tests pass  
- Inquiry calculate-cost persists to PostgreSQL  
- Historical snapshots immutable  
- Customer isolation verified  

---

## 29. Immediate next action

1. **Review** this plan and `INCREMENT_13_COSTING_RULE_DISCOVERY.md`.  
2. **Resolve** decision points D1–D7 with costing/commercial stakeholders.  
3. **Obtain** governed copy of `ELAND_Cost_Sheet_Required.xlsx` (or signed export).  
4. **Approve** Stage B start phase (recommended: **Phase B + C** first — schema + parser without UI).  

**Do not write production costing formulas until decisions D1–D3 are closed.**

---

## 30. Related documentation to create in Stage B

| Document | Stage |
|---|---|
| `COSTING_FORMULA_ENGINE.md` | C |
| `SCRAP_RULE_ENGINE.md` | E |
| `INCOTERM_COST_ENGINE.md` | G |
| `BOM_COSTING_INTEGRATION.md` | H |
| `COSTING_CONFIGURATION_VERSIONING.md` | D |
| `COSTING_SNAPSHOT_MODEL.md` | I (extend existing) |
| `COSTING_SECURITY_MODEL.md` | N |
| `COSTING_API.md` | I (extend existing) |
| `COSTING_UI.md` | J/K |
| `COSTING_TEST_STRATEGY.md` | O |
| `INCREMENT_13_IMPLEMENTATION_LOG.md` | Ongoing |
| `BUSINESS_RULES.md` | N (costing sections) |

---

**End of Stage A.**
