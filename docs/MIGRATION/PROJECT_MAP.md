# Project Map: Energya Connect Migration (Express 4 -> NestJS)

> Written: 2026-10-17, from branch `migration/phase-2` @ `b95178f`.
> Method: read-only inspection (git, grep, file reads). No build, test or parity run was executed for this document.
> Every claim below cites a file/line or a command. Items marked **UNVERIFIED** need a live run.

---

## 1. Architecture

### 1.1 Legacy (frozen reference)
- Entry: `server.ts` (Express 4). Routers are mounted at `server.ts:49-110`, all from `src/server/*Routes.ts`.
- Business logic: `src/domain`, `src/services`, `src/platform`, `src/server/*Repository.ts`.
- RBAC: `src/server/rbac.ts` (1122 lines), `src/server/customerScope.ts`.
- UI: React 19 in `src/components`; API calls in `src/services/*ApiService.ts`.
- DB: PostgreSQL via Prisma, single schema `prisma/schema.prisma` (shared with Nest).
- Port `:3847`. In dev, `server.ts` also hosts Vite middleware.

### 1.2 Target
- `energya-backend/` NestJS 12, ESM, Prisma client pointed at `../prisma/schema.prisma` (`energya-backend/package.json` `prisma.schema`).
- Modules registered in `energya-backend/src/app.module.ts`: `AuthModule`, `AdminIdentityModule`, `AdminCustomersModule`, `MasterDataModule`, `InquiriesModule` (draft, out of scope), plus `AppController` (`/api/platform/health|status`).
- Cross-cutting: `src/common/config/env.validation.ts` (DATABASE_URL, JWT_SECRET >= 32 chars), `src/common/filters/domain-exception.filter.ts`, `src/common/guards/*`, `ThrottlerModule`, `helmet` + manual headers in `src/main.ts`, `X-Served-By: nest` header when `NODE_ENV !== 'production'` (`src/main.ts:29-31`).
- Port `:3000`.
- `energya-frontend/` (Vue 3) is **frozen/archived** per user decision. Its lockfile still resolves from `registry.npmmirror.com` (167 entries).

### 1.3 Hybrid routing (Vite proxy) — `vite.config.ts`
- `npm run dev:legacy-ui` runs Vite on `:5173`.
- Regex rule sends to Nest `:3000`:
  `^/api/(auth|admin/(users|roles|permissions|security|customers|customer-users|customer-reference-masters)|(master|platform)/(cables|raw-materials|boms|drums|reference|keys|uniqueness|sot-status|db)|v2/cables/products)(\?|/|$)`
- Everything else under `/api` goes to legacy `:3847`.
- Rollback = narrow the regex.

### 1.4 Domain copies (legacy -> `energya-backend/src/shared/domain/`)
SHA-256 compared with `Get-FileHash`:

| File | Legacy source | Identical | In `verify-domain-sync.mjs` |
|---|---|:---:|:---:|
| drumOptimizationService.ts | src/domain | yes | yes |
| drumCapacityCalculator.ts | src/domain | yes | yes |
| drumOptimizationPresentation.ts | src/domain | yes | yes |
| customerCableCatalog.ts | src/domain | yes | **no** |
| v2AdvancedCableSearch.ts | src/domain | yes | **no** |
| masterDataSoT.ts | src/platform | yes | **no** |
| rawMaterialClassification.ts | src/domain | **no** (type inlined, trailing commas) | **no** |
| rbac.ts | src/server | **no** (import paths only) | **no** |
| customerScope.ts | src/server | **no** (imports **legacy** `src/server/db` and `src/server/identityService`) | **no** |
| permission-catalog, rbac-engine, rbac-compatibility, safe-user, password-service | no same-name legacy file | n/a | no |

### 1.5 Databases
- Legacy `.env` -> `energya_legacy`; Nest `.env` -> `energya_nest` (`docs/MIGRATION/phase-2a/RUNBOOK.md` §2).
- Consequence: sessions issued by Nest do not exist in the legacy DB (see risk R1).

### 1.6 Parity and tests
- `scripts/parity/parityHarness.mjs`: fixture runner + `normalizePayload`.
- `scripts/parity/run-full-parity.mjs` (Phase 1), `run-phase2a-parity.mjs` (Phase 2a).
- `seed-auth.mjs`, `seed-master-data.mjs` (uses `TRUNCATE CASCADE` on both parity DBs: destructive, needs approval before each run).
- `verify-domain-sync.mjs` (3 files only), `verify-g3-ui.mjs`, `verify-g3-phase2a-ui.mjs` (Playwright, Edge channel).
- Backend tests: `npm test` (vitest, `test/**/*.spec.ts` + `src/**/*.spec.ts`), `npm run test:e2e` (`vitest.config.e2e.ts`, real DB).

---

## 2. Folder map (relevant parts)

