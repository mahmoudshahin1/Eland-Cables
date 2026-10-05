-- CreateEnum
CREATE TYPE "public"."CompatibilityRelation" AS ENUM ('ALLOWED', 'FORBIDDEN');

-- CreateTable
CREATE TABLE "public"."ParameterCompatibility" (
    "id" TEXT NOT NULL,
    "fromKind" "public"."ParameterKind" NOT NULL,
    "fromCode" TEXT NOT NULL,
    "toKind" "public"."ParameterKind" NOT NULL,
    "toCode" TEXT NOT NULL,
    "relation" "public"."CompatibilityRelation" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'parameter_master_applicable_families',

    CONSTRAINT "ParameterCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TechnicalOfficeRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "canonicalStatus" TEXT NOT NULL,
    "displayStatus" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "customer" TEXT,
    "quantity" TEXT,
    "cuttingLength" TEXT,
    "requestedDate" TEXT,
    "requesterId" TEXT,
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TechnicalOfficeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ParamCompat_pair_rel_key" ON "public"."ParameterCompatibility"("fromKind", "fromCode", "toKind", "toCode", "relation");

-- CreateIndex
CREATE UNIQUE INDEX "TechnicalOfficeRequest_requestNumber_key" ON "public"."TechnicalOfficeRequest"("requestNumber");
