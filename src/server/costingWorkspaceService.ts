import { getPrisma } from './db';
import { listCostingCurrencies } from './costingCurrencyRepository';
import { listCostingExchangeRates } from './costingExchangeRateRepository';
import { listCostingScrapRules } from './costingScrapRuleRepository';
import {
  ENERGYA_COSTING_PROBE_CABLES,
  evaluateCostingReadinessForCables,
  ELAND_REGRESSION_CABLES,
} from './costingReadinessService';
import { evaluateCableCostingReadiness } from './governanceRepository';
import type { CableCostingReadiness } from '../services/bomGovernanceService';
import { computeProductionReadiness } from './productionReadiness';
import { loadDecision5SignOff } from './decision5SignOff';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export async function getCostingWorkspaceDashboard() {
  const prisma = requirePrisma();

  const [
    currencies,
    exchangeRates,
    rmTotal,
    rmCopper,
    rmAluminium,
    rmStandard,
    priceActive,
    pricePending,
    cableCount,
    governedBomCables,
    governedBomPending,
    scrapRules,
    importBatches,
    importFailed,
    costingAuditRuns,
    costingFailed,
  ] = await Promise.all([
    listCostingCurrencies({ status: 'ACTIVE' }),
    listCostingExchangeRates({ workflowStatus: 'ACTIVE' }),
    prisma.rawMaterial.count(),
    prisma.rawMaterial.count({ where: { pricingCategory: 'MARKET_METAL_COPPER' } }),
    prisma.rawMaterial.count({ where: { pricingCategory: 'MARKET_METAL_ALUMINIUM' } }),
    prisma.rawMaterial.count({ where: { pricingCategory: 'STANDARD_RAW_MATERIAL' } }),
    prisma.rawMaterialPrice.count({ where: { isCurrent: true, workflowStatus: 'APPROVED', status: 'ACTIVE' } }),
    prisma.rawMaterialPrice.count({
      where: { isCurrent: true, workflowStatus: { in: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'] } },
    }),
    prisma.cableMaster.count({ where: { status: 'ACTIVE' } }),
    prisma.governedBomLine.findMany({ distinct: ['cableMaterialNumber'], select: { cableMaterialNumber: true } }),
    prisma.governedBomLine.count({ where: { status: { not: 'APPROVED' } } }),
    listCostingScrapRules(),
    prisma.importBatch.count({
      where: { importedDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, errorCount: 0 },
    }),
    prisma.importBatch.count({
      where: { importedDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, errorCount: { gt: 0 } },
    }),
    prisma.auditEvent.count({
      where: {
        at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        OR: [
          { entity: { contains: 'Costing', mode: 'insensitive' } },
          { action: { in: ['PREVIEW', 'VALIDATE', 'CALCULATE'] } },
        ],
      },
    }),
    prisma.auditEvent.count({
      where: {
        at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        action: { in: ['FAILED', 'BLOCKED', 'ERROR'] },
      },
    }),
  ]);

  const scrapActive = scrapRules.filter((r) => r.workflowStatus === 'ACTIVE' && r.scrapRate != null).length;
  const scrapUnderCreation = scrapRules.filter(
    (r) => r.workflowStatus !== 'ACTIVE' || r.scrapRate == null
  ).length;

  return {
    currencies: { active: currencies.length },
    exchangeRates: { active: exchangeRates.length },
    rawMaterials: { total: rmTotal, copper: rmCopper, aluminium: rmAluminium, standard: rmStandard },
    rawMaterialPrices: { active: priceActive, pendingApproval: pricePending },
    bom: {
      cables: cableCount,
      governed: governedBomCables.length,
      pendingApproval: governedBomPending,
    },
    scrapRules: { active: scrapActive, underCreation: scrapUnderCreation },
    imports: { successful: importBatches, failed: importFailed },
    costingRuns: { completed: costingAuditRuns, failed: costingFailed },
  };
}

export async function validateCostingWorkspaceCable(
  materialNumber: string,
  actor: { id?: string; name?: string; email?: string },
  options?: { lengthMeters?: number; currency?: string; commercialMetadata?: Record<string, unknown> }
) {
  const built = {
    materialNumber,
    quantity: 1,
    lengthMeters: options?.lengthMeters ?? 1000,
    currency: options?.currency ?? 'USD',
    commercialMetadata: options?.commercialMetadata,
  };
  const { executeCostingForInquiryLine } = await import('./costingOrchestrationService');
  const { buildCostingRequestFromPreviewPayload } = await import('../services/costingRequestService');
  const req = buildCostingRequestFromPreviewPayload(built);
  if ('error' in req) return { status: 'NOT_READY', blockingReasons: [req.error] };
  return executeCostingForInquiryLine(req, actor, { persist: false });
}

export async function getElandReadinessSummary(actor: { id?: string; name?: string; email?: string }) {
  return evaluateCostingReadinessForCables([...ELAND_REGRESSION_CABLES], actor, {
    lengthMeters: 1000,
    quantity: 1,
    currency: 'USD',
  });
}

export type CostingReadinessSummaryKpis = {
  total: number;
  ready: number;
  blocked: number;
  warning: number;
  notChecked: number;
  gate1Failures: number;
  gate2Failures: number;
  gate3Failures: number;
  gate4Failures: number;
  topBlockers: Array<{ reason: string; count: number }>;
};

export type CostingReadinessTableRow = CableCostingReadiness & {
  family?: string | null;
  gate1: 'PASS' | 'BLOCKED' | 'WARN';
  gate2: 'PASS' | 'BLOCKED' | 'WARN';
  gate3: 'PASS' | 'BLOCKED' | 'WARN';
  gate4: 'PASS' | 'BLOCKED' | 'WARN';
  blockerCount: number;
};

export type CostingReadinessGateDetail = {
  gate: number;
  label: string;
  status: 'PASS' | 'BLOCKED' | 'WARN';
  detail?: string;
};

export type CostingReadinessActionLink = {
  label: string;
  tab: string;
  intent?: Record<string, unknown>;
};

function gateStatusFromReasons(reasons: string[], gate: number, passWhen: boolean): 'PASS' | 'BLOCKED' | 'WARN' {
  if (passWhen) return 'PASS';
  const hit = reasons.some((r) => r.includes(`Gate ${gate}`));
  if (hit) return 'BLOCKED';
  return 'WARN';
}

function enrichReadinessRow(c: CableCostingReadiness & { family?: string | null }): CostingReadinessTableRow {
  const reasons = c.blockingReasons || [];
  return {
    ...c,
    gate1: gateStatusFromReasons(reasons, 1, c.engineeringStatus === 'APPROVED'),
    gate2: gateStatusFromReasons(reasons, 2, c.bomStatus === 'RESOLVED'),
    gate3: gateStatusFromReasons(reasons, 3, !reasons.some((r) => r.includes('Gate 3'))),
    gate4: gateStatusFromReasons(reasons, 4, c.rmPriceStatus === 'ALL_PRICED'),
    blockerCount: reasons.length,
  };
}

function summarizeReadinessKpis(list: Array<CableCostingReadiness & { family?: string | null }>): CostingReadinessSummaryKpis {
  const blockerCounts = new Map<string, number>();
  for (const cable of list) {
    for (const reason of cable.blockingReasons || []) {
      const normalized = reason.replace(/^Gate \d Failed: /, '').slice(0, 120);
      blockerCounts.set(normalized, (blockerCounts.get(normalized) || 0) + 1);
    }
  }
  const topBlockers = [...blockerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({ reason, count }));

  return {
    total: list.length,
    ready: list.filter((c) => c.overallStatus === 'READY_FOR_COSTING').length,
    blocked: list.filter((c) => c.overallStatus === 'NOT_READY' || c.overallStatus === 'DATA_ISSUE').length,
    warning: list.filter((c) => c.overallStatus === 'UNDER_REVIEW').length,
    notChecked: list.filter((c) => c.engineeringStatus === 'MISSING' || c.engineeringStatus === 'CONFIG_REQUIRED').length,
    gate1Failures: list.filter((c) => c.blockingReasons.some((r) => r.includes('Gate 1'))).length,
    gate2Failures: list.filter((c) => c.blockingReasons.some((r) => r.includes('Gate 2'))).length,
    gate3Failures: list.filter((c) => c.blockingReasons.some((r) => r.includes('Gate 3'))).length,
    gate4Failures: list.filter((c) => c.blockingReasons.some((r) => r.includes('Gate 4'))).length,
    topBlockers,
  };
}

export async function getCostingReadinessSummary() {
  const list = await evaluateCableCostingReadiness();
  return {
    summary: summarizeReadinessKpis(list),
    evaluatedAt: new Date().toISOString(),
    source: 'evaluateCableCostingReadiness',
  };
}

export async function listCostingReadinessCables(options?: {
  search?: string;
  status?: string;
  gate?: string;
  page?: number;
  pageSize?: number;
}) {
  const search = (options?.search || '').trim().toLowerCase();
  const status = (options?.status || 'ALL').toUpperCase();
  const gate = (options?.gate || '').trim();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, options?.pageSize ?? 25));

  let list = (await evaluateCableCostingReadiness()).map(enrichReadinessRow);

  if (status === 'READY') {
    list = list.filter((c) => c.overallStatus === 'READY_FOR_COSTING');
  } else if (status === 'BLOCKED') {
    list = list.filter((c) => c.overallStatus === 'NOT_READY' || c.overallStatus === 'DATA_ISSUE');
  } else if (status === 'WARNING') {
    list = list.filter((c) => c.overallStatus === 'UNDER_REVIEW');
  } else if (status === 'NOT_CHECKED') {
    list = list.filter((c) => c.engineeringStatus === 'MISSING' || c.engineeringStatus === 'CONFIG_REQUIRED');
  }

  if (gate === '1') list = list.filter((c) => c.gate1 !== 'PASS');
  else if (gate === '2') list = list.filter((c) => c.gate2 !== 'PASS');
  else if (gate === '3') list = list.filter((c) => c.gate3 !== 'PASS');
  else if (gate === '4') list = list.filter((c) => c.gate4 !== 'PASS');

  if (search) {
    list = list.filter(
      (c) =>
        c.materialNumber.toLowerCase().includes(search) ||
        String(c.cableDescription || '')
          .toLowerCase()
          .includes(search) ||
        String(c.family || '')
          .toLowerCase()
          .includes(search)
    );
  }

  const total = list.length;
  const offset = (page - 1) * pageSize;
  return {
    cables: list.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    source: 'evaluateCableCostingReadiness',
  };
}

