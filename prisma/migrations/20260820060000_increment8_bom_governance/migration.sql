-- Increment 8: BOM Governance Workbench, Investigation Workflow, Evidence Register & Governed BOM Line Authority

-- CreateEnum
CREATE TYPE "public"."BomInvestigationStatus" AS ENUM ('BUSINESS_DECISION_REQUIRED', 'ASSIGNED', 'UNDER_REVIEW', 'DECISION_REQUIRED', 'RESOLVED', 'APPROVED', 'REJECTED');

-- AlterTable BomDuplicateObservation
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "investigationStatus" "public"."BomInvestigationStatus" NOT NULL DEFAULT 'BUSINESS_DECISION_REQUIRED';
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "rawMaterialDesc" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "uom" TEXT NOT NULL DEFAULT 'kg';
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "sourceEvidence" JSONB;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "selectedWeight" DECIMAL(65,30);
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "governedUom" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "bomVersion" INTEGER;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "plant" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "manufacturingRoute" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "machine" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "effectiveTo" TIMESTAMP(3);
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "assignedTo" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "rejectedBy" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "rejectedAt" TIMESTAMP(3);

ALTER TABLE "public"."BomDuplicateObservation" ALTER COLUMN "classification" SET DEFAULT 'BUSINESS_DECISION_REQUIRED';

CREATE INDEX "BomDuplicateObservation_cableMaterialNumber_idx" ON "public"."BomDuplicateObservation"("cableMaterialNumber");
CREATE INDEX "BomDuplicateObservation_rawMaterialCode_idx" ON "public"."BomDuplicateObservation"("rawMaterialCode");
CREATE INDEX "BomDuplicateObservation_investigationStatus_idx" ON "public"."BomDuplicateObservation"("investigationStatus");

-- CreateTable GovernedBomLine
CREATE TABLE "public"."GovernedBomLine" (
    "id" TEXT NOT NULL,
    "cableMaterialNumber" TEXT NOT NULL,
    "rawMaterialCode" TEXT NOT NULL,
    "consumption" DECIMAL(65,30) NOT NULL,
    "uom" TEXT NOT NULL,
    "scrapPercentage" DECIMAL(65,30),
    "bomVersion" INTEGER NOT NULL DEFAULT 1,
    "plant" TEXT,
    "manufacturingRoute" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "conflictId" TEXT,
    "decisionReference" TEXT,
    "reviewer" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GovernedBomLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GovernedBomLine_cableMaterialNumber_rawMaterialCode_bomVersion_key" ON "public"."GovernedBomLine"("cableMaterialNumber", "rawMaterialCode", "bomVersion");
CREATE INDEX "GovernedBomLine_cableMaterialNumber_idx" ON "public"."GovernedBomLine"("cableMaterialNumber");
CREATE INDEX "GovernedBomLine_rawMaterialCode_idx" ON "public"."GovernedBomLine"("rawMaterialCode");
CREATE INDEX "GovernedBomLine_status_idx" ON "public"."GovernedBomLine"("status");

ALTER TABLE "public"."GovernedBomLine" ADD CONSTRAINT "GovernedBomLine_cableMaterialNumber_fkey" FOREIGN KEY ("cableMaterialNumber") REFERENCES "public"."CableMaster"("materialNumber") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."GovernedBomLine" ADD CONSTRAINT "GovernedBomLine_rawMaterialCode_fkey" FOREIGN KEY ("rawMaterialCode") REFERENCES "public"."RawMaterial"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."GovernedBomLine" ADD CONSTRAINT "GovernedBomLine_conflictId_fkey" FOREIGN KEY ("conflictId") REFERENCES "public"."BomDuplicateObservation"("conflictId") ON DELETE SET NULL ON UPDATE CASCADE;
