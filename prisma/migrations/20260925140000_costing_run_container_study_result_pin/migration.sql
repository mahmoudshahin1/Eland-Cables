-- 05I-DF-D: pin CostingRun / CostingCalculation to a specific immutable ContainerStudyResult.

ALTER TABLE "CostingRun"
  ADD COLUMN "containerStudyResultId" TEXT;

ALTER TABLE "CostingRun"
  ADD CONSTRAINT "CostingRun_containerStudyResultId_fkey"
    FOREIGN KEY ("containerStudyResultId") REFERENCES "ContainerStudyResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CostingRun_containerStudyResultId_idx" ON "CostingRun"("containerStudyResultId");

ALTER TABLE "CostingCalculation"
  ADD COLUMN "containerStudyResultId" TEXT;

ALTER TABLE "CostingCalculation"
  ADD CONSTRAINT "CostingCalculation_containerStudyResultId_fkey"
    FOREIGN KEY ("containerStudyResultId") REFERENCES "ContainerStudyResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CostingCalculation_containerStudyResultId_idx" ON "CostingCalculation"("containerStudyResultId");
