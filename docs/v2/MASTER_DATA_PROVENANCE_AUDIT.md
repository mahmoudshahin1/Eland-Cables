# Master Data Provenance Audit

**Mode:** READ-ONLY. Generated 2026-09-12T17:17:19Z.

**This task did not create, update, or delete any database rows.**

Classification is conservative. Existence in PostgreSQL is **not** proof of Energya-approved master data. Many `E` rows are likely leftover test isolation records; they are left as `E` until a human confirms deletion.

Classes:

- **A** = provided/approved Energya data (import batch tied to official workbooks)
- **B** = legitimate system-generated data (number sequences, workflow templates, inquiry/quotation snapshots created by the app)
- **C** = test/demo data (fixture xlsx, `tester` import batches, `*.test` emails, timestamped ISO customers)
- **D** = AI/generated/seed business data (`dev-seed` / `demo-seed` / `prisma/seed.ts` / migration INSERTs of catalog rows)
- **E** = unknown provenance (no `sourceBatch`, no seed marker, not clearly a test prefix)

No rows were deleted or updated after classification.

---

## Totals by entity (live PostgreSQL)

| Entity | Total | Notes |
| --- | ---: | --- |
| CableMaster | 436 | 432 on batch `IMP-20260825104426-K3CZ` |
| CableBomLine | 4988 | Matches documented Cable Materials count (~4,986) |
| GovernedBomLine | 67 | App-governed BOM rows |
| CableEngineeringMapping | 435 | Almost 1:1 with CableMaster |
| RawMaterial | 598 | 285 have null `sourceBatch` |
| RawMaterialPrice | 327 | |
| DrumMaster | 227 | 103 on batch `IMP-20260825104504-YYKS`; **124 have null `sourceBatch`** |
| DrumCompatibility | 0 | |
| CableParameter | 60 | Seeded from `src/data/cableParameterMasters.ts` via `prisma/seed.ts` |
| ParameterCompatibility | 36 | Seeded VOLTAGE↔FAMILY |
| Customer | 1643 | Vast majority look like test isolation leftovers |
| CustomerUser | 1829 | |
| UserAccount | 3259 | Tests write users into the **shared** database |
| ImportBatch | 547 | Recent 100 sampled: almost all `importedBy=tester` fixture files |
| AuditEvent | 96242 | |
| DestinationPort | 0 | |
| Incoterm | 0 | |
| ShippingCostRate | 0 | |
| ContainerType | 4 | Migration INSERT (`ct-40hq` …) |
| MarketMetalPriceDefault | 2 | Cu 14600 / Al 3300, createdBy Development Bootstrap Administrator |
| CommercialPricingRule | 44 | Includes leftover “Rule 2 Overlap” GLOBAL rules from tests |
| CommercialInquiry | 831 | Mix of real + test |
| CommercialInquiryLine | 552 | |
| CommercialQuotation | 107 | |
| V2DrumPlan | 454 | System-generated from inquiry drum workflow + tests |
| V2ConfigurationSnapshot | 474 | |
| CostingRun | 13 | |
| NumberSequence | 4 | Seed/migration |

---

## Class tallies (entities classified row-by-row)

| Entity | A | B | C | D | E |
| --- | ---: | ---: | ---: | ---: | --- |
| DrumMaster | 103 | 0 | 2 | 0 | 122 |
| CableMaster | 432 | 0 | 3 | 0 | 1 |
| UserAccount | 0 | 1492 | 651 | 8 | 1108 |
| Customer | 0 | 0 | 183 | 1 | 1459 |

**UserAccount B vs C vs E caveat:** many `B` rows have `createdBy=dev-admin-1` but emails like `lock-sess-h1-*@energya.test`. Those are **test users created through the identity API**, not Energya staff. Treat most of B/E in UserAccount as suspected **C** until reviewed.

**Customer E caveat:** codes such as `ISOA-h1-<timestamp>` / `ISOB-h1-<timestamp>` / `B Co` are test isolation customers. Heuristic left them **E** because they do not match `CA-` / `test` exactly. Suspected **C**.

---

## DrumMaster (user concern)

Official-looking import:

- Batch `IMP-20260825104504-YYKS` → **103** drums (`EWD630-0`, `EWD700-3`, `EWD800-9`, …)
- Created 2026-08-22; `sourceBatch` set
- Documented official file: `data/source/Drum List.xlsx`
- **Class A (pending human confirmation that this batch was the Energya Drum List import)**

Not from that batch (**122 E + 2 C**), including:

| Identifier | Code | createdAt | Class | Suspected source |
| --- | --- | --- | --- | --- |
| `cmto3bi6z002vtx8gypabqfyk` | `EWD-TEST-COST-v2cost-1788595057408` | 2026-09-05 | C | `src/platform/v2CostingRunPersistence.test.ts` |
| `cmto3oq8i002vtxec51sz3u39` | `EWD-TEST-COST-v2cost-1788595676955` | 2026-09-05 | C | same |
| `cmt8kq7cs0000txgkv9n84htr` | `I11-DRM-WOOD220` | 2026-08-25 | E | increment commercial tests |
| `cmt8krcu40000txhobfns4mo6` | `I13E-DRM` | 2026-08-25 | E | increment tests |
| `cmt8ksx4g000ctxtc1k46myo5` | `I12-DRM` | 2026-08-25 | E | increment tests |
| `cmtvmbqsd003etxksr0ucnkgk` | `EWD-B1-b1-1789050243307` | 2026-09 | E (likely C) | `src/platform/containerStudyB1.test.ts` |
| `cmtmtqc4z0007txkcgoizqsah` | `T04D-1788518491379` | 2026-09 | E (likely C) | increment tests |

These extra drums are why the application contains drum codes the user did not provide.

