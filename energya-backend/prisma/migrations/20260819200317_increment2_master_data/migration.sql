-- CreateEnum
CREATE TYPE "public"."RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "public"."PriceStatus" AS ENUM ('CONFIGURED', 'PRICE_NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "public"."ParameterKind" AS ENUM ('FAMILY', 'VOLTAGE', 'CONDUCTOR', 'INSULATION', 'SCREEN', 'ARMOUR', 'SHEATH', 'CORE_COLOUR', 'STANDARD');

-- CreateEnum
CREATE TYPE "public"."ImportKind" AS ENUM ('cables', 'boms', 'drums', 'raw_materials');

-- CreateEnum
CREATE TYPE "public"."ImportStatus" AS ENUM ('PREVIEWED', 'COMMITTED', 'REJECTED');

-- CreateTable
CREATE TABLE "public"."CableParameter" (
    "id" TEXT NOT NULL,
    "kind" "public"."ParameterKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "CableParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CableMaster" (
    "id" TEXT NOT NULL,
    "materialNumber" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "elandItemNumber" TEXT,
    "description" TEXT NOT NULL,
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
    "diameter" DECIMAL(65,30) NOT NULL,
    "weight" DECIMAL(65,30) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvalStatus" TEXT NOT NULL DEFAULT 'IMPORTED',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CableMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RawMaterial" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "uom" TEXT NOT NULL,
    "supplier" TEXT,
    "currency" TEXT,
    "priceStatus" "public"."PriceStatus" NOT NULL DEFAULT 'PRICE_NOT_CONFIGURED',
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawMaterial_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "public"."RawMaterialPrice" (
    "id" TEXT NOT NULL,
    "rawMaterialCode" TEXT NOT NULL,
    "price" DECIMAL(65,30),
    "currency" TEXT,
    "priceDate" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawMaterialPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CableBomLine" (
    "id" TEXT NOT NULL,
    "cableMaterialNumber" TEXT NOT NULL,
    "rawMaterialCode" TEXT NOT NULL,
    "itemCode" TEXT,
    "customerCode" TEXT,
    "consumption" DECIMAL(65,30) NOT NULL,
    "uom" TEXT NOT NULL,
    "scrap" DECIMAL(65,30),
    "bomVersion" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CableBomLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DrumMaster" (
    "id" TEXT NOT NULL,
    "drumCode" TEXT NOT NULL,
    "drumType" TEXT,
    "flange" DECIMAL(65,30) NOT NULL,
    "barrel" DECIMAL(65,30) NOT NULL,
    "barrelWidth" DECIMAL(65,30),
    "innerWidth" DECIMAL(65,30) NOT NULL,
    "outerWidth" DECIMAL(65,30) NOT NULL,
    "usableWidth" DECIMAL(65,30),
    "capacity" DECIMAL(65,30) NOT NULL,
    "maxWeight" DECIMAL(65,30),
    "capacityUom" TEXT NOT NULL DEFAULT 'CONFIGURATION_REQUIRED',
    "dimensionUnitNote" TEXT NOT NULL DEFAULT 'SOURCE_UNIT_NOT_IN_FILE',
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceBatch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrumMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DrumCompatibility" (
    "id" TEXT NOT NULL,
    "cableFamily" TEXT,
    "voltage" TEXT,
    "minDiameter" DECIMAL(65,30),
    "maxDiameter" DECIMAL(65,30),
    "maxLength" DECIMAL(65,30),
    "maxWeight" DECIMAL(65,30),
    "customerCode" TEXT,
    "drumCode" TEXT,
    "priority" INTEGER,
    "status" "public"."RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "DrumCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ImportBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "importedBy" TEXT NOT NULL,
    "importedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataType" "public"."ImportKind" NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "warningCount" INTEGER NOT NULL,
    "status" "public"."ImportStatus" NOT NULL,
    "errorsJson" JSONB NOT NULL,
    "warningsJson" JSONB NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ImportBatchRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "field" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "ImportBatchRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "message" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CableParameter_kind_code_key" ON "public"."CableParameter"("kind", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CableMaster_materialNumber_key" ON "public"."CableMaster"("materialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CableBomLine_cableMaterialNumber_rawMaterialCode_bomVersion_key" ON "public"."CableBomLine"("cableMaterialNumber", "rawMaterialCode", "bomVersion");

-- CreateIndex
CREATE UNIQUE INDEX "DrumMaster_drumCode_key" ON "public"."DrumMaster"("drumCode");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_batchNumber_key" ON "public"."ImportBatch"("batchNumber");

-- AddForeignKey
ALTER TABLE "public"."RawMaterialPrice" ADD CONSTRAINT "RawMaterialPrice_rawMaterialCode_fkey" FOREIGN KEY ("rawMaterialCode") REFERENCES "public"."RawMaterial"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CableBomLine" ADD CONSTRAINT "CableBomLine_cableMaterialNumber_fkey" FOREIGN KEY ("cableMaterialNumber") REFERENCES "public"."CableMaster"("materialNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CableBomLine" ADD CONSTRAINT "CableBomLine_rawMaterialCode_fkey" FOREIGN KEY ("rawMaterialCode") REFERENCES "public"."RawMaterial"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ImportBatchRow" ADD CONSTRAINT "ImportBatchRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
