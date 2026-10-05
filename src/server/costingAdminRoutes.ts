import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import {
  assertCanActivateCostingFormula,
  assertCanApproveScrapRules,
  assertCanDeactivateCostingFormula,
  assertCanExecuteCostingPreview,
  assertCanManageCostingComponents,
  assertCanManageCostingConfiguration,
  assertCanManageCostingFormulas,
  assertCanManageCostingVariables,
  assertCanManageScrapRules,
  assertCanPreviewCostingFormula,
  assertCanManageExchangeRates,
  assertCanApproveExchangeRates,
  assertCanValidateCostingFormula,
  assertCanViewCostingAudit,
  assertCanViewCostingFormulas,
  assertCanProposeRawMaterialPrice,
  assertCanApproveRawMaterialPrice,
  assertCanApprovePricingRules,
} from './rbac';
import { signDecision5OptionB } from './decision5SignOff';
import {
  activateConfigurationVersion,
  activateCostingFormula,
  approveConfigurationVersion,
  approveCostingFormula,
  createConfigurationVersion,
  createCostingComponent,
  createCostingConfiguration,
  createCostingFormula,
  createCostingVariable,
  deactivateCostingFormula,
  getCostingFormulaById,
  listCostingComponents,
  listCostingConfigurations,
  listCostingFormulas,
  listCostingVariables,
  previewFormulaExpression,
  submitConfigurationVersion,
  submitCostingFormula,
  updateCostingComponent,
  updateCostingFormulaDraft,
  updateCostingFormulaAssignment,
  updateCostingVariable,
  validateConfigurationVersion,
  validateFormulaExpression,
} from './costingFormulaRepository';
import { executeCostingForInquiryLine } from './costingOrchestrationService';
import { createRawMaterialPriceDraft, listGovernedRawMaterialPrices, processBulkPriceApprove, processPriceWorkflowAction } from './governanceRepository';
import {
  ELAND_REGRESSION_CABLES,
  evaluateCostingReadinessForCables,
} from './costingReadinessService';
import {
  activateCostingScrapRule,
  approveCostingScrapRule,
  createCostingScrapRule,
  getCostingScrapRuleById,
  listApprovalQueue,
  listCostingAuditEvents,
  listCostingScrapRules,
  processBulkScrapRuleApprove,
  submitCostingScrapRule,
  updateCostingScrapRuleDraft,
  validateCostingScrapRule,
} from './costingScrapRuleRepository';
import { listCostingConfigurationLookups } from './costingLookupsService';
import {
  activateCostingExchangeRate,
  approveCostingExchangeRate,
  createCostingExchangeRate,
  getCostingExchangeRateById,
  listCostingExchangeRates,
  processBulkExchangeRateApprove,
  submitCostingExchangeRate,
  updateCostingExchangeRateDraft,
  validateCostingExchangeRate,
} from './costingExchangeRateRepository';
import { buildCostingRequestFromPreviewPayload } from '../services/costingRequestService';
import {
  executeCalculatorPreview,
  parseCalculatorPreviewRequest,
} from './costingCalculatorService';
import {
  bulkUpdateBomScrap,
  getBomScrapLines,
  listCablesForBomScrap,
} from './costingBomScrapRepository';
import {
  buildCableScrapTemplateWorkbook,
  commitCableScrapImport,
  previewCableScrapImport,
} from '../services/cableScrapTemplateService';
import {
  classifySuggestedRawMaterials,
  listBoms,
  listCables,
  listDrums,
  listRawMaterials,
  listReference,
  persistImportBatchOnly,
  persistImportTransaction,
} from './masterDataRepository';
import { commitKind, memoryImportStores, previewKind } from '../services/importPipelineService';
import {
  getCostingReadinessCableDetail,
  getCostingReadinessSummary,
  getGoldenRegressionProbeStatus,
  getProductionReadinessControl,
  getCostingWorkspaceDashboard,
  listCostingReadinessCables,
  listWorkbookPriceCandidates,
  previewGovernedCostingBulk,
} from './costingWorkspaceService';
import {
  commitMetalCostComponentBulk,
  createMetalCostComponent,
  getMetalCostComponentById,
  listMetalCostComponentAudit,
  listMetalCostComponents,
  previewMetalCostComponentBulk,
  setMetalCostComponentStatus,
  updateMetalCostComponent,
} from './costingMetalCostComponentRepository';
import {
  createMarketMetalPriceDefault,
  getActiveMarketMetalPriceDefaults,
  getMarketMetalPriceDefaultById,
  listMarketMetalPriceDefaultAudit,
  listMarketMetalPriceDefaults,
  setMarketMetalPriceDefaultStatus,
  updateMarketMetalPriceDefault,
} from './marketMetalPriceDefaultRepository';
import {
  createCostingCurrency,
  deleteCostingCurrency,
  getCurrencyWithCurrentRate,
  listCostingCurrencies,
  updateCostingCurrency,
} from './costingCurrencyRepository';
import {
  buildCostingBulkTemplateWorkbook,
  commitCostingBulkImport,
  previewCostingBulkImport,
  templateFileName,
  CostingBulkImportKind,
  costingBulkPipelineKind,
} from '../services/costingBulkImportService';

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

