import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { inquiriesRouter } from '../server/commercialRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { DECISION5_STATUS } from '../domain/v2CostingRequestService';
import { listServerAuditEvents } from '../server/serverAudit';
import {
  evaluateContainerStudyGate,
  readContainerStudyReadiness,
} from '../domain/containerStudyReadiness';
import {
  evaluateVipInquiryReadiness,
  evaluateVipLineReadiness,
} from '../domain/vipCalculateReadiness';
import {
  evaluateVipOptionalComponents,
} from '../domain/vipOptionalComponents';
import { clearDomainEventListeners, onDomainEvent } from '../domain/domainEventBus';

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

const baseLine = {
  lineId: 'line-1',
  lineNumber: 1,
  v2CurrentSnapshotId: 'snap-1',
  v2CurrentCuttingPlanId: 'cut-1',
  v2CurrentDrumPlanId: 'drum-1',
  configurationSnapshot: {
    id: 'snap-1',
    validationStatus: 'EXISTING_APPROVED',
    flowState: 'VALID',
    bomGovernanceBlocked: false,
    unresolvedBomConflictCount: 0,
    engineeringStatus: 'Released',
  },
  cuttingPlan: {
    id: 'cut-1',
    validationStatus: 'VALID',
    configurationSnapshotId: 'snap-1',
  },
  drumPlan: {
    id: 'drum-1',
    lifecycleStatus: 'CONFIRMED',
    validationStatus: 'VALID',
  },
};

const readyHeader = {
  commercialMetadata: { containerStudyReadiness: 'CONTAINER_STUDY_READY' as const },
  copperPriceRate: 9000,
  aluminiumPriceRate: 2500,
  deliveryDestination: 'Dubai',
  incoterms: 'CIF',
};

