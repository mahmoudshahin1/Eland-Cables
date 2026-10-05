-- Increment 12: Commercial Pricing & Sales Margin Engine

-- CreateEnum
CREATE TYPE "public"."PricingRuleType" AS ENUM ('MARKUP', 'GROSS_MARGIN');

-- CreateEnum
CREATE TYPE "public"."PricingRuleScope" AS ENUM ('GLOBAL', 'CUSTOMER_TIER', 'CUSTOMER_SPECIFIC', 'CABLE_SPECIFIC', 'CUSTOMER_CABLE_SPECIFIC');

-- CreateEnum
CREATE TYPE "public"."CommercialPricingStatus" AS ENUM ('PRICING_NOT_CONFIGURED', 'PRICING_CALCULATED', 'PRICING_APPROVAL_REQUIRED', 'PRICING_APPROVED', 'PRICING_REJECTED', 'PRICING_EXPIRED', 'PRICING_RULE_CONFLICT', 'PRICING_CURRENCY_MISMATCH');

-- AlterTable CommercialQuotationLine
ALTER TABLE "public"."CommercialQuotationLine" ADD COLUMN "pricingSnapshotId" TEXT;

-- CreateTable CustomerPricingTier
CREATE TABLE "public"."CustomerPricingTier" (
    "id" TEXT NOT NULL,
    "tierCode" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "description" TEXT,
    "defaultMarginType" "public"."PricingRuleType" NOT NULL DEFAULT 'GROSS_MARGIN',
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPricingTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable CommercialPricingRule
CREATE TABLE "public"."CommercialPricingRule" (
    "id" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "scope" "public"."PricingRuleScope" NOT NULL DEFAULT 'GLOBAL',
    "ruleType" "public"."PricingRuleType" NOT NULL DEFAULT 'GROSS_MARGIN',
    "customerId" TEXT,
    "customerTierCode" TEXT,
    "cableMaterialNumber" TEXT,
    "percentageValue" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "priority" INTEGER NOT NULL DEFAULT 20,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "workflowStatus" "public"."PriceWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "minMarginThreshold" DECIMAL(65,30),
    "maxDiscountAllowed" DECIMAL(65,30) DEFAULT 15.00,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialPricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable CommercialDiscountRule
CREATE TABLE "public"."CommercialDiscountRule" (
    "id" TEXT NOT NULL,
    "discountCode" TEXT NOT NULL,
    "discountName" TEXT NOT NULL,
    "customerId" TEXT,
    "customerTierCode" TEXT,
    "cableMaterialNumber" TEXT,
    "discountPercentage" DECIMAL(65,30) NOT NULL,
    "maxDiscountAllowed" DECIMAL(65,30) NOT NULL DEFAULT 15.00,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "workflowStatus" "public"."PriceWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialDiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable CommercialPricingSnapshot
CREATE TABLE "public"."CommercialPricingSnapshot" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "quotationLineId" TEXT NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "materialNumber" TEXT NOT NULL,
    "costingRunId" TEXT,
    "materialCost" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "pricingRuleId" TEXT,
    "pricingRuleRevision" INTEGER NOT NULL DEFAULT 1,
    "pricingRuleType" "public"."PricingRuleType" NOT NULL,
    "percentageValue" DECIMAL(65,30) NOT NULL,
    "baseSellingPrice" DECIMAL(65,30) NOT NULL,
    "discountPercentage" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "finalSellingPrice" DECIMAL(65,30) NOT NULL,
    "unitSellingPrice" DECIMAL(65,30) NOT NULL,
    "pricingStatus" "public"."CommercialPricingStatus" NOT NULL DEFAULT 'PRICING_CALCULATED',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvalReason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialPricingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "CustomerPricingTier_tierCode_key" ON "public"."CustomerPricingTier"("tierCode");

CREATE UNIQUE INDEX "CommercialPricingRule_ruleCode_key" ON "public"."CommercialPricingRule"("ruleCode");
CREATE INDEX "CommercialPricingRule_scope_idx" ON "public"."CommercialPricingRule"("scope");
CREATE INDEX "CommercialPricingRule_customerId_idx" ON "public"."CommercialPricingRule"("customerId");
CREATE INDEX "CommercialPricingRule_customerTierCode_idx" ON "public"."CommercialPricingRule"("customerTierCode");
CREATE INDEX "CommercialPricingRule_cableMaterialNumber_idx" ON "public"."CommercialPricingRule"("cableMaterialNumber");
CREATE INDEX "CommercialPricingRule_workflowStatus_idx" ON "public"."CommercialPricingRule"("workflowStatus");
CREATE INDEX "CommercialPricingRule_effectiveFrom_effectiveTo_idx" ON "public"."CommercialPricingRule"("effectiveFrom", "effectiveTo");

CREATE UNIQUE INDEX "CommercialDiscountRule_discountCode_key" ON "public"."CommercialDiscountRule"("discountCode");

CREATE UNIQUE INDEX "CommercialPricingSnapshot_quotationLineId_key" ON "public"."CommercialPricingSnapshot"("quotationLineId");
CREATE INDEX "CommercialPricingSnapshot_quotationId_idx" ON "public"."CommercialPricingSnapshot"("quotationId");
CREATE INDEX "CommercialPricingSnapshot_materialNumber_idx" ON "public"."CommercialPricingSnapshot"("materialNumber");
CREATE INDEX "CommercialPricingSnapshot_pricingStatus_idx" ON "public"."CommercialPricingSnapshot"("pricingStatus");

-- AddForeignKeys
ALTER TABLE "public"."CommercialPricingSnapshot" ADD CONSTRAINT "CommercialPricingSnapshot_quotationLineId_fkey" FOREIGN KEY ("quotationLineId") REFERENCES "public"."CommercialQuotationLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."CommercialPricingSnapshot" ADD CONSTRAINT "CommercialPricingSnapshot_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "public"."CommercialPricingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
