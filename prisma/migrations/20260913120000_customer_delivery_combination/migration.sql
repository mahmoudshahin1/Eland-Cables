-- Customer-specific approved delivery combinations.
-- Additive. Does not alter DestinationPort/Incoterm identity or ShippingCostRate.

CREATE TABLE "CustomerDeliveryCombination" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "countryLabel" TEXT NOT NULL,
  "incotermCode" TEXT NOT NULL,
  "destinationPortCode" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,

  CONSTRAINT "CustomerDeliveryCombination_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerDeliveryCombination_customerId_countryCode_incotermCode_destinationPortCode_key"
  ON "CustomerDeliveryCombination"("customerId", "countryCode", "incotermCode", "destinationPortCode");

CREATE INDEX "CustomerDeliveryCombination_customerId_active_idx"
  ON "CustomerDeliveryCombination"("customerId", "active");

CREATE INDEX "CustomerDeliveryCombination_destinationPortCode_idx"
  ON "CustomerDeliveryCombination"("destinationPortCode");

CREATE INDEX "CustomerDeliveryCombination_incotermCode_idx"
  ON "CustomerDeliveryCombination"("incotermCode");

ALTER TABLE "CustomerDeliveryCombination"
  ADD CONSTRAINT "CustomerDeliveryCombination_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerDeliveryCombination"
  ADD CONSTRAINT "CustomerDeliveryCombination_incotermCode_fkey"
  FOREIGN KEY ("incotermCode") REFERENCES "Incoterm"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerDeliveryCombination"
  ADD CONSTRAINT "CustomerDeliveryCombination_destinationPortCode_fkey"
  FOREIGN KEY ("destinationPortCode") REFERENCES "DestinationPort"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
