-- Task 05C — V2 cutting length plan persistence

ALTER TABLE "CommercialInquiryLine" ADD COLUMN IF NOT EXISTS "v2CurrentCuttingPlanId" TEXT;

CREATE TABLE IF NOT EXISTS "V2CuttingLengthPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "inquiryLineId" TEXT NOT NULL,
    "configurationSnapshotId" TEXT NOT NULL,
    "configurationSnapshotVersionNo" INTEGER NOT NULL,
    "configurationSnapshotIdString" TEXT NOT NULL,
    "nominalLengthM" DECIMAL(65,30) NOT NULL,
    "tolerancePercent" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "minLengthM" DECIMAL(65,30) NOT NULL,
    "maxLengthM" DECIMAL(65,30) NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "validationMessages" JSONB,
    "notes" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V2CuttingLengthPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "V2CuttingLengthPlan_planId_key" ON "V2CuttingLengthPlan"("planId");
CREATE INDEX IF NOT EXISTS "V2CuttingLengthPlan_inquiryLineId_idx" ON "V2CuttingLengthPlan"("inquiryLineId");
CREATE INDEX IF NOT EXISTS "V2CuttingLengthPlan_inquiryLineId_versionNo_idx" ON "V2CuttingLengthPlan"("inquiryLineId", "versionNo");
CREATE INDEX IF NOT EXISTS "V2CuttingLengthPlan_configurationSnapshotId_idx" ON "V2CuttingLengthPlan"("configurationSnapshotId");
CREATE INDEX IF NOT EXISTS "V2CuttingLengthPlan_capturedAt_idx" ON "V2CuttingLengthPlan"("capturedAt");
CREATE INDEX IF NOT EXISTS "CommercialInquiryLine_v2CurrentCuttingPlanId_idx" ON "CommercialInquiryLine"("v2CurrentCuttingPlanId");

ALTER TABLE "V2CuttingLengthPlan" DROP CONSTRAINT IF EXISTS "V2CuttingLengthPlan_inquiryLineId_fkey";
ALTER TABLE "V2CuttingLengthPlan" ADD CONSTRAINT "V2CuttingLengthPlan_inquiryLineId_fkey" FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "V2CuttingLengthPlan" DROP CONSTRAINT IF EXISTS "V2CuttingLengthPlan_configurationSnapshotId_fkey";
ALTER TABLE "V2CuttingLengthPlan" ADD CONSTRAINT "V2CuttingLengthPlan_configurationSnapshotId_fkey" FOREIGN KEY ("configurationSnapshotId") REFERENCES "V2ConfigurationSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
