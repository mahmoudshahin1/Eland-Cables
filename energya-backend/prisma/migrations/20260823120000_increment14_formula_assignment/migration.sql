-- Increment 14: optional cable/family formula assignment on existing CostingFormula.
-- Default GLOBAL preserves Increment 13 behaviour (formulas apply to every cable).

ALTER TABLE "CostingFormula" ADD COLUMN "assignmentScope" TEXT NOT NULL DEFAULT 'GLOBAL';
ALTER TABLE "CostingFormula" ADD COLUMN "assignmentValue" TEXT;
ALTER TABLE "CostingFormula" ADD COLUMN "assignmentPriority" INTEGER NOT NULL DEFAULT 100;

CREATE INDEX "CostingFormula_assignmentScope_assignmentValue_idx" ON "CostingFormula"("assignmentScope", "assignmentValue");
