-- Customer-lane shipping cost master with effective-dated versions.
-- Does not alter B4-B ShippingCostRate, CostingRun, or CommercialPricingSnapshot.

CREATE TYPE "CustomerShippingCostRateStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

CREATE TABLE "CustomerShippingCostRate" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deliveryPoint" TEXT NOT NULL,
    "incotermId" TEXT NOT NULL,
    "containerType" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "status" "CustomerShippingCostRateStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerShippingCostRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShippingCostTransactionSnapshot" (
    "id" TEXT NOT NULL,
    "resolutionCode" TEXT NOT NULL,
    "customerId" TEXT,
    "deliveryPoint" TEXT,
    "incotermId" TEXT,
    "containerType" TEXT,
    "shippingCostRateId" TEXT,
    "shippingRateVersion" INTEGER,
    "amount" DECIMAL(18,2),
    "currency" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocksPacking" BOOLEAN NOT NULL DEFAULT false,
    "containerStudyResultId" TEXT,
    "quotationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShippingCostTransactionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerShippingCostRate_family_version_key"
  ON "CustomerShippingCostRate"("customerId", "deliveryPoint", "incotermId", "containerType", "version");
CREATE INDEX "CustomerShippingCostRate_family_status_idx"
  ON "CustomerShippingCostRate"("customerId", "deliveryPoint", "incotermId", "containerType", "status");
CREATE INDEX "CustomerShippingCostRate_customerId_idx" ON "CustomerShippingCostRate"("customerId");
CREATE INDEX "CustomerShippingCostRate_incotermId_idx" ON "CustomerShippingCostRate"("incotermId");
CREATE INDEX "CustomerShippingCostRate_status_effectiveFrom_idx" ON "CustomerShippingCostRate"("status", "effectiveFrom");
CREATE UNIQUE INDEX "CustomerShippingCostRate_one_active_key_idx"
  ON "CustomerShippingCostRate"("customerId", "deliveryPoint", "incotermId", "containerType")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "ShippingCostTransactionSnapshot_containerStudyResultId_key"
  ON "ShippingCostTransactionSnapshot"("containerStudyResultId");
CREATE UNIQUE INDEX "ShippingCostTransactionSnapshot_quotationId_key"
  ON "ShippingCostTransactionSnapshot"("quotationId");
CREATE INDEX "ShippingCostTransactionSnapshot_customerId_idx" ON "ShippingCostTransactionSnapshot"("customerId");
CREATE INDEX "ShippingCostTransactionSnapshot_incotermId_idx" ON "ShippingCostTransactionSnapshot"("incotermId");
CREATE INDEX "ShippingCostTransactionSnapshot_shippingCostRateId_idx" ON "ShippingCostTransactionSnapshot"("shippingCostRateId");
CREATE INDEX "ShippingCostTransactionSnapshot_resolutionCode_idx" ON "ShippingCostTransactionSnapshot"("resolutionCode");

ALTER TABLE "CustomerShippingCostRate"
  ADD CONSTRAINT "CustomerShippingCostRate_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerShippingCostRate"
  ADD CONSTRAINT "CustomerShippingCostRate_incotermId_fkey"
  FOREIGN KEY ("incotermId") REFERENCES "Incoterm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShippingCostTransactionSnapshot"
  ADD CONSTRAINT "ShippingCostTransactionSnapshot_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShippingCostTransactionSnapshot"
  ADD CONSTRAINT "ShippingCostTransactionSnapshot_incotermId_fkey"
  FOREIGN KEY ("incotermId") REFERENCES "Incoterm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShippingCostTransactionSnapshot"
  ADD CONSTRAINT "ShippingCostTransactionSnapshot_shippingCostRateId_fkey"
  FOREIGN KEY ("shippingCostRateId") REFERENCES "CustomerShippingCostRate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShippingCostTransactionSnapshot"
  ADD CONSTRAINT "ShippingCostTransactionSnapshot_containerStudyResultId_fkey"
  FOREIGN KEY ("containerStudyResultId") REFERENCES "ContainerStudyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShippingCostTransactionSnapshot"
  ADD CONSTRAINT "ShippingCostTransactionSnapshot_quotationId_fkey"
  FOREIGN KEY ("quotationId") REFERENCES "CommercialQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