function handleAuthError(err: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  if (err instanceof DomainError) {
    return res.status(403).json({ error: err.message, code: err.code });
  }
  return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
}

function parseBulkApproveIds(body: { ids?: unknown } | undefined) {
  return Array.isArray(body?.ids) ? body.ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
}

async function runCostingPipelineImport(
  kind: 'raw_materials' | 'boms',
  rows: Record<string, unknown>[],
  sourceFile: string,
  actor: { id?: string; name?: string; email?: string },
  persist: boolean
) {
  const [cables, boms, drums, rawMaterials] = await Promise.all([
    listCables(),
    listBoms(),
    listDrums(),
    listRawMaterials(),
  ]);
  const stores = memoryImportStores({
    cables: Array.isArray(cables) ? cables : [],
    boms: Array.isArray(boms) ? boms : [],
    drums: Array.isArray(drums) ? drums : [],
    rawMaterials: Array.isArray(rawMaterials) ? rawMaterials : [],
  });
  const parameters = await listReference().catch(() => []);
  const importedBy = actor.name || actor.email || actor.id || 'system';
  const result = persist
    ? commitKind(kind, rows, sourceFile, importedBy, {
        persist: false,
        stores,
        actorId: actor.id,
        referenceParameters: parameters,
        enforceForeignKeys: true,
      })
    : previewKind(kind, rows, sourceFile, importedBy, {
        stores,
        actorId: actor.id,
        referenceParameters: parameters,
        enforceForeignKeys: true,
      });
  return result;
}

function handleFormulaError(err: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const e = err as Error & { code?: string; errors?: unknown };
  if (e.code === 'P2002') return res.status(409).json({ error: e.message, code: 'DUPLICATE_CODE' });
  if (e.code === 'NOT_FOUND') return res.status(404).json({ error: e.message, code: e.code });
  if (e.code === 'INVALID_SCRAP_RATE') return res.status(422).json({ error: e.message, code: e.code });
  if (
    e.code === 'INVALID_WORKFLOW_TRANSITION' ||
    e.code === 'VALIDATION_ERROR' ||
    e.code === 'EXCHANGE_RATE_NOT_EDITABLE' ||
    e.code === 'CURRENCY_IN_USE' ||
    e.code === 'OVERLAPPING_ACTIVE_PERIOD'
  ) {
    return res.status(e.code === 'CURRENCY_IN_USE' ? 409 : 422).json({ error: e.message, code: e.code });
  }
  if (e.errors) {
    return res.status(422).json({ error: e.message, code: e.code || 'VALIDATION_FAILED', errors: e.errors });
  }
  return res.status(500).json({ error: e.message, code: e.code });
}

export const costingAdminRouter = Router();

// ---------------------------------------------------------------------------
// Workspace V3 — dashboard, currencies, bulk import
// ---------------------------------------------------------------------------

