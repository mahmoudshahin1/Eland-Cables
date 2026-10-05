-- STANDARD_WORKFLOW quotation V2: process resolution, stage timing, email queue, in-app notifications, customer decision.

ALTER TYPE "InquiryProcessSource" ADD VALUE IF NOT EXISTS 'CUSTOMER_CLASSIFICATION';
ALTER TYPE "InquiryProcessSource" ADD VALUE IF NOT EXISTS 'CUSTOMER_SEGMENT';

ALTER TABLE "CustomerClassification" ADD COLUMN IF NOT EXISTS "defaultInquiryProcessCode" "InquiryProcessCode";
ALTER TABLE "CustomerSegment" ADD COLUMN IF NOT EXISTS "defaultInquiryProcessCode" "InquiryProcessCode";

ALTER TABLE "CommercialQuotation" ADD COLUMN IF NOT EXISTS "customerDecision" TEXT;
ALTER TABLE "CommercialQuotation" ADD COLUMN IF NOT EXISTS "customerDecisionReason" TEXT;
ALTER TABLE "CommercialQuotation" ADD COLUMN IF NOT EXISTS "customerDecisionAt" TIMESTAMP(3);
ALTER TABLE "CommercialQuotation" ADD COLUMN IF NOT EXISTS "customerDecisionBy" TEXT;
ALTER TABLE "CommercialQuotation" ADD COLUMN IF NOT EXISTS "quotationReturnedAt" TIMESTAMP(3);
ALTER TABLE "CommercialQuotation" ADD COLUMN IF NOT EXISTS "quotationReturnedBy" TEXT;
ALTER TABLE "CommercialQuotation" ADD COLUMN IF NOT EXISTS "quotationReturnReason" TEXT;

CREATE TABLE IF NOT EXISTS "WorkflowStageTiming" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepCode" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "owner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStageTiming_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkflowStageTiming_instanceId_idx" ON "WorkflowStageTiming"("instanceId");
CREATE INDEX IF NOT EXISTS "WorkflowStageTiming_instanceId_stepCode_idx" ON "WorkflowStageTiming"("instanceId", "stepCode");

ALTER TABLE "WorkflowStageTiming" DROP CONSTRAINT IF EXISTS "WorkflowStageTiming_instanceId_fkey";
ALTER TABLE "WorkflowStageTiming"
  ADD CONSTRAINT "WorkflowStageTiming_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$ BEGIN
  CREATE TYPE "EmailOutboxStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EmailOutbox" (
    "id" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "eventCode" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerConfigured" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailOutbox_status_idx" ON "EmailOutbox"("status");
CREATE INDEX IF NOT EXISTS "EmailOutbox_eventCode_idx" ON "EmailOutbox"("eventCode");
CREATE INDEX IF NOT EXISTS "EmailOutbox_entityType_entityId_idx" ON "EmailOutbox"("entityType", "entityId");

CREATE TABLE IF NOT EXISTS "UserNotification" (
    "id" TEXT NOT NULL,
    "userAccountId" TEXT,
    "roleCode" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "eventCode" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserNotification_userAccountId_readAt_idx" ON "UserNotification"("userAccountId", "readAt");
CREATE INDEX IF NOT EXISTS "UserNotification_roleCode_idx" ON "UserNotification"("roleCode");
CREATE INDEX IF NOT EXISTS "UserNotification_createdAt_idx" ON "UserNotification"("createdAt");

ALTER TABLE "UserNotification" DROP CONSTRAINT IF EXISTS "UserNotification_userAccountId_fkey";
ALTER TABLE "UserNotification"
  ADD CONSTRAINT "UserNotification_userAccountId_fkey"
  FOREIGN KEY ("userAccountId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Additive return path for internal quotation review.
INSERT INTO "WorkflowTransition" ("id", "templateId", "transitionCode", "fromStepCode", "toStepCode", "label", "conditionJson")
SELECT 'wf_tr_return_to_sales', 'wf_tpl_standard_inquiry_v1', 'RETURN_TO_SALES', 'QUOTATION_APPROVAL', 'SALES_REVIEW', 'Return quotation for revision', '{"type":"taskResult","value":"RETURNED"}'
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkflowTransition" WHERE "id" = 'wf_tr_return_to_sales'
);

INSERT INTO "WorkflowTransition" ("id", "templateId", "transitionCode", "fromStepCode", "toStepCode", "label", "conditionJson")
SELECT 'wf_tr_return_from_issue', 'wf_tpl_standard_inquiry_v1', 'RETURN_FROM_ISSUE', 'QUOTATION_ISSUE', 'SALES_REVIEW', 'Return issued-ready quotation for revision', '{"type":"taskResult","value":"RETURNED"}'
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkflowTransition" WHERE "id" = 'wf_tr_return_from_issue'
);
