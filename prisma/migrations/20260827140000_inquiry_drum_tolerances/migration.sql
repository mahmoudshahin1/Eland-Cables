-- AlterTable
ALTER TABLE "CommercialInquiryLine" ADD COLUMN "cableTolerancePercent" DECIMAL(65,30);
ALTER TABLE "CommercialInquiryLine" ADD COLUMN "drumSchedule" JSONB;
