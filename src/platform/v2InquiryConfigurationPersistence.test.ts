import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from '../server/db';
import { identityAuthRouter } from '../server/identityAuthRoutes';
import { v2InquiryConfigurationRouter } from '../server/v2InquiryConfigurationRoutes';
import { cableAuthorityRouter } from '../server/cableAuthorityRoutes';
import { seedDevelopmentUsers } from '../server/identityService';
import { hashPassword } from '../domain/passwordService';
import { SYSTEM_ADMIN_ROLE_CODE } from '../domain/permissionCatalog';
import { deleteCommercialInquiriesForTestSuffix } from '../server/commercialTestCleanup';
import {
  assertV2StatusTransition,
  inquiryHasV2ConfigurationLineage,
  isV2InquiryMetadata,
  shouldSubmitViaV2Inquiry,
} from '../domain/v2InquiryWorkflow';

dotenv.config();

const baseSelections = {
  selectionMode: 'TECHNICAL' as const,
  family: 'UGC',
  voltageClass: 'MV' as const,
  voltage: '6/10 kV (6.35/11 kV)',
  conductorMaterial: 'CU' as const,
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
};

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

describe('Task 05B — V2 inquiry configuration persistence', () => {
  describe('domain workflow', () => {
    it('detects V2 inquiry metadata', () => {
      assert.equal(isV2InquiryMetadata({ workflowChannel: 'V2_CONFIGURATION' }), true);
      assert.equal(isV2InquiryMetadata({}), false);
    });

    it('does not route Version A submit through V2 snapshot gates', () => {
      assert.equal(inquiryHasV2ConfigurationLineage([{ v2CurrentSnapshotId: null }]), false);
      assert.equal(
        isV2InquiryMetadata({ workflowChannel: 'V2_CONFIGURATION' }) &&
          !inquiryHasV2ConfigurationLineage([{ v2CurrentSnapshotId: null }]),
        true
      );
      assert.equal(
        inquiryHasV2ConfigurationLineage([
          { v2CurrentSnapshotId: null, drumSchedule: { rows: [{ noOfDrums: 15 }] } } as { v2CurrentSnapshotId: null },
        ]),
        false
      );
      assert.equal(
        shouldSubmitViaV2Inquiry({
          commercialMetadata: { workflowChannel: 'V2_CONFIGURATION' },
          lines: [{ v2CurrentSnapshotId: null }],
        }),
        false
      );
      assert.equal(
        shouldSubmitViaV2Inquiry({
          commercialMetadata: { inquiryProcessCode: 'STANDARD_WORKFLOW' },
          lines: [{ v2CurrentSnapshotId: null }],
        }),
        false
      );
      assert.equal(
        shouldSubmitViaV2Inquiry({
          commercialMetadata: { workflowChannel: 'V2_CONFIGURATION' },
          lines: [{ v2CurrentSnapshotId: 'snap-1' }],
        }),
        true
      );
    });

    it('enforces legal status transitions', () => {
      assert.throws(() => assertV2StatusTransition('QUOTED', 'DRAFT'));
      assertV2StatusTransition('DRAFT', 'SUBMITTED');
      assertV2StatusTransition('ENGINEERING_REVIEW', 'READY_FOR_COMMERCIAL');
    });
  });

  describe('API + IDOR', () => {
    let base = '';
    let server: http.Server;
    let tokenA = '';
    let tokenB = '';
    let adminToken = '';
    const suffix = `v2inq-${Date.now()}`;

    before(async () => {
      const health = await checkDatabase();
      assert.equal(health.ok, true, health.error);
      await seedDevelopmentUsers();
      const prisma = getPrisma()!;
      const role = await prisma.role.findFirst({ where: { code: SYSTEM_ADMIN_ROLE_CODE } });
      assert.ok(role);
      const custA = await prisma.customer.create({ data: { code: `V2A-${suffix}`, name: 'V2 Customer A' } });
      const custB = await prisma.customer.create({ data: { code: `V2B-${suffix}`, name: 'V2 Customer B' } });
      const userA = await prisma.userAccount.create({
        data: {
          username: `v2a-${suffix}`,
          email: `v2a-${suffix}@test.local`,
          fullName: 'V2 A',
          userType: 'customer',
          passwordHash: await hashPassword('V2Test@2026!'),
          status: 'ACTIVE',
        },
      });
      const userB = await prisma.userAccount.create({
        data: {
          username: `v2b-${suffix}`,
          email: `v2b-${suffix}@test.local`,
          fullName: 'V2 B',
          userType: 'customer',
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
        ],
      });
      await prisma.numberSequence.upsert({
        where: { code: 'INQ_COMMERCIAL' },
        create: {
          code: 'INQ_COMMERCIAL',
          name: 'Commercial Inquiry (V2)',
          prefix: 'INQ',
          format: '{PREFIX}{YY}-{#####}',
          nextSerial: 1,
          moduleId: 'INQUIRY_QUOTATION',
        },
          update: {},
        });
      const { ensureNumberSequencesAheadOfExisting } = await import('../server/testNumberSequenceIsolation');
      await ensureNumberSequencesAheadOfExisting(prisma);

      const app = express();
      app.use(express.json());
      app.use('/api/auth', identityAuthRouter);
      app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
      app.use('/api/cables', cableAuthorityRouter);
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
      const loginAdmin = await json(base, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@energya.com',
          password: process.env.ADMIN_SEED_PASSWORD || 'Admin@2026!',
        }),
      });
      assert.equal(loginA.status, 200, loginA.body.error);
      assert.equal(loginB.status, 200, loginB.body.error);
      assert.equal(loginAdmin.status, 200, loginAdmin.body.error);
      tokenA = loginA.body.accessToken;
      tokenB = loginB.body.accessToken;
      adminToken = loginAdmin.body.accessToken;
    });

    after(async () => {
      const prisma = getPrisma();
      if (prisma) {
        await deleteCommercialInquiriesForTestSuffix(prisma, suffix);
        await prisma.v2ConfigurationSnapshot.deleteMany({
          where: { snapshotId: { contains: suffix } },
        });
        await prisma.customerUser.deleteMany({
          where: { userAccount: { email: { contains: suffix } } },
        });
        await prisma.userRole.deleteMany({
          where: { user: { email: { contains: suffix } } },
        });
        await prisma.userAccount.deleteMany({ where: { email: { contains: suffix } } });
        await prisma.customer.deleteMany({ where: { code: { contains: suffix } } });
      }
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    });

    it('creates V2 inquiry with server-generated number', async () => {
      const created = await json(base, '/api/v2/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ projectName: `V2 Project ${suffix}` }),
      });
      assert.equal(created.status, 201, created.body.error);
      assert.match(created.body.inquiry.inquiryNumber, /^INQ\d{2}-\d{5}$/);
      assert.equal(created.body.inquiry.workflowChannel, 'V2_CONFIGURATION');
      assert.equal(created.body.inquiry.status, 'DRAFT');
    });

    it('persists line + snapshot in transaction and blocks cross-customer read (IDOR)', async () => {
      const created = await json(base, '/api/v2/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ projectName: `IDOR ${suffix}` }),
      });
      assert.equal(created.status, 201);
      const inquiryId = created.body.inquiry.id;

      const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ cableDescription: 'Test line', requestedQuantity: 1 }),
      });
      assert.equal(lineRes.status, 201);
      const lineId = lineRes.body.line.id;

      const snapRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          selections: baseSelections,
          catalogSource: 'POSTGRESQL',
          catalogAuthoritative: true,
        }),
      });
      assert.equal(snapRes.status, 201, snapRes.body.error);
      assert.ok(snapRes.body.snapshot.snapshotId);
      assert.ok(snapRes.body.snapshot.flowState);

      const prisma = getPrisma()!;
      const readyCable = await prisma.cableMaster.findUnique({ where: { materialNumber: '10009487' } });
      if (readyCable) {
        const identitySnap = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/snapshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
          body: JSON.stringify({
            selections: { selectionMode: 'CUSTOMER', materialNumber: '10009487', customerCode: readyCable.customerCode },
            catalogSource: 'POSTGRESQL',
            catalogAuthoritative: true,
            cableDescription: readyCable.description,
          }),
        });
        assert.equal(identitySnap.status, 201, identitySnap.body.error);
        assert.equal(identitySnap.body.snapshot.cableMaterialNumber, '10009487');
        assert.equal(identitySnap.body.snapshot.validationStatus, 'EXISTING_APPROVED');
        assert.equal(identitySnap.body.snapshot.flowState, 'VALID');
        assert.equal(identitySnap.body.snapshot.bomGovernanceBlocked, false);
      }

      const stealGet = await json(base, `/api/v2/inquiries/${inquiryId}`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(stealGet.status, 403);

      const stealList = await json(base, '/api/v2/inquiries', {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(stealList.status, 200);
      const ids = (stealList.body.inquiries || []).map((i: { id: string }) => i.id);
      assert.equal(ids.includes(inquiryId), false);
    });

    it('submit requires snapshots and records engineering status', async () => {
      const created = await json(base, '/api/v2/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ projectName: `Submit ${suffix}` }),
      });
      const inquiryId = created.body.inquiry.id;
      const emptySubmit = await json(base, `/api/v2/inquiries/${inquiryId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(emptySubmit.status, 409);
      assert.equal(emptySubmit.body.code, 'EMPTY_INQUIRY');

      const lineRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ cableDescription: 'Submit line' }),
      });
      const lineId = lineRes.body.line.id;
      const snapRes = await json(base, `/api/v2/inquiries/${inquiryId}/lines/${lineId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          selections: baseSelections,
          catalogSource: 'POSTGRESQL',
          catalogAuthoritative: true,
        }),
      });
      assert.equal(snapRes.status, 201, snapRes.body.error);

      const submitted = await json(base, `/api/v2/inquiries/${inquiryId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const flow = snapRes.body.snapshot?.flowState;
      if (flow === 'VALID') {
        assert.equal(submitted.status, 200, submitted.body.error);
        assert.equal(submitted.body.inquiry.status, 'READY_FOR_COMMERCIAL');
      } else {
        assert.equal(submitted.status, 409, submitted.body.error);
        assert.ok(
          submitted.body.code === 'INVALID_CONFIGURATION' || submitted.body.code === 'CONFIGURATION_REQUIRED'
        );
        assert.match(String(submitted.body.error), /not VALID/);
      }
    });

    it('POST /api/cables/evaluate applies customer scope from auth', async () => {
      const evalRes = await json(base, '/api/cables/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({
          config: { family: 'UGC', voltage: '6/10 kV', customerCode: 'EVIL-SPOOF' },
        }),
      });
      assert.equal(evalRes.status, 200);
      assert.equal(evalRes.body.evaluationMode, 'CUSTOMER_SCOPED');
      assert.notEqual(evalRes.body.customerScopeApplied, 'EVIL-SPOOF');
    });

    it('internal can list V2 inquiries with engineering summary', async () => {
      const list = await json(base, '/api/v2/inquiries', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(list.status, 200);
      assert.ok(Array.isArray(list.body.inquiries));
    });
  });
});
