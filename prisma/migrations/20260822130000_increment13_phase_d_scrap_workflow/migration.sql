-- Increment 13 Phase D — Scrap rules + approval workflow states

-- Extend CostingConfigStatus enum for approval pipeline
ALTER TYPE "CostingConfigStatus" ADD VALUE 'VALIDATION';
ALTER TYPE "CostingConfigStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "CostingConfigStatus" ADD VALUE 'APPROVED';

-- CreateEnum
CREATE TYPE "CostingScrapScopeType" AS ENUM ('GLOBAL', 'FAMILY', 'MATERIAL_CLASS', 'CABLE', 'BOM_LINE');

-- AlterTable
ALTER TABLE "CostingConfigurationVersion" ADD COLUMN "workflowStatus" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT';

-- Backfill workflowStatus from status for existing rows
UPDATE "CostingConfigurationVersion" SET "workflowStatus" = "status" WHERE "workflowStatus" = 'DRAFT' AND "status" != 'DRAFT';

-- CreateTable
CREATE TABLE "CostingScrapRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scopeType" "CostingScrapScopeType" NOT NULL DEFAULT 'GLOBAL',
    "scopeValue" TEXT,
    "materialClass" TEXT,
    "scrapRate" DECIMAL(65,30),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "changeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "CostingScrapRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostingScrapRule_code_key" ON "CostingScrapRule"("code");
CREATE INDEX "CostingScrapRule_scopeType_scopeValue_idx" ON "CostingScrapRule"("scopeType", "scopeValue");
CREATE INDEX "CostingScrapRule_workflowStatus_idx" ON "CostingScrapRule"("workflowStatus");
CREATE INDEX "CostingScrapRule_status_idx" ON "CostingScrapRule"("status");
CREATE INDEX "CostingScrapRule_isCurrent_idx" ON "CostingScrapRule"("isCurrent");
