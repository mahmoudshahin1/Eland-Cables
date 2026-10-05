-- Task 05I-DD — Container Study persistence & master-data foundation.
-- Additive. Does not seed Excel sample dimensions as production truth.

CREATE TYPE "ContainerStudyStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CONFIRMED', 'SUPERSEDED');
CREATE TYPE "ContainerStuffingMethod" AS ENUM ('Rolling', 'Forklifting');
CREATE TYPE "ContainerStudyRegion" AS ENUM ('Europe', 'Africa');
CREATE TYPE "DeliveryAllocationMode" AS ENUM ('ENTIRE_INQUIRY', 'PER_INQUIRY_LINE');
CREATE TYPE "ContainerDimensionsStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED');
CREATE TYPE "AlgorithmImplementationStatus" AS ENUM ('NOT_IMPLEMENTED', 'BLOCKED', 'ENABLED');
CREATE TYPE "AlgorithmConfigStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'INACTIVE');
CREATE TYPE "AlgorithmParameterRuleStatus" AS ENUM ('ENABLED', 'DISABLED', 'BLOCKED');
CREATE TYPE "ContainerMasterRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUPERSEDED');

CREATE TABLE "ContainerType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerType_code_key" ON "ContainerType"("code");
CREATE INDEX "ContainerType_active_idx" ON "ContainerType"("active");

