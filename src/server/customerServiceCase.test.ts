import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import { adminIdentityRouter } from './adminIdentityRoutes';
import { adminCustomerRouter } from './adminCustomerRoutes';
import { inquiriesRouter } from './commercialRoutes';
import { customerServiceRouter } from './customerServiceRoutes';
import { seedDevelopmentUsers } from './identityService';
import { hashPassword } from '../domain/passwordService';
import { ensureCustomerServiceMasters } from './customerServiceRepository';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';

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

describe('Customer service cases — scope, visibility, commands', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  const suffix = `cs-${Date.now()}`;
  let customerAId = '';
  let customerBId = '';
  let tokenA = '';
  let tokenB = '';
  let inquiryAId = '';
  let inquiryBId = '';
  let lineAId = '';
  let caseAId = '';
  let caseANumber = '';
  let categoryId = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    await ensureCustomerServiceMasters();
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/admin', adminIdentityRouter);
    app.use('/api/admin', adminCustomerRouter);
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/customer-service', customerServiceRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;

    const admin = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@energya.com', password: process.env.ADMIN_SEED_PASSWORD || 'Admin@2026!' }),
    });
    assert.equal(admin.status, 200, admin.body.error);
    adminToken = admin.body.accessToken;

    const prisma = getPrisma()!;
    const role = await prisma.role.findUnique({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(role);
    const pass = await hashPassword('CustCs@2026!');
    const ua = await prisma.userAccount.create({
      data: {
        email: `a-${suffix}@iso.test`,
        username: `a-${suffix}`,
        fullName: 'Customer A Service',
        passwordHash: pass,
        userType: 'customer',
      },
    });
    const ub = await prisma.userAccount.create({
      data: {
        email: `b-${suffix}@iso.test`,
        username: `b-${suffix}`,
        fullName: 'Customer B Service',
        passwordHash: pass,
        userType: 'customer',
      },
    });
    await prisma.userRole.createMany({
      data: [
        { userId: ua.id, roleId: role.id },
        { userId: ub.id, roleId: role.id },
      ],
    });

    const ca = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ code: `CSA-${suffix}`, name: 'Service Customer A', type: 'EPC_CUSTOMER' }),
    });
    assert.equal(ca.status, 201, ca.body.error);
    customerAId = ca.body.customer.id;
    const cb = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ code: `CSB-${suffix}`, name: 'Service Customer B', type: 'EPC_CUSTOMER' }),
    });
    assert.equal(cb.status, 201, cb.body.error);
    customerBId = cb.body.customer.id;

    await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ customerId: customerAId, userAccountId: ua.id }),
    });
    await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ customerId: customerBId, userAccountId: ub.id }),
    });

    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ua.email, password: 'CustCs@2026!' }),
    });
    assert.equal(loginA.status, 200, loginA.body.error);
    tokenA = loginA.body.accessToken;
    const loginB = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ub.email, password: 'CustCs@2026!' }),
    });
    assert.equal(loginB.status, 200, loginB.body.error);
    tokenB = loginB.body.accessToken;

    const inqA = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ projectName: 'Service Case A', customerName: 'Service Customer A' }),
    });
    assert.equal(inqA.status, 201, inqA.body.error);
    inquiryAId = inqA.body.inquiry.id;
    const lineA = await json(base, `/api/inquiries/${inquiryAId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ cableDescription: 'LV test cable', requestedQuantity: 1, requestedLengthMeters: 1000 }),
    });
    assert.equal(lineA.status, 201, lineA.body.error);
    lineAId = lineA.body.line.id;

    const inqB = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
      body: JSON.stringify({ projectName: 'Service Case B', customerName: 'Service Customer B' }),
    });
    assert.equal(inqB.status, 201, inqB.body.error);
    inquiryBId = inqB.body.inquiry.id;

    const meta = await json(base, '/api/customer-service/meta', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(meta.status, 200, meta.body.error);
    assert.ok(Array.isArray(meta.body.categories) && meta.body.categories.length >= 15);
    categoryId = meta.body.categories.find((c: { code: string }) => c.code === 'DAMAGED_CABLE')?.id;
    assert.ok(categoryId);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.supportChatMessage.deleteMany({
        where: { session: { customerId: { in: [customerAId, customerBId] } } },
      });
      await prisma.supportChatSession.deleteMany({
        where: { customerId: { in: [customerAId, customerBId] } },
      });
      await prisma.customerServiceCase.deleteMany({
        where: { OR: [{ customerId: customerAId }, { customerId: customerBId }] },
      });
      await deleteCommercialInquiriesMatching(prisma, {
        OR: [{ id: inquiryAId }, { id: inquiryBId }],
      });
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates a case from owned inquiry/line and rejects another customer inquiry', async () => {
    const steal = await json(base, '/api/customer-service/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        subject: 'Stolen inquiry',
        description: 'Should fail',
        categoryId,
        inquiryId: inquiryBId,
      }),
    });
    assert.equal(steal.status, 403);

    const created = await json(base, '/api/customer-service/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        subject: 'Damaged outer sheath',
        description: 'Outer sheath damaged on delivery.',
        categoryId,
        inquiryId: inquiryAId,
        inquiryLineId: lineAId,
        priority: 'HIGH',
      }),
    });
    assert.equal(created.status, 201, created.body.error);
    assert.match(created.body.case.caseNumber, /^CS-\d{2}-\d{5}$/);
    assert.equal(created.body.case.inquiry.id, inquiryAId);
    assert.equal(created.body.case.inquiryLine.id, lineAId);
    caseAId = created.body.case.id;
    caseANumber = created.body.case.caseNumber;
  });

  it('blocks IDOR reads and keeps other-customer cases out of the list', async () => {
    const steal = await json(base, `/api/customer-service/cases/${caseAId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(steal.status, 403);
    const listed = await json(base, '/api/customer-service/cases', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(listed.status, 200, listed.body.error);
    assert.equal((listed.body.cases || []).some((row: { id: string }) => row.id === caseAId), false);
    const own = await json(base, `/api/customer-service/cases/${caseANumber}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(own.status, 200, own.body.error);
    assert.equal(own.body.case.id, caseAId);
  });

  it('hides INTERNAL comments from the customer and allows customer comments', async () => {
    const internal = await json(base, `/api/customer-service/cases/${caseAId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ body: 'Internal investigation cost note', visibility: 'INTERNAL' }),
    });
    assert.equal(internal.status, 201, internal.body.error);
    assert.equal(
      (internal.body.case.comments || []).some((c: { body: string }) => c.body.includes('Internal investigation')),
      true
    );

    const customerView = await json(base, `/api/customer-service/cases/${caseAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(customerView.status, 200, customerView.body.error);
    assert.equal(
      (customerView.body.case.comments || []).some((c: { body: string }) => c.body.includes('Internal investigation')),
      false
    );

    const comment = await json(base, `/api/customer-service/cases/${caseAId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ body: 'Photos will follow', visibility: 'INTERNAL' }),
    });
    assert.equal(comment.status, 201, comment.body.error);
    const customerComment = (comment.body.case.comments || []).find((c: { body: string }) => c.body === 'Photos will follow');
    assert.equal(customerComment?.visibility, 'CUSTOMER');
  });

  it('rejects customer assignment and arbitrary status, then confirm/reopen', async () => {
    const assign = await json(base, `/api/customer-service/cases/${caseAId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ department: 'QUALITY' }),
    });
    assert.equal(assign.status, 403);
    const status = await json(base, `/api/customer-service/cases/${caseAId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ status: 'CLOSED' }),
    });
    assert.equal(status.status, 403);

    const resolved = await json(base, `/api/customer-service/cases/${caseAId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        resolutionSummary: 'Replacement drums will ship next week.',
        internalNotes: 'Warranty cost 1200 USD — never show this.',
      }),
    });
    assert.equal(resolved.status, 200, resolved.body.error);
    assert.equal(resolved.body.case.status, 'RESOLVED');
    assert.equal(resolved.body.case.resolution.internalNotes, 'Warranty cost 1200 USD — never show this.');

    const customerResolved = await json(base, `/api/customer-service/cases/${caseAId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(customerResolved.body.case.resolution.resolutionSummary, 'Replacement drums will ship next week.');
    assert.equal(customerResolved.body.case.resolution.internalNotes, undefined);

    const confirm = await json(base, `/api/customer-service/cases/${caseAId}/confirm-resolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ accepted: true }),
    });
    assert.equal(confirm.status, 200, confirm.body.error);
    assert.equal(confirm.body.case.status, 'CLOSED');

    const reopen = await json(base, `/api/customer-service/cases/${caseAId}/request-reopen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(reopen.status, 200, reopen.body.error);
    assert.equal(reopen.body.case.status, 'OPEN');
  });

  it('does not list another customer inquiry on the reference endpoint', async () => {
    const refs = await json(base, '/api/customer-service/references/inquiries', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(refs.status, 200, refs.body.error);
    assert.equal((refs.body.inquiries || []).some((row: { id: string }) => row.id === inquiryBId), false);
    assert.equal((refs.body.inquiries || []).some((row: { id: string }) => row.id === inquiryAId), true);
    const stealLines = await json(base, `/api/customer-service/references/inquiries/${inquiryBId}/lines`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(stealLines.status, 403);
  });

  it('opens scripted AI chat and blocks the other customer from that session', async () => {
    const opened = await json(base, '/api/customer-service/chat?channel=AI_ASSISTANT', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(opened.status, 200, opened.body.error);
    assert.equal(opened.body.session.channel, 'AI_ASSISTANT');
    assert.ok((opened.body.session.messages || []).some((m: { body: string }) => m.body.includes('Energya Assistant')));

    const reply = await json(base, '/api/customer-service/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ channel: 'AI_ASSISTANT', body: 'What is the ampacity of 4x240?', chipId: null }),
    });
    assert.equal(reply.status, 201, reply.body.error);
    const assistant = (reply.body.session.messages || []).filter((m: { role: string }) => m.role === 'ASSISTANT').pop();
    assert.match(assistant.body, /Technical Office Engineer/);
    assert.equal(String(assistant.body).includes('4x240'), false);

    const steal = await json(base, '/api/customer-service/chat?channel=AI_ASSISTANT', {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(steal.status, 200, steal.body.error);
    assert.equal((steal.body.session.messages || []).some((m: { body: string }) => m.body.includes('4x240')), false);
  });

  it('requests an engineer by creating a Technical Support case', async () => {
    const requested = await json(base, '/api/customer-service/chat/request-engineer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ inquiryId: inquiryAId }),
    });
    assert.equal(requested.status, 201, requested.body.error);
    assert.equal(requested.body.session.engineerStatus, 'WAITING');
    assert.ok(requested.body.session.caseNumber);
    assert.match(requested.body.session.caseNumber, /^CS-\d{2}-\d{5}$/);
    const owned = await json(base, `/api/customer-service/cases/${requested.body.session.caseId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(owned.status, 200, owned.body.error);
    assert.equal(owned.body.case.caseType, 'TECHNICAL_SUPPORT');
    const steal = await json(base, `/api/customer-service/cases/${requested.body.session.caseId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(steal.status, 403);
  });
});