```
/                       server.ts, vite.config.ts, package.json (legacy)
src/server/             Express routers, repositories, rbac.ts, customerScope.ts
src/domain|services|platform/  legacy pure logic + UI API services
src/components/         React UI (kept)
prisma/                 schema.prisma (single source), migrations, seed.ts
energya-backend/src/    Nest: common/, shared/domain/, auth/, admin-identity/, admin-customers/, master-data/{cables,raw-materials,boms,drums,reference,common}/, inquiries/ (draft)
energya-backend/test/   vitest specs (unit + e2e)
scripts/parity/         parity harness, seeds, G3 scripts
scripts/inventory/      generateInventory.mjs/.ts (source of ENDPOINT_INVENTORY.md)
docs/MIGRATION/         plan, status, protocol, reviews, phase-2a/ bundle
.agents/rules/          MIGRATION_RULES.md (Antigravity rules, 15 rules)
energya-frontend/       Vue (frozen, unused)
```

---

## 3. Run and test commands (from RUNBOOK + package.json)

| Purpose | Command (cwd) |
|---|---|
| Legacy API + UI | `npm run dev` (root, :3847) |
| Hybrid UI | `npm run dev:legacy-ui` (root, :5173) |
| Nest | `npm run start:dev` (energya-backend, :3000) |
| Nest unit | `npm test` (energya-backend) |
| Nest e2e | `npm run test:e2e` (energya-backend, needs DB) |
| Nest build / lint | `npm run build`, `npm run lint` (oxlint) |
| Legacy tests | `npm test` (root, `scripts/runRegisteredTests.mjs`) |
| Domain sync | `npm run verify:domain` (root) |
| Parity 2a | `npm run test:parity:phase2a` (root; seeds with TRUNCATE) |
| Prisma | `npm run prisma:migrate`, `npm run prisma:seed` |

---

## 4. Current status (verified from git/code)

| Phase | Branch @ commit | Real legacy endpoints | In Nest | Gates with evidence in repo | Closing bundle | Tag |
|---|---|---|---|---|---|---|
| 0 Foundation | `migration/phase-0` @ `8cb2557` | 2 (`/api/platform/health`, `/status`) | 2 | Status file: G1 ⬜ G3 ⬜ | n/a (protocol did not exist) | none |
| 1 Auth/RBAC/Admin | `migration/phase-1` @ `3693e4a` | 49 (12 auth + 23 admin-identity + 14 admin-customers) | 49, paths match | Claimed G1-G5 ✅ in REVIEW_PHASE_1 (not re-run here) | old format `REVIEW_PHASE_1.md` only | none |
| 2a Master read + drums | `migration/phase-2` @ `b95178f` | **19** (18 `/api/master/*` + `/api/platform/db`) | 19 real + **19 non-legacy aliases** + 2 Phase-3 `v2/cables/products*` | Tests static count OK; G1 has gaps; G3 evidence weak | 4 files in `phase-2a/` (gaps, see §5) | none |
| 2b / 2c | not started | ≈59 remaining real Phase-2 routes (re-split needed) | 0 | - | - | - |
| 3-8 | not started | inventory numbers unreliable until regenerated | 0 | - | - | - |

Test counts (static count of `it(`/`test(` and `it.todo(`): unit 114 (matches report output), e2e 83 + 11 todo (matches). Legacy source counts match the 2a mapping table (60/14/7/6/5/13).

---

## 5. Contradictions (docs vs code)

