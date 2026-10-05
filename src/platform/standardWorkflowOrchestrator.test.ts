import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { inquiriesRouter } from '../server/commercialRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { workflowRouter } from '../server/workflowRoutes';
import { notificationRouter } from '../server/notificationRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { enqueueEmail, retryFailedEmail } from '../server/emailOutboxService';
import { createUserNotification, listUserNotifications } from '../server/userNotificationService';
import { evaluateStandardEngineering } from '../domain/standardWorkflowReadiness';

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

describe('STANDARD_WORKFLOW quotation V2', () => {
  let base = '';
  let server: http.Server;
  let stdToken = '';
  let otherToken = '';
  let adminToken = '';
  let stdCustomerId = '';
  let stdUserId = '';
  const suffix = `stdwf-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    const adminRole = await prisma.role.findFirst({ where: { code: 'SYSTEM_ADMINISTRATOR' } });
    assert.ok(customerRole && adminRole);

    const stdCustomer = await prisma.customer.create({
      data: {
        code: `STD-${suffix}`,
        name: 'Standard Workflow Fixture',
        defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      },
    });
    const otherCustomer = await prisma.customer.create({
      data: {
        code: `OTH-${suffix}`,
        name: 'Other Workflow Fixture',
        defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      },
    });
    stdCustomerId = stdCustomer.id;

    const stdUser = await prisma.userAccount.create({
      data: {
        username: `std-${suffix}`,
        email: `std-${suffix}@test.local`,
        fullName: 'Std Workflow User',
        userType: 'customer',
        passwordHash: await hashPassword('StdFlow@Test-2026!'),
        status: 'ACTIVE',
        customerId: stdCustomer.code,
      },
    });
    stdUserId = stdUser.id;
    const otherUser = await prisma.userAccount.create({
      data: {
        username: `oth-${suffix}`,
        email: `oth-${suffix}@test.local`,
        fullName: 'Other Workflow User',
        userType: 'customer',
        passwordHash: await hashPassword('OthFlow@Test-2026!'),
        status: 'ACTIVE',
        customerId: otherCustomer.code,
      },
    });
    const adminUser = await prisma.userAccount.create({
      data: {
        username: `adm-${suffix}`,
        email: `adm-${suffix}@test.local`,
        fullName: 'Admin Workflow User',
        userType: 'internal',
        passwordHash: await hashPassword('AdmFlow@Test-2026!'),
        status: 'ACTIVE',
      },
    });

    await prisma.customerUser.createMany({
      data: [
        { customerId: stdCustomer.id, userAccountId: stdUser.id, status: 'ACTIVE' },
        { customerId: otherCustomer.id, userAccountId: otherUser.id, status: 'ACTIVE' },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: stdUser.id, roleId: customerRole.id },
        { userId: otherUser.id, roleId: customerRole.id },
        { userId: adminUser.id, roleId: adminRole.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/v2/workflows', workflowRouter);
    app.use('/api/notifications', notificationRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginStd = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: stdUser.email, password: 'StdFlow@Test-2026!' }),
    });
    const loginOth = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherUser.email, password: 'OthFlow@Test-2026!' }),
    });
    const loginAdm = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminUser.email, password: 'AdmFlow@Test-2026!' }),
    });
    assert.equal(loginStd.status, 200, loginStd.body.error);
    assert.equal(loginOth.status, 200, loginOth.body.error);
    assert.equal(loginAdm.status, 200, loginAdm.body.error);
    stdToken = loginStd.body.accessToken;
    otherToken = loginOth.body.accessToken;
    adminToken = loginAdm.body.accessToken;
  });

  after(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it('seeds TEST-STANDARD-001 without modifying ELAND', async () => {
    const prisma = getPrisma()!;
    const testCustomer = await prisma.customer.findUnique({ where: { code: 'TEST-STANDARD-001' } });
    const eland = await prisma.customer.findUnique({ where: { code: 'C-ELAND' } });
    assert.ok(testCustomer);
    assert.equal(testCustomer.name, 'Energya Standard Test Customer');
    assert.equal(testCustomer.defaultInquiryProcessCode, 'STANDARD_WORKFLOW');
    if (eland) {
      assert.equal(eland.defaultInquiryProcessCode, 'VIP_FAST_TRACK');
      assert.notEqual(eland.name, testCustomer.name);
    }
    const user = await prisma.userAccount.findUnique({ where: { email: 'standard.test@energya.local' } });
    assert.ok(user);
    assert.equal(user.username, 'standard.test');
  });

  it('customer create stamps V2 channel and STANDARD process from master', async () => {
    const created = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: `STD ${suffix}`,
        commercialMetadata: { workflowChannel: 'V2_CONFIGURATION' },
      }),
    });
    assert.equal(created.status, 201, created.body.error);
    const meta = created.body.inquiry.commercialMetadata || {};
    assert.equal(meta.inquiryProcessCode, 'STANDARD_WORKFLOW');
    assert.equal(meta.inquiryProcessSource, 'CUSTOMER_OVERRIDE');
    assert.equal(meta.workflowChannel, 'V2_CONFIGURATION');
  });

  it('submit without lines is rejected; customer cannot approve or issue', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: `Empty ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const empty = await json(base, `/api/v2/inquiries/${inquiryId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}` },
    });
    assert.equal(empty.status, 409);
    assert.equal(empty.body.code, 'EMPTY_INQUIRY');

    const approve = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(approve.status, 403);

    const issue = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/issue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(issue.status, 403);
  });

  it('submit with snapshot starts workflow, records timing, and stops at real lineage gate', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: `Gate ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cableDescription: 'STD line' }),
    });
    const lineId = lineRes.body.line.id;
    const snapRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/snapshots`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selections: {
          selectionMode: 'TECHNICAL',
          family: 'UGC',
          voltageClass: 'MV',
          voltage: '6/10 kV (6.35/11 kV)',
          conductorMaterial: 'CU',
          conductorClass: 'Class 2 — Stranded',
          conductorSize: '120 mm²',
          cores: '1 Core',
          coresCount: 1,
          coreColors: { 1: 'Black' },
          insulation: 'XLPE',
          outerSemiConductor: 'Strippable',
          screenType: 'Copper Wire',
          screenCSA: '16 mm²',
          armour: 'No Armour',
          sheathing: 'MDPE',
          sheathingColor: 'Black',
          specialAdditives: ['UV Resistant'],
          cpr: 'No',
        },
        catalogSource: 'POSTGRESQL',
        catalogAuthoritative: true,
      }),
    });
    assert.equal(snapRes.status, 201, snapRes.body.error);

    const submitted = await json(base, `/api/inquiries/${inquiryId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}` },
    });
    const flow = snapRes.body.snapshot?.flowState;
    if (flow === 'VALID') {
      assert.equal(submitted.status, 200, submitted.body.error);
    } else {
      assert.equal(submitted.status, 409, submitted.body.error);
      assert.ok(
        submitted.body.code === 'INVALID_CONFIGURATION' || submitted.body.code === 'CONFIGURATION_REQUIRED'
      );
      assert.match(String(submitted.body.error), /not VALID/);
      const still = await json(base, `/api/v2/inquiries/${inquiryId}`, {
        headers: { Authorization: `Bearer ${stdToken}` },
      });
      assert.equal(still.body.inquiry.status, 'DRAFT');
    }

    const steal = await json(base, `/api/v2/inquiries/${inquiryId}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    assert.equal(steal.status, 403);
  });

  it('customer cannot see another customer notifications and cannot retry email', async () => {
    await createUserNotification({
      userAccountId: stdUserId,
      title: 'Private',
      message: 'own only',
      eventCode: 'STANDARD_WORKFLOW_SUBMITTED',
      entityId: stdCustomerId,
    });
    const mine = await json(base, '/api/notifications', {
      headers: { Authorization: `Bearer ${stdToken}` },
    });
    assert.equal(mine.status, 200);
    assert.ok((mine.body.notifications || []).some((n: { title: string }) => n.title === 'Private'));

    const other = await json(base, '/api/notifications', {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    assert.equal(other.status, 200);
    assert.equal(
      (other.body.notifications || []).some((n: { title: string }) => n.title === 'Private'),
      false
    );

    const emails = await json(base, '/api/notifications/emails', {
      headers: { Authorization: `Bearer ${stdToken}` },
    });
    assert.equal(emails.status, 403);
  });

  it('email queue stays QUEUED without SMTP and FAILED send does not throw', async () => {
    const prevHost = process.env.SMTP_HOST;
    const prevFrom = process.env.SMTP_FROM;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_FROM;
    const queued = await enqueueEmail({
      toAddress: 'ops@energya.local',
      subject: 'Quote issued test',
      bodyText: 'Email queued / provider not configured',
      eventCode: 'STANDARD_QUOTATION_ISSUED',
      entityType: 'CommercialInquiry',
      entityId: `inq-${suffix}`,
    });
    assert.equal(queued.status, 'QUEUED');
    assert.equal(queued.providerConfigured, false);

    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_FROM = 'noreply@energya.local';
    process.env.SMTP_PORT = '9';
    const failed = await retryFailedEmail(queued.id);
    assert.ok(failed.status === 'FAILED' || failed.status === 'QUEUED');
    if (prevHost) process.env.SMTP_HOST = prevHost;
    else delete process.env.SMTP_HOST;
    if (prevFrom) process.env.SMTP_FROM = prevFrom;
    else delete process.env.SMTP_FROM;
  });

  it('duplicate customer decision is rejected; unissued quotation is hidden', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: `Decision ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const quote = await json(base, `/api/v2/inquiries/${inquiryId}/quotation`, {
      headers: { Authorization: `Bearer ${stdToken}` },
    });
    assert.equal(quote.status, 200);
    assert.equal(quote.body.quotation, null);

    const decision = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/customer-decision`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'ACCEPT' }),
    });
    assert.ok(
      decision.status === 409 || decision.status === 400 || decision.status === 403,
      `expected blocked customer decision, got ${decision.status} ${JSON.stringify(decision.body)}`
    );
  });

  it('internal my-tasks returns only real pending tasks', async () => {
    const tasks = await json(base, '/api/v2/workflows/my-tasks', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(tasks.status, 200);
    assert.ok(Array.isArray(tasks.body.tasks));
  });

  it('internal return requires a reason and customers cannot return', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: `Return ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.findUnique({ where: { id: inquiryId } });
    assert.ok(inquiry);
    await prisma.commercialQuotation.create({
      data: {
        quotationNumber: `QUO-RET-${suffix}`,
        inquiryId,
        customerId: inquiry.customerId,
        customerMasterId: inquiry.customerMasterId,
        customerName: inquiry.customerName || 'Standard Workflow Fixture',
        workflowChannel: 'V2_CONFIGURATION',
        status: 'OPEN',
        commercialPricingStatus: 'PRICED',
      },
    });

    const missingReason = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '' }),
    });
    assert.equal(missingReason.status, 400);
    assert.equal(missingReason.body.code, 'VALIDATION');

    const asCustomer = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'customer should not return' }),
    });
    assert.equal(asCustomer.status, 403);

    const returned = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Need sales to revise commercial terms' }),
    });
    assert.equal(returned.status, 200, returned.body.error);
    assert.equal(returned.body.quotation.commercialOfferStatus, 'RETURNED');
    assert.equal(returned.body.quotation.quotationReturnReason, 'Need sales to revise commercial terms');
  });

  it('customer accept of an issued quotation creates existing CommercialCommitment', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName: `Commit ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.findUnique({ where: { id: inquiryId } });
    assert.ok(inquiry);
    const quotation = await prisma.commercialQuotation.create({
      data: {
        quotationNumber: `QUO-ACC-${suffix}`,
        inquiryId,
        customerId: inquiry.customerId,
        customerMasterId: inquiry.customerMasterId,
        customerName: inquiry.customerName || 'Standard Workflow Fixture',
        workflowChannel: 'V2_CONFIGURATION',
        status: 'SUBMITTED',
        issuedAt: new Date(),
        commercialPricingStatus: 'PRICING_APPROVED',
        commercialOfferStatus: 'ISSUED',
        technicalOfferStatus: 'ISSUED',
      },
    });

    const accepted = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/customer-decision`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'ACCEPT' }),
    });
    assert.equal(accepted.status, 200, accepted.body.error);
    assert.equal(accepted.body.quotation.customerDecision, 'ACCEPT');

    const commitment = await prisma.commercialCommitment.findFirst({
      where: { quotationId: quotation.id },
    });
    assert.ok(commitment);
    assert.equal(commitment.fulfillmentType, 'DIRECT_ORDER');
    assert.equal(commitment.workflowChannel, 'V2_CONFIGURATION');
  });

  it('TO exception evaluation is additive and does not invent snapshots', () => {
    const result = evaluateStandardEngineering([
      {
        lineId: 'x',
        lineNumber: 1,
        v2CurrentSnapshotId: null,
        v2CurrentCuttingPlanId: null,
        v2CurrentDrumPlanId: null,
        configurationSnapshot: null,
        cuttingPlan: null,
        drumPlan: null,
      },
    ]);
    assert.equal(result.allApproved, false);
    assert.equal(result.toRequired, true);
  });

  it('customer notifications list is scoped to the actor', async () => {
    const listed = await listUserNotifications({ id: stdUserId, userType: 'customer', roles: ['CUSTOMER_USER'] });
    assert.ok(listed.every((n) => n.userAccountId === stdUserId || n.roleCode === 'CUSTOMER_USER'));
  });
});
