-- Task 05I-DF-B1 — Shipment group commercial context + snapshot lineage provenance

CREATE TYPE "ShipmentGroupStatus" AS ENUM ('DRAFT', 'ACTIVE', 'LOCKED');

ALTER TABLE "ContainerShipmentGroup"
  ADD COLUMN "inquiryLineId" TEXT,
  ADD COLUMN "destinationPortCode" TEXT,
  ADD COLUMN "incotermCode" TEXT,
  ADD COLUMN "containerTypePreferenceCode" TEXT,
  ADD COLUMN "status" "ShipmentGroupStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "versionNo" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ContainerShipmentGroup"
  ADD CONSTRAINT "ContainerShipmentGroup_inquiryLineId_fkey"
  FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ContainerShipmentGroup_inquiryLineId_idx" ON "ContainerShipmentGroup"("inquiryLineId");

ALTER TABLE "ContainerStudyInputSnapshot"
  ADD COLUMN "lineageProvenanceJson" JSONB;
