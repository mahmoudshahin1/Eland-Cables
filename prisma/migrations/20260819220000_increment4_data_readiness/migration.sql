-- Increment 4: price temporal model without invented dates; BOM duplicate observations; import skipped counts.

ALTER TABLE "public"."RawMaterialPrice" ALTER COLUMN "effectiveFrom" DROP NOT NULL;
ALTER TABLE "public"."RawMaterialPrice" ALTER COLUMN "effectiveFrom" DROP DEFAULT;

ALTER TABLE "public"."RawMaterialPrice" ADD COLUMN "temporalStatus" TEXT NOT NULL DEFAULT 'DATA_REQUIRED';

UPDATE "public"."RawMaterialPrice"
SET "temporalStatus" = 'EFFECTIVE'
WHERE "effectiveFrom" IS NOT NULL;

ALTER TABLE "public"."ImportBatch" ADD COLUMN "skippedCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "public"."BomDuplicateObservation" (
    "id" TEXT NOT NULL,
    "cableMaterialNumber" TEXT NOT NULL,
    "rawMaterialCode" TEXT NOT NULL,
    "weightA" DECIMAL(65,30) NOT NULL,
    "weightB" DECIMAL(65,30) NOT NULL,
    "occurrenceCount" INTEGER NOT NULL,
    "sourceWorksheet" TEXT,
    "sourceFile" TEXT,
    "sourceRows" JSONB,
    "classification" TEXT NOT NULL,
    "sourceBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BomDuplicateObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BomDuplicateObservation_cable_rm_idx" ON "public"."BomDuplicateObservation"("cableMaterialNumber", "rawMaterialCode");