function buildReadinessActionLinks(
  cable: CableCostingReadiness,
  engine?: { formula?: boolean; scrap?: boolean; prices?: boolean; bom?: boolean }
): CostingReadinessActionLink[] {
  const actions: CostingReadinessActionLink[] = [];
  if (cable.bomStatus !== 'RESOLVED') {
    actions.push({ label: 'Resolve BOM in BOM Explorer', tab: 'bom' });
    if (cable.bomStatus === 'CONFLICT_UNRESOLVED') {
      actions.push({ label: 'Bulk upload governed BOM', tab: 'bulk_import', intent: { bulkKind: 'boms', bulkStep: 1 } });
    }
  }
  if (cable.rmPriceStatus !== 'ALL_PRICED' || cable.blockingReasons.some((r) => r.includes('Gate 4'))) {
    actions.push({ label: 'Configure Raw Material Prices', tab: 'raw_material_prices' });
    actions.push({ label: 'Bulk import prices', tab: 'bulk_import', intent: { bulkKind: 'raw_material_prices', bulkStep: 1 } });
  }
  if (cable.blockingReasons.some((r) => r.includes('Gate 3'))) {
    actions.push({ label: 'Open Raw Material Master', tab: 'raw_materials' });
  }
  if (engine && (!engine.formula || !engine.scrap)) {
    actions.push({ label: 'Review Scrap Rules', tab: 'scrap_rules' });
    actions.push({ label: 'Run costing validation', tab: 'validation' });
  }
  if (engine && !engine.prices) {
    actions.push({ label: 'Review Exchange Rates', tab: 'exchange_rates' });
  }
  return actions;
}

