-- Phase 1 extension: Direct MTS Sales Order entry point
-- Order Origin vs Order Fulfillment Mode; Cable Fulfillment Policy on CableMaster
-- Existing Phase 1 SOs backfilled as MTO from QUOTATION or AGREEMENT_RELEASE

-- CreateEnum
CREATE TYPE "public"."SalesOrderOrigin" AS ENUM ('QUOTATION', 'AGREEMENT_RELEASE', 'DIRECT_MTS');

-- CreateEnum
CREATE TYPE "public"."OrderFulfillmentMode" AS ENUM ('MTO', 'MTS');

-- CreateEnum
CREATE TYPE "public"."CableFulfillmentPolicy" AS ENUM ('MTO', 'MTS', 'MTO_MTS');

-- AlterTable CableMaster — default MTO (quotation path only) for existing cables
ALTER TABLE "public"."CableMaster" ADD COLUMN "fulfillmentPolicy" "public"."CableFulfillmentPolicy" NOT NULL DEFAULT 'MTO';

CREATE INDEX "CableMaster_fulfillmentPolicy_idx" ON "public"."CableMaster"("fulfillmentPolicy");

-- AlterTable EpcSalesOrder — nullable commitment/quotation for DIRECT_MTS; origin/mode
ALTER TABLE "public"."EpcSalesOrder" ADD COLUMN "orderOrigin" "public"."SalesOrderOrigin",
ADD COLUMN "orderFulfillmentMode" "public"."OrderFulfillmentMode",
ADD COLUMN "customerReference" TEXT,
ADD COLUMN "idempotencyKey" TEXT;

-- Backfill existing Phase 1 orders
UPDATE "public"."EpcSalesOrder"
SET
  "orderOrigin" = CASE
    WHEN "agreementReleaseId" IS NOT NULL THEN 'AGREEMENT_RELEASE'::"public"."SalesOrderOrigin"
    ELSE 'QUOTATION'::"public"."SalesOrderOrigin"
  END,
  "orderFulfillmentMode" = 'MTO'::"public"."OrderFulfillmentMode"
WHERE "orderOrigin" IS NULL OR "orderFulfillmentMode" IS NULL;

ALTER TABLE "public"."EpcSalesOrder" ALTER COLUMN "orderOrigin" SET NOT NULL,
ALTER COLUMN "orderFulfillmentMode" SET NOT NULL;

ALTER TABLE "public"."EpcSalesOrder" ALTER COLUMN "commitmentId" DROP NOT NULL,
ALTER COLUMN "quotationId" DROP NOT NULL;

CREATE UNIQUE INDEX "EpcSalesOrder_idempotencyKey_key" ON "public"."EpcSalesOrder"("idempotencyKey");

CREATE INDEX "EpcSalesOrder_orderOrigin_idx" ON "public"."EpcSalesOrder"("orderOrigin");

CREATE INDEX "EpcSalesOrder_orderFulfillmentMode_idx" ON "public"."EpcSalesOrder"("orderFulfillmentMode");

-- AlterTable EpcSalesOrderLine — optional stock snapshot for Direct MTS
ALTER TABLE "public"."EpcSalesOrderLine" ADD COLUMN "availableStockQuantity" DECIMAL(65,30);

CREATE INDEX "EpcSalesOrderLine_materialNumber_idx" ON "public"."EpcSalesOrderLine"("materialNumber");