costingAdminRouter.get('/workspace/dashboard', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const dashboard = await getCostingWorkspaceDashboard();
    res.json({ dashboard });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/currencies', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const status = req.query.status === 'INACTIVE' ? 'INACTIVE' : req.query.status === 'ACTIVE' ? 'ACTIVE' : undefined;
    const rows = await listCostingCurrencies(status ? { status } : undefined);
    const enriched = await Promise.all(rows.map((c) => getCurrencyWithCurrentRate(c.code)));
    res.json({ currencies: enriched.filter(Boolean) });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/currencies', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const body = req.body || {};
  if (!body.code || !body.name) {
    return res.status(400).json({ error: 'code and name are required.', code: 'VALIDATION_ERROR' });
  }
  try {
    const currency = await createCostingCurrency(body, actor);
    res.status(201).json({ currency });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.patch('/currencies/:code', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const currency = await updateCostingCurrency(req.params.code, req.body || {}, actor);
    if (!currency) return res.status(404).json({ error: 'Currency not found.', code: 'NOT_FOUND' });
    res.json({ currency });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.delete('/currencies/:code', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const currency = await deleteCostingCurrency(req.params.code, actor);
    if (!currency) return res.status(404).json({ error: 'Currency not found.', code: 'NOT_FOUND' });
    res.json({ deleted: true, currency });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/currencies/:code/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const action = String(req.body?.action || '').toUpperCase();
  if (action !== 'DELETE') {
    return res.status(422).json({ error: 'Unsupported currency action.', code: 'VALIDATION_ERROR' });
  }
  try {
    const currency = await deleteCostingCurrency(req.params.code, actor);
    if (!currency) return res.status(404).json({ error: 'Currency not found.', code: 'NOT_FOUND' });
    res.json({ deleted: true, currency });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/raw-materials/classify-suggested', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const result = await classifySuggestedRawMaterials(actor, {
      onlyUnclassified: req.body?.onlyUnclassified !== false,
    });
    res.json({ classified: true, ...result });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/market-metal-price-defaults', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const defaults = await listMarketMetalPriceDefaults({
      metalType: typeof req.query.metalType === 'string' ? req.query.metalType : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ defaults });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/market-metal-price-defaults/active', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const active = await getActiveMarketMetalPriceDefaults();
    res.json({ copper: active.copper, aluminium: active.aluminium });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/market-metal-price-defaults', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const record = await createMarketMetalPriceDefault(req.body || {}, actor);
    res.status(201).json({ default: record });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/market-metal-price-defaults/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const record = await getMarketMetalPriceDefaultById(req.params.id);
    if (!record) return res.status(404).json({ error: 'Market metal price default not found.', code: 'NOT_FOUND' });
    res.json({ default: record });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/market-metal-price-defaults/:id/audit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingAudit(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const events = await listMarketMetalPriceDefaultAudit(req.params.id);
    res.json({ events });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.patch('/market-metal-price-defaults/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const record = await updateMarketMetalPriceDefault(req.params.id, req.body || {}, actor);
    res.json({ default: record });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/market-metal-price-defaults/:id/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const action = String(req.body?.action || '').toUpperCase();
  if (action !== 'ACTIVATE' && action !== 'DEACTIVATE') {
    return res.status(422).json({ error: 'Unsupported action. Use ACTIVATE or DEACTIVATE.', code: 'VALIDATION_ERROR' });
  }
  try {
    const record = await setMarketMetalPriceDefaultStatus(
      req.params.id,
      action === 'ACTIVATE' ? 'ACTIVE' : 'INACTIVE',
      actor
    );
    res.json({ default: record });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/metal-cost-components', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const components = await listMetalCostComponents({
      metal: typeof req.query.metal === 'string' ? req.query.metal : undefined,
      componentType: typeof req.query.componentType === 'string' ? req.query.componentType : undefined,
      currencyCode: typeof req.query.currency === 'string' ? req.query.currency : undefined,
      priceBasis: typeof req.query.priceBasis === 'string' ? req.query.priceBasis : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      effectiveDate: typeof req.query.effectiveDate === 'string' ? req.query.effectiveDate : undefined,
    });
    res.json({
      components,
      costingMode: 'OPTION_B_LME_BASE_ONLY',
      includedInDirectRmCost: false,
      note: 'Premium / Shipping / Clearance are currently not included in Direct Raw Material Cost.',
    });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/metal-cost-components', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const component = await createMetalCostComponent(req.body || {}, actor);
    res.status(201).json({ component });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/metal-cost-components/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const component = await getMetalCostComponentById(req.params.id);
    if (!component) return res.status(404).json({ error: 'Metal cost component not found.', code: 'NOT_FOUND' });
    res.json({ component });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/metal-cost-components/:id/audit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingAudit(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const events = await listMetalCostComponentAudit(req.params.id);
    res.json({ events });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.patch('/metal-cost-components/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const component = await updateMetalCostComponent(req.params.id, req.body || {}, actor);
    res.json({ component });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/metal-cost-components/:id/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const action = String(req.body?.action || '').toUpperCase();
  if (action !== 'ACTIVATE' && action !== 'DEACTIVATE') {
    return res.status(422).json({ error: 'Unsupported action. Use ACTIVATE or DEACTIVATE.', code: 'VALIDATION_ERROR' });
  }
  try {
    const component = await setMetalCostComponentStatus(
      req.params.id,
      action === 'ACTIVATE' ? 'ACTIVE' : 'INACTIVE',
      actor
    );
    res.json({ component });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/bulk-import/template/:kind', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const kind = req.params.kind as CostingBulkImportKind;
  try {
    const buffer = buildCostingBulkTemplateWorkbook(kind);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${templateFileName(kind)}"`);
    res.send(buffer);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/bulk-import/preview', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const { kind, rows, sourceFile } = req.body || {};
  if (!kind || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'kind and rows are required.', code: 'VALIDATION_ERROR' });
  }
  try {
    const pipelineKind = costingBulkPipelineKind(kind as CostingBulkImportKind);
    if (pipelineKind) {
      const preview = await runCostingPipelineImport(
        pipelineKind,
        rows as Record<string, unknown>[],
        String(sourceFile || 'upload.xlsx'),
        actor,
        false
      );
      return res.json({ ...preview, rows });
    }
    const preview = previewCostingBulkImport(
      kind as CostingBulkImportKind,
      rows as Record<string, unknown>[],
      String(sourceFile || 'upload.xlsx'),
      actor.name || actor.email || actor.id || 'system'
    );
    if (String(kind) === 'metal_cost_components') {
      return res.json(previewMetalCostComponentBulk(rows as Record<string, unknown>[], String(sourceFile || 'upload.xlsx')));
    }
    if (['raw_material_prices', 'currencies', 'exchange_rates', 'scrap_rules'].includes(String(kind))) {
      const governed = await previewGovernedCostingBulk(String(kind), rows as Record<string, unknown>[], String(sourceFile || 'upload.xlsx'));
      return res.json(governed);
    }
    res.json({ ...preview, rows });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/bulk-import/commit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const { kind, rows, sourceFile } = req.body || {};
  if (!kind || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'kind and rows are required.', code: 'VALIDATION_ERROR' });
  }
  try {
    const pipelineKind = costingBulkPipelineKind(kind as CostingBulkImportKind);
    if (pipelineKind) {
      const result = await runCostingPipelineImport(
        pipelineKind,
        rows as Record<string, unknown>[],
        String(sourceFile || 'upload.xlsx'),
        actor,
        true
      );
      if (result.batch.errorCount > 0) {
        await persistImportBatchOnly(result.batch, 'REJECTED').catch(() => undefined);
        return res.status(422).json({
          result,
          committed: false,
          message: 'Import rejected. No ERROR rows were written.',
        });
      }
      await persistImportTransaction({
        kind: pipelineKind,
        batch: {
          ...result.batch,
          status: 'COMMITTED',
          successCount:
            result.cables?.length || result.boms?.length || result.drums?.length || result.rawMaterials?.length || 0,
        },
        cables: result.cables,
        boms: result.boms,
        drums: result.drums,
        rawMaterials: result.rawMaterials,
        duplicateObservations: result.duplicateObservations,
        actor,
      });
      return res.json({ result: { ...result, batch: { ...result.batch, status: 'COMMITTED' } }, message: 'Bulk import committed.' });
    }
    if (String(kind) === 'metal_cost_components') {
      const result = await commitMetalCostComponentBulk(
        rows as Record<string, unknown>[],
        String(sourceFile || 'upload.xlsx'),
        actor
      );
      return res.json({ result, message: 'Bulk import committed as Draft. Records were not auto-approved.' });
    }
    const result = commitCostingBulkImport(
      kind as CostingBulkImportKind,
      rows as Record<string, unknown>[],
      String(sourceFile || 'upload.xlsx'),
      actor.name || actor.email || actor.id || 'system'
    );
    res.json({ result, message: 'Bulk import committed.' });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Configurations
// ---------------------------------------------------------------------------

costingAdminRouter.get('/configurations', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const configurations = await listCostingConfigurations();
    res.json({ configurations });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/configurations', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const body = req.body || {};
  if (!body.code || !body.name) {
    return res.status(400).json({ error: 'code and name are required.' });
  }
  try {
    const created = await createCostingConfiguration(body, actor);
    res.status(201).json({ configuration: created });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/configurations/:id/versions', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const version = await createConfigurationVersion(req.params.id, actor, req.body?.changeNotes);
    res.status(201).json({ version });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/configurations/:configId/versions/:versionId/activate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const version = await activateConfigurationVersion(req.params.versionId, actor);
    res.json({ version, message: 'Configuration version activated.' });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

costingAdminRouter.get('/variables', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const variables = await listCostingVariables({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
    });
    res.json({ variables });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/variables', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingVariables(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const created = await createCostingVariable(req.body || {}, actor);
    res.status(201).json({ variable: created });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.patch('/variables/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingVariables(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const updated = await updateCostingVariable(req.params.id, req.body || {}, actor);
    res.json({ variable: updated });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

costingAdminRouter.get('/components', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const components = await listCostingComponents({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
    });
    res.json({ components });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/components', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingComponents(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const created = await createCostingComponent(req.body || {}, actor);
    res.status(201).json({ component: created });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.patch('/components/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingComponents(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const updated = await updateCostingComponent(req.params.id, req.body || {}, actor);
    res.json({ component: updated });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Formulas
// ---------------------------------------------------------------------------

costingAdminRouter.get('/formulas', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const formulas = await listCostingFormulas({
      configurationVersionId: typeof req.query.configurationVersionId === 'string' ? req.query.configurationVersionId : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
    });
    res.json({ formulas });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/formulas/validate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanValidateCostingFormula(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const body = req.body || {};
  if (!body.expression) {
    return res.status(400).json({ error: 'expression is required.' });
  }
  try {
    const result = await validateFormulaExpression(
      body.expression,
      body.outputVariable,
      body.configurationVersionId
    );
    res.json(result);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/formulas/preview', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanPreviewCostingFormula(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const body = req.body || {};
  if (!body.expression) {
    return res.status(400).json({ error: 'expression is required.' });
  }
  try {
    const result = await previewFormulaExpression(
      body.expression,
      body.variableValues || {},
      body.outputVariable,
      body.configurationVersionId
    );
    res.json(result);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/formulas/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const formula = await getCostingFormulaById(req.params.id);
    if (!formula) return res.status(404).json({ error: 'Formula not found.' });
    res.json({ formula });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/formulas', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const body = req.body || {};
  if (!body.configurationVersionId || !body.name || !body.outputVariableCode || !body.expression) {
    return res.status(400).json({ error: 'configurationVersionId, name, outputVariableCode, and expression are required.' });
  }
  try {
    const created = await createCostingFormula(body, actor);
    res.status(201).json({ formula: created });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.patch('/formulas/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const body = req.body || {};
    if (body.assignmentScope != null || body.assignmentValue !== undefined || body.assignmentPriority != null) {
      await updateCostingFormulaAssignment(req.params.id, body, actor);
    }
    if (body.expression != null || body.changeNotes != null) {
      const updated = await updateCostingFormulaDraft(req.params.id, body, actor);
      return res.json({ version: updated });
    }
    const formula = await getCostingFormulaById(req.params.id);
    res.json({ formula });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/formulas/:id/activate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanActivateCostingFormula(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const formula = await activateCostingFormula(req.params.id, actor);
    res.json({ formula, message: 'Formula activated.' });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/formulas/:id/deactivate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanDeactivateCostingFormula(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const formula = await deactivateCostingFormula(req.params.id, actor);
    res.json({ formula, message: 'Formula deactivated.' });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Methods alias (configurations)
// ---------------------------------------------------------------------------

costingAdminRouter.get('/methods', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const methods = await listCostingConfigurations();
    res.json({ methods });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Layers alias (components)
// ---------------------------------------------------------------------------

costingAdminRouter.get('/layers', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const layers = await listCostingComponents({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      kind: typeof req.query.kind === 'string' ? req.query.kind : undefined,
    });
    res.json({ layers });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Configuration workflow
// ---------------------------------------------------------------------------

costingAdminRouter.post('/configurations/:configId/versions/:versionId/validate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const version = await validateConfigurationVersion(req.params.versionId, actor);
    res.json({ version });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/configurations/:configId/versions/:versionId/submit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const version = await submitConfigurationVersion(req.params.versionId, actor);
    res.json({ version });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/configurations/:configId/versions/:versionId/approve', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingConfiguration(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const version = await approveConfigurationVersion(req.params.versionId, actor);
    res.json({ version });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Formula workflow
// ---------------------------------------------------------------------------

costingAdminRouter.post('/formulas/:id/submit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const formula = await submitCostingFormula(req.params.id, actor);
    res.json({ formula });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/formulas/:id/approve', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanActivateCostingFormula(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const formula = await approveCostingFormula(req.params.id, actor);
    res.json({ formula });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// BOM scrap (per-line standard scrap on governed BOM)
// ---------------------------------------------------------------------------

costingAdminRouter.get('/bom-scrap/cables', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const cables = await listCablesForBomScrap(search);
    res.json({ cables });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/bom-scrap/template', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const metal = typeof req.query.metal === 'string' ? req.query.metal : undefined;
    const family = typeof req.query.family === 'string' ? req.query.family : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const buf = await buildCableScrapTemplateWorkbook({ metal, family, search });
    const suffix = [metal, family].filter(Boolean).join('_') || 'All';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Cable_Scrap_Rates_${suffix}.xlsx"`);
    res.send(buf);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/bom-scrap/import/preview', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required.' });
  }
  try {
    const preview = await previewCableScrapImport(rows);
    res.json(preview);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/bom-scrap/import/commit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required.' });
  }
  try {
    const result = await commitCableScrapImport(rows, actor);
    res.json(result);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/bom-scrap', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const cable = typeof req.query.cable === 'string' ? req.query.cable.trim() : '';
  if (!cable) {
    return res.status(400).json({ error: 'cable query parameter is required.' });
  }
  try {
    const result = await getBomScrapLines(cable);
    res.json(result);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.put('/bom-scrap', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const body = req.body || {};
  const cableMaterialNumber = typeof body.cableMaterialNumber === 'string' ? body.cableMaterialNumber.trim() : '';
  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (!cableMaterialNumber) {
    return res.status(400).json({ error: 'cableMaterialNumber is required.' });
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'updates array is required.' });
  }
  try {
    const result = await bulkUpdateBomScrap(cableMaterialNumber, updates, actor);
    res.json(result);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Master lookups for Costing Configuration dropdowns
// ---------------------------------------------------------------------------

costingAdminRouter.get('/lookups', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const lookups = await listCostingConfigurationLookups({
      family: typeof req.query.family === 'string' ? req.query.family : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    });
    res.json(lookups);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Scrap rules
// ---------------------------------------------------------------------------

costingAdminRouter.get('/scrap-rules', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const scrapRules = await listCostingScrapRules({
      workflowStatus: typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined,
      scopeType: typeof req.query.scopeType === 'string' ? req.query.scopeType : undefined,
    });
    res.json({
      scrapRules,
      overlapPolicy: 'BUSINESS_RULE_REQUIRED',
      overlapPolicyNote:
        'BOM line scrap % first; else matching ACTIVE CostingScrapRule by specificity (BOM_LINE > CABLE > FAMILY > MATERIAL_CLASS > GLOBAL), then lowest priority. Equal remaining overlap is BUSINESS_RULE_REQUIRED.',
    });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/scrap-rules/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rule = await getCostingScrapRuleById(req.params.id);
    if (!rule) return res.status(404).json({ error: 'Scrap rule not found.' });
    res.json({ scrapRule: rule });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/scrap-rules', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const body = req.body || {};
  if (!body.name) {
    return res.status(400).json({ error: 'name is required.' });
  }
  try {
    const created = await createCostingScrapRule(body, actor);
    res.status(201).json({ scrapRule: created });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.patch('/scrap-rules/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const updated = await updateCostingScrapRuleDraft(req.params.id, req.body || {}, actor);
    res.json({ scrapRule: updated });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/scrap-rules/:id/validate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rule = await validateCostingScrapRule(req.params.id, actor);
    res.json({ scrapRule: rule });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/scrap-rules/:id/submit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rule = await submitCostingScrapRule(req.params.id, actor);
    res.json({ scrapRule: rule });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/scrap-rules/bulk-approve', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanApproveScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const ids = parseBulkApproveIds(req.body);
  if (ids.length === 0) return res.status(400).json({ error: 'ids array is required.', code: 'VALIDATION_ERROR' });
  try {
    res.json(await processBulkScrapRuleApprove(ids, actor));
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/scrap-rules/:id/approve', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanApproveScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rule = await approveCostingScrapRule(req.params.id, actor);
    res.json({ scrapRule: rule });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/scrap-rules/:id/activate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanApproveScrapRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rule = await activateCostingScrapRule(req.params.id, actor);
    res.json({ scrapRule: rule });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Exchange rates
// ---------------------------------------------------------------------------

costingAdminRouter.get('/exchange-rates', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const exchangeRates = await listCostingExchangeRates({
      workflowStatus: typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined,
    });
    res.json({ exchangeRates });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/exchange-rates/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rate = await getCostingExchangeRateById(req.params.id);
    if (!rate) return res.status(404).json({ error: 'Exchange rate not found.' });
    res.json({ exchangeRate: rate });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/exchange-rates', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const body = req.body || {};
  if (!body.fromCurrency || !body.toCurrency || body.rate == null || body.rate === '') {
    return res.status(400).json({ error: 'fromCurrency, toCurrency, and rate are required.' });
  }
  try {
    const created = await createCostingExchangeRate(body, actor);
    res.status(201).json({ exchangeRate: created });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.patch('/exchange-rates/:id', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const updated = await updateCostingExchangeRateDraft(req.params.id, req.body || {}, actor);
    res.json({ exchangeRate: updated });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/exchange-rates/:id/validate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rate = await validateCostingExchangeRate(req.params.id, actor);
    res.json({ exchangeRate: rate });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/exchange-rates/:id/submit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rate = await submitCostingExchangeRate(req.params.id, actor);
    res.json({ exchangeRate: rate });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/exchange-rates/bulk-approve', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanApproveExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const ids = parseBulkApproveIds(req.body);
  if (ids.length === 0) return res.status(400).json({ error: 'ids array is required.', code: 'VALIDATION_ERROR' });
  try {
    res.json(await processBulkExchangeRateApprove(ids, actor));
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/exchange-rates/:id/approve', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanApproveExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rate = await approveCostingExchangeRate(req.params.id, actor);
    res.json({ exchangeRate: rate });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/exchange-rates/:id/activate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanApproveExchangeRates(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const rate = await activateCostingExchangeRate(req.params.id, actor);
    res.json({ exchangeRate: rate });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

// ---------------------------------------------------------------------------
// Preview & audit
// ---------------------------------------------------------------------------

costingAdminRouter.post('/preview', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const built = buildCostingRequestFromPreviewPayload(req.body || {});
  if ('error' in built) {
    return res.status(400).json({ error: built.error });
  }
  try {
    const preview = await executeCostingForInquiryLine(built, actor, { persist: false });
    res.json({ preview, persisted: false });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/calculator/preview', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const parsed = parseCalculatorPreviewRequest(req.body || {});
  if ('error' in parsed) {
    return res.status(400).json({ error: parsed.error });
  }
  try {
    const result = await executeCalculatorPreview(parsed);
    res.json({ calculator: result });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/audit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingAudit(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const events = await listCostingAuditEvents({
      entity: typeof req.query.entity === 'string' ? req.query.entity : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
    res.json({ events });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/approval-queue', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const queue = await listApprovalQueue();
    res.json(queue);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/raw-material-prices/workbook-candidates', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanProposeRawMaterialPrice(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const result = await listWorkbookPriceCandidates();
    res.json({ ...result, message: 'Workbook prices are shown for review. Nothing was inserted.' });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/raw-material-prices', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanProposeRawMaterialPrice(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const prices = await listGovernedRawMaterialPrices({
      rawMaterialCode: typeof req.query.rawMaterialCode === 'string' ? req.query.rawMaterialCode : undefined,
      workflowStatus: typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined,
      excludeSynthetic: req.query.excludeSynthetic !== 'false',
    });
    res.json({ prices });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/raw-material-prices', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanProposeRawMaterialPrice(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const created = await createRawMaterialPriceDraft(req.body || {}, actor);
    res.status(201).json({ price: created, message: 'Price proposal created in DRAFT status.' });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/raw-material-prices/bulk-approve', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanApproveRawMaterialPrice(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const ids = parseBulkApproveIds(req.body);
  if (ids.length === 0) return res.status(400).json({ error: 'ids array is required.', code: 'VALIDATION_ERROR' });
  try {
    res.json(await processBulkPriceApprove(ids, actor));
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/raw-material-prices/:id/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  const action = String(req.body?.action || '').toUpperCase();
  try {
    if (action === 'APPROVE') {
      assertCanApproveRawMaterialPrice(actor);
    } else {
      assertCanProposeRawMaterialPrice(actor);
    }
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const price = await processPriceWorkflowAction(req.params.id, action as never, req.body || {}, actor);
    res.json({ price, action });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/decision-5/sign-off', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanApprovePricingRules(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const decision5 = await signDecision5OptionB(actor);
    res.json({ decision5 });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/production-readiness', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    res.json(await getProductionReadinessControl(actor));
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/readiness/summary', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    res.json(await getCostingReadinessSummary());
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/readiness/cables/:materialNumber', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const materialNumber = String(req.params.materialNumber || '').trim();
  if (!materialNumber) {
    return res.status(400).json({ error: 'materialNumber is required.', code: 'INVALID_REQUEST' });
  }
  try {
    const detail = await getCostingReadinessCableDetail(materialNumber, actor);
    if (!detail) return res.status(404).json({ error: 'Cable not found.', code: 'CABLE_NOT_FOUND' });
    res.json(detail);
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/readiness/cables', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    const page = req.query.page != null ? Number(req.query.page) : undefined;
    const pageSize = req.query.pageSize != null ? Number(req.query.pageSize) : undefined;
    res.json(
      await listCostingReadinessCables({
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        gate: typeof req.query.gate === 'string' ? req.query.gate : undefined,
        page: Number.isFinite(page) ? page : undefined,
        pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
      })
    );
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/readiness/golden-regression', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  try {
    res.json(await getGoldenRegressionProbeStatus(actor));
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.get('/readiness', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const requested =
    typeof req.query.cables === 'string'
      ? req.query.cables.split(',').map((c) => c.trim()).filter(Boolean)
      : typeof req.query.materialNumber === 'string'
        ? [req.query.materialNumber.trim()]
        : [...ELAND_REGRESSION_CABLES];
  try {
    const rows = await evaluateCostingReadinessForCables(requested, actor);
    res.json({ cables: rows, engine: 'executeCostingForInquiryLine' });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});

costingAdminRouter.post('/validate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanExecuteCostingPreview(actor);
  } catch (err) {
    return handleAuthError(err, res);
  }
  const materialNumber = String(req.body?.materialNumber || '').trim();
  if (!materialNumber) {
    return res.status(400).json({ error: 'materialNumber is required.', code: 'COSTING_NOT_READY' });
  }
  const built = buildCostingRequestFromPreviewPayload(req.body || {});
  if ('error' in built) {
    return res.status(400).json({ error: built.error, code: 'COSTING_NOT_READY' });
  }
  try {
    const preview = await executeCostingForInquiryLine(built, actor, { persist: false });
    res.json({
      status: preview.status,
      costingStatus: preview.costingStatus,
      errorCode: preview.errorCode,
      blockingReasons: preview.blockingReasons,
      preview,
      persisted: false,
    });
  } catch (err: unknown) {
    handleFormulaError(err, res);
  }
});
