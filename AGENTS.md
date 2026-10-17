# AGENTS.md — Energya Connect migration

Express 4 legacy backend -> NestJS (`energya-backend/`). React 19 UI, PostgreSQL and Prisma stay as they are.
`energya-frontend/` (Vue) is frozen and unused.

Reply to the user in Arabic (Egyptian is fine). Code, identifiers, commands and commit messages in English.

## Read before any work
1. `docs/MIGRATION/MIGRATION_PLAN.md` — binding plan, phases, gates G1-G5.
2. `docs/MIGRATION/MIGRATION_STATUS.md` — live tracker, legacy modifications log, security findings.
3. `docs/MIGRATION/PHASE_CLOSING_PROTOCOL.md` — closing bundle per phase.
4. `docs/MIGRATION/PROJECT_MAP.md` — architecture, commands, known contradictions and risks.
5. `.agents/rules/MIGRATION_RULES.md` — original standing rules (Cursor does not load this folder automatically; `.cursor/rules/` mirrors it).

The legacy code is the specification. If a doc disagrees with legacy code, legacy wins and the discrepancy is reported.

## Roles (subagents in `.cursor/agents/`)
- **orchestrator** = the main agent. Plans, delegates, reviews, merges. Never ports more than one module at a time.
- `legacy-explorer`, `security-reviewer`: read-only, may run in parallel.
- `module-porter`, `test-porter`, `parity-engineer`, `status-keeper`: writers. Only one writer per module at a time.

## Delegation rules
- Every deliverable ends with verbatim command output as evidence. No ✅ without output.
- No agent commits to `main`, force-pushes, or starts a new phase.
- A new phase starts only after the user writes: "تمت المراجعة والـ UAT، ابدأ Phase <N+1>".
- Destructive DB/git commands need explicit user approval (enforced by `.cursor/hooks.json`).

## Workflows (skills in `.cursor/skills/`)
`phase-kickoff` -> `port-module` -> `port-tests` -> `parity-run` -> `security-review` -> `phase-close`. Use `inventory-verify` before sizing any phase.
