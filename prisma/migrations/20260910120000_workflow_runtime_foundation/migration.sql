-- Task 05I-B — workflow runtime foundation

CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "WorkflowAssignmentType" AS ENUM ('USER', 'ROLE', 'GROUP');
CREATE TYPE "WorkflowEventType" AS ENUM (
  'INSTANCE_STARTED',
  'STEP_ENTERED',
  'STEP_EXITED',
  'TASK_CREATED',
  'TASK_ASSIGNED',
  'TASK_COMPLETED',
  'TRANSITION',
  'INSTANCE_COMPLETED',
  'INSTANCE_CANCELLED'
);

CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inquiryProcessCode" "InquiryProcessCode",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stepCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "allowCustomerAction" BOOLEAN NOT NULL DEFAULT false,
    "requiredPermission" TEXT,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "transitionCode" TEXT NOT NULL,
    "fromStepCode" TEXT NOT NULL,
    "toStepCode" TEXT NOT NULL,
    "label" TEXT,
    "conditionJson" JSONB,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowInstance" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "currentStepCode" TEXT NOT NULL,
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "contextJson" JSONB,
    "customerMasterId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "startedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowTask" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "stepCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "resultJson" JSONB,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "assignmentType" "WorkflowAssignmentType" NOT NULL,
    "assigneeRef" TEXT NOT NULL,

    CONSTRAINT "WorkflowAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkflowEvent" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "eventType" "WorkflowEventType" NOT NULL,
    "fromStepCode" TEXT,
    "toStepCode" TEXT,
    "taskId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowTemplate_code_version_key" ON "WorkflowTemplate"("code", "version");
CREATE INDEX "WorkflowTemplate_code_idx" ON "WorkflowTemplate"("code");

CREATE UNIQUE INDEX "WorkflowStep_templateId_stepCode_key" ON "WorkflowStep"("templateId", "stepCode");
CREATE INDEX "WorkflowStep_templateId_idx" ON "WorkflowStep"("templateId");

CREATE UNIQUE INDEX "WorkflowTransition_templateId_transitionCode_key" ON "WorkflowTransition"("templateId", "transitionCode");
CREATE INDEX "WorkflowTransition_templateId_fromStepCode_idx" ON "WorkflowTransition"("templateId", "fromStepCode");

CREATE INDEX "WorkflowInstance_entityType_entityId_idx" ON "WorkflowInstance"("entityType", "entityId");
CREATE INDEX "WorkflowInstance_status_idx" ON "WorkflowInstance"("status");
CREATE INDEX "WorkflowInstance_customerMasterId_idx" ON "WorkflowInstance"("customerMasterId");
CREATE INDEX "WorkflowInstance_templateCode_templateVersion_idx" ON "WorkflowInstance"("templateCode", "templateVersion");

CREATE UNIQUE INDEX "WorkflowInstance_active_entity_unique"
  ON "WorkflowInstance"("entityType", "entityId")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "WorkflowTask_instanceId_idx" ON "WorkflowTask"("instanceId");
CREATE INDEX "WorkflowTask_status_idx" ON "WorkflowTask"("status");
CREATE INDEX "WorkflowTask_stepCode_idx" ON "WorkflowTask"("stepCode");

CREATE INDEX "WorkflowAssignment_taskId_idx" ON "WorkflowAssignment"("taskId");
CREATE INDEX "WorkflowAssignment_assigneeRef_idx" ON "WorkflowAssignment"("assigneeRef");

CREATE INDEX "WorkflowEvent_instanceId_idx" ON "WorkflowEvent"("instanceId");
CREATE INDEX "WorkflowEvent_createdAt_idx" ON "WorkflowEvent"("createdAt");

ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowAssignment" ADD CONSTRAINT "WorkflowAssignment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "WorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_instanceId_fkey"
  FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed STANDARD_INQUIRY_V1 template (version 1)
