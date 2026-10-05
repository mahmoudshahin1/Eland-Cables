-- Customer Service / complaint management (CRM-lite).
-- Categories are a controlled master. Cases use NumberSequence CUSTOMER_SERVICE_CASE (CS-YY-#####).

CREATE TYPE "CustomerServiceCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE "CustomerServiceCasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "CaseCommentVisibility" AS ENUM ('CUSTOMER', 'INTERNAL');
CREATE TYPE "CaseAssignmentDepartment" AS ENUM ('CUSTOMER_SERVICE', 'SALES', 'TECHNICAL_OFFICE', 'QUALITY', 'LOGISTICS', 'FINANCE', 'PRODUCTION');

CREATE TABLE "ComplaintCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplaintCategory_code_key" ON "ComplaintCategory"("code");
CREATE INDEX "ComplaintCategory_active_sortOrder_idx" ON "ComplaintCategory"("active", "sortOrder");

CREATE TABLE "ComplaintSubcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintSubcategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComplaintSubcategory_categoryId_code_key" ON "ComplaintSubcategory"("categoryId", "code");
CREATE INDEX "ComplaintSubcategory_categoryId_active_sortOrder_idx" ON "ComplaintSubcategory"("categoryId", "active", "sortOrder");

CREATE TABLE "CustomerServiceCase" (
    "id" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CustomerServiceCaseStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "CustomerServiceCasePriority" NOT NULL DEFAULT 'MEDIUM',
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "inquiryId" TEXT,
    "inquiryLineId" TEXT,
    "cableMaterialNumber" TEXT,
    "quotationId" TEXT,
    "salesOrderId" TEXT,
    "shipmentGroupId" TEXT,
    "drumMasterId" TEXT,
    "drumType" TEXT,
    "drumPlanId" TEXT,
    "affectedQuantity" DECIMAL(65,30),
    "affectedQuantityUom" TEXT,
    "affectedLengthMeters" DECIMAL(65,30),
    "requestedResolution" TEXT,
    "assignedDepartment" "CaseAssignmentDepartment",
    "assignedRepresentativeName" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerServiceCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerServiceCase_caseNumber_key" ON "CustomerServiceCase"("caseNumber");
CREATE INDEX "CustomerServiceCase_customerId_status_idx" ON "CustomerServiceCase"("customerId", "status");
CREATE INDEX "CustomerServiceCase_customerId_createdAt_idx" ON "CustomerServiceCase"("customerId", "createdAt");
CREATE INDEX "CustomerServiceCase_categoryId_idx" ON "CustomerServiceCase"("categoryId");
CREATE INDEX "CustomerServiceCase_inquiryId_idx" ON "CustomerServiceCase"("inquiryId");
CREATE INDEX "CustomerServiceCase_inquiryLineId_idx" ON "CustomerServiceCase"("inquiryLineId");
CREATE INDEX "CustomerServiceCase_quotationId_idx" ON "CustomerServiceCase"("quotationId");
CREATE INDEX "CustomerServiceCase_salesOrderId_idx" ON "CustomerServiceCase"("salesOrderId");
CREATE INDEX "CustomerServiceCase_shipmentGroupId_idx" ON "CustomerServiceCase"("shipmentGroupId");
CREATE INDEX "CustomerServiceCase_status_idx" ON "CustomerServiceCase"("status");
CREATE INDEX "CustomerServiceCase_issueDate_idx" ON "CustomerServiceCase"("issueDate");

CREATE TABLE "CaseComment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "visibility" "CaseCommentVisibility" NOT NULL DEFAULT 'CUSTOMER',
    "body" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaseComment_caseId_createdAt_idx" ON "CaseComment"("caseId", "createdAt");
CREATE INDEX "CaseComment_caseId_visibility_idx" ON "CaseComment"("caseId", "visibility");

CREATE TABLE "CaseAttachment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "visibility" "CaseCommentVisibility" NOT NULL DEFAULT 'CUSTOMER',
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaseAttachment_caseId_idx" ON "CaseAttachment"("caseId");
CREATE INDEX "CaseAttachment_caseId_visibility_idx" ON "CaseAttachment"("caseId", "visibility");

CREATE TABLE "CaseAssignment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "department" "CaseAssignmentDepartment" NOT NULL,
    "assignedToUserId" TEXT,
    "assignedToName" TEXT,
    "assignedBy" TEXT,
    "note" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaseAssignment_caseId_assignedAt_idx" ON "CaseAssignment"("caseId", "assignedAt");
CREATE INDEX "CaseAssignment_department_idx" ON "CaseAssignment"("department");

CREATE TABLE "CaseStatusHistory" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromStatus" "CustomerServiceCaseStatus",
    "toStatus" "CustomerServiceCaseStatus" NOT NULL,
    "changedBy" TEXT,
    "changedByName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaseStatusHistory_caseId_createdAt_idx" ON "CaseStatusHistory"("caseId", "createdAt");

CREATE TABLE "CaseResolution" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "internalNotes" TEXT,
    "resolutionSummary" TEXT NOT NULL,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "customerConfirmedAt" TIMESTAMP(3),
    "customerConfirmedBy" TEXT,
    "reopenRequested" BOOLEAN NOT NULL DEFAULT false,
    "reopenRequestedAt" TIMESTAMP(3),
    "reopenRequestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseResolution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseResolution_caseId_key" ON "CaseResolution"("caseId");

ALTER TABLE "ComplaintSubcategory" ADD CONSTRAINT "ComplaintSubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ComplaintCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ComplaintCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ComplaintSubcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CommercialInquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_inquiryLineId_fkey" FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_cableMaterialNumber_fkey" FOREIGN KEY ("cableMaterialNumber") REFERENCES "CableMaster"("materialNumber") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "CommercialQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "EpcSalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_shipmentGroupId_fkey" FOREIGN KEY ("shipmentGroupId") REFERENCES "ContainerShipmentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerServiceCase" ADD CONSTRAINT "CustomerServiceCase_drumMasterId_fkey" FOREIGN KEY ("drumMasterId") REFERENCES "DrumMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseComment" ADD CONSTRAINT "CaseComment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerServiceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseAttachment" ADD CONSTRAINT "CaseAttachment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerServiceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseAssignment" ADD CONSTRAINT "CaseAssignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerServiceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseStatusHistory" ADD CONSTRAINT "CaseStatusHistory_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerServiceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseResolution" ADD CONSTRAINT "CaseResolution_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerServiceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ComplaintCategory" ("id", "code", "name", "sortOrder", "active", "createdAt", "updatedAt") VALUES
  ('ccat-product-cable-quality', 'PRODUCT_CABLE_QUALITY', 'Product / Cable Quality', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-cable-specification', 'CABLE_SPECIFICATION', 'Cable Specification', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-cable-length', 'CABLE_LENGTH', 'Cable Length', 30, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-drum-packing', 'DRUM_PACKING', 'Drum / Packing', 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-delivery', 'DELIVERY', 'Delivery', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-shipment-logistics', 'SHIPMENT_LOGISTICS', 'Shipment / Logistics', 60, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-quantity', 'QUANTITY', 'Quantity', 70, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-damaged-cable', 'DAMAGED_CABLE', 'Damaged Cable', 80, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-damaged-drum', 'DAMAGED_DRUM', 'Damaged Drum', 90, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-documentation', 'DOCUMENTATION', 'Documentation', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-quotation-commercial', 'QUOTATION_COMMERCIAL', 'Quotation / Commercial', 110, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-invoice-payment', 'INVOICE_PAYMENT', 'Invoice / Payment', 120, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-technical-support', 'TECHNICAL_SUPPORT', 'Technical Support', 130, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-customer-service', 'CUSTOMER_SERVICE', 'Customer Service', 140, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ccat-other', 'OTHER', 'Other', 150, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "NumberSequence" ("id", "code", "name", "prefix", "format", "nextSerial", "active", "scopeType", "moduleId", "description", "createdAt", "updatedAt")
VALUES (
  'nseq-customer-service-case',
  'CUSTOMER_SERVICE_CASE',
  'Customer Service Case',
  'CS',
  '{PREFIX}-{YY}-{#####}',
  1,
  true,
  'GLOBAL',
  'CUSTOMER_SERVICE',
  'Customer complaints and support cases. Example: CS-26-00001.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;
