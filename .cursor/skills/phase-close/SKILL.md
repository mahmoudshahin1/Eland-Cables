---
name: phase-close
description: Produce the 4-file closing bundle (REVIEW, SECURITY_REVIEW, RUNBOOK, UAT) for a phase from real command outputs, update MIGRATION_STATUS, push the phase branch and stop. Use at the end of a phase or sub-phase.
---

# Phase close (docs/MIGRATION/PHASE_CLOSING_PROTOCOL.md)

1. Collect fresh verbatim outputs: `npm test`, `npm run test:e2e`, `npm run build`, `npm run lint` (energya-backend), `npm run verify:domain`, parity run, G3 run.
2. Write `docs/MIGRATION/phase-<N>/`:
   - `REVIEW.md`: outputs, test mapping table, legacy modifications (`git diff --stat origin/main..HEAD -- src server.ts prisma vite.config.ts package.json`), new packages, intentional differences, domain registry + hash result.
   - `SECURITY_REVIEW.md`: run skill `security-review`.
   - `RUNBOOK.md`: from a clean clone; env var names only; DB create, migrate, seed; start legacy, Nest, UI; test accounts (how seeded); tests; reset; stop. Execute it in a clean folder and record the result.
   - `UAT.md`: scenarios with empty "نتيجة المستخدم" column: happy path, errors, security personas, edge cases.
3. Consistency check: every number in the four files equals the outputs. Grep for each claimed number.
4. Update `MIGRATION_STATUS.md` (counts, gates with evidence links, findings, deferred tests).
5. Commit on `migration/phase-<N>`, push that branch, then stop and tell the user "جاهز للمراجعة". Never tag; the user tags `phase-<N>-accepted` after UAT.
