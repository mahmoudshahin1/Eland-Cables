-- Task 05B — V2 inquiry configuration snapshot persistence

-- Extend inquiry workflow statuses for V2 engineering handoff
ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'ENGINEERING_REVIEW';
ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'ENGINEERING_BLOCKED';
ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'READY_FOR_COMMERCIAL';

-- Inquiry line → current V2 snapshot reference
ALTER TABLE "CommercialInquiryLine" ADD COLUMN IF NOT EXISTS "v2CurrentSnapshotId" TEXT;

CREATE TABLE IF NOT EXISTS "V2ConfigurationSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "inquiryLineId" TEXT NOT NULL,
    "cableMaterialNumber" TEXT,
    "itemCode" TEXT,
    "customerCode" TEXT,
    "selections" JSONB NOT NULL,
    "configInput" JSONB NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "flowState" TEXT NOT NULL,
    "engineeringStatus" TEXT NOT NULL,
    "summaryDescription" TEXT,
    "estimatedDiameterMm" DECIMAL(65,30),
    "estimatedWeightKgKm" DECIMAL(65,30),
    "catalogSource" TEXT NOT NULL,
    "catalogAuthoritative" BOOLEAN NOT NULL,
    "bomGovernanceBlocked" BOOLEAN NOT NULL DEFAULT false,
    "unresolvedBomConflictCount" INTEGER NOT NULL DEFAULT 81,
    "downstreamGates" JSONB,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V2ConfigurationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "V2ConfigurationSnapshot_snapshotId_key" ON "V2ConfigurationSnapshot"("snapshotId");
CREATE INDEX IF NOT EXISTS "V2ConfigurationSnapshot_inquiryLineId_idx" ON "V2ConfigurationSnapshot"("inquiryLineId");
CREATE INDEX IF NOT EXISTS "V2ConfigurationSnapshot_inquiryLineId_versionNo_idx" ON "V2ConfigurationSnapshot"("inquiryLineId", "versionNo");
CREATE INDEX IF NOT EXISTS "V2ConfigurationSnapshot_capturedAt_idx" ON "V2ConfigurationSnapshot"("capturedAt");
CREATE INDEX IF NOT EXISTS "CommercialInquiryLine_v2CurrentSnapshotId_idx" ON "CommercialInquiryLine"("v2CurrentSnapshotId");

ALTER TABLE "V2ConfigurationSnapshot" DROP CONSTRAINT IF EXISTS "V2ConfigurationSnapshot_inquiryLineId_fkey";
ALTER TABLE "V2ConfigurationSnapshot" ADD CONSTRAINT "V2ConfigurationSnapshot_inquiryLineId_fkey" FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Governed commercial inquiry numbering (V2 path)
INSERT INTO "NumberSequence" ("id", "code", "name", "prefix", "format", "nextSerial", "active", "scopeType", "moduleId", "description", "createdAt", "updatedAt")
VALUES (
    'ns-inq-commercial-v2',
    'INQ_COMMERCIAL',
    'Commercial Inquiry (V2)',
    'INQ',
    '{PREFIX}{YY}-{#####}',
    1,
    true,
    'GLOBAL',
    'INQUIRY_QUOTATION',
    'Server-generated inquiry numbers for V2 customer inquiry workflow (Task 05B).',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
