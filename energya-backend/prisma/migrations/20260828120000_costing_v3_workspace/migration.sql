-- Costing Configuration V3: currency master + raw material classification fields

CREATE TABLE "CostingCurrency" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "isBaseCurrency" BOOLEAN NOT NULL DEFAULT false,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    CONSTRAINT "CostingCurrency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CostingCurrency_code_key" ON "CostingCurrency"("code");
CREATE INDEX "CostingCurrency_status_idx" ON "CostingCurrency"("status");
CREATE INDEX "CostingCurrency_isBaseCurrency_idx" ON "CostingCurrency"("isBaseCurrency");

ALTER TABLE "RawMaterial" ADD COLUMN IF NOT EXISTS "shortDescription" TEXT;
ALTER TABLE "RawMaterial" ADD COLUMN IF NOT EXISTS "metalType" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "RawMaterial" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "RawMaterial" ADD COLUMN IF NOT EXISTS "pricingCategory" TEXT NOT NULL DEFAULT 'STANDARD_RAW_MATERIAL';

CREATE INDEX IF NOT EXISTS "RawMaterial_pricingCategory_idx" ON "RawMaterial"("pricingCategory");
CREATE INDEX IF NOT EXISTS "RawMaterial_metalType_idx" ON "RawMaterial"("metalType");
CREATE INDEX IF NOT EXISTS "RawMaterial_status_idx" ON "RawMaterial"("status");

-- Seed standard currencies (idempotent)
INSERT INTO "CostingCurrency" ("id", "code", "name", "symbol", "isBaseCurrency", "decimalPlaces", "status", "updatedAt")
VALUES
  ('cc-egp', 'LE', 'Egyptian Pound', 'E£', true, 2, 'ACTIVE', CURRENT_TIMESTAMP),
  ('cc-usd', 'USD', 'US Dollar', '$', false, 2, 'ACTIVE', CURRENT_TIMESTAMP),
  ('cc-eur', 'EUR', 'Euro', '€', false, 2, 'ACTIVE', CURRENT_TIMESTAMP),
  ('cc-gbp', 'GBP', 'British Pound', '£', false, 2, 'ACTIVE', CURRENT_TIMESTAMP),
  ('cc-sar', 'SAR', 'Saudi Riyal', 'SR', false, 2, 'ACTIVE', CURRENT_TIMESTAMP),
  ('cc-aed', 'AED', 'UAE Dirham', 'د.إ', false, 2, 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Alias EGP → LE for ISO compatibility
INSERT INTO "CostingCurrency" ("id", "code", "name", "symbol", "isBaseCurrency", "decimalPlaces", "status", "notes", "updatedAt")
VALUES ('cc-egp-alias', 'EGP', 'Egyptian Pound (ISO)', 'E£', false, 2, 'ACTIVE', 'Alias of LE base currency', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
