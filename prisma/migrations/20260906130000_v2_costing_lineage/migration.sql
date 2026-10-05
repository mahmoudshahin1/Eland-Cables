-- Task 05E: V2 costing run lineage FKs + commercial pricing cross-ref

ALTER TABLE "CostingCalculation"
  ADD COLUMN "configurationSnapshotId" TEXT,
  ADD COLUMN "cuttingLengthPlanId" TEXT,
  ADD COLUMN "drumPlanId" TEXT,
  ADD COLUMN "drumPlanVersionNo" INTEGER,
  ADD COLUMN "workflowChannel" TEXT;

ALTER TABLE "CostingCalculation"
  ADD CONSTRAINT "CostingCalculation_configurationSnapshotId_fkey"
    FOREIGN KEY ("configurationSnapshotId") REFERENCES "V2ConfigurationSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CostingCalculation"
  ADD CONSTRAINT "CostingCalculation_cuttingLengthPlanId_fkey"
    FOREIGN KEY ("cuttingLengthPlanId") REFERENCES "V2CuttingLengthPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CostingCalculation"
  ADD CONSTRAINT "CostingCalculation_drumPlanId_fkey"
    FOREIGN KEY ("drumPlanId") REFERENCES "V2DrumPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CostingCalculation_drumPlanId_idx" ON "CostingCalculation"("drumPlanId");
CREATE INDEX "CostingCalculation_configurationSnapshotId_idx" ON "CostingCalculation"("configurationSnapshotId");
CREATE INDEX "CostingCalculation_cuttingLengthPlanId_idx" ON "CostingCalculation"("cuttingLengthPlanId");
CREATE INDEX "CostingCalculation_inquiryLineId_workflowChannel_createdAt_idx"
  ON "CostingCalculation"("inquiryLineId", "workflowChannel", "createdAt");

ALTER TABLE "CostingRun"
  ADD COLUMN "drumPlanId" TEXT;

ALTER TABLE "CostingRun"
  ADD CONSTRAINT "CostingRun_drumPlanId_fkey"
    FOREIGN KEY ("drumPlanId") REFERENCES "V2DrumPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CostingRun_drumPlanId_idx" ON "CostingRun"("drumPlanId");

ALTER TABLE "CommercialPricingSnapshot"
  ADD COLUMN "v2CostingCalculationId" TEXT,
  ADD COLUMN "drumPlanId" TEXT;
