import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { DECISION5_STATUS } from '../domain/v2CostingRequestService';
import { listServerAuditEvents } from '../server/serverAudit';
import { V2_QUOTATION_WORKFLOW_CHANNEL } from '../domain/v2QuotationService';

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

async function seedValidSnapshot(
  inquiryId: string,
  lineId: string,
  inquiryNumber: string,
  lineNumber: number,
  bomBlocked = true
) {
  const prisma = getPrisma()!;
  const snapshot = await prisma.v2ConfigurationSnapshot.create({
    data: {
      snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-v1-quo`,
      versionNo: 1,
      inquiryLineId: lineId,
      cableMaterialNumber: 'TEST-MAT-QUO',
      itemCode: 'TEST-ITEM',
      customerCode: 'TEST-CUST',
      selections: { voltage: '6/10 kV' },
      configInput: {},
      validationStatus: 'EXISTING_APPROVED',
      flowState: 'VALID',
      engineeringStatus: 'Released',
      estimatedDiameterMm: 25,
      estimatedWeightKgKm: 1200,
      catalogSource: 'POSTGRESQL',
      catalogAuthoritative: true,
      bomGovernanceBlocked: bomBlocked,
      unresolvedBomConflictCount: bomBlocked ? 81 : 0,
      downstreamGates: { cuttingLength: true, drumSelection: true, costing: true },
    },
  });
  await prisma.commercialInquiryLine.update({
    where: { id: lineId },
    data: { v2CurrentSnapshotId: snapshot.id, status: 'CABLE_VALIDATED' },
  });
  return snapshot;
}

async function seedCuttingAndConfirmDrum(
  inquiryId: string,
  lineId: string,
  token: string,
  base: string
) {
  const planRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nominalLengthM: 500, tolerancePercent: 1 }),
  });
  assert.equal(planRes.status, 201, planRes.body.error);

  const created = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
  });
  assert.equal(created.status, 201, created.body.error);
  const planId = created.body.drumPlan.planId;

  await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/validate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const confirmed = await json(
    base,
    `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(confirmed.status, 200);
  return { planId };
}

describe('Task 05F — V2 quotation persistence', () => {
  let base = '';
  let server: http.Server;
  let tokenA = '';
  let tokenB = '';
  let tokenInternal = '';
  const suffix = `v2quo-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    await prisma.numberSequence.upsert({
      where: { code: 'QUO_COMMERCIAL' },
      create: {
        code: 'QUO_COMMERCIAL',
        name: 'Commercial Quotation',
        prefix: 'QUO',
        format: '{PREFIX}{YY}-{#####}',
        nextSerial: 1,
        active: true,
        moduleId: 'COMMERCIAL',
      },
      update: {},
    });
    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);
    const custA = await prisma.customer.create({ data: { code: `V2QUO-A-${suffix}`, name: 'Quo A' } });
    const custB = await prisma.customer.create({ data: { code: `V2QUO-B-${suffix}`, name: 'Quo B' } });
    const userA = await prisma.userAccount.create({
      data: {
        username: `v2quo-a-${suffix}`,
        email: `v2quo-a-${suffix}@test.local`,
        fullName: 'Quo A',
        userType: 'customer',
        passwordHash: await hashPassword('V2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userB = await prisma.userAccount.create({
      data: {
        username: `v2quo-b-${suffix}`,
        email: `v2quo-b-${suffix}@test.local`,
        fullName: 'Quo B',
        userType: 'customer',
        passwordHash: await hashPassword('V2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    const userInternal = await prisma.userAccount.create({
      data: {
        username: `v2quo-int-${suffix}`,
        email: `v2quo-int-${suffix}@test.local`,
        fullName: 'Quo Internal',
        userType: 'internal',
        passwordHash: await hashPassword('V2Test@2026!'),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.createMany({
      data: [
        { customerId: custA.id, userAccountId: userA.id, status: 'ACTIVE' },
        { customerId: custB.id, userAccountId: userB.id, status: 'ACTIVE' },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: userA.id, roleId: role.id },
        { userId: userB.id, roleId: role.id },
        { userId: userInternal.id, roleId: role.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userA.email, password: 'V2Test@2026!' }),
    });
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userB.email, password: 'V2Test@2026!' }),
    });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
    const loginInternal = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userInternal.email, password: 'V2Test@2026!' }),
    });
    tokenInternal = loginInternal.body.accessToken;
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.commercialPricingSnapshot.deleteMany({
        where: { quotationId: { in: await prisma.commercialQuotation.findMany({ where: { inquiry: { inquiryNumber: { contains: suffix } } }, select: { id: true } }).then((r) => r.map((x) => x.id)) } },
      });
      await prisma.commercialQuotationLine.deleteMany({
        where: { quotation: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.commercialQuotation.deleteMany({
        where: { inquiry: { inquiryNumber: { contains: suffix } } },
      });
      await prisma.v2DrumPlanLine.deleteMany({
        where: { drumPlan: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } } },
      });
      await prisma.v2DrumPlan.deleteMany({
        where: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.v2CuttingLengthPlan.deleteMany({
        where: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.v2CuttingLengthRequirement.deleteMany({
        where: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.v2ConfigurationSnapshot.deleteMany({
        where: { inquiryLine: { inquiry: { inquiryNumber: { contains: suffix } } } },
      });
      await prisma.commercialInquiryLine.deleteMany({
        where: { inquiry: { inquiryNumber: { contains: suffix } } },
      });
      await prisma.commercialInquiry.deleteMany({ where: { inquiryNumber: { contains: suffix } } });
      await prisma.customerUser.deleteMany({ where: { userAccount: { email: { contains: suffix } } } });
      await prisma.userRole.deleteMany({ where: { user: { email: { contains: suffix } } } });
      await prisma.userAccount.deleteMany({ where: { email: { contains: suffix } } });
      await prisma.customer.deleteMany({ where: { code: { contains: suffix } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  async function createInquiryWithLine() {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: `Quo ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'Quo line', requestedQuantity: 2 }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber
    );
    await seedCuttingAndConfirmDrum(inquiryId, lineId, tokenA, base);
    return { inquiryId, lineId, inquiryNumber: created.body.inquiry.inquiryNumber };
  }

  it('creates draft quotation with QUO_COMMERCIAL numbering and V2 lineage pins', async () => {
    const { inquiryId } = await createInquiryWithLine();
    const before = await json(base, `/api/v2/inquiries/${inquiryId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.notEqual(before.body.inquiry.status, 'QUOTED');

    const created = await json(base, `/api/v2/inquiries/${inquiryId}/quotation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: JSON.stringify({ validityDays: 30 }),
    });
    assert.equal(created.status, 201, created.body.error);
    assert.match(created.body.quotation.quotationNumber, /^QUO\d{2}-\d{5}$/);
    assert.equal(created.body.quotation.workflowChannel, V2_QUOTATION_WORKFLOW_CHANNEL);
    assert.equal(created.body.quotation.validityDays, 30);
    const line = created.body.quotation.lines[0];
    assert.ok(line.v2ConfigurationSnapshotId);
    assert.ok(line.v2DrumPlanId);

    const after = await json(base, `/api/v2/inquiries/${inquiryId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.notEqual(after.body.inquiry.status, 'QUOTED', 'Inquiry must not be QUOTED on draft create');
  });

  it('blocks pricing when BOM Gate 2 is open', async () => {
    const { inquiryId } = await createInquiryWithLine();
    await json(base, `/api/v2/inquiries/${inquiryId}/quotation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: '{}',
    });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: '{}',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'QUOTATION_NOT_READY');
  });

  it('readiness reports Decision 5 status', async () => {
    const { inquiryId } = await createInquiryWithLine();
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/readiness`, {
      headers: { Authorization: `Bearer ${tokenInternal}` },
    });
    assert.equal(res.status, 200);
    assert.ok([DECISION5_STATUS, 'SIGNED'].includes(res.body.decision5Status));
    assert.equal(res.body.ready, false);
    if (res.body.decision5Status === DECISION5_STATUS) {
      assert.match((res.body.blockingReasons || []).join(' '), /Decision 5 unsigned/);
    }
  });

  it('blocks issue until Decision 5 signed and gates pass', async () => {
    const { inquiryId } = await createInquiryWithLine();
    await json(base, `/api/v2/inquiries/${inquiryId}/quotation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: '{}',
    });
    const issue = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: '{}',
    });
    assert.equal(issue.status, 409);
    assert.ok(['QUOTATION_NOT_READY', 'BUSINESS_RULE_REQUIRED'].includes(issue.body.code));
  });

  it('rejects cross-customer IDOR on quotation fetch', async () => {
    const { inquiryId } = await createInquiryWithLine();
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/quotation`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(res.status, 403);
  });

  it('records appendServerAudit on quotation create', async () => {
    const { inquiryId, inquiryNumber } = await createInquiryWithLine();
    const created = await json(base, `/api/v2/inquiries/${inquiryId}/quotation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenInternal}` },
      body: '{}',
    });
    assert.equal(created.status, 201);
    const events = await listServerAuditEvents({
      entity: 'CommercialQuotation',
      limit: 20,
    });
    assert.ok(
      events.some(
        (e) => e.action === 'CREATE' && String(e.message || '').includes(inquiryNumber)
      )
    );
  });
});
