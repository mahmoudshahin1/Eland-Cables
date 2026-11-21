# PROJECT_HANDOFF

## Goal
Continue `STANDARD_INQUIRY_V2` on `feat/standard-inquiry-v2` until INQ26-00003 can leave COSTING, then walk Commercial through Production Handover. Keep the financial launch / FOX path unchanged. Keep manual cost recalculation locked after Submit.

## Done
- Governed FX table was empty. Migration `20261121103000_costing_workbook_fx_opening` inserted the workbook pairs already used by `scripts/configureCostingOperationalReadiness.ts`: USD→LE 50.1649, EUR→LE 58.4972, GBP→LE 68.3145. EUR→USD and GBP→USD resolve through LE. LE→USD uses the inverse of USD→LE. Applied on the DEV database only.
- `resolveFxRate` falls back to the latest consumable governed rate whose window starts on or before the costing date, and logs `[FX] No exchange rate is effective on ...`.
- INQ26-00003 costing completed. Workflow moved COSTING → SALES_REVIEW. Quotation draft QUO26-00034. Sales then approved it. Workflow is now QUOTATION_ISSUE.
- Finance 403 on COSTING was a side effect. `FINANCE_MANAGER` owns FINANCIAL_RELEASE only. The same check still returns UNAUTHORIZED for COSTING and for SALES_REVIEW. No permission change.
- Stage action forms (PO, financial release, forward, clarification, response) render only when `actorMayTransitionStep` allows the signed-in role.
- EXPORT regression INQ26-00005 (customer TEST-EXPORT-001, segment EXPORT, no shipment groups) stays on TECHNICAL_COMPLETE with template STANDARD_INQUIRY_V2. Container study was not skipped.
- Manual `calculateV2CostingRun` on INQ26-00003 without the orchestrator flag returns `COSTING_LOCKED`.

## Current point
Branch `feat/standard-inquiry-v2`.
Commits: `d7c332d` (FX), `6eb8440` (stage-owner buttons). Parent of this work: `a8471b2`.
INQ26-00003 is READY_FOR_COMMERCIAL, workflow QUOTATION_ISSUE, quotation QUO26-00034 approved and not issued.
INQ26-00005 is the export regression, stopped at TECHNICAL_COMPLETE.
An empty draft INQ26-00004 was created when the first export attempt failed before a line was added.

## Decisions and reasons
- Rates live in the migration, not in `currencyConversion.ts`. The numbers are the existing workbook pairs, not a new market quote.
- The blocked materials were EUR (HF27, HF30) and LE (TP01), not GBP. GBP→USD was still added because the workbook pair exists.
- Finance was not granted COSTING. The 403 is the stage-owner rule.
- Decision 5 was not signed. Issue stays blocked until that existing sign-off is recorded. Signing would unlock production issue for the whole DEV database.

## Files changed
- `src/domain/currencyConversion.ts`
- `src/domain/currencyConversion.test.ts`
- `prisma/migrations/20261121103000_costing_workbook_fx_opening/migration.sql`
- `src/components/inquiry-quotation/WorkflowStatusWorkspaceTab.tsx`

## Current errors
- Issue of QUO26-00034: `Decision 5 unsigned — production issue blocked (Option B / LME-base only).`
- Because issue is blocked, customer accept, PO match, commitment, financial release, and production handover were not reached.
- The running UI was not opened. Owner labels and the role gate were checked through the workflow records and `actorMayTransitionStep`.

## Next step
Decide whether to record Decision 5 Option B on DEV with the existing `signDecision5OptionB` path. After that, issue QUO26-00034, accept it as the standard customer, match the PO, then walk sales, finance, and the planner through Production Handover and confirm each owner label and English button in the UI.

## Important instructions
- Stay on `feat/standard-inquiry-v2`. Do not create a branch and do not touch `main`.
- DEV database only. Do not change the FOX / financial launch flow.
- Do not commit `logs/` or any password file. Do not copy passwords into code, commits, or replies.
- Manual costing after Submit stays locked. The orchestrator flag is the only bypass.
- UI stays English. Do not add helper text or new decoration.
- One small commit per task. Do not push unless asked.