export async function getCostingReadinessCableDetail(
  materialNumber: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const rows = await evaluateCableCostingReadiness(materialNumber);
  if (!rows.length) return null;
  const cable = rows[0];
  const engineRows = await evaluateCostingReadinessForCables([materialNumber], actor, {
    lengthMeters: 1000,
    quantity: 1,
    currency: 'USD',
  });
  const engine = engineRows[0];
  const reasons = cable.blockingReasons || [];
  const gate5Pass = engine?.status === 'READY';
  const gates: CostingReadinessGateDetail[] = [
    {
      gate: 1,
      label: 'Engineering Mapping',
      status: cable.engineeringStatus === 'APPROVED' ? 'PASS' : cable.engineeringStatus === 'PARTIAL' ? 'WARN' : 'BLOCKED',
      detail: reasons.find((r) => r.includes('Gate 1')) || (cable.engineeringStatus === 'APPROVED' ? 'Approved mapping on file.' : undefined),
    },
    {
      gate: 2,
      label: 'Governed BOM',
      status: cable.bomStatus === 'RESOLVED' ? 'PASS' : cable.bomStatus === 'CONFLICT_UNRESOLVED' ? 'BLOCKED' : 'WARN',
      detail: reasons.find((r) => r.includes('Gate 2')),
    },
    {
      gate: 3,
      label: 'Raw Materials',
      status: reasons.some((r) => r.includes('Gate 3')) ? 'BLOCKED' : 'PASS',
      detail: reasons.find((r) => r.includes('Gate 3')),
    },
    {
      gate: 4,
      label: 'Raw Material Prices',
      status: cable.rmPriceStatus === 'ALL_PRICED' ? 'PASS' : 'BLOCKED',
      detail: reasons.filter((r) => r.includes('Gate 4')).slice(0, 3).join(' · ') || undefined,
    },
    {
      gate: 5,
      label: 'Costing Engine (Formula / Scrap / FX)',
      status: gate5Pass ? 'PASS' : engine?.missing?.length ? 'BLOCKED' : 'WARN',
      detail: engine?.missing?.slice(0, 4).join(' · ') || (gate5Pass ? 'Engine preview READY (persist: false).' : undefined),
    },
  ];

  return {
    cable: enrichReadinessRow(cable),
    gates,
    blockingReasons: reasons,
    whyNotCosted: reasons.length ? reasons : gate5Pass ? [] : engine?.missing || [],
    engineProbe: engine,
    actions: buildReadinessActionLinks(cable, engine),
    source: {
      governance: 'evaluateCableCostingReadiness',
      engine: 'evaluateCostingReadinessForCables',
    },
  };
}

