-- Extend CommercialPricingRule for Cable Family + Customer Group scopes
-- and shipping-style effective-dated versions. Does not rewrite snapshots.

ALTER TYPE "PricingRuleScope" ADD VALUE IF NOT EXISTS 'CUSTOMER_GROUP_CABLE';
ALTER TYPE "PricingRuleScope" ADD VALUE IF NOT EXISTS 'CUSTOMER_FAMILY';
ALTER TYPE "PricingRuleScope" ADD VALUE IF NOT EXISTS 'CUSTOMER_GROUP_FAMILY';
ALTER TYPE "PricingRuleScope" ADD VALUE IF NOT EXISTS 'CABLE_FAMILY';

ALTER TABLE "CommercialPricingRule" ADD COLUMN "customerGroupId" TEXT;
ALTER TABLE "CommercialPricingRule" ADD COLUMN "cableFamily" TEXT;
ALTER TABLE "CommercialPricingRule" ADD COLUMN "scopeKey" TEXT;
ALTER TABLE "CommercialPricingRule" ADD COLUMN "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "CommercialPricingRule" ADD COLUMN "updatedBy" TEXT;

UPDATE "CommercialPricingRule"
SET "scopeKey" = CONCAT(
  "scope"::text, '|',
  UPPER("currency"), '|',
  COALESCE("customerId", ''), '|',
  COALESCE("customerGroupId", ''), '|',
  COALESCE("customerTierCode", ''), '|',
  COALESCE("cableMaterialNumber", ''), '|',
  UPPER(COALESCE("cableFamily", ''))
)
WHERE "scopeKey" IS NULL;

-- Existing Increment 12 fixtures may share scope + revision 1. Keep those rows
-- unique by appending the rule id only when a duplicate family/version exists.
UPDATE "CommercialPricingRule" AS r
SET "scopeKey" = r."scopeKey" || '|id:' || r."id"
WHERE EXISTS (
  SELECT 1
  FROM "CommercialPricingRule" AS o
  WHERE o."scopeKey" = r."scopeKey"
    AND o."revision" = r."revision"
    AND o."id" < r."id"
);

ALTER TABLE "CommercialPricingRule" ALTER COLUMN "scopeKey" SET NOT NULL;

ALTER TABLE "CommercialPricingSnapshot" ADD COLUMN "pricingRuleScope" "PricingRuleScope";
ALTER TABLE "CommercialPricingSnapshot" ADD COLUMN "resolutionReason" TEXT;

CREATE UNIQUE INDEX "CommercialPricingRule_scopeKey_revision_key"
  ON "CommercialPricingRule"("scopeKey", "revision");
CREATE INDEX "CommercialPricingRule_customerGroupId_idx" ON "CommercialPricingRule"("customerGroupId");
CREATE INDEX "CommercialPricingRule_cableFamily_idx" ON "CommercialPricingRule"("cableFamily");
CREATE INDEX "CommercialPricingRule_status_idx" ON "CommercialPricingRule"("status");
CREATE INDEX "CommercialPricingRule_scopeKey_status_idx" ON "CommercialPricingRule"("scopeKey", "status");

ALTER TABLE "CommercialPricingRule"
  ADD CONSTRAINT "CommercialPricingRule_customerGroupId_fkey"
  FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
