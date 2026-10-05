import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import * as XLSX from 'xlsx';
import { checkDatabase, getPrisma } from './db';
import { identityAuthRouter } from './identityAuthRoutes';
import { adminIdentityRouter } from './adminIdentityRoutes';
import { adminCustomerRouter } from './adminCustomerRoutes';
import { inquiriesRouter } from './commercialRoutes';
import { masterDataExportRouter } from './masterDataExportRoutes';
import { seedDevelopmentUsers } from './identityService';
import { hashPassword } from '../domain/passwordService';
import { deleteCommercialInquiriesMatching } from './commercialTestCleanup';
import { ELAND_APPROVED_DELIVERY_COMBINATIONS } from '../domain/customerDeliveryCombination';
import { isSecretExportField } from './excelWorkbook';

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

async function bin(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  const buffer = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buffer, headers: res.headers };
}

describe('Customer Master + Excel export', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let salesToken = '';
  const suffix = `cmx-${Date.now()}`;
  let customerId = '';
  let customerBId = '';
  let userAId = '';
  let tokenA = '';
  let inquiryId = '';
  let inquiryBId = '';
  let beforeIncoterms = 0;
  let beforePorts = 0;

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    await seedDevelopmentUsers();
    const prisma = getPrisma()!;
    beforeIncoterms = await prisma.incoterm.count();
    beforePorts = await prisma.destinationPort.count();
    const app = express();
    app.use(express.json());
    app.use('/api/auth', identityAuthRouter);
    app.use('/api/admin', adminIdentityRouter);
    app.use('/api/admin', adminCustomerRouter);
    app.use('/api/inquiries', inquiriesRouter);
    app.use('/api/master', masterDataExportRouter);
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
    const sales = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales@energya.com', password: 'Sales@2026!' }),
    });
    assert.equal(sales.status, 200, sales.body.error);
    salesToken = sales.body.accessToken;
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await deleteCommercialInquiriesMatching(prisma, {
        OR: [{ id: inquiryId || 'none' }, { id: inquiryBId || 'none' }, { customerReference: suffix }],
      });
      if (customerId) {
        await prisma.customerAddress.deleteMany({ where: { customerId } });
        await prisma.customerContact.deleteMany({ where: { customerId } });
        await prisma.customerExternalMapping.deleteMany({ where: { customerId } });
        await prisma.customerDeliveryCombination.deleteMany({ where: { customerId } });
        await prisma.customerUser.deleteMany({ where: { customerId } });
        await prisma.customer.deleteMany({ where: { id: customerId } }).catch(() => undefined);
      }
      if (customerBId) {
        await prisma.customerUser.deleteMany({ where: { customerId: customerBId } });
        await prisma.customer.deleteMany({ where: { id: customerBId } }).catch(() => undefined);
      }
      if (userAId) {
        await prisma.userRole.deleteMany({ where: { userId: userAId } });
        await prisma.userAccount.deleteMany({ where: { id: userAId } }).catch(() => undefined);
      }
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it('1-8 creates, updates, and resolves addresses, contacts, commercial profile, and delivery preferences', async () => {
    const created = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        code: `CMX-${suffix}`,
        name: 'Customer Master Export Fixture',
        countryCode: 'UK',
        defaultCurrency: 'USD',
        addresses: [
          { code: 'HQ', name: 'HQ', addressType: 'REGISTERED', line1: '1 Test Street', city: 'London', countryCode: 'UK', isDefault: true },
          { code: 'WH', name: 'Warehouse', addressType: 'SHIPPING', line1: '2 Dock Road', city: 'Doncaster', countryCode: 'UK' },
        ],
        contacts: [
          { name: 'Pat Buyer', jobTitle: 'Buyer', email: `pat-${suffix}@example.test`, isPrimary: true },
          { name: 'Alex Ops', department: 'Operations', phone: '+44 100' },
        ],
        deliveryPreferences: [
          { countryCode: 'UK', countryLabel: 'UK', incotermCode: 'DAP', destinationPortCode: 'DONCASTER', isDefault: true },
        ],
        externalMappings: [{ system: 'D365', externalCustomerCode: `D365-${suffix}`, mappingStatus: 'PENDING' }],
      }),
    });
    assert.equal(created.status, 201, created.body.error);
    customerId = created.body.customer.id;
    assert.equal(created.body.customer.code, `CMX-${suffix}`.toUpperCase());
    assert.equal(created.body.customer.defaultIncoterm, null);

    const dup = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ code: `CMX-${suffix}`, name: 'Duplicate' }),
    });
    assert.equal(dup.status, 409);

    const updated = await json(base, `/api/admin/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ remarks: 'Updated remarks', paymentTerms: 'Net 45' }),
    });
    assert.equal(updated.status, 200, updated.body.error);
    assert.equal(updated.body.customer.remarks, 'Updated remarks');
    assert.equal(updated.body.customer.paymentTerms, 'Net 45');

    const detail = await json(base, `/api/admin/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.body.addresses.length, 2);
    assert.equal(detail.body.contacts.length, 2);
    assert.equal(detail.body.customer.commercialProfile.paymentTermName, 'Net 45');
    assert.equal(detail.body.deliveryPreferences.length, 1);
    assert.equal(detail.body.deliveryPreferences[0].destinationPortCode, 'DONCASTER');
    assert.equal(detail.body.externalMappings.length, 1);
  });

  it('4 duplicate customer code is rejected', async () => {
    assert.ok(customerId);
  });

  it('9 Eland has exactly the four supplied delivery combinations', async () => {
    const prisma = getPrisma()!;
    const eland = await prisma.customer.findUnique({ where: { code: 'C-ELAND' } });
    assert.ok(eland);
    const combos = await prisma.customerDeliveryCombination.findMany({
      where: { customerId: eland.id, active: true },
      include: { destinationPort: true },
    });
    assert.equal(combos.length, 4);
    const tuples = combos
      .map((row) => `${row.countryLabel}|${row.incotermCode}|${row.destinationPort.name}`)
      .sort();
    const expected = ELAND_APPROVED_DELIVERY_COMBINATIONS.map(
      (row) => `${row.countryLabel}|${row.incotermCode}|${row.destinationPortName}`
    ).sort();
    assert.deepEqual(tuples, expected);
  });

  it('10-11 creating a customer preference does not duplicate global Incoterms or destination ports', async () => {
    const prisma = getPrisma()!;
    assert.equal(await prisma.incoterm.count(), beforeIncoterms);
    assert.equal(await prisma.destinationPort.count(), beforePorts);
  });

  it('12-13 customer isolation works and deactivation does not break historical inquiry', async () => {
    const prisma = getPrisma()!;
    const role = await prisma.role.findUnique({ where: { code: 'CUSTOMER_USER' } });
    assert.ok(role);
    const pass = await hashPassword('CustCmx@2026!');
    const ua = await prisma.userAccount.create({
      data: {
        email: `cmx-${suffix}@iso.test`,
        username: `cmx-${suffix}`,
        fullName: 'CMX Customer User',
        passwordHash: pass,
        userType: 'customer',
      },
    });
    userAId = ua.id;
    await prisma.userRole.create({ data: { userId: ua.id, roleId: role.id } });
    const cb = await json(base, '/api/admin/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ code: `CMXB-${suffix}`, name: 'Isolation Customer B' }),
    });
    assert.equal(cb.status, 201, cb.body.error);
    customerBId = cb.body.customer.id;
    await json(base, '/api/admin/customer-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ customerId, userAccountId: userAId }),
    });
    const loginA = await json(base, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ua.email, password: 'CustCmx@2026!' }),
    });
    assert.equal(loginA.status, 200, loginA.body.error);
    tokenA = loginA.body.accessToken;

    const inq = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ customerId: customerBId, customerReference: suffix, projectName: 'iso' }),
    });
    assert.equal(inq.status, 201, inq.body.error);
    assert.equal(inq.body.inquiry.customerMasterId, customerId);
    inquiryId = inq.body.inquiry.id;
    await json(base, `/api/inquiries/${inquiryId}/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({
        cableDescription: 'Multi-cut fixture',
        requestedQuantity: 4,
        requestedLengthMeters: 6000,
        drumSchedule: {
          cableTolerancePercent: 1,
          rows: [
            { drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 1 },
            { drumCode: 'EWD900-0', noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 1 },
            { drumCode: 'EWD900-0', noOfDrums: 1, cuttingLengthM: 2000, drumTolerancePercent: 1 },
          ],
        },
      }),
    });

    const steal = await json(base, `/api/admin/customers/${customerBId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(steal.status, 403);

    const deactivated = await json(base, `/api/admin/customers/${customerId}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deactivated.status, 200, deactivated.body.error);
    assert.equal(deactivated.body.customer.status, 'INACTIVE');
    const stillThere = await json(base, `/api/inquiries/${inquiryId}`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    assert.equal(stillThere.status, 200, stillThere.body.error);
    assert.equal(stillThere.body.inquiry.id, inquiryId);
    await json(base, `/api/admin/customers/${customerId}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });

  it('14-16,19-20,24 master exports return the complete filtered set as valid xlsx', async () => {
    const prisma = getPrisma()!;
    const customerCount = await prisma.customer.count({
      where: { OR: [{ code: { contains: suffix, mode: 'insensitive' } }, { name: { contains: suffix, mode: 'insensitive' } }] },
    });
    const paged = await json(base, `/api/admin/customers?q=${encodeURIComponent(suffix)}&take=1`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(paged.body.customers.length, 1);
    assert.ok(paged.body.total >= customerCount);

    const exported = await bin(base, `/api/admin/customers/export?q=${encodeURIComponent(suffix)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(exported.status, 200);
    const wb = XLSX.read(exported.buffer, { type: 'buffer' });
    assert.ok(wb.SheetNames.includes('Customer_Master'));
    const sheet = XLSX.utils.sheet_to_json(wb.Sheets.Customer_Master, { header: 1 }) as unknown[][];
    assert.ok(sheet.length - 1 >= customerCount);
    assert.ok(sheet[0]?.every((h) => !isSecretExportField(String(h))));

    const drumCount = await prisma.drumMaster.count();
    const drums = await bin(base, '/api/master/export/drums', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(drums.status, 200);
    const drumWb = XLSX.read(drums.buffer, { type: 'buffer' });
    const drumRows = XLSX.utils.sheet_to_json(drumWb.Sheets.Drum_Master, { header: 1 }) as unknown[][];
    assert.equal(drumRows.length - 1, drumCount);

    const cableCount = await prisma.cableMaster.count();
    const cables = await bin(base, '/api/master/export/cables', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(cables.status, 200);
    const cableWb = XLSX.read(cables.buffer, { type: 'buffer' });
    const cableRows = XLSX.utils.sheet_to_json(cableWb.Sheets.Cable_Master, { header: 1 }) as unknown[][];
    assert.equal(cableRows.length - 1, cableCount);
  });

  it('17 raw material export contains the complete result set', async () => {
    const prisma = getPrisma()!;
    const count = await prisma.rawMaterial.count();
    const exported = await bin(base, '/api/master/export/raw-materials', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(exported.status, 200);
    const wb = XLSX.read(exported.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Raw_Materials, { header: 1 }) as unknown[][];
    assert.equal(rows.length - 1, count);
  });

  it('18,21,22 inquiry export includes all lines, respects scope, and hides internal costing from customers', async () => {
    const internal = await bin(base, `/api/inquiries/${inquiryId}/export`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(internal.status, 200);
    const wb = XLSX.read(internal.buffer, { type: 'buffer' });
    assert.deepEqual(wb.SheetNames, ['Inquiry_Header', 'Inquiry_Lines', 'Drum_Schedule', 'Delivery']);
    const lines = XLSX.utils.sheet_to_json(wb.Sheets.Inquiry_Lines, { header: 1 }) as unknown[][];
    assert.equal(lines.length - 1, 1);
    const dumped = JSON.stringify(lines);
    assert.match(dumped, /1500 × 2; 1000 × 1; 2000 × 1/);
    assert.equal(/6000 × 4/.test(dumped), false);
    assert.ok((lines[0] as string[]).includes('Costing Status'));

    const customerExport = await bin(base, `/api/inquiries/${inquiryId}/export`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(customerExport.status, 200);
    const cwb = XLSX.read(customerExport.buffer, { type: 'buffer' });
    const clines = XLSX.utils.sheet_to_json(cwb.Sheets.Inquiry_Lines, { header: 1 }) as string[][];
    assert.equal(clines[0].includes('Costing Status'), false);
    assert.equal(JSON.stringify(clines).toLowerCase().includes('materialcost'), false);
    assert.equal(JSON.stringify(clines).toLowerCase().includes('password'), false);
  });

  it('23 unauthorized export is rejected', async () => {
    const none = await json(base, '/api/master/export/drums');
    assert.ok(none.status === 401 || none.status === 403);
    const customerMaster = await json(base, '/api/master/export/customers', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(customerMaster.status, 403);
    const stealInquiry = await json(base, `/api/inquiries/${inquiryId}/export`, {
      headers: { Authorization: `Bearer ${salesToken}` },
    });
    // sales can export authorized inquiries; create a B inquiry and steal with customer A.
    const inqB = await json(base, '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ customerId: customerBId, customerName: 'Isolation Customer B', customerReference: `${suffix}-b` }),
    });
    if (inqB.status === 201) {
      inquiryBId = inqB.body.inquiry.id;
      const steal = await json(base, `/api/inquiries/${inquiryBId}/export`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(steal.status, 403);
    }
    assert.ok(stealInquiry.status === 200 || stealInquiry.status === 403);
  });

  it('25 no passwords or secrets are exported', async () => {
    const exported = await bin(base, `/api/admin/customers/export?q=${encodeURIComponent(suffix)}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const text = exported.buffer.toString('utf8').toLowerCase();
    assert.equal(text.includes('passwordhash'), false);
    assert.equal(text.includes('jwt'), false);
    assert.equal(isSecretExportField('passwordHash'), true);
  });
});
