---
name: phase-kickoff
description: Start a migration phase or sub-phase. Reads the legacy files for the scope, builds the real endpoint table and permission matrix from legacy code, proposes a plan, then stops for user approval. Use when the user says "ابدأ Phase N" or asks to plan a phase.
---

# Phase kickoff

Precondition: the user wrote "تمت المراجعة والـ UAT، ابدأ Phase <N>" (or explicitly asked for planning only). Otherwise stop.

1. Read `docs/MIGRATION/MIGRATION_PLAN.md` (phase section), `MIGRATION_STATUS.md`, `PROJECT_MAP.md`.
2. Run skill `inventory-verify` for the phase mounts. Never trust `ENDPOINT_INVENTORY.md` alone.
3. For each mount in `server.ts` (on `origin/main`), open the router file and list every route: method, full path, handler file:line, auth helper used (`requireSignedIn`, `requireMasterReadAuth`, ...), the `assertCan*` it calls, customer-isolation calls.
4. List the legacy tests that cover those routes (`rg -l "<path fragment>" src --glob "*.test.ts"`) with `it(` counts.
5. List domain files to copy into `energya-backend/src/shared/domain/`.
6. Output, in Arabic:
   - endpoint table (method, path, legacy file:line, auth helper, permission, customer allowed?)
   - permission matrix (route -> helper -> granular permissions -> personas)
   - test mapping plan (old file, count, new file)
   - proposed sub-split if > ~25 endpoints
   - risks and ambiguities (questions)
7. Stop. Do not write code until the user approves the plan.