INSERT INTO "WorkflowTemplate" ("id", "code", "version", "name", "description", "inquiryProcessCode", "isActive", "createdAt", "updatedAt")
VALUES (
  'wf_tpl_standard_inquiry_v1',
  'STANDARD_INQUIRY_V1',
  1,
  'Standard Inquiry Workflow v1',
  'Submit → Technical Review → (clarification loop) → Technical Complete → Container Study → Costing → Sales → Quotation → Commitment → Fulfillment',
  'STANDARD_WORKFLOW',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT INTO "WorkflowStep" ("id", "templateId", "stepCode", "name", "sortOrder", "isTerminal", "allowCustomerAction", "requiredPermission") VALUES
  ('wf_step_submitted', 'wf_tpl_standard_inquiry_v1', 'SUBMITTED', 'Submitted', 10, false, false, NULL),
  ('wf_step_technical_review', 'wf_tpl_standard_inquiry_v1', 'TECHNICAL_REVIEW', 'Technical Review', 20, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_needs_information', 'wf_tpl_standard_inquiry_v1', 'NEEDS_INFORMATION', 'Needs Information', 30, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_customer_clarification', 'wf_tpl_standard_inquiry_v1', 'CUSTOMER_CLARIFICATION', 'Customer Clarification', 40, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_customer_response', 'wf_tpl_standard_inquiry_v1', 'CUSTOMER_RESPONSE', 'Customer Response', 50, false, true, 'WORKFLOW:WORKFLOW:COMPLETE'),
  ('wf_step_technical_complete', 'wf_tpl_standard_inquiry_v1', 'TECHNICAL_COMPLETE', 'Technical Complete', 60, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_container_study', 'wf_tpl_standard_inquiry_v1', 'CONTAINER_STUDY', 'Container Study', 70, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_costing', 'wf_tpl_standard_inquiry_v1', 'COSTING', 'Costing', 80, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_sales_review', 'wf_tpl_standard_inquiry_v1', 'SALES_REVIEW', 'Sales Review', 90, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_quotation_approval', 'wf_tpl_standard_inquiry_v1', 'QUOTATION_APPROVAL', 'Quotation Approval', 100, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_quotation_issue', 'wf_tpl_standard_inquiry_v1', 'QUOTATION_ISSUE', 'Quotation Issue', 110, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_customer_decision', 'wf_tpl_standard_inquiry_v1', 'CUSTOMER_DECISION', 'Customer Decision', 120, false, true, 'WORKFLOW:WORKFLOW:COMPLETE'),
  ('wf_step_commercial_commitment', 'wf_tpl_standard_inquiry_v1', 'COMMERCIAL_COMMITMENT', 'Commercial Commitment', 130, false, false, 'WORKFLOW:WORKFLOW:TRANSITION'),
  ('wf_step_fulfillment', 'wf_tpl_standard_inquiry_v1', 'FULFILLMENT', 'Fulfillment', 140, true, false, NULL);

INSERT INTO "WorkflowTransition" ("id", "templateId", "transitionCode", "fromStepCode", "toStepCode", "label", "conditionJson") VALUES
  ('wf_tr_start', 'wf_tpl_standard_inquiry_v1', 'START', 'SUBMITTED', 'TECHNICAL_REVIEW', 'Begin technical review', '{"type":"inquiryProcessCode","value":"STANDARD_WORKFLOW"}'),
  ('wf_tr_req_info', 'wf_tpl_standard_inquiry_v1', 'REQUEST_INFORMATION', 'TECHNICAL_REVIEW', 'NEEDS_INFORMATION', 'Request more information', NULL),
  ('wf_tr_tech_complete', 'wf_tpl_standard_inquiry_v1', 'TECHNICAL_COMPLETE', 'TECHNICAL_REVIEW', 'TECHNICAL_COMPLETE', 'Complete technical review', '{"type":"taskResult","value":"APPROVED"}'),
  ('wf_tr_to_clarification', 'wf_tpl_standard_inquiry_v1', 'TO_CLARIFICATION', 'NEEDS_INFORMATION', 'CUSTOMER_CLARIFICATION', 'Send clarification request', NULL),
  ('wf_tr_await_response', 'wf_tpl_standard_inquiry_v1', 'AWAIT_RESPONSE', 'CUSTOMER_CLARIFICATION', 'CUSTOMER_RESPONSE', 'Await customer response', NULL),
  ('wf_tr_customer_responded', 'wf_tpl_standard_inquiry_v1', 'CUSTOMER_RESPONDED', 'CUSTOMER_RESPONSE', 'TECHNICAL_REVIEW', 'Customer responded', '{"type":"taskResult","value":"RESPONDED"}'),
  ('wf_tr_to_container', 'wf_tpl_standard_inquiry_v1', 'TO_CONTAINER_STUDY', 'TECHNICAL_COMPLETE', 'CONTAINER_STUDY', 'Begin container study', NULL),
  ('wf_tr_to_costing', 'wf_tpl_standard_inquiry_v1', 'TO_COSTING', 'CONTAINER_STUDY', 'COSTING', 'Begin costing', NULL),
  ('wf_tr_to_sales', 'wf_tpl_standard_inquiry_v1', 'TO_SALES_REVIEW', 'COSTING', 'SALES_REVIEW', 'Begin sales review', NULL),
  ('wf_tr_to_quotation_approval', 'wf_tpl_standard_inquiry_v1', 'TO_QUOTATION_APPROVAL', 'SALES_REVIEW', 'QUOTATION_APPROVAL', 'Submit for quotation approval', NULL),
  ('wf_tr_to_quotation_issue', 'wf_tpl_standard_inquiry_v1', 'TO_QUOTATION_ISSUE', 'QUOTATION_APPROVAL', 'QUOTATION_ISSUE', 'Approve for issue', '{"type":"taskResult","value":"APPROVED"}'),
  ('wf_tr_to_customer_decision', 'wf_tpl_standard_inquiry_v1', 'TO_CUSTOMER_DECISION', 'QUOTATION_ISSUE', 'CUSTOMER_DECISION', 'Issue quotation to customer', NULL),
  ('wf_tr_to_commitment', 'wf_tpl_standard_inquiry_v1', 'TO_COMMITMENT', 'CUSTOMER_DECISION', 'COMMERCIAL_COMMITMENT', 'Customer accepted', '{"type":"taskResult","value":"ACCEPTED"}'),
  ('wf_tr_to_fulfillment', 'wf_tpl_standard_inquiry_v1', 'TO_FULFILLMENT', 'COMMERCIAL_COMMITMENT', 'FULFILLMENT', 'Begin fulfillment', NULL),
  ('wf_tr_complete', 'wf_tpl_standard_inquiry_v1', 'COMPLETE', 'FULFILLMENT', 'FULFILLMENT', 'Complete workflow', '{"type":"terminal","value":true}');
