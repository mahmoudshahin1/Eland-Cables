-- Task 05I-A — inquiry process foundation

CREATE TYPE "InquiryProcessCode" AS ENUM ('VIP_FAST_TRACK', 'STANDARD_WORKFLOW');
CREATE TYPE "InquiryProcessSource" AS ENUM ('CUSTOMER_OVERRIDE', 'CUSTOMER_GROUP', 'SYSTEM_DEFAULT');

CREATE TABLE "CustomerGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultInquiryProcessCode" "InquiryProcessCode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerGroup_code_key" ON "CustomerGroup"("code");

ALTER TABLE "Customer" ADD COLUMN "defaultInquiryProcessCode" "InquiryProcessCode",
ADD COLUMN "customerGroupId" TEXT;

CREATE INDEX "Customer_customerGroupId_idx" ON "Customer"("customerGroupId");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "CustomerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
