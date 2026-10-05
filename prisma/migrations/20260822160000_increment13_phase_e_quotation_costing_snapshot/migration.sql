-- Increment 13 Phase E Stage H: Quotation line costing calculation snapshot link

ALTER TABLE "CommercialQuotationLine" ADD COLUMN IF NOT EXISTS "costingCalculationId" TEXT;

CREATE INDEX IF NOT EXISTS "CommercialQuotationLine_costingCalculationId_idx"
  ON "CommercialQuotationLine"("costingCalculationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommercialQuotationLine_costingCalculationId_fkey'
  ) THEN
    ALTER TABLE "CommercialQuotationLine"
      ADD CONSTRAINT "CommercialQuotationLine_costingCalculationId_fkey"
      FOREIGN KEY ("costingCalculationId") REFERENCES "CostingCalculation"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