CREATE TABLE "ContainerTypeVersion" (
    "id" TEXT NOT NULL,
    "containerTypeId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "parityLabel" TEXT NOT NULL,
    "usableLengthMm" DECIMAL(65,30),
    "internalWidthMm" DECIMAL(65,30),
    "payloadCapacityKg" DECIMAL(65,30),
    "dimensionsStatus" "ContainerDimensionsStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "status" "ContainerMasterRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "ContainerTypeVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerTypeVersion_containerTypeId_versionNo_key" ON "ContainerTypeVersion"("containerTypeId", "versionNo");
CREATE INDEX "ContainerTypeVersion_containerTypeId_isCurrent_idx" ON "ContainerTypeVersion"("containerTypeId", "isCurrent");
CREATE INDEX "ContainerTypeVersion_parityLabel_idx" ON "ContainerTypeVersion"("parityLabel");
CREATE INDEX "ContainerTypeVersion_status_idx" ON "ContainerTypeVersion"("status");
CREATE INDEX "ContainerTypeVersion_effectiveFrom_effectiveTo_idx" ON "ContainerTypeVersion"("effectiveFrom", "effectiveTo");

CREATE TABLE "AlgorithmVersionRegistry" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "implementationStatus" "AlgorithmImplementationStatus" NOT NULL DEFAULT 'NOT_IMPLEMENTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlgorithmVersionRegistry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlgorithmVersionRegistry_code_key" ON "AlgorithmVersionRegistry"("code");
CREATE INDEX "AlgorithmVersionRegistry_implementationStatus_idx" ON "AlgorithmVersionRegistry"("implementationStatus");

CREATE TABLE "AlgorithmConfiguration" (
    "id" TEXT NOT NULL,
    "configurationVersion" TEXT NOT NULL,
    "algorithmVersionId" TEXT NOT NULL,
    "status" "AlgorithmConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AlgorithmConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlgorithmConfiguration_configurationVersion_key" ON "AlgorithmConfiguration"("configurationVersion");
CREATE INDEX "AlgorithmConfiguration_status_idx" ON "AlgorithmConfiguration"("status");
CREATE INDEX "AlgorithmConfiguration_algorithmVersionId_idx" ON "AlgorithmConfiguration"("algorithmVersionId");

CREATE TABLE "AlgorithmConfigurationParameter" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "numericValue" DECIMAL(65,30),
    "unit" TEXT,
    "scope" TEXT NOT NULL,
    "ruleStatus" "AlgorithmParameterRuleStatus" NOT NULL DEFAULT 'ENABLED',
    "notes" TEXT,

    CONSTRAINT "AlgorithmConfigurationParameter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AlgorithmConfigurationParameter_configurationId_name_key" ON "AlgorithmConfigurationParameter"("configurationId", "name");
CREATE INDEX "AlgorithmConfigurationParameter_name_idx" ON "AlgorithmConfigurationParameter"("name");

CREATE TABLE "DrumPackingProfile" (
    "id" TEXT NOT NULL,
    "drumMasterId" TEXT,
    "drumCode" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrumPackingProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DrumPackingProfile_drumCode_idx" ON "DrumPackingProfile"("drumCode");
CREATE INDEX "DrumPackingProfile_drumMasterId_idx" ON "DrumPackingProfile"("drumMasterId");
CREATE INDEX "DrumPackingProfile_active_idx" ON "DrumPackingProfile"("active");

CREATE TABLE "DrumPackingProfileVersion" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "packedLengthMm" DECIMAL(65,30),
    "packedWidthMm" DECIMAL(65,30),
    "packedHeightMm" DECIMAL(65,30),
    "status" "ContainerMasterRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "DrumPackingProfileVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DrumPackingProfileVersion_profileId_versionNo_key" ON "DrumPackingProfileVersion"("profileId", "versionNo");
CREATE INDEX "DrumPackingProfileVersion_profileId_isCurrent_idx" ON "DrumPackingProfileVersion"("profileId", "isCurrent");
CREATE INDEX "DrumPackingProfileVersion_status_idx" ON "DrumPackingProfileVersion"("status");

CREATE TABLE "ContainerShipmentGroup" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "deliveryAllocationMode" "DeliveryAllocationMode" NOT NULL DEFAULT 'ENTIRE_INQUIRY',
    "destinationKey" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "ContainerShipmentGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerShipmentGroup_inquiryId_groupCode_key" ON "ContainerShipmentGroup"("inquiryId", "groupCode");
CREATE INDEX "ContainerShipmentGroup_inquiryId_idx" ON "ContainerShipmentGroup"("inquiryId");

CREATE TABLE "ContainerStudy" (
    "id" TEXT NOT NULL,
    "studyNumber" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "inquiryId" TEXT NOT NULL,
    "shipmentGroupId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerMasterId" TEXT,
    "status" "ContainerStudyStatus" NOT NULL DEFAULT 'DRAFT',
    "stuffingMethod" "ContainerStuffingMethod" NOT NULL,
    "region" "ContainerStudyRegion" NOT NULL,
    "deliveryAllocationMode" "DeliveryAllocationMode" NOT NULL,
    "currentSnapshotId" TEXT,
    "currentResultId" TEXT,
    "supersedesStudyId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContainerStudy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerStudy_studyNumber_versionNo_key" ON "ContainerStudy"("studyNumber", "versionNo");
CREATE UNIQUE INDEX "ContainerStudy_currentSnapshotId_key" ON "ContainerStudy"("currentSnapshotId");
CREATE UNIQUE INDEX "ContainerStudy_currentResultId_key" ON "ContainerStudy"("currentResultId");
CREATE INDEX "ContainerStudy_inquiryId_idx" ON "ContainerStudy"("inquiryId");
CREATE INDEX "ContainerStudy_shipmentGroupId_idx" ON "ContainerStudy"("shipmentGroupId");
CREATE INDEX "ContainerStudy_customerId_idx" ON "ContainerStudy"("customerId");
CREATE INDEX "ContainerStudy_customerMasterId_idx" ON "ContainerStudy"("customerMasterId");
CREATE INDEX "ContainerStudy_status_idx" ON "ContainerStudy"("status");
CREATE INDEX "ContainerStudy_studyNumber_idx" ON "ContainerStudy"("studyNumber");

CREATE TABLE "ContainerStudyInputSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "stuffingMethod" "ContainerStuffingMethod" NOT NULL,
    "region" "ContainerStudyRegion" NOT NULL,
    "deliveryAllocationMode" "DeliveryAllocationMode" NOT NULL,
    "algorithmVersionCode" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "configurationVersion" TEXT NOT NULL,
    "containerMasterPinJson" JSONB NOT NULL,
    "packingProfilePinJson" JSONB NOT NULL,
    "algorithmParameterPinJson" JSONB NOT NULL,
    "payloadUsedKg" DECIMAL(65,30),
    "containerWidthUsedMm" DECIMAL(65,30),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerStudyInputSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerStudyInputSnapshot_snapshotId_key" ON "ContainerStudyInputSnapshot"("snapshotId");
CREATE INDEX "ContainerStudyInputSnapshot_studyId_idx" ON "ContainerStudyInputSnapshot"("studyId");
CREATE INDEX "ContainerStudyInputSnapshot_configurationId_idx" ON "ContainerStudyInputSnapshot"("configurationId");
CREATE INDEX "ContainerStudyInputSnapshot_capturedAt_idx" ON "ContainerStudyInputSnapshot"("capturedAt");

CREATE TABLE "ContainerStudyInputSnapshotContainerPin" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "containerTypeVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parityLabel" TEXT NOT NULL,
    "usableLengthMm" DECIMAL(65,30),
    "internalWidthMm" DECIMAL(65,30),
    "payloadCapacityKg" DECIMAL(65,30),
    "dimensionsStatus" "ContainerDimensionsStatus" NOT NULL,

    CONSTRAINT "ContainerStudyInputSnapshotContainerPin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContainerStudyInputSnapshotContainerPin_snapshotId_idx" ON "ContainerStudyInputSnapshotContainerPin"("snapshotId");
CREATE INDEX "ContainerStudyInputSnapshotContainerPin_containerTypeVersionId_idx" ON "ContainerStudyInputSnapshotContainerPin"("containerTypeVersionId");

CREATE TABLE "ContainerStudyInputDrum" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "drumCode" TEXT,
    "drumMasterId" TEXT,
    "packingProfileVersionId" TEXT,
    "packedLengthMm" DECIMAL(65,30),
    "packedWidthMm" DECIMAL(65,30),
    "packedHeightMm" DECIMAL(65,30),
    "grossWeightKg" DECIMAL(65,30),

    CONSTRAINT "ContainerStudyInputDrum_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContainerStudyInputDrum_snapshotId_idx" ON "ContainerStudyInputDrum"("snapshotId");
CREATE INDEX "ContainerStudyInputDrum_sourceLineId_idx" ON "ContainerStudyInputDrum"("sourceLineId");
CREATE INDEX "ContainerStudyInputDrum_packingProfileVersionId_idx" ON "ContainerStudyInputDrum"("packingProfileVersionId");

CREATE TABLE "ContainerStudyResult" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "studyId" TEXT NOT NULL,
    "studyVersionNo" INTEGER NOT NULL,
    "inputSnapshotId" TEXT NOT NULL,
    "algorithmVersionCode" TEXT NOT NULL,
    "configurationVersion" TEXT NOT NULL,
    "containerMasterPinJson" JSONB NOT NULL,
    "packingProfilePinJson" JSONB NOT NULL,
    "summaryJson" JSONB,
    "warningsJson" JSONB,
    "errorsJson" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerStudyResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerStudyResult_resultId_key" ON "ContainerStudyResult"("resultId");
CREATE INDEX "ContainerStudyResult_studyId_idx" ON "ContainerStudyResult"("studyId");
CREATE INDEX "ContainerStudyResult_inputSnapshotId_idx" ON "ContainerStudyResult"("inputSnapshotId");
CREATE INDEX "ContainerStudyResult_calculatedAt_idx" ON "ContainerStudyResult"("calculatedAt");

CREATE TABLE "ContainerStudyResultContainer" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "containerIndex" INTEGER NOT NULL,
    "typeCode" TEXT,
    "parityLabel" TEXT,
    "usableLengthMm" DECIMAL(65,30),
    "loadedWeightKg" DECIMAL(65,30),
    "remainingWeightKg" DECIMAL(65,30),
    "remainingLengthMm" DECIMAL(65,30),
    "utilizationWeightPct" DECIMAL(65,30),
    "utilizationLengthPct" DECIMAL(65,30),
    "utilizationWidthPct" DECIMAL(65,30),
    "drumCountQ3" INTEGER NOT NULL DEFAULT 0,
    "secondLayerEnabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContainerStudyResultContainer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContainerStudyResultContainer_resultId_containerIndex_key" ON "ContainerStudyResultContainer"("resultId", "containerIndex");
CREATE INDEX "ContainerStudyResultContainer_resultId_idx" ON "ContainerStudyResultContainer"("resultId");

CREATE TABLE "ContainerStudyResultAllocation" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "physicalDrumKey" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL,
    "instanceIndex" INTEGER NOT NULL,
    "allocationKind" TEXT NOT NULL DEFAULT 'PHYSICAL',
    "acceptReason" TEXT,

    CONSTRAINT "ContainerStudyResultAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContainerStudyResultAllocation_resultId_idx" ON "ContainerStudyResultAllocation"("resultId");
CREATE INDEX "ContainerStudyResultAllocation_physicalDrumKey_idx" ON "ContainerStudyResultAllocation"("physicalDrumKey");
CREATE INDEX "ContainerStudyResultAllocation_containerId_idx" ON "ContainerStudyResultAllocation"("containerId");

CREATE TABLE "ContainerStudyResultUnallocated" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "physicalDrumKey" TEXT NOT NULL,
    "sourceLineId" TEXT NOT NULL,
    "instanceIndex" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "detail" TEXT,
    "traceRef" TEXT,

    CONSTRAINT "ContainerStudyResultUnallocated_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContainerStudyResultUnallocated_resultId_idx" ON "ContainerStudyResultUnallocated"("resultId");
CREATE INDEX "ContainerStudyResultUnallocated_physicalDrumKey_idx" ON "ContainerStudyResultUnallocated"("physicalDrumKey");
CREATE INDEX "ContainerStudyResultUnallocated_reasonCode_idx" ON "ContainerStudyResultUnallocated"("reasonCode");

ALTER TABLE "ContainerTypeVersion" ADD CONSTRAINT "ContainerTypeVersion_containerTypeId_fkey" FOREIGN KEY ("containerTypeId") REFERENCES "ContainerType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlgorithmConfiguration" ADD CONSTRAINT "AlgorithmConfiguration_algorithmVersionId_fkey" FOREIGN KEY ("algorithmVersionId") REFERENCES "AlgorithmVersionRegistry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AlgorithmConfigurationParameter" ADD CONSTRAINT "AlgorithmConfigurationParameter_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "AlgorithmConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrumPackingProfile" ADD CONSTRAINT "DrumPackingProfile_drumMasterId_fkey" FOREIGN KEY ("drumMasterId") REFERENCES "DrumMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DrumPackingProfileVersion" ADD CONSTRAINT "DrumPackingProfileVersion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "DrumPackingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerShipmentGroup" ADD CONSTRAINT "ContainerShipmentGroup_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CommercialInquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudy" ADD CONSTRAINT "ContainerStudy_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CommercialInquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudy" ADD CONSTRAINT "ContainerStudy_shipmentGroupId_fkey" FOREIGN KEY ("shipmentGroupId") REFERENCES "ContainerShipmentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudy" ADD CONSTRAINT "ContainerStudy_customerMasterId_fkey" FOREIGN KEY ("customerMasterId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyInputSnapshot" ADD CONSTRAINT "ContainerStudyInputSnapshot_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ContainerStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyInputSnapshot" ADD CONSTRAINT "ContainerStudyInputSnapshot_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "AlgorithmConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudy" ADD CONSTRAINT "ContainerStudy_currentSnapshotId_fkey" FOREIGN KEY ("currentSnapshotId") REFERENCES "ContainerStudyInputSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyInputSnapshotContainerPin" ADD CONSTRAINT "ContainerStudyInputSnapshotContainerPin_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ContainerStudyInputSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyInputSnapshotContainerPin" ADD CONSTRAINT "ContainerStudyInputSnapshotContainerPin_containerTypeVersionId_fkey" FOREIGN KEY ("containerTypeVersionId") REFERENCES "ContainerTypeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyInputDrum" ADD CONSTRAINT "ContainerStudyInputDrum_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ContainerStudyInputSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyInputDrum" ADD CONSTRAINT "ContainerStudyInputDrum_packingProfileVersionId_fkey" FOREIGN KEY ("packingProfileVersionId") REFERENCES "DrumPackingProfileVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyResult" ADD CONSTRAINT "ContainerStudyResult_studyId_fkey" FOREIGN KEY ("studyId") REFERENCES "ContainerStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyResult" ADD CONSTRAINT "ContainerStudyResult_inputSnapshotId_fkey" FOREIGN KEY ("inputSnapshotId") REFERENCES "ContainerStudyInputSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudy" ADD CONSTRAINT "ContainerStudy_currentResultId_fkey" FOREIGN KEY ("currentResultId") REFERENCES "ContainerStudyResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyResultContainer" ADD CONSTRAINT "ContainerStudyResultContainer_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ContainerStudyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyResultAllocation" ADD CONSTRAINT "ContainerStudyResultAllocation_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ContainerStudyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyResultAllocation" ADD CONSTRAINT "ContainerStudyResultAllocation_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "ContainerStudyResultContainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContainerStudyResultUnallocated" ADD CONSTRAINT "ContainerStudyResultUnallocated_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "ContainerStudyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Catalog only: no production dimensions (Excel 12000/5900/2350/26000 are NOT approved masters).
INSERT INTO "ContainerType" ("id", "code", "description", "active", "createdAt", "updatedAt") VALUES
  ('ct-40hq', '40HQ', '40 ft High Cube', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ct-40std', '40STD', '40 ft Standard', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ct-20std', '20STD', '20 ft Standard', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ct-40ot', '40OT', '40 ft Open Top', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "ContainerTypeVersion" (
  "id", "containerTypeId", "versionNo", "parityLabel",
  "usableLengthMm", "internalWidthMm", "payloadCapacityKg",
  "dimensionsStatus", "status", "isCurrent", "effectiveFrom", "createdAt", "updatedAt", "createdBy"
) VALUES
  ('ctv-40hq-1', 'ct-40hq', 1, '40 HQ', NULL, NULL, NULL, 'PENDING_APPROVAL', 'ACTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'SYSTEM'),
  ('ctv-40std-1', 'ct-40std', 1, '40 STD', NULL, NULL, NULL, 'PENDING_APPROVAL', 'ACTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'SYSTEM'),
  ('ctv-20std-1', 'ct-20std', 1, '20 STD', NULL, NULL, NULL, 'PENDING_APPROVAL', 'ACTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'SYSTEM'),
  ('ctv-40ot-1', 'ct-40ot', 1, '40 Open Top', NULL, NULL, NULL, 'PENDING_APPROVAL', 'ACTIVE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'SYSTEM');

INSERT INTO "AlgorithmVersionRegistry" ("id", "code", "name", "implementationStatus", "notes", "createdAt", "updatedAt") VALUES
  ('avr-lff-v1', 'LEGACY_FIRST_FIT_V1', 'Legacy sequential first-fit (Rolling)', 'NOT_IMPLEMENTED', 'Engine not implemented in 05I-DD. Rolling only when 05I-DE is authorized.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('avr-lff-v1-pa', 'LEGACY_FIRST_FIT_V1_POST_ADJUST', 'Legacy first-fit with VBA U3>=6100 post-adjust', 'BLOCKED', 'Do not implement a standalone 6100 to 20 STD shortcut.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('avr-fork-v1', 'FORKLIFTING_FIRST_FIT_V1', 'Forklifting first-fit', 'BLOCKED', 'FORKLIFTING_PLACEMENT_ENGINE = BLOCKED. F01-F04 not validated.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('avr-bin-v1', 'BIN_PACK_OPT_V1', 'Global bin-pack optimizer', 'BLOCKED', 'Parity first. Optimization is a future algorithm version.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "AlgorithmConfiguration" (
  "id", "configurationVersion", "algorithmVersionId", "status", "notes", "createdAt", "updatedAt", "createdBy"
) VALUES (
  'acfg-lff-v1',
  'CFG-LEGACY-FIRST-FIT-V1',
  'avr-lff-v1',
  'DRAFT',
  'Legacy Excel observed constants. Not production Container Master. POST_ADJUST is BLOCKED. Not engine-active.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'SYSTEM'
);

INSERT INTO "AlgorithmConfigurationParameter" ("id", "configurationId", "name", "value", "numericValue", "unit", "scope", "ruleStatus", "notes") VALUES
  ('acp-width', 'acfg-lff-v1', 'CONTAINER_INTERNAL_WIDTH', '2350', 2350, 'mm', 'study', 'ENABLED', 'LEGACY_SAMPLE_NOT_PRODUCTION_MASTER — Excel K3 sample.'),
  ('acp-maxw', 'acfg-lff-v1', 'MAX_LOADING_WEIGHT', '26000', 26000, 'kg', 'study', 'ENABLED', 'LEGACY_SAMPLE_NOT_PRODUCTION_MASTER — Excel E5 sample.'),
  ('acp-u40', 'acfg-lff-v1', 'USABLE_LENGTH_40', '12000', 12000, 'mm', 'algorithm', 'ENABLED', 'LEGACY_SAMPLE_NOT_PRODUCTION_MASTER.'),
  ('acp-u20', 'acfg-lff-v1', 'USABLE_LENGTH_20', '5900', 5900, 'mm', 'algorithm', 'ENABLED', 'LEGACY_SAMPLE_NOT_PRODUCTION_MASTER.'),
  ('acp-hq', 'acfg-lff-v1', 'FLANGE_HQ_MIN', '2300', 2300, 'mm', 'algorithm', 'ENABLED', 'Observed Excel O3 HQ threshold. Engine not in this task.'),
  ('acp-ot', 'acfg-lff-v1', 'FLANGE_OPEN_TOP_MIN', '2600', 2600, 'mm', 'algorithm', 'ENABLED', 'Observed Excel O3 Open Top threshold.'),
  ('acp-v2l', 'acfg-lff-v1', 'SECOND_LAYER_LENGTH_LT', '1050', 1050, 'mm', 'algorithm', 'ENABLED', 'V2 flag threshold (strict less-than). Virtual load BLOCKED.'),
  ('acp-v2s', 'acfg-lff-v1', 'SECOND_LAYER_SHARE_MIN', '0.5', 0.5, 'ratio', 'algorithm', 'ENABLED', 'V2 flag share threshold.'),
  ('acp-6100', 'acfg-lff-v1', 'POST_ADJUST_REMAINING_LENGTH_GE', '6100', 6100, 'mm', 'algorithm', 'BLOCKED', 'UNVERIFIED. Must not drive engine behavior. Not a 6100 to 20 STD shortcut.'),
  ('acp-search', 'acfg-lff-v1', 'CONTAINER_SEARCH_LIMIT', '1000', 1000, 'count', 'system', 'ENABLED', 'Safety bound. Not a UI brute-force loop.'),
  ('acp-rows', 'acfg-lff-v1', 'INPUT_ROW_LIMIT', '2000', 2000, 'rows', 'system', 'ENABLED', 'Legacy sort/input ceiling.');

INSERT INTO "NumberSequence" ("id", "code", "name", "prefix", "format", "nextSerial", "active", "scopeType", "moduleId", "description", "createdAt", "updatedAt")
VALUES (
  'ns-container-study',
  'CONTAINER_STUDY',
  'Container Study',
  'CST',
  '{PREFIX}{YY}-{#####}',
  1,
  true,
  'GLOBAL',
  'LOGISTICS',
  'Server-generated Container Study numbers (Task 05I-DD).',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
