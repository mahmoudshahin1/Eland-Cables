-- Governed costing document numbers (scrap SC26-00001, optional formula FM26-00001).

CREATE TABLE "CostingDocumentSequence" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastSerial" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostingDocumentSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CostingDocumentSequence_prefix_year_key" ON "CostingDocumentSequence"("prefix", "year");
CREATE INDEX "CostingDocumentSequence_prefix_year_idx" ON "CostingDocumentSequence"("prefix", "year");
