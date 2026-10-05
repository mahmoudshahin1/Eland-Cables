-- Task 05H: V2 fulfillment lineage pins on commitment / SO / agreement lines

ALTER TABLE "CommercialCommitment"
  ADD COLUMN "inquiryId" TEXT,
  ADD COLUMN "workflowChannel" TEXT;

CREATE INDEX "CommercialCommitment_inquiryId_idx" ON "CommercialCommitment"("inquiryId");

ALTER TABLE "EpcSalesOrderLine"
  ADD COLUMN "lineageSnapshot" JSONB;

ALTER TABLE "SalesAgreementLine"
  ADD COLUMN "lineageSnapshot" JSONB;
