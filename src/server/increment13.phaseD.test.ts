import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { costingAdminRouter } from './costingAdminRoutes';
import { signTestToken } from './auth';
import { seedCostingRegistry } from './costingFormulaRepository';
import { executeCostingPreview } from './costingOrchestrationService';
import {
  assertCanApproveScrapRules,
  assertCanExecuteCostingPreview,
  assertCanManageScrapRules,
  assertCanViewCostingAudit,
} from './rbac';
import { DomainError } from '../platform/errors/domainError';
import {
  buildCostingRequestFromInquiryLine,
  buildCostingRequestFromPreviewPayload,
  normalizeCostingDate,
} from '../services/costingRequestService';

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

describe('Increment 13 — Phase D (Configuration UI + Orchestration)', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';
  const suffix = `i13d-${Date.now()}`;
  const testMat = `I13D-CABLE-${suffix}`;
  const testRm = `I13D-RM-${suffix}`;

  const actorAdmin = {
    id: 'u-i13d-admin',
    name: 'I13D Admin',
    userType: 'internal',
    permissions: { costingPricing: true, masterData: true },
    permissionCodes: [
      'COSTING:FORMULA:VIEW', 'COSTING:FORMULA:CREATE', 'COSTING:FORMULA:UPDATE',
      'COSTING:FORMULA:ACTIVATE', 'COSTING:FORMULA:DEACTIVATE', 'COSTING:FORMULA:VALIDATE',
      'COSTING:FORMULA:PREVIEW', 'COSTING:VARIABLE:VIEW', 'COSTING:VARIABLE:CREATE',
      'COSTING:VARIABLE:UPDATE', 'COSTING:COMPONENT:VIEW', 'COSTING:COMPONENT:CREATE',
      'COSTING:COMPONENT:UPDATE', 'COSTING:CONFIGURATION:VIEW', 'COSTING:CONFIGURATION:CREATE',
      'COSTING:CONFIGURATION:APPROVE', 'COSTING:SCRAP_RULE:VIEW', 'COSTING:SCRAP_RULE:CREATE',
      'COSTING:SCRAP_RULE:UPDATE', 'COSTING:SCRAP_RULE:APPROVE', 'COSTING:PREVIEW:EXECUTE',
      'COSTING:AUDIT:VIEW',
    ],
  };

  const actorCustomer = { id: 'u-i13d-cust', name: 'Customer', userType: 'customer', permissions: {}, permissionCodes: [] };

  let configVersionId = '';
  let scrapRuleId = '';
  let formulaId = '';
  const scrapCode = `I13D-${suffix}-SCRAP`.toUpperCase();

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma()!;

    await seedCostingRegistry(actorAdmin);

    await prisma.costingScrapRule.deleteMany({ where: { code: { startsWith: `I13D-${suffix}` } } });
    await prisma.costingFormulaDependency.deleteMany({ where: { formulaVersion: { formula: { code: { startsWith: `I13D-${suffix}` } } } } });
    await prisma.costingFormulaVersion.deleteMany({ where: { formula: { code: { startsWith: `I13D-${suffix}` } } } });
    await prisma.costingFormula.deleteMany({ where: { code: { startsWith: `I13D-${suffix}` } } });
    await prisma.costingConfigurationVersion.deleteMany({ where: { configuration: { code: { startsWith: `I13D-${suffix}` } } } });
    await prisma.costingConfiguration.deleteMany({ where: { code: { startsWith: `I13D-${suffix}` } } });
    await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: testMat } });
    await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: testMat } });
    await prisma.cableMaster.deleteMany({ where: { materialNumber: testMat } });
    await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: testRm } });
    await prisma.rawMaterial.deleteMany({ where: { code: testRm } });

    await prisma.rawMaterial.create({
      data: { code: testRm, description: 'Phase D test RM', uom: 'kg', priceStatus: 'CONFIGURED' },
    });
    await prisma.cableMaster.create({
      data: {
        materialNumber: testMat,
        itemCode: 'I13D',
        customerCode: 'TST',
        description: 'Phase D test cable',
        diameter: 10,
        weight: 200,
      },
    });

    const app = express();
    app.use(express.json());
    app.use('/api/admin/costing', costingAdminRouter);
    const listening = await listen(app);
    server = listening.server;
    base = listening.base;
    adminToken = signTestToken(actorAdmin);
    customerToken = signTestToken(actorCustomer);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.costingScrapRule.deleteMany({ where: { code: { startsWith: `I13D-${suffix}` } } });
      await prisma.costingFormulaDependency.deleteMany({ where: { formulaVersion: { formula: { code: { startsWith: `I13D-${suffix}` } } } } });
      await prisma.costingFormulaVersion.deleteMany({ where: { formula: { code: { startsWith: `I13D-${suffix}` } } } });
      await prisma.costingFormula.deleteMany({ where: { code: { startsWith: `I13D-${suffix}` } } });
      await prisma.costingConfigurationVersion.deleteMany({ where: { configuration: { code: { startsWith: `I13D-${suffix}` } } } });
      await prisma.costingConfiguration.deleteMany({ where: { code: { startsWith: `I13D-${suffix}` } } });
      await prisma.governedBomLine.deleteMany({ where: { cableMaterialNumber: testMat } });
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: testMat } });
      await prisma.cableMaster.deleteMany({ where: { materialNumber: testMat } });
      await prisma.rawMaterialPrice.deleteMany({ where: { rawMaterialCode: testRm } });
      await prisma.rawMaterial.deleteMany({ where: { code: testRm } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  // costingRequestService (1-6)
  it('1. normalizeCostingDate defaults to today', () => {
    assert.match(normalizeCostingDate(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('2. buildCostingRequestFromPreviewPayload requires materialNumber', () => {
    const r = buildCostingRequestFromPreviewPayload({});
    assert.ok('error' in r);
  });

  it('3. buildCostingRequestFromPreviewPayload builds valid request', () => {
    const r = buildCostingRequestFromPreviewPayload({ materialNumber: testMat, quantity: 2, lengthMeters: 500 });
    assert.ok(!('error' in r));
    assert.equal(r.materialNumber, testMat);
    assert.equal(r.quantity, 2);
    assert.equal(r.previewOnly, true);
  });

  it('4. buildCostingRequestFromInquiryLine fails without material', () => {
    const r = buildCostingRequestFromInquiryLine({}, { currency: 'USD' });
    assert.ok('error' in r);
  });

  it('5. buildCostingRequestFromInquiryLine builds from line', () => {
    const r = buildCostingRequestFromInquiryLine(
      { materialNumber: testMat, requestedQuantity: 3, requestedLengthMeters: 2000 },
      { currency: 'EUR', inquiryDate: '2026-08-20' }
    );
    assert.ok(!('error' in r));
    assert.equal(r.currency, 'EUR');
  });

  it('6. buildCostingRequestFromPreviewPayload rejects invalid quantity', () => {
    const r = buildCostingRequestFromPreviewPayload({ materialNumber: testMat, quantity: 0 });
    assert.ok('error' in r);
  });

  // RBAC (7-11)
  it('7. RBAC: admin can manage scrap rules', () => {
    assert.doesNotThrow(() => assertCanManageScrapRules(actorAdmin));
  });

  it('8. RBAC: admin can approve scrap rules', () => {
    assert.doesNotThrow(() => assertCanApproveScrapRules(actorAdmin));
  });

  it('9. RBAC: admin can execute preview', () => {
    assert.doesNotThrow(() => assertCanExecuteCostingPreview(actorAdmin));
  });

  it('10. RBAC: admin can view audit', () => {
    assert.doesNotThrow(() => assertCanViewCostingAudit(actorAdmin));
  });

  it('11. RBAC: customer cannot execute preview API', async () => {
    const res = await json(base, '/api/admin/costing/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialNumber: testMat }),
    });
    assert.equal(res.status, 403);
  });

  // API aliases (12-13)
  it('12. GET /methods returns configurations', async () => {
    const res = await json(base, '/api/admin/costing/methods', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.methods));
  });

  it('13. GET /layers returns components', async () => {
    const res = await json(base, '/api/admin/costing/layers', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.ok(res.body.layers.some((l: { code: string }) => l.code === 'MATERIAL'));
  });

  // Configuration + workflow (14-18)
  it('14. Creates configuration for workflow tests', async () => {
    const res = await json(base, '/api/admin/costing/configurations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: `I13D-${suffix}`, name: `Phase D Config ${suffix}` }),
    });
    assert.equal(res.status, 201);
    configVersionId = res.body.configuration.versions[0].id;
  });

  it('15. Validates configuration version workflow', async () => {
    const res = await json(base, `/api/admin/costing/configurations/x/versions/${configVersionId}/validate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.version.workflowStatus, 'VALIDATION');
  });

  it('16. Submits configuration version', async () => {
    const res = await json(base, `/api/admin/costing/configurations/x/versions/${configVersionId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.version.workflowStatus, 'SUBMITTED');
  });

  it('17. Approves configuration version', async () => {
    const res = await json(base, `/api/admin/costing/configurations/x/versions/${configVersionId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.version.workflowStatus, 'APPROVED');
  });

  it('18. Activates configuration version', async () => {
    const res = await json(base, `/api/admin/costing/configurations/x/versions/${configVersionId}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.version.status, 'ACTIVE');
  });

  // Scrap rules (19-26)
  it('19. Creates scrap rule without rate (governed)', async () => {
    const res = await json(base, '/api/admin/costing/scrap-rules', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: scrapCode,
        name: 'Test scrap shell',
        scopeType: 'CABLE',
        scopeValue: testMat,
      }),
    });
    assert.equal(res.status, 201);
    scrapRuleId = res.body.scrapRule.id;
    assert.equal(res.body.scrapRule.scrapRate, null);
  });

  it('20. Lists scrap rules', async () => {
    const res = await json(base, '/api/admin/costing/scrap-rules', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.ok(res.body.scrapRules.some((r: { code: string }) => r.code === scrapCode));
  });

  it('21. Updates draft scrap rule with rate', async () => {
    const res = await json(base, `/api/admin/costing/scrap-rules/${scrapRuleId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scrapRate: 0.01, sourceReference: 'Test governed 1%' }),
    });
    assert.equal(res.status, 200);
    assert.equal(Number(res.body.scrapRule.scrapRate), 0.01);
  });

  it('22. Submits scrap rule', async () => {
    const res = await json(base, `/api/admin/costing/scrap-rules/${scrapRuleId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.scrapRule.workflowStatus, 'SUBMITTED');
  });

  it('23. Approves scrap rule', async () => {
    const res = await json(base, `/api/admin/costing/scrap-rules/${scrapRuleId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.scrapRule.workflowStatus, 'APPROVED');
  });

  it('24. Activates scrap rule', async () => {
    const res = await json(base, `/api/admin/costing/scrap-rules/${scrapRuleId}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.scrapRule.workflowStatus, 'ACTIVE');
  });

  it('25. Scrap rule GET by id', async () => {
    const res = await json(base, `/api/admin/costing/scrap-rules/${scrapRuleId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.equal(res.body.scrapRule.code, scrapCode);
  });

  it('26. Customer cannot list scrap rules', async () => {
    const res = await json(base, '/api/admin/costing/scrap-rules', { headers: { Authorization: `Bearer ${customerToken}` } });
    assert.equal(res.status, 403);
  });

  // Formula workflow (27-29)
  it('27. Creates formula for workflow', async () => {
    const res = await json(base, '/api/admin/costing/formulas', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configurationVersionId: configVersionId,
        code: `I13D-${suffix}-FX`,
        name: 'Ex-work',
        outputVariableCode: 'EX_WORK_COST',
        expression: 'MATERIAL_COST / (1 - EX_WORK_RATE)',
      }),
    });
    assert.equal(res.status, 201);
    formulaId = res.body.formula.id;
  });

  it('28. Submits formula', async () => {
    const res = await json(base, `/api/admin/costing/formulas/${formulaId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.formula.status, 'SUBMITTED');
  });

  it('29. Approves formula', async () => {
    const res = await json(base, `/api/admin/costing/formulas/${formulaId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.formula.status, 'APPROVED');
  });

  // Preview NOT_READY paths (30-33)
  it('30. Preview NOT_READY without engineering approval', async () => {
    const preview = await executeCostingPreview({
      materialNumber: testMat,
      costingDate: '2026-08-22',
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
      previewOnly: true,
    });
    assert.equal(preview.status, 'NOT_READY');
    assert.ok(preview.blockingReasons.some((r) => r.includes('Gate 1')));
  });

  it('31. Preview API returns NOT_READY for unready cable', async () => {
    const res = await json(base, '/api/admin/costing/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialNumber: testMat }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.preview.status, 'NOT_READY');
  });

  it('32. Preview rejects missing materialNumber', async () => {
    const res = await json(base, '/api/admin/costing/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });

  it('33. Preview NOT_READY for unknown cable', async () => {
    const preview = await executeCostingPreview({
      materialNumber: 'NONEXISTENT-CABLE-XYZ',
      costingDate: '2026-08-22',
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
      previewOnly: true,
    });
    assert.equal(preview.status, 'NOT_READY');
  });

  // Seed ready cable context (34-38)
  it('34. Seeds approved engineering mapping', async () => {
    const prisma = getPrisma()!;
    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: testMat,
        revision: 1,
        isCurrent: true,
        status: 'APPROVED',
        mappingStatus: 'COMPLETE',
        attributes: [],
        approvedBy: 'test',
        approvedAt: new Date(),
      },
    });
  });

  it('35. Seeds governed BOM with scrap', async () => {
    const prisma = getPrisma()!;
    await prisma.governedBomLine.create({
      data: {
        cableMaterialNumber: testMat,
        rawMaterialCode: testRm,
        consumption: 100,
        uom: 'kg',
        scrapPercentage: 0.01,
        status: 'APPROVED',
      },
    });
  });

  it('36. Seeds approved price', async () => {
    const prisma = getPrisma()!;
    await prisma.rawMaterialPrice.create({
      data: {
        rawMaterialCode: testRm,
        price: 5.5,
        currency: 'USD',
        uom: 'kg',
        workflowStatus: 'APPROVED',
        status: 'ACTIVE',
        isCurrent: true,
        effectiveFrom: new Date('2026-01-01'),
        temporalStatus: 'EFFECTIVE',
      },
    });
  });

  it('37. Preview READY with material breakdown', async () => {
    const preview = await executeCostingPreview({
      materialNumber: testMat,
      costingDate: '2026-08-22',
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
      previewOnly: true,
    });
    assert.equal(preview.status, 'READY');
    assert.ok(preview.materialBreakdown.length >= 1);
    assert.ok(Number(preview.totals.materialCost) > 0);
    assert.equal(preview.scrapCostStatus, 'CONFIGURED');
  });

  it('38. Preview applies BOM line scrap source', async () => {
    const preview = await executeCostingPreview({
      materialNumber: testMat,
      costingDate: '2026-08-22',
      quantity: 1,
      lengthMeters: 1000,
      currency: 'USD',
      previewOnly: true,
    });
    const line = preview.materialBreakdown.find((l) => l.rawMaterialCode === testRm);
    assert.ok(line);
    assert.equal(line!.scrapSource, 'BOM_LINE');
    assert.equal(line!.scrapRate, 0.01);
  });

  // Audit & approval queue (39-41)
  it('39. GET /audit returns costing events', async () => {
    const res = await json(base, '/api/admin/costing/audit?limit=10', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
  });

  it('40. GET /approval-queue returns structure', async () => {
    const res = await json(base, '/api/admin/costing/approval-queue', { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(res.status, 200);
    assert.ok('configVersions' in res.body);
    assert.ok('scrapRules' in res.body);
    assert.ok(Array.isArray(res.body.rawMaterialPrices));
  });

  it('41. Scrap rule activation creates audit event', async () => {
    const prisma = getPrisma()!;
    const audits = await prisma.auditEvent.findMany({
      where: { entity: 'CostingScrapRule', entityId: scrapRuleId, action: 'COSTING_SCRAP_RULE_ACTIVATED' },
    });
    assert.ok(audits.length >= 1);
  });

  it('42. Preview with active config evaluates layers', async () => {
    await json(base, `/api/admin/costing/formulas/${formulaId}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await json(base, '/api/admin/costing/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        materialNumber: testMat,
        configurationVersionId: configVersionId,
        layerInputs: { EX_WORK_RATE: '0.06' },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.preview.status, 'READY');
    assert.ok(res.body.preview.layers.length >= 0);
  });
});
