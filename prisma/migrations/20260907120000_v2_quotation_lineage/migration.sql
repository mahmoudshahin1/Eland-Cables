-- Task 05F: V2 quotation lineage + offer snapshots

ALTER TABLE "CommercialQuotation"
  ADD COLUMN "workflowChannel" TEXT,
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "issuedBy" TEXT,
  ADD COLUMN "inquiryVersionNo" INTEGER,
  ADD COLUMN "inquirySnapshot" JSONB,
  ADD COLUMN "technicalOfferStatus" TEXT NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN "commercialOfferStatus" TEXT NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN "validityDays" INTEGER,
  ADD COLUMN "supersededByQuotationId" TEXT,
  ADD COLUMN "technicalOfferSnapshot" JSONB,
  ADD COLUMN "commercialOfferSnapshot" JSONB,
  ADD COLUMN "quotationApprovedBy" TEXT,
  ADD COLUMN "quotationApprovedAt" TIMESTAMP(3);

CREATE INDEX "CommercialQuotation_workflowChannel_status_issuedAt_idx"
  ON "CommercialQuotation"("workflowChannel", "status", "issuedAt");

ALTER TABLE "CommercialQuotationLine"
  ADD COLUMN "workflowChannel" TEXT,
  ADD COLUMN "v2ConfigurationSnapshotId" TEXT,
  ADD COLUMN "v2ConfigurationSnapshotIdString" TEXT,
  ADD COLUMN "v2CuttingLengthPlanId" TEXT,
  ADD COLUMN "v2CuttingLengthPlanIdString" TEXT,
  ADD COLUMN "v2DrumPlanId" TEXT,
  ADD COLUMN "v2DrumPlanVersionNo" INTEGER,
  ADD COLUMN "v2DrumPlanIdString" TEXT,
  ADD COLUMN "plannedLengthM" DECIMAL(65,30),
  ADD COLUMN "drumCount" INTEGER,
  ADD COLUMN "technicalOfferAttachmentIds" JSONB,
  ADD COLUMN "technicalSummarySnapshot" JSONB,
  ADD COLUMN "drumPlanLinesSnapshot" JSONB,
  ADD COLUMN "lineageSnapshot" JSONB;

CREATE INDEX "CommercialQuotationLine_v2DrumPlanId_idx"
  ON "CommercialQuotationLine"("v2DrumPlanId");

INSERT INTO "NumberSequence" ("id", "code", "name", "prefix", "format", "nextSerial", "active", "scopeType", "moduleId", "description", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  'QUO_COMMERCIAL',
  'Commercial Quotation',
  'QUO',
  '{PREFIX}{YY}-{#####}',
  1,
  true,
  'GLOBAL',
  'COMMERCIAL',
  'V2 commercial quotation numbering',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
