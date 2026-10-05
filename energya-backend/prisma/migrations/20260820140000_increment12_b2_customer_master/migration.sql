-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('EPC_CUSTOMER', 'DISTRIBUTOR', 'UTILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "CustomerAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL DEFAULT 'OTHER',
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
    "defaultIncoterm" TEXT NOT NULL DEFAULT 'FOB',
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "allowedQuotationCurrencies" JSONB NOT NULL DEFAULT '["USD"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUser" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "userAccountId" TEXT NOT NULL,
    "status" "CustomerAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMigrationException" (
    "id" TEXT NOT NULL,
    "sourceEntity" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "legacyCustomerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMigrationException_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CommercialInquiry" ADD COLUMN "customerMasterId" TEXT;

-- AlterTable
ALTER TABLE "CommercialQuotation" ADD COLUMN "customerMasterId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_customerId_userAccountId_key" ON "CustomerUser"("customerId", "userAccountId");

-- CreateIndex
CREATE INDEX "CustomerUser_userAccountId_idx" ON "CustomerUser"("userAccountId");

-- CreateIndex
CREATE INDEX "CustomerUser_status_idx" ON "CustomerUser"("status");

-- CreateIndex
CREATE INDEX "CustomerMigrationException_legacyCustomerId_idx" ON "CustomerMigrationException"("legacyCustomerId");

-- CreateIndex
CREATE INDEX "CustomerMigrationException_sourceEntity_sourceId_idx" ON "CustomerMigrationException"("sourceEntity", "sourceId");

-- CreateIndex
CREATE INDEX "CommercialInquiry_customerMasterId_idx" ON "CommercialInquiry"("customerMasterId");

-- CreateIndex
CREATE INDEX "CommercialQuotation_customerMasterId_idx" ON "CommercialQuotation"("customerMasterId");

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialInquiry" ADD CONSTRAINT "CommercialInquiry_customerMasterId_fkey" FOREIGN KEY ("customerMasterId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialQuotation" ADD CONSTRAINT "CommercialQuotation_customerMasterId_fkey" FOREIGN KEY ("customerMasterId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
