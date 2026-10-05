-- 05I-DRUM-REMEDIATION — independent cutting-length requirements + directional tolerance.
-- Does NOT merge historical commercial inquiry lines that share a cable.

CREATE TYPE "CuttingLengthToleranceMode" AS ENUM ('NONE', 'POSITIVE', 'NEGATIVE', 'SYMMETRIC');

CREATE TABLE "V2CuttingLengthRequirement" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "inquiryLineId" TEXT NOT NULL,
    "configurationSnapshotId" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'M',
    "nominalLengthM" DECIMAL(65,30) NOT NULL,
    "toleranceMode" "CuttingLengthToleranceMode" NOT NULL DEFAULT 'SYMMETRIC',
    "positiveTolerancePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "negativeTolerancePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "minLengthM" DECIMAL(65,30) NOT NULL,
    "maxLengthM" DECIMAL(65,30) NOT NULL,
    "requestedDrumCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "currentCuttingPlanId" TEXT,
    "currentDrumPlanId" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V2CuttingLengthRequirement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "V2CuttingLengthPlan"
    ADD COLUMN "cuttingLengthRequirementId" TEXT,
    ADD COLUMN "toleranceMode" "CuttingLengthToleranceMode" NOT NULL DEFAULT 'SYMMETRIC',
    ADD COLUMN "positiveTolerancePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    ADD COLUMN "negativeTolerancePercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    ADD COLUMN "requestedDrumCount" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "V2DrumPlan" ADD COLUMN "cuttingLengthRequirementId" TEXT;
ALTER TABLE "V2DrumPlanLine" ADD COLUMN "cuttingLengthRequirementId" TEXT;

-- One requirement per inquiry line that already has cutting-plan versions.
-- Historical versions of the same line remain revisions of that one requirement.
INSERT INTO "V2CuttingLengthRequirement" (
    "id",
    "requirementId",
    "sequenceNo",
    "inquiryLineId",
    "configurationSnapshotId",
    "unit",
    "nominalLengthM",
    "toleranceMode",
    "positiveTolerancePercent",
    "negativeTolerancePercent",
    "minLengthM",
    "maxLengthM",
    "requestedDrumCount",
    "status",
    "versionNo",
    "currentCuttingPlanId",
    "currentDrumPlanId",
    "actorId",
    "actorEmail",
    "actorRole",
    "createdAt",
    "updatedAt"
)
SELECT
    'clreq_' || source.plan_id,
    'v2clr-' || source."planId",
    1,
    source."inquiryLineId",
    source."configurationSnapshotId",
    'M',
    source."nominalLengthM",
    CASE
        WHEN source."tolerancePercent" = 0 THEN 'NONE'::"CuttingLengthToleranceMode"
        ELSE 'SYMMETRIC'::"CuttingLengthToleranceMode"
    END,
    CASE WHEN source."tolerancePercent" = 0 THEN 0 ELSE source."tolerancePercent" END,
    CASE WHEN source."tolerancePercent" = 0 THEN 0 ELSE source."tolerancePercent" END,
    source."minLengthM",
    source."maxLengthM",
    1,
    'ACTIVE',
    source."versionNo",
    source.plan_id,
    source."v2CurrentDrumPlanId",
    source."actorId",
    source."actorEmail",
    source."actorRole",
    source."capturedAt",
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT ON (p."inquiryLineId")
        p.id AS plan_id,
        p."planId",
        p."versionNo",
        p."inquiryLineId",
        p."configurationSnapshotId",
        p."nominalLengthM",
        p."tolerancePercent",
        p."minLengthM",
        p."maxLengthM",
        p."actorId",
        p."actorEmail",
        p."actorRole",
        p."capturedAt",
        l."v2CurrentDrumPlanId"
    FROM "V2CuttingLengthPlan" p
    JOIN "CommercialInquiryLine" l ON l.id = p."inquiryLineId"
    ORDER BY
        p."inquiryLineId",
        CASE WHEN p.id = l."v2CurrentCuttingPlanId" THEN 0 ELSE 1 END,
        p."versionNo" DESC
) AS source;

UPDATE "V2CuttingLengthPlan" AS p
SET
    "cuttingLengthRequirementId" = r.id,
    "toleranceMode" = r."toleranceMode",
    "positiveTolerancePercent" = r."positiveTolerancePercent",
    "negativeTolerancePercent" = r."negativeTolerancePercent",
    "requestedDrumCount" = r."requestedDrumCount"
FROM "V2CuttingLengthRequirement" AS r
WHERE r."inquiryLineId" = p."inquiryLineId";

UPDATE "V2DrumPlan" AS d
SET "cuttingLengthRequirementId" = r.id
FROM "V2CuttingLengthRequirement" AS r
WHERE r."inquiryLineId" = d."inquiryLineId";

UPDATE "V2DrumPlanLine" AS l
SET "cuttingLengthRequirementId" = d."cuttingLengthRequirementId"
FROM "V2DrumPlan" AS d
WHERE d.id = l."drumPlanId";

CREATE UNIQUE INDEX "V2CuttingLengthRequirement_requirementId_key" ON "V2CuttingLengthRequirement"("requirementId");
CREATE UNIQUE INDEX "V2CuttingLengthRequirement_inquiryLineId_sequenceNo_key" ON "V2CuttingLengthRequirement"("inquiryLineId", "sequenceNo");
CREATE INDEX "V2CuttingLengthRequirement_inquiryLineId_idx" ON "V2CuttingLengthRequirement"("inquiryLineId");
CREATE INDEX "V2CuttingLengthRequirement_currentCuttingPlanId_idx" ON "V2CuttingLengthRequirement"("currentCuttingPlanId");
CREATE INDEX "V2CuttingLengthRequirement_currentDrumPlanId_idx" ON "V2CuttingLengthRequirement"("currentDrumPlanId");
CREATE INDEX "V2CuttingLengthPlan_cuttingLengthRequirementId_idx" ON "V2CuttingLengthPlan"("cuttingLengthRequirementId");
CREATE INDEX "V2DrumPlan_cuttingLengthRequirementId_idx" ON "V2DrumPlan"("cuttingLengthRequirementId");
CREATE INDEX "V2DrumPlanLine_cuttingLengthRequirementId_idx" ON "V2DrumPlanLine"("cuttingLengthRequirementId");

ALTER TABLE "V2CuttingLengthRequirement"
    ADD CONSTRAINT "V2CuttingLengthRequirement_inquiryLineId_fkey"
    FOREIGN KEY ("inquiryLineId") REFERENCES "CommercialInquiryLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "V2CuttingLengthRequirement"
    ADD CONSTRAINT "V2CuttingLengthRequirement_configurationSnapshotId_fkey"
    FOREIGN KEY ("configurationSnapshotId") REFERENCES "V2ConfigurationSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "V2CuttingLengthPlan"
    ADD CONSTRAINT "V2CuttingLengthPlan_cuttingLengthRequirementId_fkey"
    FOREIGN KEY ("cuttingLengthRequirementId") REFERENCES "V2CuttingLengthRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "V2DrumPlan"
    ADD CONSTRAINT "V2DrumPlan_cuttingLengthRequirementId_fkey"
    FOREIGN KEY ("cuttingLengthRequirementId") REFERENCES "V2CuttingLengthRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "V2DrumPlanLine"
    ADD CONSTRAINT "V2DrumPlanLine_cuttingLengthRequirementId_fkey"
    FOREIGN KEY ("cuttingLengthRequirementId") REFERENCES "V2CuttingLengthRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
