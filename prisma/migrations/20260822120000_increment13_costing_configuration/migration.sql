-- Increment 13 Phase B — Costing configuration & formula engine schema

-- CreateEnum
CREATE TYPE "CostingConfigStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'SUPERSEDED');
CREATE TYPE "CostingVariableKind" AS ENUM ('INPUT', 'OUTPUT', 'INTERMEDIATE', 'CONSTANT', 'REFERENCE');
CREATE TYPE "CostingComponentKind" AS ENUM ('MATERIAL', 'SCRAP', 'PROCESS', 'EX_WORK', 'SHIPPING', 'OVERHEAD', 'DRUM', 'OTHER');

-- AlterTable
ALTER TABLE "CostingRun" ADD COLUMN "configurationVersionId" TEXT;

-- CreateTable
CREATE TABLE "CostingConfiguration" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CostingConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostingConfigurationVersion" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "status" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "changeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "supersededById" TEXT,

    CONSTRAINT "CostingConfigurationVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostingVariable" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "CostingVariableKind" NOT NULL,
    "dataType" TEXT NOT NULL DEFAULT 'DECIMAL',
    "unit" TEXT,
    "sourceModule" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "defaultValue" DECIMAL(65,30),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CostingVariable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostingComponent" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "CostingComponentKind" NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isConfigurable" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CostingComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostingFormula" (
    "id" TEXT NOT NULL,
    "configurationVersionId" TEXT NOT NULL,
    "componentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "outputVariableCode" TEXT NOT NULL,
    "status" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "CostingFormula_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostingFormulaVersion" (
    "id" TEXT NOT NULL,
    "formulaId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "expression" TEXT NOT NULL,
    "status" "CostingConfigStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "changeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "CostingFormulaVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostingFormulaDependency" (
    "id" TEXT NOT NULL,
    "formulaVersionId" TEXT NOT NULL,
    "variableCode" TEXT NOT NULL,
    "dependencyType" TEXT NOT NULL DEFAULT 'VARIABLE',

    CONSTRAINT "CostingFormulaDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostingCalculation" (
    "id" TEXT NOT NULL,
    "calculationNumber" TEXT NOT NULL,
    "configurationVersionId" TEXT,
    "inquiryLineId" TEXT,
    "materialNumber" TEXT,
    "costingDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "inputSnapshot" JSONB,
    "referenceSnapshot" JSONB,
    "outputSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CostingCalculation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostingCalculationSnapshot" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "formulaTrace" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostingCalculationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CostingConfiguration_code_key" ON "CostingConfiguration"("code");
CREATE INDEX "CostingConfiguration_status_idx" ON "CostingConfiguration"("status");

CREATE UNIQUE INDEX "CostingConfigurationVersion_configurationId_versionNo_key" ON "CostingConfigurationVersion"("configurationId", "versionNo");
CREATE INDEX "CostingConfigurationVersion_configurationId_isCurrent_idx" ON "CostingConfigurationVersion"("configurationId", "isCurrent");
CREATE INDEX "CostingConfigurationVersion_status_idx" ON "CostingConfigurationVersion"("status");
CREATE INDEX "CostingConfigurationVersion_effectiveFrom_effectiveTo_idx" ON "CostingConfigurationVersion"("effectiveFrom", "effectiveTo");

CREATE UNIQUE INDEX "CostingVariable_code_key" ON "CostingVariable"("code");
CREATE INDEX "CostingVariable_kind_idx" ON "CostingVariable"("kind");
CREATE INDEX "CostingVariable_status_idx" ON "CostingVariable"("status");

CREATE UNIQUE INDEX "CostingComponent_code_key" ON "CostingComponent"("code");
CREATE INDEX "CostingComponent_kind_idx" ON "CostingComponent"("kind");
CREATE INDEX "CostingComponent_status_idx" ON "CostingComponent"("status");

CREATE UNIQUE INDEX "CostingFormula_configurationVersionId_code_key" ON "CostingFormula"("configurationVersionId", "code");
CREATE INDEX "CostingFormula_configurationVersionId_idx" ON "CostingFormula"("configurationVersionId");
CREATE INDEX "CostingFormula_outputVariableCode_idx" ON "CostingFormula"("outputVariableCode");
CREATE INDEX "CostingFormula_status_idx" ON "CostingFormula"("status");

CREATE UNIQUE INDEX "CostingFormulaVersion_formulaId_versionNo_key" ON "CostingFormulaVersion"("formulaId", "versionNo");
CREATE INDEX "CostingFormulaVersion_formulaId_idx" ON "CostingFormulaVersion"("formulaId");
CREATE INDEX "CostingFormulaVersion_status_idx" ON "CostingFormulaVersion"("status");

CREATE UNIQUE INDEX "CostingFormulaDependency_formulaVersionId_variableCode_key" ON "CostingFormulaDependency"("formulaVersionId", "variableCode");
CREATE INDEX "CostingFormulaDependency_formulaVersionId_idx" ON "CostingFormulaDependency"("formulaVersionId");
CREATE INDEX "CostingFormulaDependency_variableCode_idx" ON "CostingFormulaDependency"("variableCode");

CREATE UNIQUE INDEX "CostingCalculation_calculationNumber_key" ON "CostingCalculation"("calculationNumber");
CREATE INDEX "CostingCalculation_configurationVersionId_idx" ON "CostingCalculation"("configurationVersionId");
CREATE INDEX "CostingCalculation_inquiryLineId_idx" ON "CostingCalculation"("inquiryLineId");
CREATE INDEX "CostingCalculation_materialNumber_idx" ON "CostingCalculation"("materialNumber");
CREATE INDEX "CostingCalculation_status_idx" ON "CostingCalculation"("status");

CREATE INDEX "CostingCalculationSnapshot_calculationId_idx" ON "CostingCalculationSnapshot"("calculationId");
CREATE INDEX "CostingCalculationSnapshot_snapshotType_idx" ON "CostingCalculationSnapshot"("snapshotType");

CREATE INDEX "CostingRun_configurationVersionId_idx" ON "CostingRun"("configurationVersionId");

-- AddForeignKey
ALTER TABLE "CostingRun" ADD CONSTRAINT "CostingRun_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "CostingConfigurationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CostingConfigurationVersion" ADD CONSTRAINT "CostingConfigurationVersion_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "CostingConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CostingFormula" ADD CONSTRAINT "CostingFormula_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "CostingConfigurationVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CostingFormula" ADD CONSTRAINT "CostingFormula_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "CostingComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CostingFormulaVersion" ADD CONSTRAINT "CostingFormulaVersion_formulaId_fkey" FOREIGN KEY ("formulaId") REFERENCES "CostingFormula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CostingFormulaDependency" ADD CONSTRAINT "CostingFormulaDependency_formulaVersionId_fkey" FOREIGN KEY ("formulaVersionId") REFERENCES "CostingFormulaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CostingFormulaDependency" ADD CONSTRAINT "CostingFormulaDependency_variableCode_fkey" FOREIGN KEY ("variableCode") REFERENCES "CostingVariable"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CostingCalculation" ADD CONSTRAINT "CostingCalculation_configurationVersionId_fkey" FOREIGN KEY ("configurationVersionId") REFERENCES "CostingConfigurationVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CostingCalculationSnapshot" ADD CONSTRAINT "CostingCalculationSnapshot_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "CostingCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
