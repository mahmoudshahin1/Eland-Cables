-- Task 05I-DF-B4-B — DestinationPort, Incoterm, ShippingCostRate.
-- Additive. Does not alter ContainerShipmentGroup string columns (B4-A frozen).
-- Does not create ShipmentCostSnapshot (B4-C).

CREATE TABLE "DestinationPort" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,

  CONSTRAINT "DestinationPort_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DestinationPort_code_key" ON "DestinationPort"("code");
CREATE INDEX "DestinationPort_active_idx" ON "DestinationPort"("active");
CREATE INDEX "DestinationPort_countryCode_idx" ON "DestinationPort"("countryCode");

CREATE TABLE "Incoterm" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,

  CONSTRAINT "Incoterm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Incoterm_code_key" ON "Incoterm"("code");
CREATE INDEX "Incoterm_active_idx" ON "Incoterm"("active");

CREATE TABLE "ShippingCostRate" (
  "id" TEXT NOT NULL,
  "destinationPortCode" TEXT NOT NULL,
  "incotermCode" TEXT NOT NULL,
  "containerTypeCode" TEXT NOT NULL,
  "rateAmount" DECIMAL(65,30) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT,
  "updatedBy" TEXT,

  CONSTRAINT "ShippingCostRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShippingCostRate_grain_active_from_idx"
  ON "ShippingCostRate"("destinationPortCode", "incotermCode", "containerTypeCode", "active", "effectiveFrom");
CREATE INDEX "ShippingCostRate_grain_idx"
  ON "ShippingCostRate"("destinationPortCode", "incotermCode", "containerTypeCode");
CREATE INDEX "ShippingCostRate_currencyCode_idx" ON "ShippingCostRate"("currencyCode");
CREATE INDEX "ShippingCostRate_active_idx" ON "ShippingCostRate"("active");

ALTER TABLE "ShippingCostRate"
  ADD CONSTRAINT "ShippingCostRate_destinationPortCode_fkey"
  FOREIGN KEY ("destinationPortCode") REFERENCES "DestinationPort"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShippingCostRate"
  ADD CONSTRAINT "ShippingCostRate_incotermCode_fkey"
  FOREIGN KEY ("incotermCode") REFERENCES "Incoterm"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShippingCostRate"
  ADD CONSTRAINT "ShippingCostRate_containerTypeCode_fkey"
  FOREIGN KEY ("containerTypeCode") REFERENCES "ContainerType"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShippingCostRate"
  ADD CONSTRAINT "ShippingCostRate_currencyCode_fkey"
  FOREIGN KEY ("currencyCode") REFERENCES "CostingCurrency"("code")
  ON DELETE RESTRICT ON UPDATE CASCADE;
