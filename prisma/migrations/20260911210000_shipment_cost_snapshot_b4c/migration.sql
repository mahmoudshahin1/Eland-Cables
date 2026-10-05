-- Task 05I-DF-B4-C — immutable ShipmentCostSnapshot bound to one CONFIRMED ContainerStudyResult.
-- Additive. No CostingRun FK. No snapshot status machine. No FX.

CREATE TABLE "ShipmentCostSnapshot" (
  "id" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "shipmentGroupId" TEXT NOT NULL,
  "containerStudyId" TEXT NOT NULL,
  "containerStudyResultId" TEXT NOT NULL,
  "destinationPortCode" TEXT NOT NULL,
  "incotermCode" TEXT NOT NULL,
  "rateAsOfDate" DATE NOT NULL,
  "totalAmount" DECIMAL(65,30) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ShipmentCostSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShipmentCostSnapshot_containerStudyResultId_key"
  ON "ShipmentCostSnapshot"("containerStudyResultId");
CREATE INDEX "ShipmentCostSnapshot_inquiryId_idx" ON "ShipmentCostSnapshot"("inquiryId");
CREATE INDEX "ShipmentCostSnapshot_shipmentGroupId_idx" ON "ShipmentCostSnapshot"("shipmentGroupId");
CREATE INDEX "ShipmentCostSnapshot_containerStudyId_idx" ON "ShipmentCostSnapshot"("containerStudyId");

CREATE TABLE "ShipmentCostSnapshotLine" (
  "id" TEXT NOT NULL,
  "shipmentCostSnapshotId" TEXT NOT NULL,
  "containerTypeCode" TEXT NOT NULL,
  "containerQuantity" INTEGER NOT NULL,
  "shippingCostRateId" TEXT NOT NULL,
  "rateAmount" DECIMAL(65,30) NOT NULL,
  "currencyCode" TEXT NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "effectiveTo" DATE,
  "lineTotal" DECIMAL(65,30) NOT NULL,

  CONSTRAINT "ShipmentCostSnapshotLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShipmentCostSnapshotLine_shipmentCostSnapshotId_containerTypeCode_key"
  ON "ShipmentCostSnapshotLine"("shipmentCostSnapshotId", "containerTypeCode");
CREATE INDEX "ShipmentCostSnapshotLine_shipmentCostSnapshotId_idx"
  ON "ShipmentCostSnapshotLine"("shipmentCostSnapshotId");
CREATE INDEX "ShipmentCostSnapshotLine_shippingCostRateId_idx"
  ON "ShipmentCostSnapshotLine"("shippingCostRateId");

ALTER TABLE "ShipmentCostSnapshot"
  ADD CONSTRAINT "ShipmentCostSnapshot_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "CommercialInquiry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipmentCostSnapshot"
  ADD CONSTRAINT "ShipmentCostSnapshot_shipmentGroupId_fkey"
  FOREIGN KEY ("shipmentGroupId") REFERENCES "ContainerShipmentGroup"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipmentCostSnapshot"
  ADD CONSTRAINT "ShipmentCostSnapshot_containerStudyId_fkey"
  FOREIGN KEY ("containerStudyId") REFERENCES "ContainerStudy"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipmentCostSnapshot"
  ADD CONSTRAINT "ShipmentCostSnapshot_containerStudyResultId_fkey"
  FOREIGN KEY ("containerStudyResultId") REFERENCES "ContainerStudyResult"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShipmentCostSnapshotLine"
  ADD CONSTRAINT "ShipmentCostSnapshotLine_shipmentCostSnapshotId_fkey"
  FOREIGN KEY ("shipmentCostSnapshotId") REFERENCES "ShipmentCostSnapshot"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShipmentCostSnapshotLine"
  ADD CONSTRAINT "ShipmentCostSnapshotLine_shippingCostRateId_fkey"
  FOREIGN KEY ("shippingCostRateId") REFERENCES "ShippingCostRate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
