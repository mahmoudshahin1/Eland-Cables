-- Increment 6: CableEngineeringMapping workflow revisions, statuses, controlled parameters & immutable audit trail

-- CreateEnum
CREATE TYPE "public"."MappingWorkflowStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Drop old table if exists
DROP TABLE IF EXISTS "public"."CableEngineeringMapping" CASCADE;

-- CreateTable
CREATE TABLE "public"."CableEngineeringMapping" (
    "id" TEXT NOT NULL,
    "materialNumber" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "status" "public"."MappingWorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "mappingStatus" TEXT NOT NULL DEFAULT 'PARTIAL',
    "dataSource" TEXT NOT NULL DEFAULT 'Energya Cable Master Data.xlsx / Cable List',
    "sourceReference" TEXT,
    "family" TEXT,
    "voltage" TEXT,
    "conductor" TEXT,
    "conductorSize" TEXT,
    "cores" TEXT,
    "insulation" TEXT,
    "screen" TEXT,
    "armour" TEXT,
    "sheath" TEXT,
    "sheathColour" TEXT,
    "coreColour" TEXT,
    "standard" TEXT,
    "specialAdditives" TEXT,
    "attributes" JSONB NOT NULL,
    "suggested" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "assignedReviewer" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "comments" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CableEngineeringMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "CableEngineeringMapping_materialNumber_revision_key" ON "public"."CableEngineeringMapping"("materialNumber", "revision");
CREATE INDEX "CableEngineeringMapping_materialNumber_isCurrent_idx" ON "public"."CableEngineeringMapping"("materialNumber", "isCurrent");
CREATE INDEX "CableEngineeringMapping_status_idx" ON "public"."CableEngineeringMapping"("status");

-- AddForeignKey
ALTER TABLE "public"."CableEngineeringMapping" ADD CONSTRAINT "CableEngineeringMapping_materialNumber_fkey" FOREIGN KEY ("materialNumber") REFERENCES "public"."CableMaster"("materialNumber") ON DELETE RESTRICT ON UPDATE CASCADE;
