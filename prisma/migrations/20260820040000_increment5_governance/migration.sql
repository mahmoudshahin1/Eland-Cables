-- Increment 5: engineering mapping + BOM conflict review register (no costing).

ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "conflictId" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "customerCode" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "cableDescription" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "reviewer" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "reviewDate" TIMESTAMP(3);
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "decision" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "comment" TEXT;
ALTER TABLE "public"."BomDuplicateObservation" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "BomDuplicateObservation_conflictId_key" ON "public"."BomDuplicateObservation"("conflictId");

CREATE TABLE "public"."CableEngineeringMapping" (
    "materialNumber" TEXT NOT NULL,
    "mappingStatus" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "suggested" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CableEngineeringMapping_pkey" PRIMARY KEY ("materialNumber")
);

ALTER TABLE "public"."CableEngineeringMapping" ADD CONSTRAINT "CableEngineeringMapping_materialNumber_fkey" FOREIGN KEY ("materialNumber") REFERENCES "public"."CableMaster"("materialNumber") ON DELETE RESTRICT ON UPDATE CASCADE;
