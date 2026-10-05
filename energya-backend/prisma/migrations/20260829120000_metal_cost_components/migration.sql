-- Metal Cost Components master (UI / preparation only; not used by costingEngine)

CREATE TYPE "MetalCostMetal" AS ENUM ('COPPER', 'ALUMINIUM');
CREATE TYPE "MetalCostComponentType" AS ENUM ('PREMIUM', 'SHIPPING', 'CLEARANCE');
CREATE TYPE "MetalCostPriceBasis" AS ENUM ('KG', 'MT', 'FIXED_AMOUNT', 'PERCENTAGE');
CREATE TYPE "MetalCostComponentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

CREATE TABLE "CostingMetalCostComponent" (
    "id" TEXT NOT NULL,
    "metal" "MetalCostMetal" NOT NULL,
    "componentType" "MetalCostComponentType" NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "priceBasis" "MetalCostPriceBasis" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" "MetalCostComponentStatus" NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CostingMetalCostComponent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CostingMetalCostComponent_metal_componentType_status_idx" ON "CostingMetalCostComponent"("metal", "componentType", "status");
CREATE INDEX "CostingMetalCostComponent_effectiveFrom_effectiveTo_idx" ON "CostingMetalCostComponent"("effectiveFrom", "effectiveTo");
CREATE INDEX "CostingMetalCostComponent_currencyCode_idx" ON "CostingMetalCostComponent"("currencyCode");
CREATE INDEX "CostingMetalCostComponent_status_idx" ON "CostingMetalCostComponent"("status");

ALTER TABLE "CostingMetalCostComponent" ADD CONSTRAINT "CostingMetalCostComponent_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "CostingCurrency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
