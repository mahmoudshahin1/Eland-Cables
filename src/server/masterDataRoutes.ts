import { Router } from 'express';
import { DomainError } from '../platform/errors/domainError';
import { resolveRequestActor } from './auth';
import { checkDatabase } from './db';
import {
  assertCanApproveBomGovernance,
  assertCanApproveEngineeringMapping,
  assertCanApproveRawMaterialPrice,
  assertCanEditEngineeringMapping,
  assertCanImportMasterData,
  assertCanInvestigateBomGovernance,
  assertCanProposeRawMaterialPrice,
  assertCanWriteBomAndRawMaterials,
  assertCanWriteCableMaster,
  assertCanManageScrapRules,
  assertCanViewCostingFormulas,
  assertCanViewMasterDataCatalog,
  assertCanUseDrumOptimization,
} from './rbac';
import {
  appendRawMaterialPrice,
  cableUniquenessReport,
  createCable,
  createRawMaterial,
  getCable,
  listBomDuplicateObservations,
  listBoms,
  listCables,
  listDrums,
  listImportHistory,
  listRawMaterialPrices,
  listRawMaterials,
  listReference,
  increment5Readiness,
  persistImportBatchOnly,
  persistImportTransaction,
  persistCableBomExcelCommit,
  PersistenceUnavailableError,
  searchCables,
  updateCable,
  updateRawMaterial,
} from './masterDataRepository';
import {
  deleteCableMasterAttachment,
  getCableMasterAttachmentContent,
  listCableMasterAttachments,
  upsertCableMasterAttachment,
} from './attachmentRepository';
import { commitKind, memoryImportStores, previewKind } from '../services/importPipelineService';
import { CableBomRawMaterial, MasterImportKind } from '../types';
import {
  BOM_CONFLICT_CLASSIFICATIONS,
} from '../services/engineeringMapping';
import {
  createRawMaterialPriceDraft,
  evaluateCableCostingReadiness,
  getEngineeringMappingDetail,
  importEngineeringMappingsFromRows,
  listBomConflictRegister,
  listEngineeringMappings,
  listGovernedRawMaterialPrices,
  masterDataKeyAnalysis,
  processBomGovernanceWorkflowAction,
  processBulkWorkflowAction,
  processMappingWorkflowAction,
  processPriceWorkflowAction,
  rawMaterialPriceReadiness,
  updateEngineeringMappingDraft,
  validateBulkEngineeringMappings,
} from './governanceRepository';
import {
  buildCableScrapTemplateWorkbook,
  commitCableScrapImport,
  previewCableScrapImport,
} from '../services/cableScrapTemplateService';

async function actorFromRequest(req: { headers: { authorization?: string } }) {
  return resolveRequestActor(req.headers.authorization);
}

async function requireSignedIn(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  message = 'Sign in is required.'
) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: message, code: 'UNAUTHORIZED' });
    return null;
  }
  return actor;
}

async function requireWriteAuth(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required to change Cable Master.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanWriteCableMaster(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireMasterReadAuth(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } },
  message = 'Sign in is required to view master data.'
) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: message, code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanViewMasterDataCatalog(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      const status = /sign in/i.test(err.message) ? 401 : 403;
      res.status(status).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireDrumComputeAuth(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: unknown) => unknown } }
) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required for drum optimization.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanUseDrumOptimization(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      const status = /sign in/i.test(err.message) ? 401 : 403;
      res.status(status).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireImportAuth(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required to import master data.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanImportMasterData(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

async function requireBomRmAuth(req: { headers: { authorization?: string } }, res: { status: (n: number) => { json: (b: unknown) => unknown } }) {
  const actor = await actorFromRequest(req);
  if (!actor.id && !actor.email && !actor.name) {
    res.status(401).json({ error: 'Sign in is required to change BOM or raw materials.', code: 'UNAUTHORIZED' });
    return null;
  }
  try {
    assertCanWriteBomAndRawMaterials(actor);
  } catch (err) {
    if (err instanceof DomainError) {
      res.status(403).json({ error: err.message, code: err.code });
      return null;
    }
    throw err;
  }
  return actor;
}

function pgError(res: { status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof PersistenceUnavailableError) {
    return res.status(503).json({ error: err.message, postgresql: false });
  }
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string }).code;
  if (code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: message, code });
  }
  return res.status(code === 'DUPLICATE_MATERIAL_NUMBER' ? 409 : 500).json({ error: message, code });
}

export const masterDataRouter = Router();
export const platformDbRouter = Router();

platformDbRouter.get('/db', async (_req, res) => {
  const health = await checkDatabase();
  res.status(health.ok ? 200 : 503).json({
    ...health,
    target: 'postgresql',
    coexistence: 'localStorage remains until each domain is dual-written',
  });
});