---

## CableMaster

| Batch | Count | Class |
| --- | ---: | --- |
| `IMP-20260825104426-K3CZ` | 432 | A (matches documented Cable List 432 / `Energya Cable Master Data.xlsx`) |
| `(null sourceBatch)` | 3 | C |
| `IMP-20260912163200-YHZT` | 1 | E / likely C (`cable-list.xlsx` imported by `tester` during `npm test`) |

---

## Seed / demo users (Class D) — identifiers only

| id | email | createdBy |
| --- | --- | --- |
| `dev-tech-1` | technical@energya.com | dev-seed |
| `dev-proc-1` | n.nabil@energya.com | dev-seed |
| `dev-sales-2` | m.ahmed@energya.com | dev-seed |
| `dev-cost-1` | k.salem@energya.com | dev-seed |
| `dev-admin-2` | ehab.maher@energya.com | dev-seed |
| `dev-cust-eland` | david.smith@elandcables.com | dev-seed |
| plus remaining `dev-*` / `demo-*` bootstrap rows | | |

Customer `C-ELAND` (`cmt2s3kda004itxtkr41fzgr0`) is created by `seedGovernedElandCustomer()` in `src/server/identityService.ts` / `src/server/customerMigration.ts`. **Class D.**

---

## Other suspicious business data

### ContainerType (D — migration)

`prisma/migrations/20260910180000_container_study_persistence_foundation/migration.sql` inserts `40HQ`, `40STD`, `20STD`, `40OT`. Comments in the migration say these are **not** approved production dimensions.

### Market metal defaults (D / unknown business values)

- COPPER 14600 USD/MT ACTIVE — createdBy Development Bootstrap Administrator
- ALUMINIUM 3300 USD/MT ACTIVE — same

Not from Energya master files in this audit. Values were activated via costing-admin APIs in prior demo work; **this task did not change them**.

### CommercialPricingRule (C)

44 rules. Recent names include `Rule 1`, `Rule 2 Overlap`, createdBy `Eng. Sales Officer` during increment pricing tests (`src/server/increment12.pricing.test.ts`). These are **not** Energya commercial policy.

### Ports / Incoterms / Shipping rates

All **0**. No fabricated logistics masters in the database at audit time.

---

## Source-code audit (no files changed)

### Seed / demo writers

| File | What it writes |
| --- | --- |
| `prisma/seed.ts` | CableParameter, ParameterCompatibility, NumberSequence; in non-production calls `seedDevelopmentUsers()` |
| `scripts/seedDemoUsers.ts` | Demo personas when `ALLOW_DEMO_USERS` / `DEMO_SEED` |
| `src/server/identityService.ts` | `seedDevelopmentUsers`, `seedDemoPersonaUsers` — hardcoded emails, `c-eland`, passwords |
| `src/server/customerMigration.ts` | `seedGovernedElandCustomer` upserts `C-ELAND` |

### In-memory / UI fixtures (not necessarily DB)

| File | Notes |
| --- | --- |
| `src/data/mockUsers.ts` | Frontend identity catalog including `c-eland` |
| `src/data/mockData.ts` | `MASTER_CABLE_CATALOG` fixture fallback |
| `src/data/cableParameterMasters.ts` | Parameter lists seeded to DB |
| `src/fixtures/increment4/cableMasterFixtures.ts` | Explicit I4 fixture — **not** official Cable List |
| `src/services/cableCatalogService.ts` | LocalStorage / fixture fallback |

### Tests that write to the **real** PostgreSQL (`DATABASE_URL`)

This is the primary contamination path. Examples:

- `src/server/increment4.readiness.test.ts` — `i4-fixture.xlsx`, `rm-fixture.xlsx`
- `src/server/increment9.price.test.ts` — `rawMaterial.createMany`, BOM lines
- `src/server/increment12*.test.ts` — customers, users, pricing rules
- `src/platform/v2DrumPlanPersistence.test.ts`
- `src/platform/containerStudyB*.test.ts` — drums, ports, rates, customers
- `src/platform/v2CostingRunPersistence.test.ts` — `EWD-TEST-COST-*` drums
- `src/server/masterData.persistence.test.ts` — `drumMaster.create`
- Many tests call `seedDevelopmentUsers()`

`src/server/commercialTestCleanup.ts` documents that unscoped `deleteMany` would wipe demo data; tests still **insert** into the shared DB.

### Migrations that INSERT business/catalog rows

| Migration | Inserts |
| --- | --- |
| `20260910180000_container_study_persistence_foundation` | ContainerType, algorithm config with `LEGACY_SAMPLE_NOT_PRODUCTION_MASTER` |
| `20260828120000_costing_v3_workspace` | CostingCurrency |
| `20260905120000_v2_inquiry_configuration_snapshot` | NumberSequence |
| `20260907120000_v2_quotation_lineage` | NumberSequence |
| `20260910120000_workflow_runtime_foundation` | WorkflowTemplate/Step/Transition |
| `20260911120000_v2_cutting_length_requirement` | Backfill SELECT→INSERT of cutting requirements (B, not new masters) |
| `20260911190000_container_study_b4a_shipment_group_membership` | Shipment group line backfill |

### Hardcoded drum fallback in UI (does not insert masters by itself)

- `src/components/inquiry-quotation/InquiryMultiDrumCuttingModal.tsx` default `'EWD630-0'`

---

## This task’s database delta

| Operation | Count |
| --- | ---: |
| Created | **0** |
| Modified | **0** |
| Deleted | **0** |

Full `npm test` was **not** executed for this recovery pass because the suite writes fixture rows into the shared database.

---

## STOP

Do not clean the database yet. Do not delete C/D/E rows until the user reviews this audit.
