-- Task 05I-DF-B4-D — immutable FinancialOfferSnapshot (financial aggregation SoT).
-- Additive. No CostingRun FK. No status machine. No FX.
-- D4-D-2: does not alter CommercialQuotation.commercialOfferSnapshot.
-- D4-D-3: partial unique index enforces at most one isCurrent = true per inquiry.

CREATE TABLE "FinancialOfferSnapshot" (
  "id" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "supersedesOfferId" TEXT,
  "hostQuotationId" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "productsTotal" DECIMAL(65,30) NOT NULL,
  "shipmentTotal" DECIMAL(65,30) NOT NULL,
  "inquiryTotal" DECIMAL(65,30) NOT NULL,
  "warningsJson" JSONB,
  "pricingSnapshotIdsJson" JSONB NOT NULL,
  "shipmentCostSnapshotIdsJson" JSONB NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialOfferSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialOfferSnapshot_inquiryId_versionNo_key"
  ON "FinancialOfferSnapshot"("inquiryId", "versionNo");
CREATE INDEX "FinancialOfferSnapshot_inquiryId_idx" ON "FinancialOfferSnapshot"("inquiryId");
CREATE INDEX "FinancialOfferSnapshot_hostQuotationId_idx" ON "FinancialOfferSnapshot"("hostQuotationId");
CREATE INDEX "FinancialOfferSnapshot_supersedesOfferId_idx" ON "FinancialOfferSnapshot"("supersedesOfferId");

-- D4-D-3 — database-level one current offer per inquiry.
CREATE UNIQUE INDEX "financial_offer_snapshot_one_current_per_inquiry"
  ON "FinancialOfferSnapshot"("inquiryId")
  WHERE "isCurrent" = true;

CREATE TABLE "FinancialOfferProductLine" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "inquiryLineId" TEXT NOT NULL,
  "commercialPricingSnapshotId" TEXT NOT NULL,
  "materialNumber" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(65,30) NOT NULL,
  "quantityUom" TEXT NOT NULL,
  "lengthMeters" DECIMAL(65,30) NOT NULL,
  "unitPrice" DECIMAL(65,30) NOT NULL,
  "lineTotal" DECIMAL(65,30) NOT NULL,
  "currencyCode" TEXT NOT NULL,

  CONSTRAINT "FinancialOfferProductLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialOfferProductLine_snapshotId_inquiryLineId_key"
  ON "FinancialOfferProductLine"("snapshotId", "inquiryLineId");
CREATE INDEX "FinancialOfferProductLine_snapshotId_idx" ON "FinancialOfferProductLine"("snapshotId");
CREATE INDEX "FinancialOfferProductLine_inquiryLineId_idx" ON "FinancialOfferProductLine"("inquiryLineId");
CREATE INDEX "FinancialOfferProductLine_commercialPricingSnapshotId_idx"
  ON "FinancialOfferProductLine"("commercialPricingSnapshotId");

CREATE TABLE "FinancialOfferShipmentLine" (
  "id" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "shipmentGroupId" TEXT NOT NULL,
  "shipmentCostSnapshotId" TEXT,
  "destinationPortCode" TEXT NOT NULL,
  "incotermCode" TEXT NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "groupTotal" DECIMAL(65,30) NOT NULL,

  CONSTRAINT "FinancialOfferShipmentLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialOfferShipmentLine_snapshotId_shipmentGroupId_key"
  ON "FinancialOfferShipmentLine"("snapshotId", "shipmentGroupId");
CREATE INDEX "FinancialOfferShipmentLine_snapshotId_idx" ON "FinancialOfferShipmentLine"("snapshotId");
CREATE INDEX "FinancialOfferShipmentLine_shipmentGroupId_idx" ON "FinancialOfferShipmentLine"("shipmentGroupId");
CREATE INDEX "FinancialOfferShipmentLine_shipmentCostSnapshotId_idx"
  ON "FinancialOfferShipmentLine"("shipmentCostSnapshotId");

CREATE TABLE "FinancialOfferShipmentTypeLine" (
  "id" TEXT NOT NULL,
  "offerShipmentLineId" TEXT NOT NULL,
  "containerTypeCode" TEXT NOT NULL,
  "containerQuantity" INTEGER NOT NULL,
  "shippingCostRateId" TEXT,
  "rateAmount" DECIMAL(65,30) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "lineTotal" DECIMAL(65,30) NOT NULL,

  CONSTRAINT "FinancialOfferShipmentTypeLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialOfferShipmentTypeLine_offerShipmentLineId_containerTypeCode_key"
  ON "FinancialOfferShipmentTypeLine"("offerShipmentLineId", "containerTypeCode");
CREATE INDEX "FinancialOfferShipmentTypeLine_offerShipmentLineId_idx"
  ON "FinancialOfferShipmentTypeLine"("offerShipmentLineId");

ALTER TABLE "FinancialOfferSnapshot"
  ADD CONSTRAINT "FinancialOfferSnapshot_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "CommercialInquiry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferSnapshot"
  ADD CONSTRAINT "FinancialOfferSnapshot_supersedesOfferId_fkey"
  FOREIGN KEY ("supersedesOfferId") REFERENCES "FinancialOfferSnapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferSnapshot"
  ADD CONSTRAINT "FinancialOfferSnapshot_hostQuotationId_fkey"
  FOREIGN KEY ("hostQuotationId") REFERENCES "CommercialQuotation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferProductLine"
  ADD CONSTRAINT "FinancialOfferProductLine_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "FinancialOfferSnapshot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferProductLine"
  ADD CONSTRAINT "FinancialOfferProductLine_inquiryLineId_fkey"
  FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferProductLine"
  ADD CONSTRAINT "FinancialOfferProductLine_commercialPricingSnapshotId_fkey"
  FOREIGN KEY ("commercialPricingSnapshotId") REFERENCES "CommercialPricingSnapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferShipmentLine"
  ADD CONSTRAINT "FinancialOfferShipmentLine_snapshotId_fkey"
  FOREIGN KEY ("snapshotId") REFERENCES "FinancialOfferSnapshot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferShipmentLine"
  ADD CONSTRAINT "FinancialOfferShipmentLine_shipmentGroupId_fkey"
  FOREIGN KEY ("shipmentGroupId") REFERENCES "ContainerShipmentGroup"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferShipmentLine"
  ADD CONSTRAINT "FinancialOfferShipmentLine_shipmentCostSnapshotId_fkey"
  FOREIGN KEY ("shipmentCostSnapshotId") REFERENCES "ShipmentCostSnapshot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialOfferShipmentTypeLine"
  ADD CONSTRAINT "FinancialOfferShipmentTypeLine_offerShipmentLineId_fkey"
  FOREIGN KEY ("offerShipmentLineId") REFERENCES "FinancialOfferShipmentLine"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
