-- Phase 1: D365 Quote-to-Cash domain models (no live D365)

-- CreateEnum
CREATE TYPE "public"."CommercialApprovalStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."FulfillmentType" AS ENUM ('DIRECT_ORDER', 'SALES_AGREEMENT');

-- CreateEnum
CREATE TYPE "public"."CommercialCommitmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."EpcSalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."EpcIntegrationStatus" AS ENUM ('NOT_SENT', 'PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."SalesAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."AgreementReleaseStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- AlterTable CommercialQuotation
ALTER TABLE "public"."CommercialQuotation" ADD COLUMN "billTo" TEXT,
ADD COLUMN "shipTo" TEXT,
ADD COLUMN "requestedDeliveryDate" TIMESTAMP(3),
ADD COLUMN "commercialApprovalStatus" "public"."CommercialApprovalStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN "fulfillmentType" "public"."FulfillmentType",
ADD COLUMN "commerciallyApprovedBy" TEXT,
ADD COLUMN "commerciallyApprovedAt" TIMESTAMP(3);

-- AlterTable CommercialQuotationLine (snapshot enrichment for SO copy)
ALTER TABLE "public"."CommercialQuotationLine" ADD COLUMN "customerCableCode" TEXT,
ADD COLUMN "configurationId" TEXT,
ADD COLUMN "engineeringRevision" TEXT,
ADD COLUMN "bomVersion" TEXT,
ADD COLUMN "technicalSpecificationId" TEXT,
ADD COLUMN "cuttingLengthMeters" DECIMAL(65,30),
ADD COLUMN "numberOfCuts" INTEGER,
ADD COLUMN "drumType" TEXT,
ADD COLUMN "drumSize" TEXT,
ADD COLUMN "drumQuantity" DECIMAL(65,30),
ADD COLUMN "drumLengthMeters" DECIMAL(65,30),
ADD COLUMN "drumWeightKg" DECIMAL(65,30);

-- CreateTable CommercialCommitment
CREATE TABLE "public"."CommercialCommitment" (
    "id" TEXT NOT NULL,
    "commitmentNumber" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "quotationVersionNo" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerMasterId" TEXT,
    "customerName" TEXT NOT NULL,
    "fulfillmentType" "public"."FulfillmentType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "totalCommittedQuantity" DECIMAL(65,30) NOT NULL,
    "totalCommittedAmount" DECIMAL(65,30),
    "quantityUom" TEXT NOT NULL DEFAULT 'KM',
    "orderedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "remainingQuantity" DECIMAL(65,30) NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expirationDate" TIMESTAMP(3),
    "status" "public"."CommercialCommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "d365DocumentNumber" TEXT,
    "d365RecordId" TEXT,
    "createdBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable SalesAgreement
CREATE TABLE "public"."SalesAgreement" (
    "id" TEXT NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerMasterId" TEXT,
    "customerName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "status" "public"."SalesAgreementStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalCommittedQuantity" DECIMAL(65,30) NOT NULL,
    "totalReleasedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "remainingQuantity" DECIMAL(65,30) NOT NULL,
    "quantityUom" TEXT NOT NULL DEFAULT 'KM',
    "integrationStatus" "public"."EpcIntegrationStatus" NOT NULL DEFAULT 'NOT_SENT',
    "d365AgreementNumber" TEXT,
    "d365RecordId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable SalesAgreementLine
CREATE TABLE "public"."SalesAgreementLine" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "quotationLineId" TEXT,
    "materialNumber" TEXT,
    "itemDescription" TEXT NOT NULL,
    "customerCableCode" TEXT,
    "committedQuantity" DECIMAL(65,30) NOT NULL,
    "releasedQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "remainingQuantity" DECIMAL(65,30) NOT NULL,
    "quantityUom" TEXT NOT NULL DEFAULT 'KM',
    "unitPrice" DECIMAL(65,30),
    "configurationId" TEXT,
    "engineeringRevision" TEXT,
    "bomVersion" TEXT,
    "technicalSpecificationId" TEXT,
    "lengthMeters" DECIMAL(65,30),
    "cuttingLengthMeters" DECIMAL(65,30),
    "numberOfCuts" INTEGER,
    "drumType" TEXT,
    "costingRunId" TEXT,
    "costingCalculationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesAgreementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable AgreementRelease
CREATE TABLE "public"."AgreementRelease" (
    "id" TEXT NOT NULL,
    "releaseNumber" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "status" "public"."AgreementReleaseStatus" NOT NULL DEFAULT 'CONFIRMED',
    "releaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedDeliveryDate" TIMESTAMP(3),
    "shipTo" TEXT,
    "totalReleasedQuantity" DECIMAL(65,30) NOT NULL,
    "quantityUom" TEXT NOT NULL DEFAULT 'KM',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgreementRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable EpcSalesOrder
CREATE TABLE "public"."EpcSalesOrder" (
    "id" TEXT NOT NULL,
    "salesOrderNumber" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "inquiryId" TEXT,
    "agreementReleaseId" TEXT,
    "customerId" TEXT NOT NULL,
    "customerMasterId" TEXT,
    "customerName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "incoterms" TEXT,
    "billTo" TEXT,
    "shipTo" TEXT,
    "requestedDeliveryDate" TIMESTAMP(3),
    "status" "public"."EpcSalesOrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "integrationStatus" "public"."EpcIntegrationStatus" NOT NULL DEFAULT 'NOT_SENT',
    "d365SalesOrderNumber" TEXT,
    "d365Company" TEXT,
    "d365RecordId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpcSalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable EpcSalesOrderLine
CREATE TABLE "public"."EpcSalesOrderLine" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    "quotationLineId" TEXT,
    "materialNumber" TEXT,
    "itemCode" TEXT,
    "itemDescription" TEXT NOT NULL,
    "customerCableCode" TEXT,
    "quantity" DECIMAL(65,30) NOT NULL,
    "quantityUom" TEXT NOT NULL DEFAULT 'KM',
    "unitPrice" DECIMAL(65,30),
    "discountPercent" DECIMAL(65,30),
    "netPrice" DECIMAL(65,30),
    "lineAmount" DECIMAL(65,30),
    "configurationId" TEXT,
    "engineeringRevision" TEXT,
    "bomVersion" TEXT,
    "technicalSpecificationId" TEXT,
    "lengthMeters" DECIMAL(65,30),
    "cuttingLengthMeters" DECIMAL(65,30),
    "numberOfCuts" INTEGER,
    "drumType" TEXT,
    "drumSize" TEXT,
    "drumQuantity" DECIMAL(65,30),
    "drumLengthMeters" DECIMAL(65,30),
    "drumWeightKg" DECIMAL(65,30),
    "costingRunId" TEXT,
    "costingCalculationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpcSalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "CommercialCommitment_commitmentNumber_key" ON "public"."CommercialCommitment"("commitmentNumber");
CREATE INDEX "CommercialCommitment_quotationId_idx" ON "public"."CommercialCommitment"("quotationId");
CREATE INDEX "CommercialCommitment_customerId_idx" ON "public"."CommercialCommitment"("customerId");
CREATE INDEX "CommercialCommitment_customerMasterId_idx" ON "public"."CommercialCommitment"("customerMasterId");
CREATE INDEX "CommercialCommitment_status_idx" ON "public"."CommercialCommitment"("status");
CREATE INDEX "CommercialCommitment_fulfillmentType_idx" ON "public"."CommercialCommitment"("fulfillmentType");

CREATE UNIQUE INDEX "SalesAgreement_agreementNumber_key" ON "public"."SalesAgreement"("agreementNumber");
CREATE INDEX "SalesAgreement_commitmentId_idx" ON "public"."SalesAgreement"("commitmentId");
CREATE INDEX "SalesAgreement_quotationId_idx" ON "public"."SalesAgreement"("quotationId");
CREATE INDEX "SalesAgreement_customerId_idx" ON "public"."SalesAgreement"("customerId");
CREATE INDEX "SalesAgreement_customerMasterId_idx" ON "public"."SalesAgreement"("customerMasterId");
CREATE INDEX "SalesAgreement_status_idx" ON "public"."SalesAgreement"("status");

CREATE INDEX "SalesAgreementLine_agreementId_idx" ON "public"."SalesAgreementLine"("agreementId");
CREATE INDEX "SalesAgreementLine_quotationLineId_idx" ON "public"."SalesAgreementLine"("quotationLineId");

CREATE UNIQUE INDEX "AgreementRelease_releaseNumber_key" ON "public"."AgreementRelease"("releaseNumber");
CREATE INDEX "AgreementRelease_agreementId_idx" ON "public"."AgreementRelease"("agreementId");
CREATE INDEX "AgreementRelease_status_idx" ON "public"."AgreementRelease"("status");

CREATE UNIQUE INDEX "EpcSalesOrder_salesOrderNumber_key" ON "public"."EpcSalesOrder"("salesOrderNumber");
CREATE UNIQUE INDEX "EpcSalesOrder_agreementReleaseId_key" ON "public"."EpcSalesOrder"("agreementReleaseId");
CREATE INDEX "EpcSalesOrder_commitmentId_idx" ON "public"."EpcSalesOrder"("commitmentId");
CREATE INDEX "EpcSalesOrder_quotationId_idx" ON "public"."EpcSalesOrder"("quotationId");
CREATE INDEX "EpcSalesOrder_customerId_idx" ON "public"."EpcSalesOrder"("customerId");
CREATE INDEX "EpcSalesOrder_customerMasterId_idx" ON "public"."EpcSalesOrder"("customerMasterId");
CREATE INDEX "EpcSalesOrder_status_idx" ON "public"."EpcSalesOrder"("status");
CREATE INDEX "EpcSalesOrder_integrationStatus_idx" ON "public"."EpcSalesOrder"("integrationStatus");

CREATE INDEX "EpcSalesOrderLine_salesOrderId_idx" ON "public"."EpcSalesOrderLine"("salesOrderId");
CREATE INDEX "EpcSalesOrderLine_quotationLineId_idx" ON "public"."EpcSalesOrderLine"("quotationLineId");

CREATE INDEX "CommercialQuotation_commercialApprovalStatus_idx" ON "public"."CommercialQuotation"("commercialApprovalStatus");

-- ForeignKeys
ALTER TABLE "public"."CommercialCommitment" ADD CONSTRAINT "CommercialCommitment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "public"."CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."SalesAgreement" ADD CONSTRAINT "SalesAgreement_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "public"."CommercialCommitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."SalesAgreement" ADD CONSTRAINT "SalesAgreement_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "public"."CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."SalesAgreementLine" ADD CONSTRAINT "SalesAgreementLine_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "public"."SalesAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."AgreementRelease" ADD CONSTRAINT "AgreementRelease_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "public"."SalesAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."EpcSalesOrder" ADD CONSTRAINT "EpcSalesOrder_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "public"."CommercialCommitment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."EpcSalesOrder" ADD CONSTRAINT "EpcSalesOrder_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "public"."CommercialQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."EpcSalesOrder" ADD CONSTRAINT "EpcSalesOrder_agreementReleaseId_fkey" FOREIGN KEY ("agreementReleaseId") REFERENCES "public"."AgreementRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."EpcSalesOrderLine" ADD CONSTRAINT "EpcSalesOrderLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "public"."EpcSalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