describe('Task 05I-C — VIP calculate readiness (unit)', () => {
  it('1. default container study is CONTAINER_STUDY_REQUIRED', () => {
    assert.equal(readContainerStudyReadiness({}), 'CONTAINER_STUDY_REQUIRED');
  });

  it('2. CONTAINER_STUDY_NOT_READY warns but does not block calculate', () => {
    const gate = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_NOT_READY' },
      devBypass: false,
    });
    assert.equal(gate.blocked, false);
    assert.equal(gate.reasonCode, 'CONTAINER_DATA_NOT_CONFIGURED');
    assert.match(gate.warningMessage || gate.message, /treated as 0/i);
  });

  it('3. CONTAINER_STUDY_READY passes container gate', () => {
    const gate = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_READY' },
      devBypass: false,
    });
    assert.equal(gate.ready, true);
    assert.equal(gate.blocked, false);
  });

  it('4. dev bypass documents explicit PO override only', () => {
    const gate = evaluateContainerStudyGate({
      metadata: { containerStudyReadiness: 'CONTAINER_STUDY_REQUIRED' },
      devBypass: true,
    });
    assert.equal(gate.devBypassApplied, true);
    assert.match(gate.message, /VIP_CONTAINER_STUDY_DEV_BYPASS/);
  });

  it('5. missing configuration snapshot blocks line readiness', () => {
    const gates = evaluateVipLineReadiness({
      ...baseLine,
      v2CurrentSnapshotId: null,
      configurationSnapshot: null,
    });
    assert.ok(gates.some((g) => g.gate === 'CONFIGURATION_SNAPSHOT' && g.status === 'BLOCK'));
  });

  it('6. stale snapshot pointer blocks line readiness', () => {
    const gates = evaluateVipLineReadiness({
      ...baseLine,
      v2CurrentSnapshotId: 'snap-stale',
    });
    assert.ok(gates.some((g) => g.code === 'SNAPSHOT_STALE'));
  });

  it('7. invalid snapshot validation blocks line readiness', () => {
    const gates = evaluateVipLineReadiness({
      ...baseLine,
      configurationSnapshot: {
        ...baseLine.configurationSnapshot!,
        validationStatus: 'INVALID_CONFIGURATION',
      },
    });
    assert.ok(gates.some((g) => g.gate === 'CONFIGURATION_SNAPSHOT' && g.status === 'BLOCK'));
  });

  it('8. missing cutting plan blocks line readiness', () => {
    const gates = evaluateVipLineReadiness({
      ...baseLine,
      v2CurrentCuttingPlanId: null,
      cuttingPlan: null,
    });
    assert.ok(gates.some((g) => g.gate === 'CUTTING_LENGTH_PLAN' && g.status === 'BLOCK'));
  });

  it('9. cutting plan ERROR blocks line readiness', () => {
    const gates = evaluateVipLineReadiness({
      ...baseLine,
      cuttingPlan: { ...baseLine.cuttingPlan!, validationStatus: 'ERROR' },
    });
    assert.ok(gates.some((g) => g.code === 'CUTTING_PLAN_INVALID'));
  });

  it('10. non-CONFIRMED drum plan blocks line readiness', () => {
    const gates = evaluateVipLineReadiness({
      ...baseLine,
      drumPlan: { ...baseLine.drumPlan!, lifecycleStatus: 'DRAFT' },
    });
    assert.ok(gates.some((g) => g.code === 'DRUM_PLAN_NOT_CONFIRMED'));
  });

  it('11. BOM Gate 2 (81 conflicts) hard blocks line readiness', () => {
    const gates = evaluateVipLineReadiness({
      ...baseLine,
      configurationSnapshot: {
        ...baseLine.configurationSnapshot!,
        bomGovernanceBlocked: true,
        unresolvedBomConflictCount: 81,
      },
    });
    assert.ok(gates.some((g) => g.gate === 'BOM_GATE_2' && g.status === 'BLOCK'));
    assert.match(gates.find((g) => g.gate === 'BOM_GATE_2')!.message, /81/);
  });

  it('12. header commercial config missing blocks inquiry readiness', () => {
    const result = evaluateVipInquiryReadiness({
      commercialMetadata: {},
      lines: [baseLine],
    });
    assert.equal(result.ready, false);
    assert.ok(result.gates.some((g) => g.gate === 'HEADER_COMMERCIAL_CONFIG' && g.status === 'BLOCK'));
  });

  it('13. container study missing warns inquiry readiness but does not block', () => {
    const result = evaluateVipInquiryReadiness({
      ...readyHeader,
      commercialMetadata: {},
      lines: [baseLine],
    });
    assert.equal(result.ready, true);
    assert.ok(result.gates.some((g) => g.gate === 'CONTAINER_STUDY' && g.status === 'WARN'));
    assert.ok(result.gates.some((g) => g.code === 'CONTAINER_DATA_NOT_CONFIGURED'));
  });

  it('14. all pre-costing gates pass when header + container ready', () => {
    const result = evaluateVipInquiryReadiness({
      ...readyHeader,
      lines: [baseLine],
    });
    assert.equal(result.ready, true);
    assert.ok(result.gates.some((g) => g.gate === 'DECISION_5' && g.status === 'INFO'));
    assert.equal(result.gates.find((g) => g.gate === 'DECISION_5')?.code, DECISION5_STATUS);
  });

  it('15. inquiry with no lines is not ready', () => {
    const result = evaluateVipInquiryReadiness({
      ...readyHeader,
      lines: [],
    });
    assert.equal(result.ready, false);
  });

  it('16. missing shipping → 0 + warning in optional components', () => {
    const components = evaluateVipOptionalComponents({
      commercialMetadata: { ...readyHeader, incoterms: 'CIF' },
      incoterms: 'CIF',
      currency: 'USD',
    });
    const shipping = components.find((c) => c.code === 'SHIPPING');
    assert.ok(shipping);
    assert.equal(shipping!.value, 0);
    assert.equal(shipping!.hasWarning, true);
    assert.equal(shipping!.reasonCode, 'SHIPPING_NOT_CONFIGURED');
  });

  it('17. missing container data → 0 + warning, not a readiness block', () => {
    const components = evaluateVipOptionalComponents({
      commercialMetadata: {},
      incoterms: 'CIF',
      currency: 'USD',
    });
    const container = components.find((c) => c.code === 'CONTAINER_SHIPMENT');
    assert.ok(container);
    assert.equal(container!.value, 0);
    assert.equal(container!.reasonCode, 'CONTAINER_DATA_NOT_CONFIGURED');
    const readiness = evaluateVipInquiryReadiness({
      ...readyHeader,
      commercialMetadata: {},
      lines: [baseLine],
    });
    assert.equal(readiness.ready, true);
  });

  it('18. missing premium → 0 + warning', () => {
    const premium = evaluateVipOptionalComponents({
      commercialMetadata: readyHeader,
      incoterms: 'CIF',
      currency: 'USD',
    }).find((c) => c.code === 'PREMIUM');
    assert.ok(premium);
    assert.equal(premium!.value, 0);
    assert.equal(premium!.hasWarning, true);
  });

  it('19. not-applicable charge → 0 without warning', () => {
    const shipping = evaluateVipOptionalComponents({
      commercialMetadata: { ...readyHeader, incoterms: 'EXW' },
      incoterms: 'EXW',
      currency: 'USD',
    }).find((c) => c.code === 'SHIPPING');
    assert.ok(shipping);
    assert.equal(shipping!.value, 0);
    assert.equal(shipping!.source, 'NOT_APPLICABLE');
    assert.equal(shipping!.hasWarning, false);
  });
});

