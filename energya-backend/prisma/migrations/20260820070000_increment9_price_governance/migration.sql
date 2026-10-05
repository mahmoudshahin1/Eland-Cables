-- Increment 9: Raw Material Price Governance & Costing Readiness Foundation

-- CreateEnum
CREATE TYPE "public"."PriceWorkflowStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PriceBasis" AS ENUM ('PER_KG', 'PER_TON', 'PER_METER', 'PER_PCS', 'PER_M2');

-- AlterTable RawMaterialPrice
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "uom" TEXT DEFAULT 'kg';
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "supplier" TEXT;
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "source" TEXT;
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "priceBasis" "public"."PriceBasis" NOT NULL DEFAULT 'PER_KG';
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "workflowStatus" "public"."PriceWorkflowStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "updatedBy" TEXT;
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "comment" TEXT;
ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing active prices mapped to APPROVED if created historically
UPDATE "public"."RawMaterialPrice"
SET "workflowStatus" = 'APPROVED'
WHERE "status" = 'ACTIVE' AND "price" IS NOT NULL;

-- Create Indexes
CREATE INDEX "RawMaterialPrice_rawMaterialCode_idx" ON "public"."RawMaterialPrice"("rawMaterialCode");
CREATE INDEX "RawMaterialPrice_workflowStatus_idx" ON "public"."RawMaterialPrice"("workflowStatus");
CREATE INDEX "RawMaterialPrice_effectiveFrom_effectiveTo_idx" ON "public"."RawMaterialPrice"("effectiveFrom", "effectiveTo");
