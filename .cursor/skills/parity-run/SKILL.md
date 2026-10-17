---
name: parity-run
description: Run the legacy-vs-Nest parity harness (seeds, servers, personas, negative tests) and collect verbatim evidence. Use when verifying gate G1 or after any change to a migrated route.
---

# Parity run

## Preconditions
- PostgreSQL up; parity DBs `energya_legacy` (legacy `.env`) and `energya_nest` (`energya-backend/.env`). Do not print `.env` values.
- Seeds TRUNCATE those two DBs only. Confirm with the user once per session before the first run.

## Steps
1. Start legacy: `npm run dev` (root, :3847). Start Nest: `npm run start:dev` (energya-backend, :3000). Wait for `/api/platform/health` on both.
2. Run the phase script, e.g. `npm run test:parity:phase2a` (root). Capture the full output to a file under `docs/MIGRATION/phase-<N>/`.
3. Check the summary line and every ❌. For each check verify:
   - legacy status == Nest status == expected status for the persona
   - body equal after normalisation (ids/timestamps replaced, not removed)
4. Confirm the negative tests failed as intended.
5. Stop both servers.

## Report
Paste: summary line, all ❌ lines with diffs, count of checks per section. Never edit the harness to turn ❌ into ✅; if the harness itself is wrong, describe the fix separately.
