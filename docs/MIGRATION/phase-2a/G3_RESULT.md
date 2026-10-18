# Phase 2a G3 result

**Branch:** `migration/phase-2a-fix` at `aaa5e25`  
**Date:** 2026-10-18  
**Databases printed before start:** `energya_legacy` on legacy port 3847, `energya_nest` on Nest port 3000. UI: `npm run dev:legacy-ui` on port 5173.  
No code, test, or existing script was edited. `scripts/parity/verify-g3-phase2a-ui.mjs` was not changed.

## Official command

```text
node scripts/parity/verify-g3-phase2a-ui.mjs
```

First launch exit 1. The browser closed before any screen ran:

```text
browserType.launch: Target page, context or browser has been closed
    at main (H:\Eland-Cables\scripts\parity\verify-g3-phase2a-ui.mjs:102:34)
```

The same command was run again, unchanged. Second launch exit 0.

The script does **not** expect `/api/v2/cables/products` to be served by Nest. `expectedNest` is `isNestRoute()`, and that path is no longer in `nestRoutes.mjs`. The observed lines were:

```text
GET /api/v2/cables/products?page=1&pageSize=50&sortBy=material -> 200 (legacy)
GET /api/v2/cables/products/facets -> 200 (legacy)
GET /api/master/drums -> 200 (nest)
GET /api/master/cables -> 200 (nest)
```

Closing lines:

```text
API requests: 621, served by Nest: 488
G3 passed.
G3_EXIT=0
```

`docs/MIGRATION/phase-2a/network_log.json` from that run: `generatedAt=2026-10-18T15:15:50.927Z`, `total=621`, `nest=488`, `failures=[]`.

## Extra coverage script

`scripts/parity/verify-g3-phase2a-coverage.mjs` was added and was not committed. Exit 0. `coverage requests=588`, `consoleErrors=0`.

```text
Login custA@parity.test -> 200
GET /api/v2/cables/products?page=1&pageSize=50&sortBy=material -> 200 (legacy)
GET /api/v2/cables/products/facets -> 200 (legacy)
GET /api/master/drums -> 200 (nest)
Login admin@energya.com -> 200
GET /api/master/cables -> 200 (nest)
Login limited@parity.test -> 200
GET /api/admin/security -> 403 (nest)
GET /api/admin/permissions/matrix -> 403 (nest)
```

No request in that run was `POST /api/master/drums/optimize`, `/capacity`, `/candidates`, or `/validate`. No request was `GET /api/master/cables/:materialNumber`.

## Table

| Screen | Account | Important requests | Status | X-Served-By |
|---|---|---|---|---|
| Customer Products | `custA@parity.test` | `GET /api/v2/cables/products` | 200 | none (legacy) |
| Customer Products | `custA@parity.test` | `GET /api/v2/cables/products/facets` | 200 | none (legacy) |
| Drum Optimizer | `custA@parity.test` | `GET /api/master/drums` | 200 | nest |
| Drum Optimizer | `custA@parity.test` | `POST /api/master/drums/optimize` | not sent | — |
| Drum Optimizer | `custA@parity.test` | `POST /api/master/drums/capacity` | not sent | — |
| Drum Optimizer | `custA@parity.test` | `POST /api/master/drums/candidates` | not sent | — |
| Drum Optimizer | `custA@parity.test` | `POST /api/master/drums/validate` | not sent | — |
| Cable Master list and search | `admin@energya.com` | `GET /api/master/cables` | 200 | nest |
| Cable Master open row | `admin@energya.com` | `GET /api/master/cables/:materialNumber` | not sent | — |
| Cable Master | `limited@parity.test` | `GET /api/master/cables` | not sent | — |
| Administration after limited login | `limited@parity.test` | `GET /api/admin/security` | 403 | nest |

## Code map for the drum and cable-detail calls

| Route | Code path | UI action |
|---|---|---|
| `POST /api/master/drums/optimize` | `src/api/drumPlanApi.ts:254` `optimizeDrumPlanViaApi`, called by `requestAutomaticDrumPlanFromPanel` in `src/components/common/DrumSelectionWorkflowPanel.tsx:48` | Technical Office (`/internal/technical-office`) → button **Search** → **Select** on a cable → **Automatic Optimization** |
| `POST /api/master/drums/candidates` | `src/api/drumPlanApi.ts:268` `listDrumCandidatesViaApi`, called in `DrumSelectionWorkflowPanel.tsx:314` while mode is Manual | Same popup, **Manual Selection**, after Cable Tolerance and Cutting Length are filled |
| `POST /api/master/drums/validate` | `src/api/drumPlanApi.ts:261` `validateDrumPlanViaApi`, called in `DrumSelectionWorkflowPanel.tsx:427` | Same popup, after a drum code is chosen on a line that already has a cutting length |
| `POST /api/master/drums/capacity` | Server only: `src/server/masterDataRoutes.ts:843`. No call in `src/` | No button |
| `GET /api/master/cables/:materialNumber` | Not called. `src/services/masterDataApiService.ts:564` is `PUT` inside `updateCableViaApi`, reached from `ExcelCableUploadModal.tsx:229` | No button for GET. Upload Cables commits with PUT |

## Coverage rerun of those actions

```text
REQ POST /api/master/drums/candidates
REQ POST /api/master/drums/optimize
WATCH POST /api/master/drums/optimize -> 200 (nest)
WATCH POST /api/master/drums/candidates -> 200 (nest)
MISSING POST /api/master/drums/validate
MISSING POST /api/master/drums/capacity
MISSING GET /api/master/cables/:materialNumber
COVERAGE_EXIT=0
```

| Screen | Account | Action | Request | Status | X-Served-By |
|---|---|---|---|---|---|
| Technical Office search popup | `admin@energya.com` | Manual Selection after length 1000 and tolerance 2 | `POST /api/master/drums/candidates` | 200 | nest |
| Technical Office search popup | `admin@energya.com` | Automatic Optimization | `POST /api/master/drums/optimize` | 200 | nest |
| Technical Office search popup | `admin@energya.com` | Choose a drum on the line | `POST /api/master/drums/validate` | not sent | — |
| — | — | no UI control | `POST /api/master/drums/capacity` | not sent | — |
| Cable Master | `admin@energya.com` | open a row | `GET /api/master/cables/:materialNumber` | not sent | — |

## Findings

1. The official script's second run passed. It does not require products to be served by Nest. Products returned 200 from legacy, with no `X-Served-By: nest`.
2. Drum Optimizer calculated the 33kV preset locally (17,000 m, 9 drums) and did not call optimize, capacity, candidates, or validate.
3. Clicking a Cable Master row did not call `GET /api/master/cables/:materialNumber`. Search filtered the list already loaded by `GET /api/master/cables`.
4. `limited@parity.test` was not shown Master Data. The screen was Administration, with `403` and the text `Not authorized for ADMIN:SECURITY:VIEW.` No cable-master 403 was observed.
5. The first official launch failed because Edge closed before the first page: `browserType.launch: Target page, context or browser has been closed` at `verify-g3-phase2a-ui.mjs:102`. The script was not changed. This launch is flaky.
6. `POST /api/master/drums/validate` did not leave the browser. The select showed "Select suitable drum" and had no second option after candidates returned, so no drum code was applied. The call site is `DrumSelectionWorkflowPanel.tsx:427`.
7. `POST /api/master/drums/capacity` has no frontend caller. The only definition is `src/server/masterDataRoutes.ts:843`.
8. `GET /api/master/cables/:materialNumber` has no frontend caller. `masterDataApiService.ts:564` sends `PUT` through `updateCableViaApi`, used when Upload Cables commits an existing material.
