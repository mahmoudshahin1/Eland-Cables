import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import { inquiriesRouter } from './commercialRoutes';
import { seedDevelopmentUsers } from './identityService';
import { createInquiry } from './commercialRepository';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';
import { listApprovedShipmentMasters, listIncoterms } from './shippingCostRepository';
import { ensureIccIncoterms2020Master } from './iccIncotermMasterLoad';
import { deleteLeftoverB4TestIncoterms } from './incotermTestCleanup';
import {
  ICC_INCOTERM_CODE_SET_2020,
  ICC_INCOTERM_CODES_2020,
  ICC_INCOTERM_LOAD_DESCRIPTION,
  ICC_INCOTERMS_2020,
} from '../domain/globalIncotermMaster';

dotenv.config();

const REQUIRED_CODES = [...ICC_INCOTERM_CODES_2020];

function listen(app: express.Express): Promise<{ server: http.Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

async function json(base: string, pathName: string, init?: RequestInit) {
  const res = await fetch(`${base}${pathName}`, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('ICC Incoterms 2020 global master load', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let cifIdBefore = '';
  let dapIdBefore = '';
  let cifCreatedByBefore: string | null = null;
  let dapCreatedByBefore: string | null = null;
  let cifCreatedAtBefore: Date | null = null;
  let dapCreatedAtBefore: Date | null = null;
  let codesBefore: string[] = [];
  let createdInquiryId = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma()!;
    await deleteLeftoverB4TestIncoterms(prisma);

    const beforeRows = await prisma.incoterm.findMany({ orderBy: { code: 'asc' } });
    codesBefore = beforeRows.map((row) => row.code);
    const cif = beforeRows.find((row) => row.code === 'CIF');
    const dap = beforeRows.find((row) => row.code === 'DAP');
    assert.ok(cif, 'CIF must already exist and must not be recreated');
    assert.ok(dap, 'DAP must already exist and must not be recreated');
    cifIdBefore = cif.id;
    dapIdBefore = dap.id;
    cifCreatedByBefore = cif.createdBy;
    dapCreatedByBefore = dap.createdBy;
    cifCreatedAtBefore = cif.createdAt;
    dapCreatedAtBefore = dap.createdAt;

    await seedDevelopmentUsers();
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/inquiries', inquiriesRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const login = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@energya.com',
        password: process.env.ADMIN_SEED_PASSWORD || 'Admin@2026!',
      }),
    });
    assert.equal(login.status, 200, login.body.error);
    adminToken = login.body.accessToken;
  });

  after(async () => {
    const prisma = getPrisma();
    try {
      if (prisma) {
        if (createdInquiryId) {
          await deleteCommercialInquiriesMatching(prisma, { id: createdInquiryId });
        }
        await deleteLeftoverB4TestIncoterms(prisma);
      }
    } finally {
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
      await disconnectPrisma();
    }
  });

  it('upserts exactly the 11 ICC codes, preserving CIF and DAP row identity', async () => {
    const prisma = getPrisma()!;
    const result = await ensureIccIncoterms2020Master();
    await deleteLeftoverB4TestIncoterms(prisma);

    const rows = await prisma.incoterm.findMany({ orderBy: { code: 'asc' } });
    const active = rows.filter((row) => row.active);
    const codes = rows.map((row) => row.code);
    const unexpectedFromThisLoad = codes.filter(
      (code) => !ICC_INCOTERM_CODE_SET_2020.has(code) && !codesBefore.includes(code)
    );

    assert.deepEqual(codes.sort(), [...REQUIRED_CODES].sort());
    assert.equal(rows.length, 11);
    assert.equal(active.length, 11);
    assert.equal(new Set(codes).size, 11);
    assert.equal(codes.filter((code) => code === 'CIF').length, 1);
    assert.equal(codes.filter((code) => code === 'DAP').length, 1);
    assert.deepEqual(unexpectedFromThisLoad, []);

    const cif = rows.find((row) => row.code === 'CIF')!;
    const dap = rows.find((row) => row.code === 'DAP')!;
    assert.equal(cif.id, cifIdBefore);
    assert.equal(dap.id, dapIdBefore);
    assert.equal(cif.createdBy, cifCreatedByBefore);
    assert.equal(dap.createdBy, dapCreatedByBefore);
    assert.equal(cif.createdAt.toISOString(), cifCreatedAtBefore!.toISOString());
    assert.equal(dap.createdAt.toISOString(), dapCreatedAtBefore!.toISOString());
    assert.equal(cif.name, 'Cost, Insurance and Freight');
    assert.equal(dap.name, 'Delivered at Place');
    assert.equal(cif.active, true);
    assert.equal(dap.active, true);

    for (const spec of ICC_INCOTERMS_2020) {
      const row = rows.find((item) => item.code === spec.code);
      assert.ok(row, spec.code);
      assert.equal(row!.name, spec.name);
      assert.equal(row!.active, true);
      assert.equal(row!.description, ICC_INCOTERM_LOAD_DESCRIPTION);
    }

    const insertedCodes = result.inserted.map((row) => row.code).sort();
    const updatedCodes = result.updated.map((row) => row.code).sort();
    assert.equal(insertedCodes.some((code) => code === 'CIF' || code === 'DAP'), false);
    assert.equal(
      result.inserted.some((row) => row.id === cifIdBefore || row.id === dapIdBefore),
      false
    );
    for (const code of updatedCodes) {
      assert.equal(ICC_INCOTERM_CODE_SET_2020.has(code), true, code);
    }

    const listed = await listIncoterms({ active: true });
    assert.equal(listed.length, 11);
    assert.deepEqual(listed.map((row) => row.code).sort(), [...REQUIRED_CODES].sort());
  });

  it('is idempotent and does not insert unexpected codes on a second run', async () => {
    const prisma = getPrisma()!;
    const beforeSecond = await prisma.incoterm.findMany({ select: { id: true, code: true } });
    const second = await ensureIccIncoterms2020Master();
    const afterSecond = await prisma.incoterm.findMany({ select: { id: true, code: true } });
    assert.equal(second.inserted.length, 0);
    assert.equal(afterSecond.length, beforeSecond.length);
    assert.deepEqual(
      afterSecond.map((row) => `${row.id}:${row.code}`).sort(),
      beforeSecond.map((row) => `${row.id}:${row.code}`).sort()
    );
    assert.equal(afterSecond.length, 11);
  });

  it('GET /api/inquiries/:id shipmentMasters.incoterms uses listApprovedShipmentMasters and contains all 11', async () => {
    const actor = {
      id: 'u-admin-1',
      name: 'Eng. Khaled Elsewedy',
      email: 'admin@energya.com',
      userType: 'internal',
      permissions: { salesQuotations: true },
    };
    const created = await createInquiry(
      { customerName: 'ICC Incoterm Load Probe', projectName: 'ICC-INCOTERM-LOAD' },
      actor
    );
    createdInquiryId = created.id;

    const masters = await listApprovedShipmentMasters(created.customerMasterId);
    const masterCodes = masters.incoterms.filter((row) => row.active !== false).map((row) => row.code);
    assert.deepEqual([...masterCodes].sort(), [...REQUIRED_CODES].sort());
    assert.equal(masterCodes.length, 11);

    const get = await json(base, `/api/inquiries/${created.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(get.status, 200, get.body.error);
    const payloadCodes = (get.body.shipmentMasters?.incoterms || [])
      .filter((row: { active?: boolean }) => row.active !== false)
      .map((row: { code: string }) => row.code);
    assert.deepEqual([...payloadCodes].sort(), [...REQUIRED_CODES].sort());
    assert.equal(payloadCodes.length, 11);

    const prisma = getPrisma()!;
    const named = await prisma.commercialInquiry.findFirst({
      where: { inquiryNumber: 'INQ26-03447', isCurrent: true },
      select: { id: true, incoterms: true },
    });
    if (named) {
      assert.equal(named.incoterms, 'CIF');
      const namedGet = await json(base, `/api/inquiries/${named.id}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(namedGet.status, 200, namedGet.body.error);
      assert.equal(namedGet.body.inquiry.incoterms, 'CIF');
      const namedCodes = (namedGet.body.shipmentMasters?.incoterms || [])
        .filter((row: { active?: boolean }) => row.active !== false)
        .map((row: { code: string }) => row.code);
      assert.deepEqual([...namedCodes].sort(), [...REQUIRED_CODES].sort());
    }
  });

  it('does not introduce a second Incoterm table or hardcoded selectable list', () => {
    const schema = readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    assert.equal(schema.match(/^model Incoterm \{/gm)?.length, 1);
    const header = readFileSync(
      path.join(process.cwd(), 'src', 'components', 'inquiry-quotation', 'InquiryHeaderForm.tsx'),
      'utf8'
    );
    const routes = readFileSync(path.join(process.cwd(), 'src', 'server', 'commercialRoutes.ts'), 'utf8');
    assert.match(header, /incotermMasters/);
    assert.equal(header.includes("['EXW', 'FCA', 'CPT'"), false);
    assert.match(routes, /listApprovedShipmentMasters/);
    assert.equal(routes.includes('model InquiryIncoterm'), false);
  });
});
