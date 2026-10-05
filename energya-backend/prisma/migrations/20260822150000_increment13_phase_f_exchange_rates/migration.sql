-- Increment 13 Phase F: governed exchange rates for multi-currency costing

CREATE TABLE "CostingExchangeRate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "workflowStatus" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "changeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "CostingExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CostingExchangeRate_code_key" ON "CostingExchangeRate"("code");
CREATE INDEX "CostingExchangeRate_fromCurrency_toCurrency_idx" ON "CostingExchangeRate"("fromCurrency", "toCurrency");
CREATE INDEX "CostingExchangeRate_workflowStatus_idx" ON "CostingExchangeRate"("workflowStatus");
CREATE INDEX "CostingExchangeRate_status_idx" ON "CostingExchangeRate"("status");
CREATE INDEX "CostingExchangeRate_isCurrent_idx" ON "CostingExchangeRate"("isCurrent");
CREATE INDEX "CostingExchangeRate_effectiveFrom_effectiveTo_idx" ON "CostingExchangeRate"("effectiveFrom", "effectiveTo");
