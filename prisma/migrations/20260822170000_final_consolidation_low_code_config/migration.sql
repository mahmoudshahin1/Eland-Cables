-- Final consolidation: low-code configuration models (metal rates, logistics, packing, fields, notifications, reports)
-- No seed data — amounts configured by business through Administration UI.

-- CreateEnum
CREATE TYPE "MetalRateSource" AS ENUM ('LME', 'CUSTOMER_COMMERCIAL', 'INTERNAL_GOVERNED', 'MANUAL');

-- CreateEnum
CREATE TYPE "PlatformEntityCode" AS ENUM ('INQUIRY', 'INQUIRY_LINE', 'QUOTATION', 'QUOTATION_LINE', 'CUSTOMER', 'CABLE', 'RAW_MATERIAL', 'TECHNICAL_OFFICE_REQUEST', 'COSTING');

-- CreateTable
CREATE TABLE "CostingMetalRate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metalType" TEXT NOT NULL,
    "rate" DECIMAL(65,30),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit" TEXT NOT NULL DEFAULT 'per_ton',
    "rateSource" "MetalRateSource" NOT NULL DEFAULT 'INTERNAL_GOVERNED',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "changeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "CostingMetalRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostingLogisticsRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "incoterm" TEXT NOT NULL,
    "destination" TEXT,
    "cost" DECIMAL(65,30),
    "currency" TEXT,
    "basis" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "changeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "CostingLogisticsRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostingPackingRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "drumCode" TEXT,
    "packingCost" DECIMAL(65,30),
    "currency" TEXT,
    "basis" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "changeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CostingPackingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFieldDefinition" (
    "id" TEXT NOT NULL,
    "entityCode" "PlatformEntityCode" NOT NULL,
    "fieldCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "dataType" TEXT NOT NULL,
    "unit" TEXT,
    "section" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "filterable" BOOLEAN NOT NULL DEFAULT false,
    "sortable" BOOLEAN NOT NULL DEFAULT false,
    "exportable" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "defaultValue" TEXT,
    "minValue" TEXT,
    "maxValue" TEXT,
    "precision" INTEGER,
    "helpText" TEXT,
    "validationRules" JSONB,
    "roleVisibility" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventCode" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientValue" TEXT NOT NULL,
    "subjectTemplate" TEXT,
    "bodyTemplate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityCode" TEXT NOT NULL,
    "fieldCodes" JSONB NOT NULL,
    "filters" JSONB,
    "sortConfig" JSONB,
    "grouping" JSONB,
    "aggregations" JSONB,
    "roleVisibility" JSONB,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostingMetalRate_code_key" ON "CostingMetalRate"("code");
CREATE INDEX "CostingMetalRate_metalType_idx" ON "CostingMetalRate"("metalType");
CREATE INDEX "CostingMetalRate_workflowStatus_idx" ON "CostingMetalRate"("workflowStatus");
CREATE INDEX "CostingMetalRate_isCurrent_idx" ON "CostingMetalRate"("isCurrent");
CREATE INDEX "CostingMetalRate_effectiveFrom_effectiveTo_idx" ON "CostingMetalRate"("effectiveFrom", "effectiveTo");

CREATE UNIQUE INDEX "CostingLogisticsRule_code_key" ON "CostingLogisticsRule"("code");
CREATE INDEX "CostingLogisticsRule_incoterm_destination_idx" ON "CostingLogisticsRule"("incoterm", "destination");
CREATE INDEX "CostingLogisticsRule_workflowStatus_idx" ON "CostingLogisticsRule"("workflowStatus");
CREATE INDEX "CostingLogisticsRule_isCurrent_idx" ON "CostingLogisticsRule"("isCurrent");
CREATE INDEX "CostingLogisticsRule_priority_idx" ON "CostingLogisticsRule"("priority");

CREATE UNIQUE INDEX "CostingPackingRule_code_key" ON "CostingPackingRule"("code");
CREATE INDEX "CostingPackingRule_drumCode_idx" ON "CostingPackingRule"("drumCode");
CREATE INDEX "CostingPackingRule_workflowStatus_idx" ON "CostingPackingRule"("workflowStatus");
CREATE INDEX "CostingPackingRule_isCurrent_idx" ON "CostingPackingRule"("isCurrent");

CREATE UNIQUE INDEX "PlatformFieldDefinition_entityCode_fieldCode_key" ON "PlatformFieldDefinition"("entityCode", "fieldCode");
CREATE INDEX "PlatformFieldDefinition_entityCode_idx" ON "PlatformFieldDefinition"("entityCode");
CREATE INDEX "PlatformFieldDefinition_status_idx" ON "PlatformFieldDefinition"("status");

CREATE UNIQUE INDEX "NotificationRule_code_key" ON "NotificationRule"("code");
CREATE INDEX "NotificationRule_eventCode_idx" ON "NotificationRule"("eventCode");
CREATE INDEX "NotificationRule_active_idx" ON "NotificationRule"("active");

CREATE UNIQUE INDEX "ReportDefinition_code_key" ON "ReportDefinition"("code");
CREATE INDEX "ReportDefinition_entityCode_idx" ON "ReportDefinition"("entityCode");
CREATE INDEX "ReportDefinition_status_idx" ON "ReportDefinition"("status");