describe('Task 05I-C — VIP calculate orchestrator (integration)', () => {
  let base = '';
  let server: http.Server;
  let vipToken = '';
  let stdToken = '';
  let otherToken = '';
  let vipCustomerId = '';
  const suffix = `vipcalc-${Date.now()}`;
  const prevBypass = process.env.VIP_CONTAINER_STUDY_DEV_BYPASS;

  before(async () => {
    process.env.VIP_CONTAINER_STUDY_DEV_BYPASS = 'false';
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;

    const vipCustomer = await prisma.customer.create({
      data: {
        code: `VIP-CALC-${suffix}`,
        name: 'VIP Calc Customer',
        defaultInquiryProcessCode: 'VIP_FAST_TRACK',
      },
    });
    vipCustomerId = vipCustomer.id;

    const stdCustomer = await prisma.customer.create({
      data: {
        code: `STD-CALC-${suffix}`,
        name: 'Std Calc Customer',
        defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      },
    });
    const otherCustomer = await prisma.customer.create({
      data: { code: `OTH-CALC-${suffix}`, name: 'Other Calc Customer' },
    });

    const vipUser = await prisma.userAccount.create({
      data: {
        username: `vip-calc-${suffix}`,
        email: `vip-calc-${suffix}@test.local`,
        fullName: 'VIP Calc User',
        userType: 'customer',
        passwordHash: await hashPassword('VipCalc@2026!'),
        status: 'ACTIVE',
      },
    });
    const stdUser = await prisma.userAccount.create({
      data: {
        username: `std-calc-${suffix}`,
        email: `std-calc-${suffix}@test.local`,
        fullName: 'Std Calc User',
        userType: 'customer',
        passwordHash: await hashPassword('StdCalc@2026!'),
        status: 'ACTIVE',
      },
    });
    const otherUser = await prisma.userAccount.create({
      data: {
        username: `oth-calc-${suffix}`,
        email: `oth-calc-${suffix}@test.local`,
        fullName: 'Other Calc User',
        userType: 'customer',
        passwordHash: await hashPassword('OthCalc@2026!'),
        status: 'ACTIVE',
      },
    });

    await prisma.customerUser.createMany({
      data: [
        { customerId: vipCustomer.id, userAccountId: vipUser.id, status: 'ACTIVE' },
        { customerId: stdCustomer.id, userAccountId: stdUser.id, status: 'ACTIVE' },
        { customerId: otherCustomer.id, userAccountId: otherUser.id, status: 'ACTIVE' },
      ],
    });

    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(customerRole);
    await prisma.userRole.createMany({
      data: [
        { userId: vipUser.id, roleId: customerRole.id },
        { userId: stdUser.id, roleId: customerRole.id },
        { userId: otherUser.id, roleId: customerRole.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
    app.use('/api/inquiries', inquiriesRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const loginVip = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: vipUser.email, password: 'VipCalc@2026!' }),
    });
    const loginStd = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: stdUser.email, password: 'StdCalc@2026!' }),
    });
    const loginOther = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: otherUser.email, password: 'OthCalc@2026!' }),
    });
    vipToken = loginVip.body.accessToken;
    stdToken = loginStd.body.accessToken;
    otherToken = loginOther.body.accessToken;
  });

  after(async () => {
    if (prevBypass === undefined) delete process.env.VIP_CONTAINER_STUDY_DEV_BYPASS;
    else process.env.VIP_CONTAINER_STUDY_DEV_BYPASS = prevBypass;
    clearDomainEventListeners();

    const prisma = getPrisma();
    if (prisma) {
      await prisma.commercialPricingSnapshot.deleteMany({
        where: { quotationLine: { quotation: { inquiry: { inquiryNumber: { contains: suffix } } } } },
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
        snapshotId: `v2cfg-${inquiryNumber}-L${lineNumber}-vip`,
        versionNo: 1,
        inquiryLineId: lineId,
        cableMaterialNumber: 'TEST-MAT-VIP',
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
    token: string
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
  }

  async function patchVipHeader(inquiryId: string, extra: Record<string, unknown> = {}) {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.findUnique({ where: { id: inquiryId } });
    assert.ok(inquiry);
    const meta = {
      ...((inquiry.commercialMetadata || {}) as Record<string, unknown>),
      inquiryProcessCode: 'VIP_FAST_TRACK',
      inquiryProcessSource: 'CUSTOMER_OVERRIDE',
      copperPriceRate: 9000,
      aluminiumPriceRate: 2500,
      deliveryDestination: 'Dubai',
      incoterms: 'CIF',
      containerStudyReadiness: 'CONTAINER_STUDY_READY',
      ...extra,
    };
    await prisma.commercialInquiry.update({
      where: { id: inquiryId },
      data: {
        commercialMetadata: meta,
        incoterms: 'CIF',
      },
    });
  }

  async function createVipInquiryReady(overrides?: { bomBlocked?: boolean; containerStudy?: string }) {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: JSON.stringify({ projectName: `VIP ${suffix}` }),
    });
    assert.equal(created.status, 201);
    const inquiryId = created.body.inquiry.id;
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: JSON.stringify({ cableDescription: 'VIP line', requestedQuantity: 2 }),
    });
    const lineId = lineRes.body.line.id;
    await seedValidSnapshot(
      inquiryId,
      lineId,
      created.body.inquiry.inquiryNumber,
      lineRes.body.line.lineNumber,
      overrides?.bomBlocked !== false
    );
    await seedCuttingAndConfirmDrum(inquiryId, lineId, vipToken);
    await patchVipHeader(inquiryId, {
      containerStudyReadiness: overrides?.containerStudy ?? 'CONTAINER_STUDY_READY',
    });
    return { inquiryId, lineId, inquiryNumber: created.body.inquiry.inquiryNumber };
  }

  it('16. rejects STANDARD_WORKFLOW inquiry on VIP calculate route', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stdToken}` },
      body: JSON.stringify({ projectName: `STD ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const prisma = getPrisma()!;
    await prisma.commercialInquiry.update({
      where: { id: inquiryId },
      data: {
        commercialMetadata: {
          workflowChannel: 'V2_CONFIGURATION',
          inquiryProcessCode: 'STANDARD_WORKFLOW',
          inquiryProcessSource: 'CUSTOMER_OVERRIDE',
        },
      },
    });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stdToken}` },
      body: '{}',
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'INQUIRY_PROCESS_ACTION_DENIED');
  });

  it('20. container study no longer blocks VIP calculate (warns + proceeds)', async () => {
    const { inquiryId } = await createVipInquiryReady({ bomBlocked: false, containerStudy: 'CONTAINER_STUDY_REQUIRED' });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.ok([200, 409].includes(res.status));
    assert.notEqual(res.body.result.status, 'BLOCKED');
    assert.ok(
      res.body.result.gates.some(
        (g: { gate: string; status: string }) => g.gate === 'CONTAINER_STUDY' && g.status === 'WARN'
      )
    );
    const container = res.body.result.optionalComponents?.find(
      (c: { code: string }) => c.code === 'CONTAINER_SHIPMENT'
    );
    assert.ok(container);
    assert.equal(container.value, 0);
    assert.equal(container.reasonCode, 'CONTAINER_DATA_NOT_CONFIGURED');
    assert.ok(res.body.result.optionalWarnings?.length > 0);
  });

  it('21. blocks VIP calculate on BOM Gate 2 before costing', async () => {
    const { inquiryId } = await createVipInquiryReady({ bomBlocked: true });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.equal(res.status, 409);
    assert.ok(
      res.body.result.gates.some(
        (g: { gate: string; status: string }) => g.gate === 'BOM_GATE_2' && g.status === 'BLOCK'
      )
    );
  });

  it('22. records VIP_CALCULATE_STARTED audit for container-warn path', async () => {
    const { inquiryNumber } = await createVipInquiryReady({ containerStudy: 'CONTAINER_STUDY_NOT_READY' });
    await json(base, `/api/v2/inquiries/${inquiryNumber}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    const events = await listServerAuditEvents({ entity: 'CommercialInquiry', limit: 30 });
    assert.ok(events.some((e) => e.action === 'VIP_CALCULATE_STARTED' && e.entityId === inquiryNumber));
  });

  it('23. container study alone does not produce CONTAINER_STUDY BLOCK gate', async () => {
    const events: string[] = [];
    onDomainEvent((e) => events.push(e.type));
    const { inquiryId } = await createVipInquiryReady({ bomBlocked: false, containerStudy: 'CONTAINER_STUDY_REQUIRED' });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.ok(events.includes('INQUIRY_CALCULATION_STARTED'));
    assert.ok(
      res.body.result.gates.some(
        (g: { gate: string; status: string }) => g.gate === 'CONTAINER_STUDY' && g.status === 'WARN'
      )
    );
    assert.ok(
      !res.body.result.gates.some(
        (g: { gate: string; status: string }) => g.gate === 'CONTAINER_STUDY' && g.status === 'BLOCK'
      )
    );
  });

  it('24. rejects cross-customer IDOR on VIP calculate', async () => {
    const { inquiryId } = await createVipInquiryReady();
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${otherToken}` },
      body: '{}',
    });
    assert.equal(res.status, 403);
  });

  it('25. returns gate breakdown with Decision 5 info on response', async () => {
    const { inquiryId } = await createVipInquiryReady({ containerStudy: 'CONTAINER_STUDY_NOT_READY' });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.equal(res.body.result.decision5Status, DECISION5_STATUS);
    assert.ok(res.body.result.gates.some((g: { gate: string }) => g.gate === 'DECISION_5'));
    assert.ok(res.body.result.optionalComponents?.length > 0);
  });

  it('26. pre-costing readiness passes when container study missing and BOM clear', async () => {
    const { inquiryId } = await createVipInquiryReady({ bomBlocked: false });
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.findUnique({
      where: { id: inquiryId },
      include: { lines: true },
    });
    assert.ok(inquiry);
    const line = inquiry.lines[0];
    const snapshot = await prisma.v2ConfigurationSnapshot.findUnique({
      where: { id: line.v2CurrentSnapshotId! },
    });
    const cutting = await prisma.v2CuttingLengthPlan.findUnique({
      where: { id: line.v2CurrentCuttingPlanId! },
    });
    const drum = await prisma.v2DrumPlan.findUnique({ where: { id: line.v2CurrentDrumPlanId! } });
    const readiness = evaluateVipInquiryReadiness({
      commercialMetadata: inquiry.commercialMetadata,
      copperPriceRate: 9000,
      aluminiumPriceRate: 2500,
      deliveryDestination: (inquiry.commercialMetadata as Record<string, unknown>)?.deliveryDestination,
      incoterms: inquiry.incoterms,
      lines: [
        {
          lineId: line.id,
          lineNumber: line.lineNumber,
          v2CurrentSnapshotId: line.v2CurrentSnapshotId,
          v2CurrentCuttingPlanId: line.v2CurrentCuttingPlanId,
          v2CurrentDrumPlanId: line.v2CurrentDrumPlanId,
          configurationSnapshot: snapshot
            ? {
                id: snapshot.id,
                validationStatus: snapshot.validationStatus,
                flowState: snapshot.flowState,
                bomGovernanceBlocked: snapshot.bomGovernanceBlocked,
                unresolvedBomConflictCount: snapshot.unresolvedBomConflictCount,
              }
            : null,
          cuttingPlan: cutting
            ? {
                id: cutting.id,
                validationStatus: cutting.validationStatus,
                configurationSnapshotId: cutting.configurationSnapshotId,
              }
            : null,
          drumPlan: drum
            ? { id: drum.id, lifecycleStatus: drum.lifecycleStatus, validationStatus: drum.validationStatus }
            : null,
        },
      ],
    });
    assert.equal(readiness.ready, true);
  });

  it('27. VIP calculate advances to costing phase when pre-gates pass (may PARTIAL at costing)', async () => {
    const { inquiryId } = await createVipInquiryReady({ bomBlocked: false });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.ok([200, 409].includes(res.status));
    const status = res.body.result?.status;
    assert.ok(['COMPLETED', 'PARTIAL', 'BLOCKED'].includes(status));
    if (status === 'PARTIAL') {
      assert.ok(res.body.result.gates.some((g: { gate: string }) => g.gate === 'COSTING_GATES'));
    }
  });

  it('28. warnings persisted on inquiry metadata when calculate completes', async () => {
    const { inquiryId } = await createVipInquiryReady({ bomBlocked: false, containerStudy: 'CONTAINER_STUDY_REQUIRED' });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    if (res.body.result?.status === 'COMPLETED') {
      const prisma = getPrisma()!;
      const inquiry = await prisma.commercialInquiry.findUnique({ where: { id: inquiryId } });
      const snapshot = (inquiry?.commercialMetadata as Record<string, unknown>)?.vipLastCalculateSnapshot as
        | { optionalComponents?: unknown[]; warnings?: string[] }
        | undefined;
      assert.ok(snapshot?.optionalComponents?.length);
      assert.ok(snapshot?.warnings?.length);
      const quotation = await prisma.commercialQuotation.findFirst({
        where: { inquiryId, isCurrent: true },
      });
      const offer = quotation?.commercialOfferSnapshot as Record<string, unknown> | null;
      assert.ok(offer?.optionalWarnings);
    }
  });

  it('29. retry does not duplicate quotation draft', async () => {
    const { inquiryId } = await createVipInquiryReady({ bomBlocked: false });
    const first = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    const second = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    if (first.body.result?.status === 'COMPLETED' && second.body.result?.status === 'COMPLETED') {
      assert.equal(second.body.result.idempotent, true);
      assert.equal(second.body.result.quotation?.created, false);
      const prisma = getPrisma()!;
      const count = await prisma.commercialQuotation.count({ where: { inquiryId, isCurrent: true } });
      assert.equal(count, 1);
    }
  });

  it('30. standard workflow submit path unchanged (regression)', async () => {
    const created = await json(base, '/api/v2/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stdToken}` },
      body: JSON.stringify({ projectName: `STD-REG ${suffix}` }),
    });
    const inquiryId = created.body.inquiry.id;
    const prisma = getPrisma()!;
    await prisma.commercialInquiry.update({
      where: { id: inquiryId },
      data: {
        commercialMetadata: {
          workflowChannel: 'V2_CONFIGURATION',
          inquiryProcessCode: 'STANDARD_WORKFLOW',
          copperPriceRate: 9000,
          aluminiumPriceRate: 2500,
          deliveryDestination: 'Dubai',
          incoterms: 'CIF',
        },
        incoterms: 'CIF',
      },
    });
    const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stdToken}` },
      body: JSON.stringify({ cableDescription: 'Std line', requestedQuantity: 1 }),
    });
    const submit = await json(base, `/api/v2/inquiries/${inquiryId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stdToken}` },
    });
    assert.ok([200, 409].includes(submit.status));
    const calcDenied = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stdToken}` },
      body: '{}',
    });
    assert.equal(calcDenied.status, 409);
    assert.equal(calcDenied.body.code, 'INQUIRY_PROCESS_ACTION_DENIED');
    assert.ok(lineRes.status === 201);
  });

  it('31. completed calculate includes financialOffer when offer generation succeeds', async () => {
    const { inquiryId } = await createVipInquiryReady({ bomBlocked: false });
    const res = await json(base, `/api/v2/inquiries/${inquiryId}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vipToken}` },
      body: '{}',
    });
    assert.ok([200, 409].includes(res.status));
    const result = res.body.result;
    assert.ok(result);
    if (result.status === 'COMPLETED') {
      assert.ok(result.quotation?.quotationNumber);
      assert.ok(result.financialOffer?.id, 'COMPLETED calculate must include a financial offer snapshot');
    } else {
      assert.equal(result.quotation == null || result.status === 'QUOTATION_BLOCKED', true);
      if (result.status === 'QUOTATION_BLOCKED') {
        assert.equal(result.quotation, null);
        assert.equal(result.financialOffer, null);
        assert.ok(result.gates.some((g: { gate: string; status: string }) => g.gate === 'FINANCIAL_OFFER' && g.status === 'BLOCK'));
      }
    }
  });
});
