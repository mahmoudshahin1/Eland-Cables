-- CreateTable
CREATE TABLE "V2DrumPlan" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "inquiryLineId" TEXT NOT NULL,
    "cuttingLengthPlanId" TEXT NOT NULL,
    "cuttingLengthPlanVersionNo" INTEGER NOT NULL,
    "cuttingLengthPlanIdString" TEXT NOT NULL,
    "configurationSnapshotId" TEXT NOT NULL,
    "configurationSnapshotIdString" TEXT NOT NULL,
    "lifecycleStatus" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "selectionMethod" TEXT NOT NULL,
    "cableTolerancePercent" DECIMAL(65,30) NOT NULL,
    "totalPlannedLengthM" DECIMAL(65,30) NOT NULL,
    "drumCount" INTEGER NOT NULL,
    "remainderLengthM" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "quantityReconciliationStatus" TEXT,
    "quantityReconciliationMessages" JSONB,
    "engineeringSnapshot" JSONB,
    "notes" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "V2DrumPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V2DrumPlanLine" (
    "id" TEXT NOT NULL,
    "drumPlanId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "drumCode" TEXT NOT NULL,
    "drumMasterId" TEXT,
    "numberOfDrums" INTEGER NOT NULL,
    "cuttingLengthM" DECIMAL(65,30) NOT NULL,
    "isRemainderDrum" BOOLEAN NOT NULL DEFAULT false,
    "clearanceMm" DECIMAL(65,30),
    "capacityM" DECIMAL(65,30),
    "maxLoadKg" DECIMAL(65,30),
    "plannedCableLengthM" DECIMAL(65,30) NOT NULL,
    "cableWeightKg" DECIMAL(65,30),
    "emptyDrumNetWeightKg" DECIMAL(65,30),
    "grossLoadedDrumWeightKg" DECIMAL(65,30),
    "lengthUtilizationPercent" DECIMAL(65,30),
    "loadUtilizationPercent" DECIMAL(65,30),
    "validationStatus" TEXT,
    "validationReasons" JSONB,
    "engineering" JSONB,

    CONSTRAINT "V2DrumPlanLine_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CommercialInquiryLine" ADD COLUMN "v2CurrentDrumPlanId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "V2DrumPlan_planId_key" ON "V2DrumPlan"("planId");

-- CreateIndex
CREATE INDEX "V2DrumPlan_inquiryLineId_idx" ON "V2DrumPlan"("inquiryLineId");

-- CreateIndex
CREATE INDEX "V2DrumPlan_inquiryLineId_versionNo_idx" ON "V2DrumPlan"("inquiryLineId", "versionNo");

-- CreateIndex
CREATE INDEX "V2DrumPlan_cuttingLengthPlanId_idx" ON "V2DrumPlan"("cuttingLengthPlanId");

-- CreateIndex
CREATE INDEX "V2DrumPlan_lifecycleStatus_idx" ON "V2DrumPlan"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "V2DrumPlan_capturedAt_idx" ON "V2DrumPlan"("capturedAt");

-- CreateIndex
CREATE INDEX "V2DrumPlanLine_drumPlanId_idx" ON "V2DrumPlanLine"("drumPlanId");

-- CreateIndex
CREATE INDEX "V2DrumPlanLine_drumPlanId_lineNo_idx" ON "V2DrumPlanLine"("drumPlanId", "lineNo");

-- CreateIndex
CREATE INDEX "V2DrumPlanLine_drumCode_idx" ON "V2DrumPlanLine"("drumCode");

-- CreateIndex
CREATE INDEX "CommercialInquiryLine_v2CurrentDrumPlanId_idx" ON "CommercialInquiryLine"("v2CurrentDrumPlanId");

-- AddForeignKey
ALTER TABLE "V2DrumPlan" ADD CONSTRAINT "V2DrumPlan_inquiryLineId_fkey" FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V2DrumPlan" ADD CONSTRAINT "V2DrumPlan_cuttingLengthPlanId_fkey" FOREIGN KEY ("cuttingLengthPlanId") REFERENCES "V2CuttingLengthPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V2DrumPlanLine" ADD CONSTRAINT "V2DrumPlanLine_drumPlanId_fkey" FOREIGN KEY ("drumPlanId") REFERENCES "V2DrumPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
