-- Additive LME instrument catalog, import batch, and price history.
-- Does not seed sample prices and does not alter costing tables.

CREATE TYPE "MarketMetalImportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED');
CREATE TYPE "MarketMetalCostingUsage" AS ENUM ('CABLE_COPPER', 'CABLE_ALUMINIUM', 'NONE');

CREATE TABLE "MarketMetalInstrument" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costingUsage" "MarketMetalCostingUsage" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketMetalInstrument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketMetalInstrument_code_key" ON "MarketMetalInstrument"("code");
CREATE INDEX "MarketMetalInstrument_costingUsage_idx" ON "MarketMetalInstrument"("costingUsage");

CREATE TABLE "MarketMetalImportBatch" (
    "id" TEXT NOT NULL,
    "status" "MarketMetalImportStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceFileName" TEXT,
    "mimeType" TEXT,
    "image" BYTEA,
    "extractedJson" JSONB NOT NULL,
    "quoteDate" DATE,
    "confidence" TEXT NOT NULL DEFAULT 'LOW',
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketMetalImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketMetalImportBatch_status_idx" ON "MarketMetalImportBatch"("status");
CREATE INDEX "MarketMetalImportBatch_quoteDate_idx" ON "MarketMetalImportBatch"("quoteDate");

CREATE TABLE "MarketMetalPrice" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "quoteDate" DATE NOT NULL,
    "cashAsk" DECIMAL(18,4),
    "threeMonthAsk" DECIMAL(18,4),
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "blankCash" BOOLEAN NOT NULL DEFAULT false,
    "status" "MarketMetalImportStatus" NOT NULL DEFAULT 'DRAFT',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketMetalPrice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketMetalPrice_instrumentId_status_quoteDate_idx" ON "MarketMetalPrice"("instrumentId", "status", "quoteDate");
CREATE INDEX "MarketMetalPrice_importBatchId_idx" ON "MarketMetalPrice"("importBatchId");
CREATE INDEX "MarketMetalPrice_isCurrent_idx" ON "MarketMetalPrice"("isCurrent");

ALTER TABLE "MarketMetalPrice" ADD CONSTRAINT "MarketMetalPrice_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "MarketMetalInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketMetalPrice" ADD CONSTRAINT "MarketMetalPrice_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "MarketMetalImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MarketMetalInstrument" ("id", "code", "name", "costingUsage", "sortOrder", "createdAt", "updatedAt") VALUES
  ('mmi-copper', 'COPPER', 'Copper', 'CABLE_COPPER', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-aluminium', 'ALUMINIUM', 'Aluminium', 'CABLE_ALUMINIUM', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-nickel', 'NICKEL', 'Nickel', 'NONE', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-zinc', 'ZINC', 'Zinc', 'NONE', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-lead', 'LEAD', 'Lead', 'NONE', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-tin', 'TIN', 'Tin', 'NONE', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-al-alloy', 'AL_ALLOY', 'Al Alloy', 'NONE', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-nasaac', 'NASAAC', 'NASAAC', 'NONE', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-cobalt', 'COBALT', 'Cobalt', 'NONE', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-molybdenum', 'MOLYBDENUM', 'Molybdenum', 'NONE', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mmi-us-al-premium', 'US_ALUMINIUM_PREMIUM', 'US Aluminium Premium', 'NONE', 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
