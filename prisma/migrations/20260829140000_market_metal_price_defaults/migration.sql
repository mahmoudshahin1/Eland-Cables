-- System default copper/aluminium market prices (inquiry create snapshot only; not used by costingEngine)

CREATE TABLE "MarketMetalPriceDefault" (
    "id" TEXT NOT NULL,
    "metalType" "MetalCostMetal" NOT NULL,
    "priceRate" DECIMAL(65,30) NOT NULL,
    "priceUom" TEXT NOT NULL DEFAULT 'USD/MT',
    "status" "MetalCostComponentStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "MarketMetalPriceDefault_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketMetalPriceDefault_metalType_status_idx" ON "MarketMetalPriceDefault"("metalType", "status");
CREATE INDEX "MarketMetalPriceDefault_effectiveFrom_effectiveTo_idx" ON "MarketMetalPriceDefault"("effectiveFrom", "effectiveTo");
CREATE INDEX "MarketMetalPriceDefault_status_idx" ON "MarketMetalPriceDefault"("status");

-- At most one ACTIVE default per metal (service also enforces non-overlapping ACTIVE periods)
CREATE UNIQUE INDEX "MarketMetalPriceDefault_one_active_per_metal" ON "MarketMetalPriceDefault"("metalType") WHERE "status" = 'ACTIVE';