export async function getGoldenRegressionProbeStatus(actor: { id?: string; name?: string; email?: string }) {
  const governance = (await evaluateCableCostingReadiness()).filter((c) =>
    (ENERGYA_COSTING_PROBE_CABLES as readonly string[]).includes(c.materialNumber)
  );
  const engine = await evaluateCostingReadinessForCables([...ENERGYA_COSTING_PROBE_CABLES], actor, {
    lengthMeters: 1000,
    quantity: 1,
    currency: 'USD',
  });
  return {
    cables: ENERGYA_COSTING_PROBE_CABLES.map((materialNumber) => {
      const gov = governance.find((g) => g.materialNumber === materialNumber);
      const eng = engine.find((e) => e.materialNumber === materialNumber);
      return {
        materialNumber,
        governanceStatus: gov?.overallStatus || 'NOT_FOUND',
        engineStatus: eng?.status || 'NOT_CHECKED',
        gate4Blocked: gov?.blockingReasons.some((r) => r.includes('Gate 4')) ?? false,
        missing: eng?.missing?.slice(0, 3) || gov?.blockingReasons.slice(0, 3) || [],
      };
    }),
    probeSet: 'ENERGYA_COSTING_PROBE_CABLES',
  };
}

/** Aggregates existing readiness APIs. Does not change costingEngine or Option B. */
export async function getProductionReadinessControl(actor: { id?: string; name?: string; email?: string }) {
  const [summaryRes, golden, currenciesFx, scrapRules, decision5] = await Promise.all([
    getCostingReadinessSummary(),
    getGoldenRegressionProbeStatus(actor),
    listCostingExchangeRates({ workflowStatus: 'ACTIVE' }),
    listCostingScrapRules(),
    loadDecision5SignOff(),
  ]);
  const scrapActive = scrapRules.filter((r) => r.workflowStatus === 'ACTIVE' && r.scrapRate != null).length;
  const computed = computeProductionReadiness({
    summary: summaryRes.summary,
    golden: golden.cables,
    fxActiveCount: currenciesFx.length,
    scrapActiveCount: scrapActive,
    decision5,
    ci: { tests: 'NOT_VERIFIED', typescript: 'NOT_VERIFIED' },
  });
  return {
    ...computed,
    decision5,
    golden: golden.cables,
    evaluatedAt: summaryRes.evaluatedAt,
    source: {
      governance: 'evaluateCableCostingReadiness',
      golden: 'getGoldenRegressionProbeStatus',
      fx: 'listCostingExchangeRates',
      scrap: 'listCostingScrapRules',
      decision5: decision5.source || 'none',
      ci: 'NOT_VERIFIED',
    },
  };
}

