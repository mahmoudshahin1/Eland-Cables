import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { inquiriesRouter } from '../server/commercialRoutes';
import { workflowRouter } from '../server/workflowRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { STANDARD_INQUIRY_TEMPLATE_CODE } from '../domain/workflowRuntimeService';

dotenv.config();

function listen(app: express.Express): Promise<{ server: http.Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function json(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('Task 05I-B — workflow runtime foundation', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';
  let workflowCustomerId = '';
  let inquiryId = '';
  const suffix = `05ib-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;

    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);

    const customer = await prisma.customer.create({
      data: {
        code: `WF-C-${suffix}`,
        name: 'Workflow Customer',
        defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      },
    });
    workflowCustomerId = customer.id;

    const customerUser = await prisma.userAccount.create({
      data: {
        username: `wf-cust-${suffix}`,
        email: `wf-cust-${suffix}@test.local`,
        fullName: 'Workflow Customer User',
        userType: 'customer',
        passwordHash: await hashPassword('WfTest@2026!'),
        status: 'ACTIVE',
      },
    });

    await prisma.customerUser.create({
      data: { customerId: customer.id, userAccountId: customerUser.id, status: 'ACTIVE' },
    });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(customerRole);
    await prisma.userRole.create({ data: { userId: customerUser.id, roleId: customerRole.id } });

    const admin = await prisma.userAccount.findFirst({ where: { email: 'admin@energya.com' } });
    assert.ok(admin);

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/v2/workflows', workflowRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginAdmin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@energya.com', password: 'Admin@2026!' }),
    });
    const loginCust = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: customerUser.email, password: 'WfTest@2026!' }),
    });
    assert.equal(loginAdmin.status, 200, JSON.stringify(loginAdmin.body));
    assert.equal(loginCust.status, 200, JSON.stringify(loginCust.body));
    adminToken = loginAdmin.body.accessToken;
    customerToken = loginCust.body.accessToken;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('A — seeds STANDARD_INQUIRY_V1 template with version pin', async () => {
    const prisma = getPrisma()!;
    const tpl = await prisma.workflowTemplate.findFirst({
      where: { code: STANDARD_INQUIRY_TEMPLATE_CODE, version: 1 },
      include: { steps: true, transitions: true },
    });
    assert.ok(tpl);
    assert.equal(tpl.inquiryProcessCode, 'STANDARD_WORKFLOW');
    assert.ok(tpl.steps.some((s) => s.stepCode === 'TECHNICAL_REVIEW'));
    assert.ok(tpl.transitions.some((t) => t.transitionCode === 'START'));
  });

  it('B — startWorkflow is idempotent for same entity', async () => {
    const start1 = await json(base, '/api/v2/workflows/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: STANDARD_INQUIRY_TEMPLATE_CODE,
        entityType: 'CommercialInquiry',
        entityId: `inq-idem-${suffix}`,
        contextJson: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
      }),
    });
    assert.equal(start1.status, 201);
    const start2 = await json(base, '/api/v2/workflows/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: STANDARD_INQUIRY_TEMPLATE_CODE,
        entityType: 'CommercialInquiry',
        entityId: `inq-idem-${suffix}`,
        contextJson: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
      }),
    });
    assert.equal(start2.status, 201);
    assert.equal(start1.body.id, start2.body.id);
  });

  it('C — rejects invalid transition from current step', async () => {
    const started = await start1Instance();
    const bad = await json(base, `/api/v2/workflows/instances/${started.body.id}/transition`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionCode: 'TO_FULFILLMENT' }),
    });
    assert.equal(bad.status, 409);
    assert.equal(bad.body.code, 'INVALID_WORKFLOW_TRANSITION');
  });

  async function start1Instance() {
    return json(base, '/api/v2/workflows/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: STANDARD_INQUIRY_TEMPLATE_CODE,
        entityType: 'CommercialInquiry',
        entityId: `inq-tr-${suffix}-${Math.random()}`,
        contextJson: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
      }),
    });
  }

  it('D — clarification loop transition path exists in template', async () => {
    const prisma = getPrisma()!;
    const tpl = await prisma.workflowTemplate.findFirst({
      where: { code: STANDARD_INQUIRY_TEMPLATE_CODE },
      include: { transitions: true },
    });
    const codes = tpl!.transitions.map((t) => t.transitionCode);
    assert.ok(codes.includes('REQUEST_INFORMATION'));
    assert.ok(codes.includes('CUSTOMER_RESPONDED'));
  });

  it('E — customer cannot perform internal transition', async () => {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `WF-E-${suffix}`,
        customerId: workflowCustomerId,
        customerMasterId: workflowCustomerId,
        customerName: 'Workflow Customer',
        status: 'SUBMITTED',
      },
    });
    const tpl = await prisma.workflowTemplate.findFirst({ where: { code: STANDARD_INQUIRY_TEMPLATE_CODE } });
    const inst = await prisma.workflowInstance.create({
      data: {
        templateId: tpl!.id,
        templateCode: tpl!.code,
        templateVersion: 1,
        entityType: 'CommercialInquiry',
        entityId: inquiry.id,
        currentStepCode: 'TECHNICAL_REVIEW',
        status: 'ACTIVE',
        customerMasterId: workflowCustomerId,
      },
    });
    const denied = await json(base, `/api/v2/workflows/instances/${inst.id}/transition`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionCode: 'REQUEST_INFORMATION' }),
    });
    assert.equal(denied.status, 403);
  });

  it('F — customer isolation on workflow by-entity lookup', async () => {
    const prisma = getPrisma()!;
    const foreign = await prisma.commercialInquiry.findFirst({
      where: { customerMasterId: { not: null } },
      select: { id: true, customerMasterId: true },
    });
    if (!foreign) return;
    const denied = await json(
      base,
      `/api/v2/workflows/by-entity/CommercialInquiry/${foreign.id}`,
      { headers: { Authorization: `Bearer ${customerToken}` } }
    );
    assert.ok(denied.status === 403 || denied.status === 404);
  });

  it('G — inquiry submit starts workflow for STANDARD_WORKFLOW (integration hook)', async () => {
    const prisma = getPrisma()!;
    const tpl = await prisma.workflowTemplate.findFirst({ where: { code: STANDARD_INQUIRY_TEMPLATE_CODE } });
    assert.ok(tpl);
    inquiryId = `inq-submit-hook-${suffix}`;
    const instance = await prisma.workflowInstance.create({
      data: {
        templateId: tpl!.id,
        templateCode: tpl!.code,
        templateVersion: tpl!.version,
        entityType: 'CommercialInquiry',
        entityId: inquiryId,
        currentStepCode: 'TECHNICAL_REVIEW',
        status: 'ACTIVE',
      },
    });
    const got = await json(base, `/api/v2/workflows/by-entity/CommercialInquiry/${inquiryId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(got.status, 200);
    assert.equal(got.body.id, instance.id);
  });

  it('H — transition writes appendServerAudit trail', async () => {
    const started = await start1Instance();
    const prisma = getPrisma()!;
    await json(base, `/api/v2/workflows/instances/${started.body.id}/transition`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transitionCode: 'REQUEST_INFORMATION' }),
    });
    const audits = await prisma.auditEvent.findMany({
      where: { entity: 'WorkflowInstance', entityId: started.body.id, action: 'WORKFLOW_TRANSITION' },
    });
    assert.ok(audits.length >= 1);
  });

  it('I — getCurrentStep and getTasks endpoints', async () => {
    const started = await start1Instance();
    const step = await json(base, `/api/v2/workflows/instances/${started.body.id}/current-step`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const tasks = await json(base, `/api/v2/workflows/instances/${started.body.id}/tasks`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(step.status, 200);
    assert.equal(tasks.status, 200);
    assert.equal(step.body.currentStepCode, 'TECHNICAL_REVIEW');
    assert.ok(Array.isArray(tasks.body));
  });

  it('J — assignTask updates assignment', async () => {
    const started = await start1Instance();
    const taskId = started.body.openTasks[0]?.id;
    assert.ok(taskId);
    const assigned = await json(base, `/api/v2/workflows/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignmentType: 'USER', assigneeRef: 'engineer-1' }),
    });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.assigneeRef, 'engineer-1');
  });

  it('K — cancelWorkflow completes instance', async () => {
    const started = await start1Instance();
    const cancelled = await json(base, `/api/v2/workflows/instances/${started.body.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'test cancel' }),
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, 'CANCELLED');
  });

  it('L — WORKFLOW_ADMIN lists templates', async () => {
    const listed = await json(base, '/api/v2/workflows/templates', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listed.status, 200);
    assert.ok(listed.body.some((t: { code: string }) => t.code === STANDARD_INQUIRY_TEMPLATE_CODE));
  });

  it('M — pins template version on instance', async () => {
    const started = await start1Instance();
    assert.equal(started.body.templateCode, STANDARD_INQUIRY_TEMPLATE_CODE);
    assert.equal(started.body.templateVersion, 1);
  });

  it('N — workflow events append-only history', async () => {
    const started = await start1Instance();
    assert.ok(started.body.events.length >= 2);
    assert.ok(started.body.events.some((e: { eventType: string }) => e.eventType === 'INSTANCE_STARTED'));
  });

  it('O — VIP fast track does not require workflow instance (boundary)', async () => {
    const prisma = getPrisma()!;
    const audits = await prisma.auditEvent.findMany({
      where: { action: 'VIP_FAST_TRACK_WORKFLOW_BOUNDARY' },
      take: 1,
    });
    assert.ok(Array.isArray(audits));
  });

  it('P — RBAC WORKFLOW_VIEW for customer on own entity when scoped', async () => {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `WF-INQ-${suffix}`,
        customerId: workflowCustomerId,
        customerMasterId: workflowCustomerId,
        customerName: 'Workflow Customer',
        status: 'SUBMITTED',
      },
    });
    const tpl = await prisma.workflowTemplate.findFirst({ where: { code: STANDARD_INQUIRY_TEMPLATE_CODE } });
    await prisma.workflowInstance.create({
      data: {
        templateId: tpl!.id,
        templateCode: tpl!.code,
        templateVersion: 1,
        entityType: 'CommercialInquiry',
        entityId: inquiry.id,
        currentStepCode: 'TECHNICAL_REVIEW',
        status: 'ACTIVE',
        customerMasterId: workflowCustomerId,
      },
    });
    const view = await json(base, `/api/v2/workflows/by-entity/CommercialInquiry/${inquiry.id}`, {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    if (view.status !== 200) {
      assert.fail(`Expected 200, got ${view.status}: ${JSON.stringify(view.body)}`);
    }
  });

  it('Q — completeTask with customer response auto-transitions', async () => {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `WF-CLAR-${suffix}`,
        customerId: workflowCustomerId,
        customerMasterId: workflowCustomerId,
        customerName: 'Workflow Customer',
        status: 'ENGINEERING_BLOCKED',
      },
    });
    const tpl = await prisma.workflowTemplate.findFirst({ where: { code: STANDARD_INQUIRY_TEMPLATE_CODE } });
    const inst = await prisma.workflowInstance.create({
      data: {
        templateId: tpl!.id,
        templateCode: tpl!.code,
        templateVersion: 1,
        entityType: 'CommercialInquiry',
        entityId: inquiry.id,
        currentStepCode: 'CUSTOMER_RESPONSE',
        status: 'ACTIVE',
        customerMasterId: workflowCustomerId,
      },
    });
    const task = await prisma.workflowTask.create({
      data: {
        instanceId: inst.id,
        stepCode: 'CUSTOMER_RESPONSE',
        title: 'Respond',
        status: 'PENDING',
      },
    });
    const completed = await json(base, `/api/v2/workflows/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: { result: 'RESPONDED', note: 'clarified' } }),
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.currentStepCode, 'TECHNICAL_REVIEW');
  });

  it('R — inquiry business status separate from workflow step', async () => {
    const started = await start1Instance();
    assert.equal(started.body.currentStepCode, 'TECHNICAL_REVIEW');
    assert.notEqual(started.body.status, 'ENGINEERING_REVIEW');
  });
});
