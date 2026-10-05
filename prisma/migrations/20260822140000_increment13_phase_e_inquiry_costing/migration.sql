-- Phase E: inquiry line costing calculation linkage
ALTER TABLE "CommercialInquiryLine" ADD COLUMN "costingCalculationId" TEXT;

ALTER TABLE "CostingRun" ADD COLUMN "inquiryLineId" TEXT;

ALTER TABLE "CostingCalculation" ADD COLUMN "inquiryId" TEXT;

CREATE INDEX "CommercialInquiryLine_costingCalculationId_idx" ON "CommercialInquiryLine"("costingCalculationId");
CREATE INDEX "CostingRun_inquiryLineId_idx" ON "CostingRun"("inquiryLineId");
CREATE INDEX "CostingCalculation_inquiryId_idx" ON "CostingCalculation"("inquiryId");

ALTER TABLE "CommercialInquiryLine" ADD CONSTRAINT "CommercialInquiryLine_costingCalculationId_fkey"
  FOREIGN KEY ("costingCalculationId") REFERENCES "CostingCalculation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
