-- Increment 12 — Commercial Inquiry UI persistence & versioning
ALTER TABLE "CommercialInquiry" ADD COLUMN IF NOT EXISTS "modifiedBy" TEXT;
ALTER TABLE "CommercialInquiry" ADD COLUMN IF NOT EXISTS "salesAgent" TEXT;
ALTER TABLE "CommercialInquiry" ADD COLUMN IF NOT EXISTS "quotationOwner" TEXT;
ALTER TABLE "CommercialInquiry" ADD COLUMN IF NOT EXISTS "versionNo" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CommercialInquiry" ADD COLUMN IF NOT EXISTS "isCurrent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CommercialInquiry" ADD COLUMN IF NOT EXISTS "supersedesInquiryId" TEXT;
ALTER TABLE "CommercialInquiry" ADD COLUMN IF NOT EXISTS "inquiryGroupKey" TEXT;
ALTER TABLE "CommercialInquiry" ADD COLUMN IF NOT EXISTS "commercialMetadata" JSONB;

CREATE INDEX IF NOT EXISTS "CommercialInquiry_inquiryGroupKey_idx" ON "CommercialInquiry"("inquiryGroupKey");
CREATE INDEX IF NOT EXISTS "CommercialInquiry_isCurrent_idx" ON "CommercialInquiry"("isCurrent");
CREATE INDEX IF NOT EXISTS "CommercialInquiry_customerReference_idx" ON "CommercialInquiry"("customerReference");
