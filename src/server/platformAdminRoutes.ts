import { Router } from 'express';
import { resolveRequestActor } from './auth';
import { DomainError } from '../platform/errors/domainError';
import { assertCanManageCostingConfiguration, assertCanManagePlatformMetadata, assertCanViewCostingFormulas, assertCanViewPlatformDashboard, assertCanViewPlatformMetadata, assertCanViewReports } from './rbac';
import {
  createCostingLogisticsRule,
  createCostingMetalRate,
  createCostingPackingRule,
  createNotificationRule,
  createReportDefinition,
  listCostingLogisticsRules,
  listCostingMetalRates,
  listCostingPackingRules,
  listNotificationRules,
  listPlatformFieldDefinitions,
  listReportDefinitions,
  upsertPlatformFieldDefinition,
} from './platformConfigurationRepository';
import { getPlatformKpis } from './dashboardKpiService';
import { runWhitelistedReport } from './reportRuntimeService';

export const platformAdminRouter = Router();

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

function handleAuthError(err: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  if (err instanceof DomainError) {
    const status =
      err.code === 'UNAUTHORIZED' && /sign in/i.test(err.message)
        ? 401
        : err.code === 'UNAUTHORIZED'
          ? 403
          : err.code === 'NOT_FOUND'
            ? 404
            : err.code === 'VALIDATION_FAILED'
              ? 400
              : 403;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  const e = err as Error & { code?: string; http?: number };
  return res.status(e.http || 403).json({ error: e.message, code: e.code || 'FORBIDDEN' });
}

// Dashboard KPIs (real data)
platformAdminRouter.get('/dashboard/kpis', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewPlatformDashboard(actor);
    const kpis = await getPlatformKpis();
    res.json({ kpis });
  } catch (err: unknown) {
    return handleAuthError(err, res);
  }
});

// Metal rates
platformAdminRouter.get('/costing/metal-rates', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
    const rates = await listCostingMetalRates();
    res.json({ metalRates: rates });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

platformAdminRouter.post('/costing/metal-rates', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
    const rate = await createCostingMetalRate(req.body || {}, actor);
    res.status(201).json({ metalRate: rate });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// Logistics rules (incoterm + destination)
platformAdminRouter.get('/costing/logistics-rules', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
    const rules = await listCostingLogisticsRules();
    res.json({ logisticsRules: rules });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

platformAdminRouter.post('/costing/logistics-rules', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
    const rule = await createCostingLogisticsRule(req.body || {}, actor);
    res.status(201).json({ logisticsRule: rule });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// Packing / drum rules
platformAdminRouter.get('/costing/packing-rules', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
    const rules = await listCostingPackingRules();
    res.json({ packingRules: rules });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

platformAdminRouter.post('/costing/packing-rules', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
    const rule = await createCostingPackingRule(req.body || {}, actor);
    res.status(201).json({ packingRule: rule });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// Field definitions
platformAdminRouter.get('/fields', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewPlatformMetadata(actor);
    const entity = typeof req.query.entity === 'string' ? req.query.entity : undefined;
    const fields = await listPlatformFieldDefinitions(entity);
    res.json({ fields });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

platformAdminRouter.post('/fields', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManagePlatformMetadata(actor);
    const field = await upsertPlatformFieldDefinition(req.body || {}, actor);
    res.json({ field });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// Notification rules
platformAdminRouter.get('/notifications/rules', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
    const rules = await listNotificationRules();
    res.json({ rules });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

platformAdminRouter.post('/notifications/rules', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
    const rule = await createNotificationRule(req.body || {}, actor);
    res.status(201).json({ rule });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

// Report definitions
platformAdminRouter.get('/reports', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewReports(actor);
    const reports = await listReportDefinitions();
    res.json({ reports });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

platformAdminRouter.post('/reports', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
    const report = await createReportDefinition(req.body || {}, actor);
    res.status(201).json({ report });
  } catch (err) {
    return handleAuthError(err, res);
  }
});

platformAdminRouter.post('/reports/:code/run', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewReports(actor);
    const result = await runWhitelistedReport({ code: req.params.code, actor });
    res.json({ result });
  } catch (err) {
    return handleAuthError(err, res);
  }
});
