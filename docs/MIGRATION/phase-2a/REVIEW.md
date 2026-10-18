# Phase 2a review evidence (2026-10-18)

Branch `migration/phase-2a-fix`. Catalog routes were removed from Nest registration. The phase 2a proxy table is still 19 routes. Nest total is 68, not 17.

`node scripts/inventory/generateInventory.mjs`:

```text
Endpoint Inventory written successfully: 472 endpoints
Served by Nest: 68 { '1': 49, '2': 19 }
phase2aRoutes=19 notRouted=0
products=false
facets=false
```

## npm test

Exit code 0.

```text
> energya-backend@0.0.1 test
> vitest run

 Test Files  7 passed (7)
      Tests  114 passed (114)
   Start at  17:32:49
   Duration  35.43s (transform 17.36s, setup 0ms, import 55.21s, tests 11.22s, environment 1ms)
```

## npm run test:e2e

Exit code 1. The five failures are `GET /api/v2/cables/products` and `/products/facets` returning 404 after the controller was unregistered. The test file was not changed.

```text
 ❯ test/master-data/customerCableCatalog.server.e2e-spec.ts (6 tests | 5 failed | 1 todo) 2525ms
     × requires sign-in 60ms
     × lists Cable Master rows with server-side pagination and no costing leak 27ms
     × maps category=MV from family/voltage without rewriting masters 25ms
     × maps POWER as LV ∪ MV family keys 23ms
     × returns live facets from Cable Master and documents unmapped category field 15ms

 FAIL  ... > requires sign-in
Error: expected 401 "Unauthorized", got 404 "Not Found"

 Test Files  1 failed | 9 passed (10)
      Tests  5 failed | 78 passed | 11 todo (94)
   Start at  17:33:58
   Duration  158.11s (transform 6.32s, setup 0ms, import 113.83s, tests 34.75s, environment 3ms)
```

## npm run build

Exit code 0.

```text
> energya-backend@0.0.1 build
> tsc -p tsconfig.build.json
```

## npm run lint

Exit code 0. Warnings only. The rerun after removing the unused `parseCableDescriptionConstruction` import does not list `customer-catalog.repository.ts`.

```text
> energya-backend@0.0.1 lint
> oxlint --type-aware src/ test/
LINT_EXIT=0
```

## node scripts/check-rules.mjs

Exit code 0.

```text
anyCount=140 baseline=140 previousAnyCount=143
check-rules passed
scopeBase=ee98586
```

The previous `any` count, before comments and strings were stripped, was 143.

## npm run test:parity:phase2a

Printed before the run: `parity databases: energya_legacy and energya_nest`. Exit code 1. The harness and its tests were not edited.

```text
Summary: 147/159 checks passed, 12 failed.
  FAIL anon GET /api/v2/cables/products?page=1&pageSize=10 [legacy 401 / nest 404 / expected 401] status differs; body differs
  FAIL customer GET /api/v2/cables/products?page=1&pageSize=10 [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL limited GET /api/v2/cables/products?page=1&pageSize=10 [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL granular GET /api/v2/cables/products?page=1&pageSize=10 [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL writer GET /api/v2/cables/products?page=1&pageSize=10 [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL admin GET /api/v2/cables/products?page=1&pageSize=10 [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL anon GET /api/v2/cables/products/facets [legacy 401 / nest 404 / expected 401] status differs; body differs
  FAIL customer GET /api/v2/cables/products/facets [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL limited GET /api/v2/cables/products/facets [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL granular GET /api/v2/cables/products/facets [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL writer GET /api/v2/cables/products/facets [legacy 200 / nest 404 / expected 200] status differs; body differs
  FAIL admin GET /api/v2/cables/products/facets [legacy 200 / nest 404 / expected 200] status differs; body differs
  PASS proxy table routes all 19 Phase 2a routes to Nest
```

## npm run verify:domain

Exit code 0.

```text
Verifying 11 domain copies (SHA-256)...
SYNC OK  drumOptimizationService.ts [specifiers] 8c90d22d1a52
SYNC OK  drumCapacityCalculator.ts [exact] e70c578d8db0
SYNC OK  drumOptimizationPresentation.ts [exact] ec290cf2bdf2
SYNC OK  customerCableCatalog.ts [specifiers] c3730d814f63
SYNC OK  v2AdvancedCableSearch.ts [exact] 637a5055901c
SYNC OK  masterDataSoT.ts [exact] b28715b6ffa3
SYNC OK  rawMaterialClassification.ts [imports] b04a7794a47b
SYNC OK  rbac.ts [imports] ef08feac8b4b
SYNC OK  customerScope.ts [imports] ecafc3b125b7
SYNC OK  permissionCatalog.ts [imports] bb5e01f39a5a
SYNC OK  passwordService.ts [imports] b9f1ea661676
All domain copies in sync.
```

## Not done

- No package upgrade for FIND-2A-03.
- Parity and the catalog e2e were not edited to expect 404.
- Root `.env.example` was not rewritten (FIND-2A-04).
- Commit `c3f708a` was not touched.
- Phase 2b was not started.