export async function listWorkbookPriceCandidates() {
  const prisma = requirePrisma();
  const fs = await import('node:fs');
  const path = await import('node:path');
  const XLSX = await import('xlsx');
  const filePath = path.resolve('data/source/Raw Material List.xlsx');
  if (!fs.existsSync(filePath)) {
    return { sourceFile: 'Raw Material List.xlsx', candidates: [], missingFile: true };
  }
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const codes = rows
    .map((r) => String(r['Raw Material Code'] || r.Code || '').trim())
    .filter(Boolean);
  const existing = await prisma.rawMaterialPrice.findMany({
    where: { rawMaterialCode: { in: codes } },
    select: { rawMaterialCode: true, price: true, currency: true, uom: true, workflowStatus: true, isCurrent: true },
  });
  const byCode = new Map<string, typeof existing>();
  for (const p of existing) {
    const list = byCode.get(p.rawMaterialCode) || [];
    list.push(p);
    byCode.set(p.rawMaterialCode, list);
  }
  const candidates = rows
    .map((r) => {
      const code = String(r['Raw Material Code'] || r.Code || '').trim();
      if (!code) return null;
      const workbookPrice = r.Price === '' || r.Price == null ? null : Number(r.Price);
      const workbookCurrency = String(r.Currency || '');
      const workbookUom = String(r.UofM || r.UOM || '');
      const db = byCode.get(code) || [];
      const approved = db.find((p) => p.workflowStatus === 'APPROVED' && p.isCurrent);
      const draft = db.find((p) => p.workflowStatus !== 'APPROVED' && p.isCurrent);
      let action: 'UNCHANGED' | 'REVIEW_DRAFT' | 'MISSING_APPROVED' | 'WORKBOOK_ONLY' = 'UNCHANGED';
      if (workbookPrice == null || !Number.isFinite(workbookPrice)) action = 'UNCHANGED';
      else if (!db.length) action = 'WORKBOOK_ONLY';
      else if (!approved) action = 'REVIEW_DRAFT';
      else if (Number(approved.price) !== workbookPrice) action = 'REVIEW_DRAFT';
      return {
        rawMaterialCode: code,
        description: String(r.Description || ''),
        workbookPrice,
        workbookCurrency,
        workbookUom,
        dbApprovedPrice: approved?.price != null ? Number(approved.price) : null,
        dbApprovedCurrency: approved?.currency || null,
        dbDraftPrice: draft?.price != null ? Number(draft.price) : null,
        dbDraftStatus: draft?.workflowStatus || null,
        action,
      };
    })
    .filter(Boolean);
  return { sourceFile: 'Raw Material List.xlsx', candidates, inserted: false };
}

function cell(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const match = Object.keys(row).find((k) => k.trim().toLowerCase() === key.toLowerCase());
    if (match != null && row[match] !== undefined && row[match] !== '') return String(row[match]).trim();
  }
  return '';
}