| # | Claim | Reality | Evidence |
|---|---|---|---|
| C1 | 2a = 36 endpoints | 19 real; 17 of the 36 never existed in legacy | `git show origin/main:server.ts` mounts only `platformDbRouter` on `/api/platform`; `platformDbRouter` has only `/db` (`masterDataRoutes.ts:206-215`) |
| C2 | Legacy is frozen | `server.ts:79-80` added `app.use('/api/platform', masterDataRouter)` and `app.use('/api/master', platformDbRouter)` in `b95178f` | `git diff origin/main..origin/migration/phase-2 -- server.ts` |
| C3 | Legacy modifications log complete | `server.ts`, `prisma/seed.ts` (+14 lines: governed customer + DAP/CIF incoterms, since Phase 1), root `package.json` scripts are **not** logged | `MIGRATION_STATUS.md` §5 vs `git diff --stat origin/main..HEAD` |
| C4 | ENDPOINT_INVENTORY = 585 | 52 fake rows (51 `/api/platform/*` + `/api/master/db`); generator attributes every router in a file to each mount | `scripts/inventory/generateInventory.mjs:57-87`, inventory grep |
| C5 | Nest = legacy routes | Nest uses `@Controller(['api/master','api/platform'])` in 5 controllers and `@Get(['api/master/x','api/platform/x'])` in reference controller | `cables.controller.ts:15`, `drums.controller.ts:18`, `boms.controller.ts:6`, `raw-materials.controller.ts:6`, `attachments.controller.ts:23`, `reference.controller.ts:15-39` |
| C6 | Limited internal user gets 403 | Parity log shows 200 vs 200 on `/cables`, `/raw-materials`, `/boms`, `/drums` but 403 on `/drums/optimize`. Harness only compares A vs B, never the expected status | `REVIEW_PHASE_2A.md` lines 235-242; `run-phase2a-parity.mjs:154-165`, `500-529` |
| C7 | `GET /cables` needs 1 of 7 perms (SECURITY_REVIEW row 1) | Legacy uses `requireSignedIn` only for `GET /cables` | `masterDataRoutes.ts:218` vs `:261` |
| C8 | G3 UI passes | 28 of 103 requests returned 401 from legacy (notifications, v2/inquiries, sales-orders, workflows, `/api/master/imports`). Script never asserts; defaults header to `legacy/express` | `phase-2a/network_log.json`; `verify-g3-phase2a-ui.mjs:24,113-116` |
| C9 | G2 = "108 unit" (REVIEW conclusion) | Same report output says 114 | `REVIEW_PHASE_2A.md` line ~458 vs line 42 |
| C10 | Domain copies registered and synced | Only 3 of 9 copies registered; 3 copies differ from legacy | §1.4 |
| C11 | G4: no `any` | ~50 `any` occurrences in controllers (admin-identity 17, admin-customers 12, auth 6, inquiries 6, drums 4, ...) | grep `: any|as any` in `energya-backend/src` |
| C12 | Size limits | Over limit: `admin-customers.service.ts` 313, `admin-identity.controller.ts` 224, `customer-catalog.repository.ts` 305, `master-data-dto.ts` 206, `inquiries.service.ts` 394 | line counts |
| C13 | RUNBOOK "Verified" | No recorded clean-clone execution (protocol §3.3) | grep `git clone` in RUNBOOK: none |
| C14 | Parity compares error messages | Anonymous checks use `ignore: ['error']`; mutations ignore `id`/`createdAt` instead of normalising | `run-phase2a-parity.mjs:213,235,429-446` |
| C15 | Rules file says target UI is Vue | User decision: keep React; `MIGRATION_RULES.md` line 5 and plan §3/Phase 9 still say Vue | `.agents/rules/MIGRATION_RULES.md` |
| C16 | CORS_ORIGIN mandatory (plan Phase 0) | Not validated; falls back to `origin: true` with `credentials: true` | `env.validation.ts`, `main.ts:38-50` |

---

## 6. Risks

| ID | Risk | Severity |
|---|---|---|
| R1 | Hybrid UI broken: `/api/auth` goes to Nest (`energya_nest`), legacy (`energya_legacy`) rejects those sessions -> every unmigrated screen gets 401 (C8). Rollback-by-proxy strategy does not work as configured. | High |
| R2 | Proxy regex sends unmigrated 2b writes to Nest (404): `PUT /api/master/raw-materials/:code`, `POST /api/master/drums/excel-preview|excel-commit`, `POST /api/master/boms/excel-commit`, `PUT/POST /api/master/cables`, `GET /api/v2/cables/products/export` — all used by React (`masterDataApiService.ts:234,373,400,678`, `customerCableCatalogApiService.ts:84`, `RawMaterialsPanel.tsx:142,166`) | High |
| R3 | Nest imports legacy runtime: `shared/domain/customerScope.ts:1,4` -> `src/server/db`, `src/server/identityService` (legacy Prisma client and env) | High |
| R4 | 19 fabricated routes in Nest + 2 in legacy `server.ts` (C1, C2, C5) | High (parity contract) |
| R5 | Inventory inflated (C4) -> phase sizing and progress (87/585) wrong | Medium |
| R6 | Parity harness cannot detect "both wrong" (C6, C14) | Medium |
| R7 | `.cursor/mcp.json` contains a plaintext GitHub token, untracked but **not** gitignored | High (secret) |
| R8 | `seed-master-data.mjs` runs `TRUNCATE CASCADE`; running parity is a destructive action | Medium (process) |
| R9 | Draft `InquiriesModule` registered in Nest, not ported 1:1 | Low now, High at Phase 4 |
| R10 | Open legacy findings SEC-MD-01, SEC-MD-02 awaiting owner decision | Medium |

---

## 7. Open questions

1. SEC-MD-01 / SEC-MD-02: keep as-is (parity) until which phase, and who is the decision owner?
2. Hybrid DB: should legacy and Nest share one DB (and one JWT secret) during the hybrid UI period, or should the proxy keep `/api/auth` on legacy until cutover?
3. Remove `/api/platform/*` aliases from both `server.ts` and Nest, and the fake `/api/master/db`: approved?
4. Is `GET /api/v2/cables/products*` (Phase 3 in the plan) accepted inside 2a, or moved back to Phase 3?
5. Is the `prisma/seed.ts` change (governed customer + incoterms) an approved "unblock" edit?
