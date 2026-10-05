import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { shippingCostRouter } from '../server/shippingCostRoutes';
import { shipmentCostSnapshotRouter } from '../server/shipmentCostSnapshotRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { dateOnlyToUtc } from '../domain/shippingCostCanonical';
import { deleteV2LineageForInquiries } from './containerStudyTestCleanup';
import { appendServerAuditTx } from '../server/serverAudit';
import { deleteNonIccTestIncoterm } from '../server/incotermTestCleanup';

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

describe('Task 05I-DF-B4-C — Shipment Cost Snapshot', () => {
  let base = '';
  let server: http.Server;
  let tokenAdmin = '';
  let tokenCustomer = '';
  let tokenConfirm = '';
  let tokenStudyOnly = '';
  let customerId = '';
  let configId = '';
  const suffix = `B4C${Date.now().toString(36).toUpperCase()}`;
  const portCode = `P${suffix}`.slice(0, 12);
  const incotermCode = `I${suffix}`.slice(0, 12);
  const typeHq = `H${suffix}`.slice(0, 12);
  const typeStd = `S${suffix}`.slice(0, 12);
  const inquiryIds: string[] = [];
  const rateIds: string[] = [];
  const auth = () => ({ Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' });

  async function seedInquiry(opts?: { inquiryDate?: Date }) {
    const prisma = getPrisma()!;
    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${suffix}-${inquiryIds.length + 1}`,
        customerId,
        customerName: 'B4C Customer',
        inquiryDate: opts?.inquiryDate ?? new Date('2026-06-15T12:00:00.000Z'),
        status: 'DRAFT',
      },
    });
    inquiryIds.push(inquiry.id);
    const group = await prisma.containerShipmentGroup.create({
      data: {
        inquiryId: inquiry.id,
        groupCode: `SG-${inquiryIds.length}`,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: portCode,
        incotermCode,
        status: 'LOCKED',
      },
    });
    return { inquiry, group };
  }

  async function seedStudy(opts: {
    groupId: string;
    inquiryId: string;
    status?: 'DRAFT' | 'VALIDATED' | 'CONFIRMED' | 'SUPERSEDED';
    typeCounts: Record<string, number>;
    unallocated?: boolean;
    blankType?: boolean;
    bindCurrentResult?: boolean;
    extraResult?: boolean;
  }) {
    const prisma = getPrisma()!;
    const study = await prisma.containerStudy.create({
      data: {
        studyNumber: `CST-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        versionNo: 1,
        inquiryId: opts.inquiryId,
        shipmentGroupId: opts.groupId,
        customerId,
        status: opts.status ?? 'CONFIRMED',
        stuffingMethod: 'Rolling',
        region: 'Europe',
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
      },
    });
    const input = await prisma.containerStudyInputSnapshot.create({
      data: {
        snapshotId: `SNAP-${study.id}`,
        studyId: study.id,
        stuffingMethod: 'Rolling',
        region: 'Europe',
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        algorithmVersionCode: 'LEGACY',
        configurationId: configId,
        configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1',
        containerMasterPinJson: {},
        packingProfilePinJson: {},
        algorithmParameterPinJson: {},
      },
    });
    const result = await prisma.containerStudyResult.create({
      data: {
        resultId: `RES-${study.id}`,
        studyId: study.id,
        studyVersionNo: 1,
        inputSnapshotId: input.id,
        algorithmVersionCode: 'LEGACY',
        configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1',
        containerMasterPinJson: {},
        packingProfilePinJson: {},
      },
    });
    let index = 0;
    for (const [typeCode, count] of Object.entries(opts.typeCounts)) {
      for (let i = 0; i < count; i += 1) {
        await prisma.containerStudyResultContainer.create({
          data: {
            resultId: result.id,
            containerIndex: index,
            typeCode: opts.blankType ? '' : typeCode,
            drumCountQ3: 7,
          },
        });
        index += 1;
      }
    }
    if (opts.unallocated) {
      await prisma.containerStudyResultUnallocated.create({
        data: {
          resultId: result.id,
          physicalDrumKey: `DRUM-${study.id}`,
          sourceLineId: 'line-1',
          instanceIndex: 1,
          reasonCode: 'NO_FIT',
        },
      });
    }
    let otherResultId: string | undefined;
    if (opts.extraResult) {
      const other = await prisma.containerStudyResult.create({
        data: {
          resultId: `RES-OLD-${study.id}`,
          studyId: study.id,
          studyVersionNo: 1,
          inputSnapshotId: input.id,
          algorithmVersionCode: 'LEGACY',
          configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1',
          containerMasterPinJson: {},
          packingProfilePinJson: {},
        },
      });
      otherResultId = other.id;
    }
    await prisma.containerStudy.update({
      where: { id: study.id },
      data: {
        currentSnapshotId: input.id,
        currentResultId: opts.bindCurrentResult === false ? otherResultId ?? null : result.id,
      },
    });
    return { study, input, result, otherResultId };
  }

  async function createRate(typeCode: string, amount: number, currencyCode: string, from = '2026-01-01') {
    const prisma = getPrisma()!;
    const row = await prisma.shippingCostRate.create({
      data: {
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeCode,
        rateAmount: amount,
        currencyCode,
        effectiveFrom: dateOnlyToUtc(from),
        active: true,
      },
    });
    rateIds.push(row.id);
    return row;
  }

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    const adminRole = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
    const customerRole = await prisma.role.findFirst({ where: { code: 'CUSTOMER_USER' } });
    const salesMgrRole = await prisma.role.findFirst({ where: { code: 'SALES_MANAGER' } });
    const salesRepRole = await prisma.role.findFirst({ where: { code: 'SALES_REPRESENTATIVE' } });
    assert.ok(adminRole && customerRole && salesMgrRole && salesRepRole);
    const cfg = await prisma.algorithmConfiguration.findFirst({
      where: { id: 'CFG-LEGACY-FIRST-FIT-V1' },
    }) ?? await prisma.algorithmConfiguration.findFirst();
    assert.ok(cfg, 'AlgorithmConfiguration seed is required');
    configId = cfg.id;

    await prisma.costingCurrency.upsert({
      where: { code: 'USD' },
      create: { code: 'USD', name: 'US Dollar', status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await prisma.costingCurrency.upsert({
      where: { code: 'EUR' },
      create: { code: 'EUR', name: 'Euro', status: 'ACTIVE' },
      update: { status: 'ACTIVE' },
    });
    await prisma.containerType.upsert({
      where: { code: typeHq },
      create: { code: typeHq, description: 'B4-C HQ', active: true },
      update: { active: true },
    });
    await prisma.containerType.upsert({
      where: { code: typeStd },
      create: { code: typeStd, description: 'B4-C STD', active: true },
      update: { active: true },
    });
    await prisma.destinationPort.create({
      data: { code: portCode, name: 'B4C Port', countryCode: 'EG', active: true },
    });
    await prisma.incoterm.create({
      data: { code: incotermCode, name: 'B4C Incoterm', active: true },
    });

    const customer = await prisma.customer.create({ data: { code: `C-${suffix}`, name: 'B4C Customer' } });
    customerId = customer.id;
    const admin = await prisma.userAccount.create({
      data: {
        username: `b4c-admin-${suffix}`,
        email: `b4c-admin-${suffix}@test.local`,
        fullName: 'B4C Admin',
        userType: 'internal',
        passwordHash: await hashPassword('B4CTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const custUser = await prisma.userAccount.create({
      data: {
        username: `b4c-cust-${suffix}`,
        email: `b4c-cust-${suffix}@test.local`,
        fullName: 'B4C Customer',
        userType: 'customer',
        passwordHash: await hashPassword('B4CTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const confirmUser = await prisma.userAccount.create({
      data: {
        username: `b4c-confirm-${suffix}`,
        email: `b4c-confirm-${suffix}@test.local`,
        fullName: 'B4C Confirm',
        userType: 'internal',
        passwordHash: await hashPassword('B4CTest@2026!'),
        status: 'ACTIVE',
      },
    });
    const studyOnly = await prisma.userAccount.create({
      data: {
        username: `b4c-study-${suffix}`,
        email: `b4c-study-${suffix}@test.local`,
        fullName: 'B4C Study Only',
        userType: 'internal',
        passwordHash: await hashPassword('B4CTest@2026!'),
        status: 'ACTIVE',
      },
    });
    await prisma.customerUser.create({
      data: { customerId: customer.id, userAccountId: custUser.id, status: 'ACTIVE' },
    });
    await prisma.userRole.createMany({
      data: [
        { userId: admin.id, roleId: adminRole.id },
        { userId: custUser.id, roleId: customerRole.id },
        { userId: confirmUser.id, roleId: salesMgrRole.id },
        { userId: studyOnly.id, roleId: salesRepRole.id },
      ],
    });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/v2', shippingCostRouter);
    app.use('/api/v2', shipmentCostSnapshotRouter);
    const started = await listen(app);
    server = started.server;
    base = started.base;

    const login = async (email: string) => {
      const res = await json(base, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'B4CTest@2026!' }),
      });
      return res.body.accessToken as string;
    };
    tokenAdmin = await login(admin.email!);
    tokenCustomer = await login(custUser.email!);
    tokenConfirm = await login(confirmUser.email!);
    tokenStudyOnly = await login(studyOnly.email!);
    assert.ok(tokenAdmin);
  });

  after(async () => {
    const prisma = getPrisma();
    try {
      if (prisma) {
        try {
          await deleteV2LineageForInquiries(prisma, inquiryIds);
          await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
        } catch {
          /* still drop the ephemeral Incoterm below */
        }
        if (rateIds.length) await prisma.shippingCostRate.deleteMany({ where: { id: { in: rateIds } } });
        await prisma.shippingCostRate.deleteMany({
          where: { destinationPortCode: portCode, incotermCode },
        });
        await deleteNonIccTestIncoterm(prisma, incotermCode);
        await prisma.destinationPort.deleteMany({ where: { code: portCode } });
        await prisma.containerType.deleteMany({ where: { code: { in: [typeHq, typeStd] } } });
        const emails = [
          `b4c-admin-${suffix}@test.local`,
          `b4c-cust-${suffix}@test.local`,
          `b4c-confirm-${suffix}@test.local`,
          `b4c-study-${suffix}@test.local`,
        ];
        const users = await prisma.userAccount.findMany({ where: { email: { in: emails } }, select: { id: true } });
        const userIds = users.map((u) => u.id);
        if (userIds.length) {
          await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
          await prisma.customerUser.deleteMany({ where: { userAccountId: { in: userIds } } });
          await prisma.userAccount.deleteMany({ where: { id: { in: userIds } } });
        }
        await prisma.customer.deleteMany({ where: { code: `C-${suffix}` } });
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('creates a snapshot from confirmed-result container counts, ignoring client quantities', async () => {
    const rateHq = await createRate(typeHq, 1000, 'USD');
    const rateStd = await createRate(typeStd, 400, 'USD');
    const { inquiry, group } = await seedInquiry();
    const seeded = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 2, [typeStd]: 1 },
    });
    const created = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        containerStudyResultId: seeded.result.id,
        shipmentGroupId: group.id,
        customerId: 'client-spoof',
        containerQuantities: [{ containerTypeCode: typeHq, containerQuantity: 5 }],
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.containerStudyResultId, seeded.result.id);
    assert.equal(created.body.resultId, seeded.result.resultId);
    assert.equal(created.body.shipmentGroupId, group.id);
    assert.equal(created.body.inquiryId, inquiry.id);
    assert.equal(created.body.destinationPortCode, portCode);
    assert.equal(created.body.incotermCode, incotermCode);
    assert.equal(created.body.rateAsOfDate, '2026-06-15');
    assert.equal(created.body.currencyCode, 'USD');
    assert.equal(Number(created.body.totalAmount), 2400);
    assert.equal(created.body.lines.length, 2);
    assert.equal(created.body.lines[0].containerTypeCode, typeHq < typeStd ? typeHq : typeStd);
    const hqLine = created.body.lines.find((l: { containerTypeCode: string }) => l.containerTypeCode === typeHq);
    const stdLine = created.body.lines.find((l: { containerTypeCode: string }) => l.containerTypeCode === typeStd);
    assert.equal(hqLine.containerQuantity, 2);
    assert.equal(Number(hqLine.lineTotal), 2000);
    assert.equal(hqLine.shippingCostRateId, rateHq.id);
    assert.equal(Number(hqLine.rateAmount), 1000);
    assert.equal(stdLine.containerQuantity, 1);
    assert.equal(stdLine.shippingCostRateId, rateStd.id);

    const prisma = getPrisma()!;
    await prisma.shippingCostRate.update({ where: { id: rateHq.id }, data: { active: false } });
    const reread = await json(base, `/api/v2/shipment-cost-snapshots/${created.body.id}`, { headers: auth() });
    assert.equal(reread.status, 200);
    assert.equal(
      Number(reread.body.lines.find((l: { containerTypeCode: string }) => l.containerTypeCode === typeHq).rateAmount),
      1000
    );
    assert.equal(Number(reread.body.totalAmount), 2400);
    await prisma.shippingCostRate.update({ where: { id: rateHq.id }, data: { active: true } });

    const byResult = await json(base, `/api/v2/container-study-results/${seeded.result.resultId}/shipment-cost-snapshot`, {
      headers: auth(),
    });
    assert.equal(byResult.status, 200);
    assert.equal(byResult.body.id, created.body.id);

    const audits = await prisma.auditEvent.findMany({
      where: { action: 'SHIPMENT_COST_SNAPSHOT_CREATED', entityId: created.body.id },
    });
    assert.equal(audits.length, 1);
    assert.equal((audits[0].newValue as { resultId: string }).resultId, seeded.result.resultId);
  });

  it('is idempotent for the same confirmed result and rejects a competing as-of date', async () => {
    const { inquiry, group } = await seedInquiry();
    const seeded = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
    });
    const first = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: seeded.result.id }),
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const second = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: seeded.result.resultId }),
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.id, first.body.id);
    const mismatch = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: seeded.result.id, rateAsOfDate: '2026-01-01' }),
    });
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.details?.issueCode, 'SNAPSHOT_AS_OF_MISMATCH');
    const prisma = getPrisma()!;
    const count = await prisma.shipmentCostSnapshot.count({ where: { containerStudyResultId: seeded.result.id } });
    assert.equal(count, 1);
    const createdAudits = await prisma.auditEvent.count({
      where: { action: 'SHIPMENT_COST_SNAPSHOT_CREATED', entityId: first.body.id },
    });
    assert.equal(createdAudits, 1);
  });

  it('rejects DRAFT, SUPERSEDED, non-current result, unallocated, and blank typeCode', async () => {
    const { inquiry, group } = await seedInquiry();
    const draft = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      status: 'DRAFT',
      typeCounts: { [typeHq]: 1 },
    });
    const draftRes = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: draft.result.id }),
    });
    assert.equal(draftRes.status, 400);
    assert.equal(draftRes.body.details?.issueCode, 'RESULT_NOT_CONFIRMED');

    const superseded = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      status: 'SUPERSEDED',
      typeCounts: { [typeHq]: 1 },
    });
    const superRes = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: superseded.result.id }),
    });
    assert.equal(superRes.status, 400);
    assert.equal(superRes.body.details?.issueCode, 'RESULT_SUPERSEDED');

    const notCurrent = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
      extraResult: true,
      bindCurrentResult: false,
    });
    const notCurrentRes = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: notCurrent.result.id }),
    });
    assert.equal(notCurrentRes.status, 400);
    assert.equal(notCurrentRes.body.details?.issueCode, 'RESULT_NOT_CONFIRMED');

    const unalloc = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
      unallocated: true,
    });
    const unallocRes = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: unalloc.result.id }),
    });
    assert.equal(unallocRes.status, 400);
    assert.equal(unallocRes.body.details?.issueCode, 'UNALLOCATED_CONTAINERS');

    const blank = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
      blankType: true,
    });
    const blankRes = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: blank.result.id }),
    });
    assert.equal(blankRes.status, 400);
    assert.equal(blankRes.body.details?.issueCode, 'CONTAINER_TYPE_NOT_FOUND');
  });

  it('fails closed on RATE_NOT_FOUND, RATE_AMBIGUOUS, and mixed currencies without persisting', async () => {
    const { inquiry, group } = await seedInquiry();
    const missing = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1, [typeStd]: 1 },
    });
    const prisma = getPrisma()!;
    await prisma.shippingCostRate.updateMany({
      where: { containerTypeCode: typeStd, destinationPortCode: portCode },
      data: { active: false },
    });
    const notFound = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: missing.result.id, rateAsOfDate: '2026-06-15' }),
    });
    assert.equal(notFound.status, 400);
    assert.equal(notFound.body.details?.issueCode, 'RATE_NOT_FOUND');
    assert.equal(await prisma.shipmentCostSnapshot.count({ where: { containerStudyResultId: missing.result.id } }), 0);
    const failedAudits = await prisma.auditEvent.findMany({
      where: { action: 'SHIPMENT_COST_SNAPSHOT_CREATE_FAILED', entityId: missing.result.id },
    });
    assert.ok(failedAudits.length >= 1);
    assert.equal(await prisma.auditEvent.count({
      where: { action: 'SHIPMENT_COST_SNAPSHOT_CREATED', entityId: missing.result.id },
    }), 0);

    const ambStudy = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
    });
    const a = await prisma.shippingCostRate.create({
      data: {
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeHq,
        rateAmount: 11,
        currencyCode: 'USD',
        effectiveFrom: dateOnlyToUtc('2026-06-01'),
        effectiveTo: dateOnlyToUtc('2026-06-30'),
        active: true,
      },
    });
    const b = await prisma.shippingCostRate.create({
      data: {
        destinationPortCode: portCode,
        incotermCode,
        containerTypeCode: typeHq,
        rateAmount: 22,
        currencyCode: 'USD',
        effectiveFrom: dateOnlyToUtc('2026-06-10'),
        effectiveTo: dateOnlyToUtc('2026-06-20'),
        active: true,
      },
    });
    rateIds.push(a.id, b.id);
    const ambiguous = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: ambStudy.result.id, rateAsOfDate: '2026-06-15' }),
    });
    assert.equal(ambiguous.status, 400);
    assert.equal(ambiguous.body.details?.issueCode, 'RATE_AMBIGUOUS');
    await prisma.shippingCostRate.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { active: false } });

    await prisma.shippingCostRate.updateMany({
      where: { containerTypeCode: typeStd, destinationPortCode: portCode },
      data: { active: true },
    });
    const eur = await createRate(typeStd, 50, 'EUR');
    await prisma.shippingCostRate.update({
      where: { id: eur.id },
      data: { destinationPortCode: portCode, incotermCode, containerTypeCode: typeStd },
    });
    const mixedStudy = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1, [typeStd]: 1 },
    });
    await prisma.shippingCostRate.updateMany({
      where: { containerTypeCode: typeStd, destinationPortCode: portCode, id: { not: eur.id } },
      data: { active: false },
    });
    const mixed = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ containerStudyResultId: mixedStudy.result.id, rateAsOfDate: '2026-06-15' }),
    });
    assert.equal(mixed.status, 400, JSON.stringify(mixed.body));
    assert.equal(mixed.body.details?.issueCode, 'CURRENCY_INCOMPATIBLE');
    assert.equal(await prisma.shipmentCostSnapshot.count({ where: { containerStudyResultId: mixedStudy.result.id } }), 0);
  });

  it('denies customers, allows CONFIRM-only create, and has no PATCH/DELETE', async () => {
    const { inquiry, group } = await seedInquiry();
    const seeded = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
    });
    const customerCreate = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCustomer}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ containerStudyResultId: seeded.result.id }),
    });
    assert.equal(customerCreate.status, 401);

    const studyOnlyCreate = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenStudyOnly}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ containerStudyResultId: seeded.result.id }),
    });
    assert.equal(studyOnlyCreate.status, 401);

    const confirmCreate = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenConfirm}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ containerStudyResultId: seeded.result.id }),
    });
    assert.equal(confirmCreate.status, 201, JSON.stringify(confirmCreate.body));

    const customerGet = await json(base, `/api/v2/shipment-cost-snapshots/${confirmCreate.body.id}`, {
      headers: { Authorization: `Bearer ${tokenCustomer}` },
    });
    assert.equal(customerGet.status, 401);

    const studyOnlyGet = await json(base, `/api/v2/shipment-cost-snapshots/${confirmCreate.body.id}`, {
      headers: { Authorization: `Bearer ${tokenStudyOnly}` },
    });
    assert.equal(studyOnlyGet.status, 200);

    const patched = await json(base, `/api/v2/shipment-cost-snapshots/${confirmCreate.body.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ totalAmount: '1' }),
    });
    assert.equal(patched.status, 404);
    const deleted = await json(base, `/api/v2/shipment-cost-snapshots/${confirmCreate.body.id}`, {
      method: 'DELETE',
      headers: auth(),
    });
    assert.equal(deleted.status, 404);
  });

  it('serializes concurrent creates to one snapshot via unique containerStudyResultId', async () => {
    const { inquiry, group } = await seedInquiry();
    const seeded = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
    });
    const payload = JSON.stringify({ containerStudyResultId: seeded.result.id });
    const [a, b] = await Promise.all([
      json(base, '/api/v2/shipment-cost-snapshots', { method: 'POST', headers: auth(), body: payload }),
      json(base, '/api/v2/shipment-cost-snapshots', { method: 'POST', headers: auth(), body: payload }),
    ]);
    assert.ok([200, 201].includes(a.status), JSON.stringify(a.body));
    assert.ok([200, 201].includes(b.status), JSON.stringify(b.body));
    assert.equal(a.body.id, b.body.id);
    const prisma = getPrisma()!;
    assert.equal(await prisma.shipmentCostSnapshot.count({ where: { containerStudyResultId: seeded.result.id } }), 1);
    assert.equal(
      await prisma.auditEvent.count({ where: { action: 'SHIPMENT_COST_SNAPSHOT_CREATED', entityId: a.body.id } }),
      1
    );
  });

  it('rejects a mismatched shipmentGroupId', async () => {
    const { inquiry, group } = await seedInquiry();
    const other = await seedInquiry();
    const seeded = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
    });
    const res = await json(base, '/api/v2/shipment-cost-snapshots', {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({
        containerStudyResultId: seeded.result.id,
        shipmentGroupId: other.group.id,
      }),
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.details?.issueCode, 'INVALID_SHIPMENT_GROUP');
  });

  it('rolls back the snapshot when appendServerAuditTx throws inside the transaction', async () => {
    const { inquiry, group } = await seedInquiry();
    const seeded = await seedStudy({
      groupId: group.id,
      inquiryId: inquiry.id,
      typeCounts: { [typeHq]: 1 },
    });
    const prisma = getPrisma()!;
    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          await tx.shipmentCostSnapshot.create({
            data: {
              inquiryId: inquiry.id,
              shipmentGroupId: group.id,
              containerStudyId: seeded.study.id,
              containerStudyResultId: seeded.result.id,
              destinationPortCode: portCode,
              incotermCode,
              rateAsOfDate: dateOnlyToUtc('2026-06-15'),
              totalAmount: 1,
              currencyCode: 'USD',
            },
          });
          await appendServerAuditTx(
            {
              auditEvent: {
                create: async () => {
                  throw new Error('forced-audit-failure');
                },
              },
            },
            {
              entity: 'ShipmentCostSnapshot',
              entityId: 'forced-audit-failure',
              action: 'SHIPMENT_COST_SNAPSHOT_CREATED',
            }
          );
        }),
      /forced-audit-failure/
    );
    assert.equal(await prisma.shipmentCostSnapshot.count({ where: { containerStudyResultId: seeded.result.id } }), 0);
    assert.equal(
      await prisma.auditEvent.count({
        where: { action: 'SHIPMENT_COST_SNAPSHOT_CREATED', entityId: 'forced-audit-failure' },
      }),
      0
    );
  });
});
