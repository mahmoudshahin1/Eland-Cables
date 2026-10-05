-- Optional case type on existing CRM-lite cases + customer support chat.

CREATE TYPE "CustomerServiceCaseType" AS ENUM ('COMPLAINT', 'TECHNICAL_SUPPORT', 'GENERAL_SUPPORT', 'INFORMATION_REQUEST');
CREATE TYPE "SupportChatChannel" AS ENUM ('AI_ASSISTANT', 'ENGINEER');
CREATE TYPE "SupportChatEngineerStatus" AS ENUM ('AVAILABLE', 'WAITING', 'ASSIGNED');
CREATE TYPE "SupportChatRole" AS ENUM ('CUSTOMER', 'ASSISTANT', 'SYSTEM');

ALTER TABLE "CustomerServiceCase" ADD COLUMN "caseType" "CustomerServiceCaseType";

CREATE TABLE "SupportChatSession" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "SupportChatChannel" NOT NULL,
    "engineerStatus" "SupportChatEngineerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "caseId" TEXT,
    "inquiryId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportChatSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "SupportChatRole" NOT NULL,
    "visibility" "CaseCommentVisibility" NOT NULL DEFAULT 'CUSTOMER',
    "body" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportChatSession_customerId_channel_key" ON "SupportChatSession"("customerId", "channel");
CREATE INDEX "SupportChatSession_customerId_channel_idx" ON "SupportChatSession"("customerId", "channel");
CREATE INDEX "SupportChatSession_caseId_idx" ON "SupportChatSession"("caseId");
CREATE INDEX "SupportChatSession_inquiryId_idx" ON "SupportChatSession"("inquiryId");
CREATE INDEX "SupportChatMessage_sessionId_createdAt_idx" ON "SupportChatMessage"("sessionId", "createdAt");
CREATE INDEX "SupportChatMessage_sessionId_visibility_idx" ON "SupportChatMessage"("sessionId", "visibility");

ALTER TABLE "SupportChatSession" ADD CONSTRAINT "SupportChatSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportChatSession" ADD CONSTRAINT "SupportChatSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CustomerServiceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportChatSession" ADD CONSTRAINT "SupportChatSession_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "CommercialInquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SupportChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
