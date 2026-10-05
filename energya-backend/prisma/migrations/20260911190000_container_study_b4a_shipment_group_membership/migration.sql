-- Task 05I-DF-B4-A — DESTINATION_CLUSTER + authoritative membership.
-- Additive. Does not rewrite Container Study results or packing snapshots.
-- inquiryLineId on ContainerShipmentGroup remains as a PER_INQUIRY_LINE compatibility mirror.

ALTER TYPE "DeliveryAllocationMode" ADD VALUE IF NOT EXISTS 'DESTINATION_CLUSTER';
ALTER TYPE "ShipmentGroupStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';

CREATE TABLE "ContainerShipmentGroupLine" (
  "id" TEXT NOT NULL,
  "shipmentGroupId" TEXT NOT NULL,
  "inquiryLineId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContainerShipmentGroupLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerShipmentGroupLine_shipmentGroupId_inquiryLineId_key"
  ON "ContainerShipmentGroupLine"("shipmentGroupId", "inquiryLineId");

CREATE INDEX "ContainerShipmentGroupLine_shipmentGroupId_idx"
  ON "ContainerShipmentGroupLine"("shipmentGroupId");

CREATE INDEX "ContainerShipmentGroupLine_inquiryLineId_idx"
  ON "ContainerShipmentGroupLine"("inquiryLineId");

ALTER TABLE "ContainerShipmentGroupLine"
  ADD CONSTRAINT "ContainerShipmentGroupLine_shipmentGroupId_fkey"
  FOREIGN KEY ("shipmentGroupId") REFERENCES "ContainerShipmentGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContainerShipmentGroupLine"
  ADD CONSTRAINT "ContainerShipmentGroupLine_inquiryLineId_fkey"
  FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill PER_INQUIRY_LINE from the compatibility mirror.
INSERT INTO "ContainerShipmentGroupLine" ("id", "shipmentGroupId", "inquiryLineId", "createdAt")
SELECT concat('csgl-', g."id", '-', g."inquiryLineId"), g."id", g."inquiryLineId", CURRENT_TIMESTAMP
FROM "ContainerShipmentGroup" g
WHERE g."inquiryLineId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ContainerShipmentGroupLine" m
    WHERE m."shipmentGroupId" = g."id" AND m."inquiryLineId" = g."inquiryLineId"
  );

-- Backfill ENTIRE_INQUIRY as the materialized set of inquiry lines at migrate time.
INSERT INTO "ContainerShipmentGroupLine" ("id", "shipmentGroupId", "inquiryLineId", "createdAt")
SELECT concat('csgl-', g."id", '-', l."id"), g."id", l."id", CURRENT_TIMESTAMP
FROM "ContainerShipmentGroup" g
JOIN "CommercialInquiryLine" l ON l."inquiryId" = g."inquiryId"
WHERE g."deliveryAllocationMode" = 'ENTIRE_INQUIRY'
  AND NOT EXISTS (
    SELECT 1 FROM "ContainerShipmentGroupLine" m
    WHERE m."shipmentGroupId" = g."id" AND m."inquiryLineId" = l."id"
  );