export async function previewGovernedCostingBulk(
  kind: string,
  rows: Record<string, unknown>[],
  sourceFile: string
) {
  const prisma = requirePrisma();
  const previewRows: Array<Record<string, unknown>> = [];
  const errors: Array<{ rowNumber: number; code: string; message: string }> = [];
  const warnings: Array<{ rowNumber: number; code: string; message: string }> = [];
  let insertCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;

  if (kind === 'raw_material_prices') {
    const codes = rows.map((r) => cell(r, 'Raw Material Code', 'RM Code')).filter(Boolean);
    const existing = await prisma.rawMaterialPrice.findMany({
      where: { rawMaterialCode: { in: codes }, isCurrent: true },
    });
    const byCode = new Map<string, typeof existing>();
    for (const p of existing) {
      const list = byCode.get(p.rawMaterialCode) || [];
      list.push(p);
      byCode.set(p.rawMaterialCode, list);
    }
    rows.forEach((row, i) => {
      const code = cell(row, 'Raw Material Code', 'RM Code');
      const rowNumber = i + 2;
      if (!code) {
        errors.push({ rowNumber, code: 'REQUIRED', message: 'RM Code is required.' });
        previewRows.push({ ...row, action: 'ERROR' });
        return;
      }
      const db = byCode.get(code) || [];
      const approved = db.find((p) => p.workflowStatus === 'APPROVED');
      const draft = db.find((p) => p.workflowStatus === 'DRAFT' || p.workflowStatus === 'SUBMITTED');
      if (!db.length) {
        insertCount += 1;
        warnings.push({
          rowNumber,
          code: 'CANDIDATE',
          message: `${code} is not in the price table. Apply through Raw Material Prices — nothing is auto-inserted here.`,
        });
        previewRows.push({ ...row, action: 'INSERT' });
        return;
      }
      const incoming = Number(cell(row, 'Unit Price', 'Price'));
      if (approved && Number(approved.price) === incoming) {
        unchangedCount += 1;
        previewRows.push({ ...row, action: 'UNCHANGED' });
        return;
      }
      if (approved) {
        warnings.push({
          rowNumber,
          code: 'NO_SILENT_OVERWRITE',
          message: `${code} already has an approved price. Create a new draft via the price workflow; bulk apply will not overwrite it.`,
        });
        previewRows.push({ ...row, action: 'WARNING' });
        return;
      }
      updateCount += 1;
      previewRows.push({ ...row, action: 'UPDATE', existingStatus: draft?.workflowStatus || 'DRAFT' });
    });
  } else if (kind === 'currencies') {
    const existing = await prisma.costingCurrency.findMany();
    const byCode = new Map(existing.map((c) => [c.code.toUpperCase(), c]));
    rows.forEach((row, i) => {
      const code = cell(row, 'Code').toUpperCase();
      const rowNumber = i + 2;
      if (!code) {
        errors.push({ rowNumber, code: 'REQUIRED', message: 'Currency code is required.' });
        previewRows.push({ ...row, action: 'ERROR' });
        return;
      }
      if (!byCode.has(code)) {
        insertCount += 1;
        previewRows.push({ ...row, action: 'INSERT' });
        return;
      }
      unchangedCount += 1;
      previewRows.push({ ...row, action: 'UNCHANGED' });
    });
  } else if (kind === 'exchange_rates') {
    const existing = await prisma.costingExchangeRate.findMany({ where: { isCurrent: true } });
    rows.forEach((row, i) => {
      const from = cell(row, 'From Currency', 'Currency').toUpperCase();
      const to = cell(row, 'To Currency', 'To').toUpperCase() || 'LE';
      const rate = Number(cell(row, 'Rate to Base', 'Rate'));
      const rowNumber = i + 2;
      const hit = existing.find(
        (r) => r.fromCurrency.toUpperCase() === from && r.toCurrency.toUpperCase() === to
      );
      if (!from || !Number.isFinite(rate) || rate <= 0) {
        errors.push({ rowNumber, code: 'VALIDATION_ERROR', message: 'Currency and positive Rate to Base are required.' });
        previewRows.push({ ...row, action: 'ERROR' });
        return;
      }
      if (!hit) {
        insertCount += 1;
        previewRows.push({ ...row, action: 'INSERT' });
        return;
      }
      if (Number(hit.rate) === rate) {
        unchangedCount += 1;
        previewRows.push({ ...row, action: 'UNCHANGED' });
        return;
      }
      if (hit.workflowStatus === 'APPROVED' || hit.workflowStatus === 'ACTIVE') {
        warnings.push({
          rowNumber,
          code: 'NO_SILENT_OVERWRITE',
          message: `${from}→${to} is ${hit.workflowStatus}. Edit through Exchange Rates workflow.`,
        });
        previewRows.push({ ...row, action: 'WARNING' });
        return;
      }
      updateCount += 1;
      previewRows.push({ ...row, action: 'UPDATE' });
    });
  } else if (kind === 'scrap_rules') {
    const existing = await prisma.costingScrapRule.findMany({ where: { isCurrent: true } });
    rows.forEach((row, i) => {
      const family = cell(row, 'Family');
      const rowNumber = i + 2;
      const hit = existing.find((r) => (r.scopeValue || '').toUpperCase() === family.toUpperCase());
      if (!family) {
        errors.push({ rowNumber, code: 'REQUIRED', message: 'Family is required.' });
        previewRows.push({ ...row, action: 'ERROR' });
        return;
      }
      if (!hit) {
        insertCount += 1;
        previewRows.push({ ...row, action: 'INSERT' });
        return;
      }
      unchangedCount += 1;
      previewRows.push({ ...row, action: 'UNCHANGED' });
    });
  }

  return {
    batch: {
      batchNumber: 'PREVIEW',
      sourceFile,
      importedDate: new Date().toISOString(),
      dataType: kind,
      rowCount: rows.length,
      successCount: insertCount + updateCount + unchangedCount,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors,
      warnings,
      information: [
        {
          rowNumber: 0,
          code: 'NO_SILENT_APPLY',
          message: 'Preview only. Apply uses dedicated Costing Configuration forms so approved masters are never silently overwritten.',
        },
      ],
      skipped: [],
      insertCount,
      updateCount,
      unchangedCount,
    },
    rows: previewRows,
    previewRows,
  };
}


