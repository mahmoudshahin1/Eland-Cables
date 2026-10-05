-- Increment 10: Costing Engine Calculation Foundation (CostingRun, CostingLine, MaterialCost)

-- CreateEnum
CREATE TYPE "public"."CostingRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'INCOMPLETE', 'BLOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "public"."CostComponentType" AS ENUM ('MATERIAL', 'PROCESS', 'LABOUR', 'ENERGY', 'OVERHEAD', 'PACKAGING', 'DRUM', 'SCRAP', 'OTHER');

-- CreateTable CostingRun
CREATE TABLE "public"."CostingRun" (
    "id" TEXT NOT NULL,
    "costingRunNumber" TEXT NOT NULL,
    "materialNumber" TEXT NOT NULL,
    "costingDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "lengthMeters" DECIMAL(65,30) NOT NULL DEFAULT 1000,
    "lengthKm" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "engineeringRevision" INTEGER NOT NULL DEFAULT 1,
    "bomVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "public"."CostingRunStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "materialCost" DECIMAL(65,30) NOT NULL,
    "processCostStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "overheadCostStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "scrapCostStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "manufacturingCost" DECIMAL(65,30),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "blockingReasons" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable CostingLine
CREATE TABLE "public"."CostingLine" (
    "id" TEXT NOT NULL,
    "costingRunId" TEXT NOT NULL,
    "componentType" "public"."CostComponentType" NOT NULL DEFAULT 'MATERIAL',
    "rawMaterialCode" TEXT NOT NULL,
    "rawMaterialDesc" TEXT,
    "consumptionPerKm" DECIMAL(65,30) NOT NULL,
    "totalConsumption" DECIMAL(65,30) NOT NULL,
    "consumptionUom" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "priceCurrency" TEXT NOT NULL,
    "priceUom" TEXT NOT NULL,
    "priceBasis" TEXT NOT NULL DEFAULT 'PER_KG',
    "priceRevision" INTEGER NOT NULL DEFAULT 1,
    "priceId" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "lineCost" DECIMAL(65,30) NOT NULL,
    "calculationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostingLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "CostingRun_costingRunNumber_key" ON "public"."CostingRun"("costingRunNumber");
CREATE INDEX "CostingRun_materialNumber_isCurrent_idx" ON "public"."CostingRun"("materialNumber", "isCurrent");
CREATE INDEX "CostingRun_costingDate_idx" ON "public"."CostingRun"("costingDate");
CREATE INDEX "CostingRun_status_idx" ON "public"."CostingRun"("status");

CREATE INDEX "CostingLine_costingRunId_idx" ON "public"."CostingLine"("costingRunId");
CREATE INDEX "CostingLine_rawMaterialCode_idx" ON "public"."CostingLine"("rawMaterialCode");

-- AddForeignKeys
ALTER TABLE "public"."CostingRun" ADD CONSTRAINT "CostingRun_materialNumber_fkey" FOREIGN KEY ("materialNumber") REFERENCES "public"."CableMaster"("materialNumber") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."CostingLine" ADD CONSTRAINT "CostingLine_costingRunId_fkey" FOREIGN KEY ("costingRunId") REFERENCES "public"."CostingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
