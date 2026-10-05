-- Inquiry header metal pricing traceability on costing lines and RM pricing category
ALTER TABLE "RawMaterial" ADD COLUMN IF NOT EXISTS "pricingCategory" TEXT NOT NULL DEFAULT 'STANDARD_RAW_MATERIAL';

ALTER TABLE "CostingLine" ADD COLUMN IF NOT EXISTS "pricingSource" TEXT;
ALTER TABLE "CostingLine" ADD COLUMN IF NOT EXISTS "masterPrice" DECIMAL(65,30);
ALTER TABLE "CostingLine" ADD COLUMN IF NOT EXISTS "masterPriceCurrency" TEXT;
ALTER TABLE "CostingLine" ADD COLUMN IF NOT EXISTS "masterPriceUom" TEXT;
ALTER TABLE "CostingLine" ADD COLUMN IF NOT EXISTS "inquiryHeaderPrice" DECIMAL(65,30);
ALTER TABLE "CostingLine" ADD COLUMN IF NOT EXISTS "inquiryHeaderPriceUom" TEXT;