masterDataRouter.get('/cables', async (req, res) => {
  const actor = await requireSignedIn(req, res, 'Sign in is required to view Cable Master.');
  if (!actor) return;
  try {
    const hasFilter = Boolean(
      req.query.q ||
        req.query.customerCode ||
        req.query.itemCode ||
        req.query.materialNumber ||
        req.query.family ||
        req.query.voltage ||
        req.query.conductor ||
        req.query.cores ||
        req.query.diameter ||
        req.query.page ||
        req.query.pageSize
    );
    if (hasFilter) {
      const result = await searchCables({
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        customerCode: typeof req.query.customerCode === 'string' ? req.query.customerCode : undefined,
        itemCode: typeof req.query.itemCode === 'string' ? req.query.itemCode : undefined,
        materialNumber: typeof req.query.materialNumber === 'string' ? req.query.materialNumber : undefined,
        family: typeof req.query.family === 'string' ? req.query.family : undefined,
        voltage: typeof req.query.voltage === 'string' ? req.query.voltage : undefined,
        conductor: typeof req.query.conductor === 'string' ? req.query.conductor : undefined,
        cores: typeof req.query.cores === 'string' ? req.query.cores : undefined,
        diameter: typeof req.query.diameter === 'string' ? req.query.diameter : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 25,
      });
      return res.json(result);
    }
    if (actor.userType === 'customer') {
      const result = await searchCables({ page: 1, pageSize: 50 });
      return res.json(result);
    }
    res.json({ cables: await listCables() });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/cables/:materialNumber', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res, 'Sign in is required to view Cable Master.');
  if (!actor) return;
  try {
    const cable = await getCable(req.params.materialNumber);
    if (!cable) return res.status(404).json({ error: 'Cable not found.' });
    res.json({ cable });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/cables', async (req, res) => {
  const actor = await requireWriteAuth(req, res);
  if (!actor) return;
  const body = req.body || {};
  if (!body.cableCode || !body.itemCode || !body.customerCode || !body.description) {
    return res.status(400).json({ error: 'cableCode, itemCode, customerCode, and description are required.' });
  }
  if (body.outerDiameterMm == null || body.approxWeightKgKm == null) {
    return res.status(400).json({ error: 'outerDiameterMm and approxWeightKgKm are required. Blank is not stored as zero.' });
  }
  try {
    const cable = await createCable(
      {
        id: `mc-${body.cableCode}`,
        itemCode: String(body.itemCode),
        cableCode: String(body.cableCode),
        customerCode: String(body.customerCode),
        code: `${body.customerCode} ${body.cableCode}`,
        description: String(body.description),
        voltageClass: body.voltageClass || 'LV',
        conductor: body.conductor || 'Copper',
        cores: body.cores || '1C',
        crossSectionMm2: Number(body.crossSectionMm2) || 0,
        outerDiameterMm: Number(body.outerDiameterMm),
        approxWeightKgKm: Number(body.approxWeightKgKm),
        standardPriceUsdPerM: 0,
        priceConfigured: false,
        elandItemNumber: body.elandItemNumber,
        status: 'ACTIVE',
      },
      actor
    );
    res.status(201).json({ cable });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.put('/cables/:materialNumber', async (req, res) => {
  const actor = await requireWriteAuth(req, res);
  if (!actor) return;
  try {
    const cable = await updateCable(req.params.materialNumber, req.body || {}, actor);
    if (!cable) return res.status(404).json({ error: 'Cable not found.' });
    res.json({ cable });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/cables/:materialNumber/attachments', async (req, res) => {
  try {
    const attachments = await listCableMasterAttachments(req.params.materialNumber);
    res.json({ attachments });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/cables/:materialNumber/attachments', async (req, res) => {
  const actor = await requireWriteAuth(req, res);
  if (!actor) return;
  try {
    const attachment = await upsertCableMasterAttachment(req.params.materialNumber, req.body || {}, actor);
    res.status(201).json({ attachment });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    if (err.code === 'INVALID_REQUEST_INPUTS') return res.status(400).json({ error: err.message, code: err.code });
    pgError(res, err);
  }
});

masterDataRouter.get('/cables/:materialNumber/attachments/:attachmentId', async (req, res) => {
  try {
    const row = await getCableMasterAttachmentContent(req.params.materialNumber, req.params.attachmentId);
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${row.fileName.replace(/"/g, '')}"`);
    res.send(row.content);
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    pgError(res, err);
  }
});

masterDataRouter.delete('/cables/:materialNumber/attachments/:attachmentId', async (req, res) => {
  const actor = await requireWriteAuth(req, res);
  if (!actor) return;
  try {
    const result = await deleteCableMasterAttachment(req.params.materialNumber, req.params.attachmentId, actor);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNAUTHORIZED') return res.status(403).json({ error: err.message, code: err.code });
    pgError(res, err);
  }
});

masterDataRouter.get('/boms', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    res.json({ boms: await listBoms() });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/boms/excel-commit', async (req, res) => {
  const actor = await requireBomRmAuth(req, res);
  if (!actor) return;
  try {
    const body = req.body as {
      lines?: CableBomRawMaterial[];
      replaceCableMaterialNumbers?: string[];
      duplicateObservations?: Array<{
        cableMaterialNumber: string;
        rawMaterialCode: string;
        weightA: number;
        weightB: number;
        occurrenceCount: number;
        sourceWorksheet?: string;
        sourceFile?: string;
        sourceRowNumbers: number[];
        classification: string;
      }>;
      sourceFile?: string;
    };
    const lines = Array.isArray(body.lines) ? body.lines : [];
    const replaceCableMaterialNumbers = Array.isArray(body.replaceCableMaterialNumbers)
      ? body.replaceCableMaterialNumbers
      : [];
    const result = await persistCableBomExcelCommit({
      lines,
      replaceCableMaterialNumbers,
      duplicateObservations: body.duplicateObservations,
      sourceFile: body.sourceFile,
      actor,
    });
    res.json({
      committed: true,
      postgresql: true,
      ...result,
    });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/raw-materials', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    res.json({ rawMaterials: await listRawMaterials() });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/raw-material-prices', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    const rawMaterialCode = typeof req.query.rawMaterialCode === 'string' ? req.query.rawMaterialCode : undefined;
    const workflowStatus = typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined;
    const currency = typeof req.query.currency === 'string' ? req.query.currency : undefined;
    const isCurrent = req.query.isCurrent !== undefined ? req.query.isCurrent === 'true' : undefined;

    const prices = await listGovernedRawMaterialPrices({
      rawMaterialCode,
      workflowStatus,
      currency,
      isCurrent,
    });
    res.json({ prices });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/raw-material-prices/:rawMaterialCode', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    const prices = await listGovernedRawMaterialPrices({
      rawMaterialCode: req.params.rawMaterialCode,
    });
    res.json({ prices });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/raw-material-prices', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanProposeRawMaterialPrice(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const created = await createRawMaterialPriceDraft(req.body || {}, actor);
    res.status(201).json({ price: created, message: 'Price proposal created in DRAFT status.' });
  } catch (err: any) {
    if (err.errors) return res.status(400).json({ error: err.message, errors: err.errors, code: err.code });
    pgError(res, err);
  }
});

masterDataRouter.post('/raw-material-prices/:id/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  const action = String(req.body?.action || '').toUpperCase() as 'SUBMIT' | 'ASSIGN' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'EXPIRE' | 'CANCEL';

  if (!['SUBMIT', 'ASSIGN', 'REVIEW', 'APPROVE', 'REJECT', 'EXPIRE', 'CANCEL'].includes(action)) {
    return res.status(400).json({ error: `Invalid Price governance action: "${action}"` });
  }

  try {
    if (action === 'APPROVE') {
      assertCanApproveRawMaterialPrice(actor);
    } else {
      assertCanProposeRawMaterialPrice(actor);
    }
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const updated = await processPriceWorkflowAction(
      req.params.id,
      action,
      req.body || {},
      actor
    );
    res.json({ price: updated, action, message: `Price proposal ${action} executed successfully.` });
  } catch (err: any) {
    if (err.code === 'PRICE_PERIOD_OVERLAP') {
      return res.status(422).json({ error: err.message, code: err.code });
    }
    if (err.code === 'INVALID_WORKFLOW_TRANSITION') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    pgError(res, err);
  }
});

masterDataRouter.get('/raw-material-prices-export', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanProposeRawMaterialPrice(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const rawMaterialCode = typeof req.query.rawMaterialCode === 'string' ? req.query.rawMaterialCode : undefined;
    const workflowStatus = typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined;
    const prices = await listGovernedRawMaterialPrices({ rawMaterialCode, workflowStatus });

    const XLSX = await import('xlsx');
    const headers = [
      'Raw Material Code',
      'Description',
      'Price',
      'Currency',
      'UOM',
      'Effective From',
      'Effective To',
      'Status',
      'Approval Status',
      'Supplier',
      'Source',
      'Price Basis',
      'Comment',
    ];

    const data = prices.map((p) => [
      p.rawMaterialCode,
      p.rawMaterialDesc || '',
      p.price != null ? p.price : '',
      p.currency || '',
      p.uom || '',
      p.effectiveFrom ? new Date(p.effectiveFrom).toISOString().slice(0, 10) : '',
      p.effectiveTo ? new Date(p.effectiveTo).toISOString().slice(0, 10) : '',
      p.status || 'ACTIVE',
      p.workflowStatus || 'APPROVED',
      p.supplier || '',
      p.source || '',
      p.priceBasis || 'PER_KG',
      p.comment || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Raw Material Prices');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Raw_Material_Prices_Template.xlsx"');
    res.send(buf);
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/cable-scrap-template-export', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanViewCostingFormulas(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
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
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/cable-scrap-import/preview', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required.' });
  }
  try {
    const preview = await previewCableScrapImport(rows);
    res.json(preview);
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/cable-scrap-import/commit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanManageScrapRules(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (rows.length === 0) {
    return res.status(400).json({ error: 'rows array is required.' });
  }
  try {
    const result = await commitCableScrapImport(rows, actor);
    res.json(result);
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/raw-material-prices/import/preview', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanProposeRawMaterialPrice(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const sourceFile = req.body?.sourceFile || 'Price_Upload.xlsx';

  const { getPrisma } = await import('./db');
  const prisma = getPrisma();
  if (!prisma) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const [rms, approvedPrices] = await Promise.all([
      prisma.rawMaterial.findMany({ select: { code: true } }),
      prisma.rawMaterialPrice.findMany({ where: { workflowStatus: 'APPROVED' } }),
    ]);

    const existingCodes = new Set<string>(rms.map((r) => r.code.toUpperCase()));
    const { validatePriceInput, detectPricePeriodOverlap } = await import('../services/rawMaterialPriceGovernanceService');
    const { asTrimmedString, getExcelVal } = await import('../services/excelFieldUtils');

    const previewRows: any[] = [];
    const seenCodesInFile = new Map<string, number>();

    rows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const rawCode = asTrimmedString(getExcelVal(row, ['Raw Material Code', 'RawMaterialCode', 'Code']));
      const priceRaw = getExcelVal(row, ['Price']);
      const currency = asTrimmedString(getExcelVal(row, ['Currency']));
      const uom = asTrimmedString(getExcelVal(row, ['UOM', 'Unit of Measurement', 'Unit']));
      const effectiveFrom = asTrimmedString(getExcelVal(row, ['Effective From', 'From']));
      const effectiveTo = asTrimmedString(getExcelVal(row, ['Effective To', 'To']));
      const supplier = asTrimmedString(getExcelVal(row, ['Supplier']));
      const source = asTrimmedString(getExcelVal(row, ['Source']));
      const priceBasis = asTrimmedString(getExcelVal(row, ['Price Basis', 'PriceBasis'])) || 'PER_KG';
      const comment = asTrimmedString(getExcelVal(row, ['Comment', 'Notes']));

      const errors: Array<{ field: string; message: string; code: string }> = [];

      const parsedPrice = priceRaw === '' || priceRaw === undefined || priceRaw === null ? null : Number(priceRaw);

      const val = validatePriceInput(
        {
          rawMaterialCode: rawCode,
          price: parsedPrice,
          currency,
          uom,
          effectiveFrom,
          effectiveTo,
          supplier,
          source,
          priceBasis,
          comment,
        },
        { existingRawMaterialCodes: existingCodes }
      );

      errors.push(...val.errors);

      if (rawCode) {
        const key = rawCode.toUpperCase();
        if (seenCodesInFile.has(key)) {
          errors.push({
            field: 'rawMaterialCode',
            message: `Duplicate Raw Material Code "${rawCode}" in row ${seenCodesInFile.get(key)}.`,
            code: 'DUPLICATE',
          });
        } else {
          seenCodesInFile.set(key, rowNumber);
        }

        // Check Overlapping with Approved Prices
        if (val.valid) {
          const fromDate = effectiveFrom ? new Date(effectiveFrom) : null;
          const toDate = effectiveTo ? new Date(effectiveTo) : null;
          const overlap = detectPricePeriodOverlap(
            {
              rawMaterialCode: rawCode,
              currency,
              uom,
              priceBasis: priceBasis as any,
              effectiveFrom: fromDate,
              effectiveTo: toDate,
            },
            approvedPrices.map((p) => ({
              id: p.id,
              rawMaterialCode: p.rawMaterialCode,
              price: p.price != null ? Number(p.price) : null,
              currency: p.currency,
              uom: p.uom,
              effectiveFrom: p.effectiveFrom,
              effectiveTo: p.effectiveTo,
              supplier: p.supplier,
              source: p.source,
              priceBasis: p.priceBasis,
              workflowStatus: p.workflowStatus,
              isCurrent: p.isCurrent,
              revision: p.revision,
            }))
          );
          if (overlap.overlap) {
            errors.push({
              field: 'effectiveFrom',
              message: `Overlapping price period with existing approved price ${overlap.conflictingPrice?.id}.`,
              code: 'PRICE_PERIOD_OVERLAP',
            });
          }
        }
      }

      previewRows.push({
        rowNumber,
        rawMaterialCode: rawCode || `ROW-${rowNumber}`,
        valid: errors.length === 0,
        errors,
        parsedInput: {
          rawMaterialCode: rawCode,
          price: parsedPrice,
          currency,
          uom,
          effectiveFrom,
          effectiveTo,
          supplier,
          source: source || `Excel import: ${sourceFile}`,
          priceBasis,
          comment,
        },
      });
    });

    const totalRows = previewRows.length;
    const invalidCount = previewRows.filter((r) => !r.valid).length;
    const validCount = previewRows.filter((r) => r.valid).length;

    res.json({
      preview: {
        sourceFile,
        totalRows,
        validCount,
        invalidCount,
        canSubmit: invalidCount === 0 && totalRows > 0,
        rows: previewRows,
      },
    });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/raw-material-prices/import/commit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanProposeRawMaterialPrice(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const sourceFile = req.body?.sourceFile || 'Price_Upload.xlsx';

  const { getPrisma } = await import('./db');
  const prisma = getPrisma();
  if (!prisma) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const createdDrafts: any[] = [];
    for (const row of rows) {
      const draft = await createRawMaterialPriceDraft(row.parsedInput || row, actor);
      createdDrafts.push(draft);
    }

    res.json({
      sourceFile,
      importedCount: createdDrafts.length,
      prices: createdDrafts,
      message: `Successfully imported ${createdDrafts.length} price proposals as DRAFT.`,
    });
  } catch (err: any) {
    pgError(res, err);
  }
});

masterDataRouter.get('/drums', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res, 'Sign in is required to view drums.');
  if (!actor) return;
  try {
    res.json({ drums: await listDrums() });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/drums/capacity', async (req, res) => {
  const actor = await requireDrumComputeAuth(req, res);
  if (!actor) return;
  try {
    const { calculateDrumCapacity } = await import('../domain/drumCapacityCalculator');
    const body = req.body || {};
    const drum = body.drum || {};
    const cable = body.cable || {};
    const result = calculateDrumCapacity(
      {
        drumCode: String(drum.drumCode || 'UNKNOWN'),
        flange: Number(drum.flange),
        barrel: Number(drum.barrel),
        innerWidth: Number(drum.innerWidth),
        clearanceMm: drum.clearanceMm != null ? Number(drum.clearanceMm) : null,
        maxLoadKg: drum.maxLoadKg != null ? Number(drum.maxLoadKg) : drum.maxWeight != null ? Number(drum.maxWeight) : null,
        emptyDrumNetWeightKg:
          drum.emptyDrumNetWeightKg != null ? Number(drum.emptyDrumNetWeightKg) : null,
      },
      {
        cableDiameterMm: Number(cable.cableDiameterMm),
        outputDiameterMm: cable.outputDiameterMm != null ? Number(cable.outputDiameterMm) : null,
        approxWeightKgKm: Number(cable.approxWeightKgKm),
      }
    );
    res.json({ capacity: result });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/drums/candidates', async (req, res) => {
  const actor = await requireDrumComputeAuth(req, res);
  if (!actor) return;
  try {
    const { listDrumCandidates, buildDrumMasterEngineeringGapReport } = await import(
      '../domain/drumOptimizationService'
    );
    const body = req.body || {};
    const cable = body.cable || {};
    const drums = await listDrums();
    const cuttingLengthM = Number(body.cuttingLengthM);
    const cableTolerancePercent = Number(body.cableTolerancePercent);
    const cableInput = {
      cableDiameterMm: Number(cable.cableDiameterMm),
      outputDiameterMm: cable.outputDiameterMm != null ? Number(cable.outputDiameterMm) : null,
      approxWeightKgKm: Number(cable.approxWeightKgKm),
    };
    const result = listDrumCandidates({
      drums,
      cable: cableInput,
      cuttingLengthM,
      cableTolerancePercent,
    });
    const engineeringGap = buildDrumMasterEngineeringGapReport({
      drums,
      cableDiameterMm: cableInput.cableDiameterMm,
    });
    if (process.env.NODE_ENV !== 'production') {
      const missingClearance = drums.filter(
        (d) => d.clearanceMm == null && Number(cableInput.cableDiameterMm) <= 50
      ).length;
      const missingMaxLoad = drums.filter((d) => d.maxWeight == null).length;
      console.debug('[drum-api] candidates', {
        cableDiameterMm: cableInput.cableDiameterMm,
        approxWeightKgKm: cableInput.approxWeightKgKm,
        cuttingLengthM,
        cableTolerancePercent,
        drumCount: drums.length,
        suitable: result.suitable.length,
        incomplete: result.incomplete.length,
        unsuitable: result.unsuitable.length,
        missingClearance,
        missingMaxLoad,
        engineeringGapRootCause: engineeringGap.rootCause,
        sampleIncomplete: result.incomplete.slice(0, 5).map((c) => ({
          code: c.drum.drumCode,
          status: c.evaluationStatus,
          capacityStatus: c.capacity.status,
          missingFields: c.missingFields,
          reason: c.rejectionReasons[0] || null,
        })),
        sampleUnsuitable: result.unsuitable.slice(0, 5).map((c) => ({
          code: c.drum.drumCode,
          status: c.evaluationStatus,
          capacityStatus: c.capacity.status,
          reason: c.rejectionReasons[0] || null,
          maxUsable: c.capacity.maximumUsableLengthMeters,
        })),
      });
    }
    res.json({
      suitable: result.suitable,
      incomplete: result.incomplete,
      unsuitable: result.unsuitable,
      summary: {
        suitableCount: result.suitable.length,
        incompleteCount: result.incomplete.length,
        unsuitableCount: result.unsuitable.length,
        drumCount: drums.length,
      },
      engineeringGap,
    });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/drums/validate', async (req, res) => {
  const actor = await requireDrumComputeAuth(req, res);
  if (!actor) return;
  try {
    const { validateManualDrumPlan } = await import('../domain/drumOptimizationService');
    const body = req.body || {};
    const cable = body.cable || {};
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const drums = await listDrums();
    const plan = validateManualDrumPlan({
      drums,
      cable: {
        cableDiameterMm: Number(cable.cableDiameterMm),
        outputDiameterMm: cable.outputDiameterMm != null ? Number(cable.outputDiameterMm) : null,
        approxWeightKgKm: Number(cable.approxWeightKgKm),
      },
      cableTolerancePercent: Number(body.cableTolerancePercent),
      rows: rows.map((r: Record<string, unknown>) => ({
        drumCode: String(r.drumCode || ''),
        numberOfDrums: Number(r.numberOfDrums),
        cuttingLengthM: Number(r.cuttingLengthM),
        drumTolerancePercent: Number(r.drumTolerancePercent ?? 0),
      })),
      includeEngineering: body.includeEngineering !== false,
    });
    res.json({ plan });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/drums/optimize', async (req, res) => {
  const actor = await requireDrumComputeAuth(req, res);
  if (!actor) return;
  try {
    const { optimizeDrumPlan, optimizeDrumPlanForSchedule } = await import('../domain/drumOptimizationService');
    const body = req.body || {};
    const cable = body.cable || {};
    const drums = await listDrums();
    const cableInput = {
      cableDiameterMm: Number(cable.cableDiameterMm),
      outputDiameterMm: cable.outputDiameterMm != null ? Number(cable.outputDiameterMm) : null,
      approxWeightKgKm: Number(cable.approxWeightKgKm),
    };
    const cableTolerancePercent = Number(body.cableTolerancePercent);
    const drumTolerancePercent =
      body.drumTolerancePercent != null ? Number(body.drumTolerancePercent) : 0;
    const includeEngineering = body.includeEngineering !== false;
    const requirementRows = Array.isArray(body.requirements) ? body.requirements : [];
    const plan =
      requirementRows.length > 0
        ? optimizeDrumPlanForSchedule({
            drums,
            cable: cableInput,
            cableTolerancePercent,
            drumTolerancePercent,
            includeEngineering,
            requirements: requirementRows,
          })
        : optimizeDrumPlan({
            drums,
            cable: cableInput,
            totalOrderLengthM: Number(body.totalOrderLengthM),
            requestedDrumCount: (() => {
              const raw = Number(body.requestedDrumCount);
              return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
            })(),
            cableTolerancePercent,
            drumTolerancePercent,
            includeEngineering,
          });
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[drum-api] optimize', {
        totalOrderLengthM: Number(body.totalOrderLengthM),
        requestedDrumCount: body.requestedDrumCount,
        requirementCount: requirementRows.length,
        cableTolerancePercent,
        drumCount: drums.length,
        isValid: plan.isValid,
        lines: plan.lines.length,
        blocking: plan.blockingReasons[0] || null,
      });
    }
    res.json({ plan });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/reference', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    res.json({ parameters: await listReference() });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/readiness', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    res.json(await increment5Readiness());
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/engineering-mappings', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const workflowStatus = typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json({ mappings: await listEngineeringMappings({ status, workflowStatus, q }) });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/engineering-mappings-export', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanEditEngineeringMapping(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const workflowStatus = typeof req.query.workflowStatus === 'string' ? req.query.workflowStatus : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const mappings = await listEngineeringMappings({ status, workflowStatus, q });

    const { generateMappingTemplateWorkbook } = await import('../services/engineeringMappingExcelService');
    const wb = generateMappingTemplateWorkbook(
      mappings.map((m) => ({
        materialNumber: m.materialNumber,
        description: m.description,
        family: m.family != null ? String(m.family) : undefined,
        voltage: m.voltage != null ? String(m.voltage) : undefined,
        conductor: m.conductor != null ? String(m.conductor) : undefined,
        conductorSize: m.size != null ? String(m.size) : undefined,
        cores: m.cores != null ? String(m.cores) : undefined,
        insulation: m.insulation != null ? String(m.insulation) : undefined,
        screen: m.screen != null ? String(m.screen) : undefined,
        armour: m.armour != null ? String(m.armour) : undefined,
        sheath: m.sheath != null ? String(m.sheath) : undefined,
        sheathColour: m.sheathColour != null ? String(m.sheathColour) : undefined,
        coreColour: m.coreColour != null ? String(m.coreColour) : undefined,
        standard: m.standard != null ? String(m.standard) : undefined,
        specialAdditives: m.specialAdditives != null ? String(m.specialAdditives) : undefined,
        comment: m.comments != null ? String(m.comments) : undefined,
      }))
    );

    const buf = await import('xlsx').then((XLSX) => XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Engineering_Mapping_Export.xlsx"');
    res.send(buf);
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/engineering-mappings/:materialNumber', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    const detail = await getEngineeringMappingDetail(req.params.materialNumber);
    if (!detail) return res.status(404).json({ error: 'Engineering mapping not found.' });
    res.json(detail);
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.put('/engineering-mappings/:materialNumber', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanEditEngineeringMapping(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }
  try {
    const mapping = await updateEngineeringMappingDraft(req.params.materialNumber, req.body || {}, actor);
    res.json({ mapping, message: 'Draft engineering mapping updated successfully.' });
  } catch (err: any) {
    if (err.code === 'INVALID_PARAMETERS') return res.status(400).json({ error: err.message, errors: err.errors, code: err.code });
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    pgError(res, err);
  }
});

masterDataRouter.post('/engineering-mappings/bulk/validate', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanEditEngineeringMapping(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }
  const materialNumbers = Array.isArray(req.body?.materialNumbers) ? req.body.materialNumbers : [];
  try {
    const report = await validateBulkEngineeringMappings(materialNumbers);
    res.json(report);
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/engineering-mappings/bulk/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  const action = String(req.body?.action || '').toUpperCase() as 'SUBMIT' | 'ASSIGN' | 'APPROVE' | 'REJECT' | 'CANCEL';
  if (!['SUBMIT', 'ASSIGN', 'APPROVE', 'REJECT', 'CANCEL'].includes(action)) {
    return res.status(400).json({ error: `Invalid action "${action}". Allowed: SUBMIT, ASSIGN, APPROVE, REJECT, CANCEL` });
  }

  try {
    if (action === 'APPROVE') {
      assertCanApproveEngineeringMapping(actor);
    } else {
      assertCanEditEngineeringMapping(actor);
    }
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  const materialNumbers = Array.isArray(req.body?.materialNumbers) ? req.body.materialNumbers : [];
  try {
    const outcome = await processBulkWorkflowAction(
      materialNumbers,
      action,
      {
        assignedReviewer: req.body?.assignedReviewer,
        comments: req.body?.comments,
        decision: req.body?.decision,
      },
      actor
    );
    res.json(outcome);
  } catch (err: any) {
    if (err.code === 'APPROVAL_BLOCKED_INVALID_COMPATIBILITY') {
      return res.status(422).json({ error: err.message, details: err.details, code: err.code });
    }
    if (err.code === 'EMPTY_SELECTION') return res.status(400).json({ error: err.message });
    pgError(res, err);
  }
});

masterDataRouter.post('/engineering-mappings/import/preview', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanEditEngineeringMapping(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const sourceFile = req.body?.sourceFile || 'Mapping_Upload.xlsx';

  const { getPrisma } = await import('./db');
  const prisma = getPrisma();
  if (!prisma) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const [cables, parameters, compatibility] = await Promise.all([
      prisma.cableMaster.findMany({ select: { materialNumber: true, description: true } }),
      prisma.cableParameter.findMany({ where: { status: 'ACTIVE' } }),
      prisma.parameterCompatibility.findMany(),
    ]);

    const existingMap = new Map<string, { materialNumber: string; description: string }>(
      cables.map((c) => [c.materialNumber.toLowerCase(), { materialNumber: c.materialNumber, description: c.description }])
    );
    const { validateMappingImportRows } = await import('../services/engineeringMappingExcelService');
    const preview = validateMappingImportRows(rows, { existingCables: existingMap, parameters, compatibility }, sourceFile);
    res.json({ preview });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/engineering-mappings/import/commit', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanEditEngineeringMapping(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const sourceFile = req.body?.sourceFile || 'Mapping_Upload.xlsx';

  try {
    const result = await importEngineeringMappingsFromRows(rows, sourceFile, actor);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'IMPORT_VALIDATION_FAILED') {
      return res.status(422).json({ error: err.message, preview: err.preview, code: err.code });
    }
    pgError(res, err);
  }
});

masterDataRouter.post('/engineering-mappings/:materialNumber/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  const action = String(req.body?.action || '').toUpperCase() as 'SUBMIT' | 'ASSIGN' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'CANCEL';
  if (!['SUBMIT', 'ASSIGN', 'REVIEW', 'APPROVE', 'REJECT', 'CANCEL'].includes(action)) {
    return res.status(400).json({ error: `Invalid action "${action}". Allowed: SUBMIT, ASSIGN, REVIEW, APPROVE, REJECT, CANCEL` });
  }

  try {
    if (action === 'APPROVE') {
      assertCanApproveEngineeringMapping(actor);
    } else {
      assertCanEditEngineeringMapping(actor);
    }
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const updated = await processMappingWorkflowAction(
      req.params.materialNumber,
      action,
      {
        assignedReviewer: req.body?.assignedReviewer,
        comments: req.body?.comments,
        decision: req.body?.decision,
      },
      actor
    );
    res.json({ mapping: updated, action, message: `Action ${action} completed successfully.` });
  } catch (err: any) {
    if (err.code === 'APPROVAL_BLOCKED_INVALID_COMPATIBILITY') {
      return res.status(422).json({ error: err.message, code: err.code });
    }
    if (err.code === 'INVALID_WORKFLOW_TRANSITION') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    pgError(res, err);
  }
});

masterDataRouter.get('/bom-conflicts', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    const investigationStatus = typeof req.query.investigationStatus === 'string' ? req.query.investigationStatus : undefined;
    const classification = typeof req.query.classification === 'string' ? req.query.classification : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json({
      conflicts: await listBomConflictRegister({ investigationStatus, classification, q }),
      allowedClassifications: BOM_CONFLICT_CLASSIFICATIONS,
      allowedWorkflowStatuses: [
        'BUSINESS_DECISION_REQUIRED',
        'ASSIGNED',
        'UNDER_REVIEW',
        'DECISION_REQUIRED',
        'RESOLVED',
        'APPROVED',
        'REJECTED',
      ],
    });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/bom-conflicts-export', async (req, res) => {
  const actor = await actorFromRequest(req);
  try {
    assertCanInvestigateBomGovernance(actor);
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const investigationStatus = typeof req.query.investigationStatus === 'string' ? req.query.investigationStatus : undefined;
    const classification = typeof req.query.classification === 'string' ? req.query.classification : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const conflicts = await listBomConflictRegister({ investigationStatus, classification, q });

    const XLSX = await import('xlsx');
    const headers = [
      'Conflict ID',
      'Cable Material Number',
      'Cable Description',
      'Customer Code',
      'Raw Material Code',
      'Raw Material Description',
      'Weight A (Source)',
      'Weight B (Source)',
      'Selected Weight (Governed)',
      'UOM',
      'Source Rows',
      'Occurrence Count',
      'Classification',
      'Investigation Status',
      'BOM Version',
      'Plant',
      'Manufacturing Route',
      'Effective From',
      'Reviewer',
      'Decision',
      'Comment',
      'Approved By',
      'Approved Date',
    ];

    const data = conflicts.map((c) => [
      c.conflictId,
      c.cableMaterialNumber,
      c.cable,
      c.customerCode || '',
      c.rawMaterial,
      c.rawMaterialDesc || '',
      c.weightA,
      c.weightB,
      c.selectedWeight != null ? c.selectedWeight : '',
      c.uom,
      Array.isArray(c.sourceRows) ? (c.sourceRows as any[]).join(', ') : '',
      c.occurrenceCount,
      c.currentClassification,
      c.investigationStatus,
      c.bomVersion || '',
      c.plant || '',
      c.manufacturingRoute || '',
      c.effectiveFrom ? new Date(c.effectiveFrom).toISOString().slice(0, 10) : '',
      c.reviewer || '',
      c.decision || '',
      c.comment || '',
      c.approvedBy || '',
      c.approvedAt ? new Date(c.approvedAt).toISOString().slice(0, 10) : '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOM Conflicts');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="BOM_Conflicts_Register.xlsx"');
    res.send(buf);
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/bom-conflicts/:conflictId/actions', async (req, res) => {
  const actor = await actorFromRequest(req);
  const action = String(req.body?.action || '').toUpperCase() as 'ASSIGN' | 'START_REVIEW' | 'DECIDE' | 'RESOLVE' | 'APPROVE' | 'REJECT' | 'REOPEN';

  if (!['ASSIGN', 'START_REVIEW', 'DECIDE', 'RESOLVE', 'APPROVE', 'REJECT', 'REOPEN'].includes(action)) {
    return res.status(400).json({ error: `Invalid BOM governance action: "${action}"` });
  }

  try {
    if (action === 'APPROVE') {
      assertCanApproveBomGovernance(actor);
    } else {
      assertCanInvestigateBomGovernance(actor);
    }
  } catch (err) {
    if (err instanceof DomainError) return res.status(403).json({ error: err.message, code: err.code });
    return res.status(401).json({ error: 'Sign in required.', code: 'UNAUTHORIZED' });
  }

  try {
    const updated = await processBomGovernanceWorkflowAction(
      req.params.conflictId,
      action,
      req.body || {},
      actor
    );
    res.json({ conflict: updated, action, message: `BOM Governance action ${action} executed successfully.` });
  } catch (err: any) {
    if (err.code === 'INVALID_DECISION_EVIDENCE' || err.code === 'APPROVAL_BLOCKED_NO_GOVERNED_WEIGHT') {
      return res.status(422).json({ error: err.message, code: err.code });
    }
    if (err.code === 'INVALID_WORKFLOW_TRANSITION') {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    pgError(res, err);
  }
});

masterDataRouter.get('/costing-readiness', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    const materialNumber = typeof req.query.materialNumber === 'string' ? req.query.materialNumber : undefined;
    const list = await evaluateCableCostingReadiness(materialNumber);
    const summary = {
      totalCables: list.length,
      readyForCosting: list.filter((c) => c.overallStatus === 'READY_FOR_COSTING').length,
      dataIssue: list.filter((c) => c.overallStatus === 'DATA_ISSUE').length,
      underReview: list.filter((c) => c.overallStatus === 'UNDER_REVIEW').length,
      notReady: list.filter((c) => c.overallStatus === 'NOT_READY').length,
    };
    res.json({ summary, cables: list });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/raw-material-price-readiness', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    res.json({
      items: await rawMaterialPriceReadiness(),
      requiredFromFinance: [
        'price',
        'currency',
        'UOM',
        'effective date',
        'supplier/source',
        'price basis',
        'validity period',
      ],
      rule: 'BLANK PRICE ≠ ZERO. Status remains PRICE_NOT_CONFIGURED until Finance provides values.',
    });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/keys', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    const uniqueness = await cableUniquenessReport();
    res.json({ analysis: masterDataKeyAnalysis(), uniqueness });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/uniqueness', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    res.json(await cableUniquenessReport());
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/bom-duplicate-observations', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    res.json({ observations: await listBomDuplicateObservations() });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.get('/imports', async (req, res) => {
  const actor = await requireMasterReadAuth(req, res);
  if (!actor) return;
  try {
    res.json({ imports: await listImportHistory() });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/raw-materials', async (req, res) => {
  const actor = await requireBomRmAuth(req, res);
  if (!actor) return;
  const body = req.body || {};
  if (!body.code || !body.description || !body.uom) {
    return res.status(400).json({ error: 'code, description, and uom are required.' });
  }
  try {
    const rawMaterial = await createRawMaterial(
      {
        code: String(body.code),
        description: String(body.description),
        shortDescription: body.shortDescription,
        uom: String(body.uom),
        category: body.category,
        pricingCategory: body.pricingCategory,
        metalType: body.metalType,
        notes: body.notes,
        supplier: body.supplier,
        currency: body.currency,
        status: body.status,
      },
      actor
    );
    res.status(201).json({ rawMaterial });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'DUPLICATE_RAW_MATERIAL') return res.status(409).json({ error: (err as Error).message, code });
    pgError(res, err);
  }
});

masterDataRouter.put('/raw-materials/:code', async (req, res) => {
  const actor = await requireBomRmAuth(req, res);
  if (!actor) return;
  try {
    const rawMaterial = await updateRawMaterial(req.params.code, req.body || {}, actor);
    if (!rawMaterial) return res.status(404).json({ error: 'Raw material not found.' });
    res.json({ rawMaterial });
  } catch (err) {
    pgError(res, err);
  }
});

masterDataRouter.post('/raw-materials/:code/prices', async (req, res) => {
  const actor = await requireBomRmAuth(req, res);
  if (!actor) return;
  const body = req.body || {};
  if (body.price === '' || body.price === undefined) {
    return res.status(400).json({
      error: 'A blank price is PRICE_NOT_CONFIGURED. Do not post an empty price as zero.',
      code: 'PRICE_NOT_CONFIGURED',
    });
  }
  try {
    const created = await appendRawMaterialPrice(
      req.params.code,
      {
        price: body.price == null ? null : Number(body.price),
        currency: body.currency,
        effectiveFrom: body.effectiveFrom || null,
        effectiveTo: body.effectiveTo || null,
      },
      actor
    );
    if (!created) return res.status(404).json({ error: 'Raw material not found.' });
    res.status(201).json({ price: created });
  } catch (err) {
    pgError(res, err);
  }
});

async function runImport(req: {
  body: {
    kind?: MasterImportKind;
    rows?: Record<string, unknown>[];
    sourceFile?: string;
  };
  headers: { authorization?: string };
}, persist: boolean) {
  const kind = req.body.kind;
  const rows = req.body.rows;
  if (!kind || !Array.isArray(rows)) {
    throw Object.assign(new Error('kind and rows[] are required.'), { http: 400 });
  }
  const actor = await actorFromRequest(req);
  const importedBy = actor.name || 'api-user';
  const sourceFile = req.body.sourceFile || 'upload.xlsx';
  const [cables, boms, drums, rawMaterials] = persist
    ? await Promise.all([listCables(), listBoms(), listDrums(), listRawMaterials()]).catch(() => [[], [], [], []] as const)
    : await Promise.all([
        listCables().catch(() => []),
        listBoms().catch(() => []),
        listDrums().catch(() => []),
        listRawMaterials().catch(() => []),
      ]);
  const stores = memoryImportStores({
    cables: Array.isArray(cables) ? cables : [],
    boms: Array.isArray(boms) ? boms : [],
    drums: Array.isArray(drums) ? drums : [],
    rawMaterials: Array.isArray(rawMaterials) ? rawMaterials : [],
  });
  const parameters = await listReference().catch(() => []);
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
  return { result, actor, kind };
}

masterDataRouter.post('/imports/preview', async (req, res) => {
  const actor = await requireImportAuth(req, res);
  if (!actor) return;
  try {
    const { result } = await runImport(req, false);
    await persistImportBatchOnly(result.batch, result.batch.status === 'REJECTED' ? 'REJECTED' : 'PREVIEWED').catch(
      () => undefined
    );
    res.json({
      batch: result.batch,
      wouldCommit: result.batch.errorCount === 0,
      valid: result.batch.successCount,
      errors: result.batch.errorCount,
      warnings: result.batch.warningCount,
      duplicates: result.batch.duplicateCount || 0,
      skipped: result.batch.skippedCount || 0,
      message:
        result.batch.errorCount > 0
          ? 'Preview has ERROR rows. Nothing was written.'
          : 'Preview OK. Confirm to commit valid rows. Skipped/duplicate groups are not auto-fixed.',
    });
  } catch (err: any) {
    if (err.http === 400) return res.status(400).json({ error: err.message });
    pgError(res, err);
  }
});

masterDataRouter.post('/imports/commit', async (req, res) => {
  const actor = await requireImportAuth(req, res);
  if (!actor) return;
  try {
    const { result, kind } = await runImport(req, true);
    if (result.batch.errorCount > 0) {
      await persistImportBatchOnly(result.batch, 'REJECTED').catch(() => undefined);
      return res.status(422).json({
        batch: result.batch,
        committed: false,
        message: 'Import rejected. No ERROR rows were written. Duplicate BOM weights were not auto-resolved.',
      });
    }
    await persistImportTransaction({
      kind,
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
    res.json({
      batch: { ...result.batch, status: 'COMMITTED' },
      committed: true,
      postgresql: true,
      valid: result.cables?.length || result.boms?.length || result.drums?.length || result.rawMaterials?.length || 0,
      errors: 0,
      warnings: result.batch.warningCount,
      duplicates: result.batch.duplicateCount || 0,
      skipped: result.batch.skippedCount || 0,
    });
  } catch (err: any) {
    if (err.http === 400) return res.status(400).json({ error: err.message });
    pgError(res, err);
  }
});
