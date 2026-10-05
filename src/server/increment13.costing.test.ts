import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import http from 'node:http';
import express from 'express';
import dotenv from 'dotenv';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';
import { costingAdminRouter } from './costingAdminRoutes';
import { signTestToken } from './auth';
import { seedCostingRegistry } from './costingFormulaRepository';
import {
  assertCanManageCostingFormulas,
  assertCanPreviewCostingFormula,
  assertCanViewCostingFormulas,
} from './rbac';
import { DomainError } from '../platform/errors/domainError';

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

describe('Increment 13 — Costing Formula Engine (Phase B+C)', () => {
  let base = '';
  let server: http.Server;
  let adminToken = '';
  let customerToken = '';
  const suffix = `i13-${Date.now()}`;

  const actorAdmin = {
    id: 'u-i13-admin',
    name: 'I13 Admin',
    userType: 'internal',
    permissions: { costingPricing: true, masterData: true },
    permissionCodes: [
      'COSTING:FORMULA:VIEW',
      'COSTING:FORMULA:CREATE',
      'COSTING:FORMULA:UPDATE',
      'COSTING:FORMULA:ACTIVATE',
      'COSTING:FORMULA:DEACTIVATE',
      'COSTING:FORMULA:VALIDATE',
      'COSTING:FORMULA:PREVIEW',
      'COSTING:VARIABLE:VIEW',
      'COSTING:VARIABLE:CREATE',
      'COSTING:VARIABLE:UPDATE',
      'COSTING:COMPONENT:VIEW',
      'COSTING:COMPONENT:CREATE',
      'COSTING:COMPONENT:UPDATE',
      'COSTING:CONFIGURATION:VIEW',
      'COSTING:CONFIGURATION:CREATE',
      'COSTING:CONFIGURATION:APPROVE',
    ],
  };

  const actorCustomer = {
    id: 'u-i13-cust',
    name: 'Customer User',
    userType: 'customer',
    permissions: { costingPricing: false },
    permissionCodes: [],
  };

  let configVersionId = '';
  let formulaId = '';

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);

    await seedCostingRegistry(actorAdmin);

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
      await prisma.costingFormulaDependency.deleteMany({ where: { formulaVersion: { formula: { code: { startsWith: `I13-${suffix}` } } } } });
      await prisma.costingFormulaVersion.deleteMany({ where: { formula: { code: { startsWith: `I13-${suffix}` } } } });
      await prisma.costingFormula.deleteMany({ where: { code: { startsWith: `I13-${suffix}` } } });
      await prisma.costingConfigurationVersion.deleteMany({ where: { configuration: { code: { startsWith: `I13-${suffix}` } } } });
      await prisma.costingConfiguration.deleteMany({ where: { code: { startsWith: `I13-${suffix}` } } });
      await prisma.auditEvent.deleteMany({ where: { entity: { in: ['CostingFormula', 'CostingConfiguration', 'CostingVariable'] }, message: { contains: suffix } } });
    }
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    await disconnectPrisma();
  });

  it('24. RBAC: admin can view costing formulas', () => {
    assert.doesNotThrow(() => assertCanViewCostingFormulas(actorAdmin));
  });

  it('25. RBAC: customer cannot view costing formulas', () => {
    assert.throws(() => assertCanViewCostingFormulas(actorCustomer), DomainError);
  });

  it('26. RBAC: customer API request returns 403', async () => {
    const res = await json(base, '/api/admin/costing/variables', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    assert.equal(res.status, 403);
  });

  it('27. Lists seeded system variables including MATERIAL_COST and EX_WORK_RATE', async () => {
    const res = await json(base, '/api/admin/costing/variables', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const codes = res.body.variables.map((v: { code: string }) => v.code);
    assert.ok(codes.includes('MATERIAL_COST'));
    assert.ok(codes.includes('EX_WORK_RATE'));
    assert.ok(codes.includes('EX_WORK_COST'));
  });

  it('28. Lists seeded EX_WORK component (configurable, not hard-coded)', async () => {
    const res = await json(base, '/api/admin/costing/components', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    const exWork = res.body.components.find((c: { code: string }) => c.code === 'EX_WORK');
    assert.ok(exWork);
    assert.equal(exWork.kind, 'EX_WORK');
    assert.equal(exWork.isConfigurable, true);
  });

  it('29. Creates costing configuration with initial version', async () => {
    const res = await json(base, '/api/admin/costing/configurations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: `I13-${suffix}`, name: `I13 Test Config ${suffix}` }),
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.configuration.versions?.length >= 1);
    configVersionId = res.body.configuration.versions[0].id;
  });

  it('30. Validates ex-work formula expression', async () => {
    const res = await json(base, '/api/admin/costing/formulas/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expression: 'MATERIAL_COST / (1 - EX_WORK_RATE)',
        outputVariable: 'EX_WORK_COST',
        configurationVersionId: configVersionId,
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    assert.ok(res.body.dependencies.includes('MATERIAL_COST'));
    assert.ok(res.body.dependencies.includes('EX_WORK_RATE'));
  });

  it('31. Rejects unknown variable in validate', async () => {
    const res = await json(base, '/api/admin/costing/formulas/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression: 'FAKE_VAR + 1' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.valid, false);
    assert.ok(res.body.errors.some((e: { code: string }) => e.code === 'UNKNOWN_VARIABLE'));
  });

  it('32. Preview evaluates without persisting', async () => {
    const prisma = getPrisma()!;
    const beforeCount = await prisma.costingFormula.count();

    const res = await json(base, '/api/admin/costing/formulas/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expression: 'MATERIAL_COST / (1 - EX_WORK_RATE)',
        outputVariable: 'EX_WORK_COST',
        variableValues: { MATERIAL_COST: '1000', EX_WORK_RATE: '0.06' },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.valid, true);
    assert.ok(Number(res.body.result) > 1063);

    const afterCount = await prisma.costingFormula.count();
    assert.equal(beforeCount, afterCount, 'Preview must not create formula records');
  });

  it('33. Creates formula with dependencies', async () => {
    const res = await json(base, '/api/admin/costing/formulas', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configurationVersionId: configVersionId,
        code: `I13-${suffix}-EXWORK`,
        name: 'Ex-Work Loading Formula',
        outputVariableCode: 'EX_WORK_COST',
        expression: 'MATERIAL_COST / (1 - EX_WORK_RATE)',
      }),
    });
    assert.equal(res.status, 201);
    formulaId = res.body.formula.id;
    assert.ok(res.body.formula.versions[0].dependencies.length >= 2);
  });

  it('34. Activates formula and creates audit event', async () => {
    const res = await json(base, '/api/admin/costing/formulas/' + formulaId + '/activate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.formula.status, 'ACTIVE');

    const prisma = getPrisma()!;
    const audits = await prisma.auditEvent.findMany({
      where: { entity: 'CostingFormula', entityId: formulaId, action: 'COSTING_FORMULA_ACTIVATED' },
    });
    assert.ok(audits.length >= 1);
  });

  it('35. Deactivates formula', async () => {
    const res = await json(base, '/api/admin/costing/formulas/' + formulaId + '/deactivate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.formula.status, 'INACTIVE');
  });

  it('36. Rejects malicious expression in validate', async () => {
    const res = await json(base, '/api/admin/costing/formulas/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression: 'eval("1+1")' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.valid, false);
    assert.ok(res.body.errors.some((e: { code: string }) => e.code === 'INVALID_SYNTAX'));
  });

  it('37. RBAC preview permission check', () => {
    assert.doesNotThrow(() => assertCanPreviewCostingFormula(actorAdmin));
    assert.throws(() => assertCanPreviewCostingFormula(actorCustomer), DomainError);
  });

  it('38. RBAC manage formulas permission', () => {
    assert.doesNotThrow(() => assertCanManageCostingFormulas(actorAdmin));
  });

  it('39. Creates custom variable in registry', async () => {
    const varCode = `I13_TEST_${suffix.replace(/-/g, '_')}`;
    const res = await json(base, '/api/admin/costing/variables', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: varCode,
        name: 'Test Variable',
        kind: 'INPUT',
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.variable.code, varCode.toUpperCase());
  });

  it('40. Activates configuration version', async () => {
    const res = await json(base, `/api/admin/costing/configurations/x/versions/${configVersionId}/activate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.version.status, 'ACTIVE');
  });
});
