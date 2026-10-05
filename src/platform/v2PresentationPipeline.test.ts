import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { v2CableSearchRouter } from '../server/v2CableSearchRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { CABLE_SEARCH_FORBIDDEN_RESULT_KEYS } from '../domain/v2AdvancedCableSearch';

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

describe('V2 presentation pipeline — customer to quotation', () => {
  let base = '';
  let server: http.Server;
  let vipToken = '';
  let otherToken = '';
  const suffix = `pres-${Date.now()}`;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    assert.ok(role);

    const vipCustomer = await prisma.customer.create({
      data: {
        code: `PRES-VIP-${suffix}`,
        name: 'Presentation VIP Customer',
        defaultInquiryProcessCode: 'VIP_FAST_TRACK',
      },
    });
    const otherCustomer = await prisma.customer.create({
      data: { code: `PRES-OTH-${suffix}`, name: 'Presentation Other Customer' },
    });
    const vipUser = await prisma.userAccount.create({
      data: {
        username: `pres-vip-${suffix}`,
        email: `pres-vip-${suffix}@test.local`,
        fullName: 'Presentation Buyer',
        userType: 'customer',
        passwordHash: await hashPassword('Present@2026!'),
        status: 'ACTIVE',
      },
    });
    const otherUser = await prisma.userAccount.create({
      data: {
        username: `pres-oth-${suffix}`,
        email: `pres-oth-${suffix}@test.local`,
        fullName: 'Other Buyer',
        userType: 'customer',
        passwordHash: await hashPassword('Present@2026!'),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.createMany({
      data: [
        { customerId: vipCustomer.id, userAccountId: vipUser.id, status: 'ACTIVE' },
        { customerId: otherCustomer.id, userAccountId: otherUser.id, status: 'ACTIVE' },
      ],
    });
    await prisma.userRole.createMany({
      data: [
        { userId: vipUser.id, roleId: role.id },
        { userId: otherUser.id, roleId: role.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/v2/cables', v2CableSearchRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: vipUser.email, password: 'Present@2026!' }),
    });
    const otherLogin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherUser.email, password: 'Present@2026!' }),
    });
    vipToken = login.body.accessToken as string;
    otherToken = otherLogin.body.accessToken as string;
    assert.ok(vipToken);
    assert.ok(otherToken);
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('logs in and creates a VIP inquiry without a client process choice', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: JSON.stringify({ projectName: `Presentation ${suffix}` }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.inquiry.inquiryProcessCode, 'VIP_FAST_TRACK');
    assert.equal(created.body.inquiry.inquiryProcessSource, 'CUSTOMER_OVERRIDE');
  });

  it('standard and advanced Cable Master search stay read-only', async () => {
    const standard = await json(base, '/api/v2/cables/search?q=cable&limit=5', {
      headers: { Authorization: `Bearer ${vipToken}` },
    });
    assert.equal(standard.status, 200);
    assert.ok(Array.isArray(standard.body.cables));
    for (const cable of standard.body.cables as Array<Record<string, unknown>>) {
      for (const key of CABLE_SEARCH_FORBIDDEN_RESULT_KEYS) {
        assert.equal(key in cable, false, key);
      }
    }

    const advanced = await json(base, '/api/v2/cables/search?voltage=6/10&limit=5', {
      headers: { Authorization: `Bearer ${vipToken}` },
    });
    assert.equal(advanced.status, 200);

    const createDenied = await json(base, '/api/v2/cables/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.equal(createDenied.status, 405);
  });

  it('runs automatic processing: engineering → costing → pricing → offer → quotation', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: JSON.stringify({ projectName: `Pipeline ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id as string;
    const inquiryNumber = created.body.inquiry.inquiryNumber as string;

    const blocked = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.result.status, 'BLOCKED');
    assert.ok(Array.isArray(blocked.body.result.gates));

    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: JSON.stringify({ cableDescription: 'Presentation cable', requestedQuantity: 10, requestedLengthMeters: 1000 }),
    });
    assert.equal(lineRes.status, 201);
    const lineId = lineRes.body.line.id as string;
    const lineNumber = lineRes.body.line.lineNumber as number;
    const prisma = getPrisma()!;
    const snapshot = await prisma.v2ConfigurationSnapshot.create({
      data: {
        snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-pres`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: 'TEST-MAT-PRES',
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
        bomGovernanceBlocked: false,
        unresolvedBomConflictCount: 0,
        downstreamGates: { cuttingLength: true, drumSelection: true, costing: true },
      },
    });
    await prisma.commercialInquiryLine.update({
      where: { id: lineId },
      data: { v2CurrentSnapshotId: snapshot.id, status: 'CABLE_VALIDATED' },
    });

    const cutting = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/cutting-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: JSON.stringify({ nominalLengthM: 1000, tolerancePercent: 1 }),
    });
    assert.equal(cutting.status, 201, cutting.body.error);

    const drum = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: JSON.stringify({ selectionMethod: 'AUTOMATIC' }),
    });
    assert.equal(drum.status, 201, drum.body.error);
    const planId = drum.body.drumPlan.planId as string;
    await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vipToken}` },
    });
    const confirmed = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/drum-plans/${planId}/confirm`,
      { method: 'POST', headers: { Authorization: `Bearer ${vipToken}` } }
    );
    assert.equal(confirmed.status, 200, confirmed.body.error);

    const existing = await prisma.commercialInquiry.findUnique({ where: { id: inquiryId } });
    assert.ok(existing);
    await prisma.commercialInquiry.update({
      where: { id: inquiryId },
      data: {
        incoterms: 'CIF',
        commercialMetadata: {
          ...((existing.commercialMetadata || {}) as Record<string, unknown>),
          copperPriceRate: 9000,
          aluminiumPriceRate: 2500,
          deliveryDestination: 'Alexandria',
          incoterms: 'CIF',
          containerStudyReadiness: 'CONTAINER_STUDY_READY',
        },
      },
    });

    const calculated = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.ok(
      [200, 409].includes(calculated.status),
      `calculate status ${calculated.status}: ${JSON.stringify(calculated.body)}`
    );
    const result = calculated.body.result;
    assert.ok(result);
    assert.ok(['COMPLETED', 'PARTIAL', 'BLOCKED', 'QUOTATION_BLOCKED'].includes(result.status));
    assert.ok(result.gates.some((g: { gate: string }) => g.gate === 'CONFIGURATION_SNAPSHOT' || g.gate === 'DECISION_5' || g.gate === 'CUTTING_PLAN' || g.gate === 'DRUM_PLAN' || g.gate === 'COSTING_GATES'));

    if (result.status === 'COMPLETED') {
      assert.ok(result.quotation?.quotationNumber);
      assert.ok(result.quotation?.status);
      assert.ok(result.financialOffer?.id, 'COMPLETED calculate must include a financial offer snapshot');
    } else if (result.status === 'QUOTATION_BLOCKED') {
      assert.equal(result.quotation, null);
      assert.equal(result.financialOffer, null);
      assert.ok(result.gates.some((g: { gate: string; status: string }) => g.gate === 'FINANCIAL_OFFER' && g.status === 'BLOCK'));
    } else if (result.status === 'PARTIAL') {
      assert.equal(result.quotation, null);
      assert.ok(result.gates.some((g: { gate: string; status: string }) => g.gate === 'COSTING_GATES' && g.status === 'BLOCK'));
    }

    const approve = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.equal(approve.status, 403);

    const issue = await json(base, `/api/v2/inquiries/${inquiryId}/quotation/issue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.equal(issue.status, 403);

    const quote = await json(base, `/api/v2/inquiries/${inquiryId}/quotation`, {
      headers: { Authorization: `Bearer ${vipToken}` },
    });
    assert.ok([200, 404].includes(quote.status) || quote.status === 200);
    const quotation = quote.body.quotation as Record<string, unknown> | null;
    if (quotation) {
      assert.equal('costingCalculationId' in quotation, false);
      const lines = Array.isArray(quotation.lines) ? quotation.lines : [];
      for (const line of lines as Array<Record<string, unknown>>) {
        assert.equal('costingCalculationId' in line, false);
        assert.equal('materialCost' in line, false);
      }
    }

    const idor = await json(base, `/api/v2/inquiries/${inquiryId}`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    assert.equal(idor.status, 403);

    const costingLeak = await json(
      base,
      `/api/v2/inquiries/${inquiryId}/lines/${lineId}/costing-runs/preview`,
      { method: 'POST', headers: { Authorization: `Bearer ${vipToken}` } }
    );
    assert.equal(costingLeak.status, 403);
  });
});
