-- Increment 11: Commercial Inquiry & Quotation Foundation

-- CreateEnum
CREATE TYPE "public"."InquiryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'QUOTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."InquiryLineStatus" AS ENUM ('DRAFT', 'CONFIGURATION_REQUIRED', 'TECHNICAL_OFFICE_REQUIRED', 'CABLE_VALIDATED', 'COSTING_NOT_READY', 'COSTING_READY', 'READY_FOR_QUOTATION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."QuotationStatus" AS ENUM ('DRAFT', 'OPEN', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'CANCELLED');

-- CreateTable CommercialInquiry
CREATE TABLE "public"."CommercialInquiry" (
    "id" TEXT NOT NULL,
    "inquiryNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "customerReference" TEXT,
    "inquiryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedDeliveryDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incoterms" TEXT DEFAULT 'FOB',
    "paymentTerms" TEXT DEFAULT 'LC at sight',
    "deliveryTerms" TEXT DEFAULT 'CIF Alexandria',
    "projectName" TEXT,
    "status" "public"."InquiryStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable CommercialInquiryLine
CREATE TABLE "public"."CommercialInquiryLine" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "materialNumber" TEXT,
    "customerCode" TEXT,
    "itemCode" TEXT,
    "cableDescription" TEXT NOT NULL,
    "requestedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "quantityUom" TEXT NOT NULL DEFAULT 'KM',
    "requestedLengthMeters" DECIMAL(65,30) NOT NULL DEFAULT 1000,
    "cuttingLengthMeters" DECIMAL(65,30),
    "drumType" TEXT DEFAULT 'Wood Reel 220',
    "configurationPayload" JSONB,
    "cableAuthorityStatus" TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
    "technicalOfficeRequestId" TEXT,
    "costingReadinessStatus" TEXT NOT NULL DEFAULT 'NOT_READY',
    "costingRunId" TEXT,
    "materialCost" DECIMAL(65,30),
    "materialCostCurrency" TEXT DEFAULT 'USD',
    "status" "public"."InquiryLineStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialInquiryLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable CommercialQuotation
CREATE TABLE "public"."CommercialQuotation" (
    "id" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "contactPerson" TEXT,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersedesQuotationId" TEXT,
    "status" "public"."QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "incoterms" TEXT DEFAULT 'FOB',
    "paymentTerms" TEXT DEFAULT 'LC at sight',
    "deliveryTerms" TEXT DEFAULT 'CIF Alexandria',
    "validUntil" TIMESTAMP(3),
    "materialCostTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commercialPricingStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "sellingPrice" DECIMAL(65,30),
    "quotationOwner" TEXT,
    "remarks" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable CommercialQuotationLine
CREATE TABLE "public"."CommercialQuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "inquiryLineId" TEXT,
    "materialNumber" TEXT,
    "itemDescription" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "quantityUom" TEXT NOT NULL DEFAULT 'KM',
    "lengthMeters" DECIMAL(65,30) NOT NULL DEFAULT 1000,
    "costingRunId" TEXT,
    "materialCost" DECIMAL(65,30),
    "materialCostCurrency" TEXT DEFAULT 'USD',
    "commercialStatus" TEXT NOT NULL DEFAULT 'MATERIAL_COST_AVAILABLE',
    "sellingPrice" DECIMAL(65,30),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialQuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "CommercialInquiry_inquiryNumber_key" ON "public"."CommercialInquiry"("inquiryNumber");
CREATE INDEX "CommercialInquiry_customerId_idx" ON "public"."CommercialInquiry"("customerId");
CREATE INDEX "CommercialInquiry_status_idx" ON "public"."CommercialInquiry"("status");
CREATE INDEX "CommercialInquiry_inquiryDate_idx" ON "public"."CommercialInquiry"("inquiryDate");

CREATE INDEX "CommercialInquiryLine_inquiryId_idx" ON "public"."CommercialInquiryLine"("inquiryId");
CREATE INDEX "CommercialInquiryLine_materialNumber_idx" ON "public"."CommercialInquiryLine"("materialNumber");
CREATE INDEX "CommercialInquiryLine_status_idx" ON "public"."CommercialInquiryLine"("status");

CREATE UNIQUE INDEX "CommercialQuotation_quotationNumber_versionNo_key" ON "public"."CommercialQuotation"("quotationNumber", "versionNo");
CREATE INDEX "CommercialQuotation_inquiryId_idx" ON "public"."CommercialQuotation"("inquiryId");
CREATE INDEX "CommercialQuotation_customerId_idx" ON "public"."CommercialQuotation"("customerId");
CREATE INDEX "CommercialQuotation_isCurrent_idx" ON "public"."CommercialQuotation"("isCurrent");
CREATE INDEX "CommercialQuotation_status_idx" ON "public"."CommercialQuotation"("status");

CREATE INDEX "CommercialQuotationLine_quotationId_idx" ON "public"."CommercialQuotationLine"("quotationId");

-- AddForeignKeys
ALTER TABLE "public"."CommercialInquiryLine" ADD CONSTRAINT "CommercialInquiryLine_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "public"."CommercialInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CommercialQuotation" ADD CONSTRAINT "CommercialQuotation_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "public"."CommercialInquiry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."CommercialQuotationLine" ADD CONSTRAINT "CommercialQuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "public"."CommercialQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."CommercialQuotationLine" ADD CONSTRAINT "CommercialQuotationLine_inquiryLineId_fkey" FOREIGN KEY ("inquiryLineId") REFERENCES "public"."CommercialInquiryLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
