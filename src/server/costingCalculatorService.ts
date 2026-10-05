import { getPrisma } from './db';
import {
  buildLayerInputsFromCalculatorRows,
  CalculatorBasis,
  CalculatorLineResult,
  CalculatorParameterType,
  CalculatorRowInput,
  stackCalculatorRows,
} from '../domain/costingCalculator';
import { buildCostingRequestFromPreviewPayload } from '../services/costingRequestService';
import { executeCostingPreview, CostingPreviewResult } from './costingOrchestrationService';
function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

export interface CalculatorPreviewRequest {
  rows: CalculatorRowInput[];
  targetCurrency: string;
  materialNumber?: string;
  quantity?: number;
  lengthMeters?: number;
  baseAmount?: number;
  costingDate?: string;
}

export interface CalculatorPreviewResult {
  status: 'READY' | 'NOT_READY';
  targetCurrency: string;
  baseAmount: number;
  lines: CalculatorLineResult[];
  calculatorTotal: number;
  orchestratedTotal: string | null;
  materialPreview?: CostingPreviewResult;
  configurationVersionId?: string;
  blockingReasons: string[];
  helpExamples: string[];
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function parseRow(raw: unknown, index: number): CalculatorRowInput | { error: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: `Row ${index + 1}: invalid row payload.` };
  }
  const row = raw as Record<string, unknown>;
  const parameterType = String(row.parameterType || '').toUpperCase() as CalculatorParameterType;
  const basis = String(row.basis || '').toUpperCase() as CalculatorBasis;
  const value = Number(row.value);
  const allowedTypes: CalculatorParameterType[] = [
    'RAW_MATERIAL',
    'INCOTERM',
    'SCRAP',
    'EXCHANGE',
    'MARGIN',
    'CUSTOM',
  ];
  const allowedBasis: CalculatorBasis[] = ['FIXED_VALUE', 'PERCENT_OF_BASE', 'PER_UNIT', 'CONSUMPTION_QTY'];

  if (!allowedTypes.includes(parameterType)) {
    return { error: `Row ${index + 1}: unsupported parameterType.` };
  }
  if (!allowedBasis.includes(basis)) {
    return { error: `Row ${index + 1}: unsupported basis.` };
  }
  if (!Number.isFinite(value)) {
    return { error: `Row ${index + 1}: value must be a number.` };
  }

  return {
    parameterType,
    subCode: typeof row.subCode === 'string' ? row.subCode.trim() : undefined,
    basis,
    value,
    label: typeof row.label === 'string' ? row.label : undefined,
  };
}

export function parseCalculatorPreviewRequest(body: Record<string, unknown>): CalculatorPreviewRequest | { error: string } {
  const rowsRaw = Array.isArray(body.rows) ? body.rows : [];
  const rows: CalculatorRowInput[] = [];
  for (let i = 0; i < rowsRaw.length; i++) {
    const parsed = parseRow(rowsRaw[i], i);
    if ('error' in parsed) return parsed;
    rows.push(parsed);
  }

  const targetCurrency = String(body.targetCurrency || 'LE').toUpperCase();
  const quantity = Number(body.quantity ?? 1);
  const lengthMeters = Number(body.lengthMeters ?? 1000);
  const baseAmount = body.baseAmount != null ? Number(body.baseAmount) : undefined;

  if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'quantity must be > 0.' };
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) return { error: 'lengthMeters must be > 0.' };
  if (baseAmount != null && (!Number.isFinite(baseAmount) || baseAmount < 0)) {
    return { error: 'baseAmount must be >= 0 when provided.' };
  }

  return {
    rows,
    targetCurrency,
    materialNumber: typeof body.materialNumber === 'string' ? body.materialNumber.trim() : undefined,
    quantity,
    lengthMeters,
    baseAmount,
    costingDate: typeof body.costingDate === 'string' ? body.costingDate : undefined,
  };
}

async function loadRawMaterialPriceHints(currency: string): Promise<
  Record<string, { unitPrice: number; uom?: string; consumptionPerKm?: number }>
> {
  const prisma = requirePrisma();
  const [prices, bomLines] = await Promise.all([
    prisma.rawMaterialPrice.findMany({
      where: { workflowStatus: 'APPROVED', status: 'ACTIVE', isCurrent: true },
    }),
    prisma.governedBomLine.findMany({ where: { status: 'APPROVED' } }),
  ]);

  const consumptionByRm = new Map<string, number>();
  for (const line of bomLines) {
    const key = line.rawMaterialCode.toUpperCase();
    const existing = consumptionByRm.get(key) ?? 0;
    consumptionByRm.set(key, existing + Number(line.consumption));
  }

  const hints: Record<string, { unitPrice: number; uom?: string; consumptionPerKm?: number }> = {};
  for (const price of prices) {
    const key = price.rawMaterialCode.toUpperCase();
    const priceCurrency = (price.currency || 'USD').toUpperCase();
    if (priceCurrency !== currency.toUpperCase() && currency !== 'USD' && priceCurrency !== 'USD') {
      // Prefer same-currency prices; orchestration handles FX for cable preview
    }
    if (price.price == null) continue;
    hints[key] = {
      unitPrice: Number(price.price),
      uom: price.uom,
      consumptionPerKm: consumptionByRm.get(key),
    };
  }
  return hints;
}

export async function findActiveConfigurationVersionId(): Promise<string | undefined> {
  const prisma = requirePrisma();
  const version = await prisma.costingConfigurationVersion.findFirst({
    where: { workflowStatus: 'ACTIVE', isCurrent: true, status: 'ACTIVE' },
    orderBy: { activatedAt: 'desc' },
  });
  return version?.id;
}

/** Ensure STANDARD configuration with ex-work formula exists for calculator demos */
export async function ensureDefaultCostingConfiguration(
  actor: { id?: string; name?: string; email?: string } = { id: 'system', name: 'System' }
): Promise<string | undefined> {
  const prisma = requirePrisma();
  const active = await prisma.costingConfigurationVersion.findFirst({
    where: { workflowStatus: 'ACTIVE', isCurrent: true, status: 'ACTIVE' },
  });
  if (active) return active.id;

  let config = await prisma.costingConfiguration.findUnique({ where: { code: 'STANDARD' } });
  if (!config) {
    config = await prisma.costingConfiguration.create({
      data: {
        code: 'STANDARD',
        name: 'Standard Cable Costing',
        description: 'Default calculator method — Material + Scrap + Ex-Work',
        status: 'ACTIVE',
        createdBy: actorLabel(actor),
      },
    });
  }

  let version = await prisma.costingConfigurationVersion.findFirst({
    where: { configurationId: config.id, isCurrent: true },
    orderBy: { versionNo: 'desc' },
  });

  if (!version) {
    version = await prisma.costingConfigurationVersion.create({
      data: {
        configurationId: config.id,
        versionNo: 1,
        status: 'ACTIVE',
        workflowStatus: 'ACTIVE',
        isCurrent: true,
        activatedAt: new Date(),
        approvedBy: actorLabel(actor),
        approvedAt: new Date(),
        changeNotes: 'Seeded for Costing Calculator',
        createdBy: actorLabel(actor),
      },
    });
  } else if (version.workflowStatus !== 'ACTIVE') {
    version = await prisma.costingConfigurationVersion.update({
      where: { id: version.id },
      data: {
        status: 'ACTIVE',
        workflowStatus: 'ACTIVE',
        isCurrent: true,
        activatedAt: new Date(),
        approvedBy: actorLabel(actor),
        approvedAt: new Date(),
      },
    });
  }

  const exWorkComponent = await prisma.costingComponent.findUnique({ where: { code: 'EX_WORK' } });
  const existingFormula = await prisma.costingFormula.findFirst({
    where: { configurationVersionId: version.id, code: 'STANDARD_EXWORK' },
  });

  if (!existingFormula) {
    const formula = await prisma.costingFormula.create({
      data: {
        configurationVersionId: version.id,
        componentId: exWorkComponent?.id,
        code: 'STANDARD_EXWORK',
        name: 'Standard Ex-Work Loading',
        outputVariableCode: 'EX_WORK_COST',
        status: 'ACTIVE',
        sortOrder: 20,
        createdBy: actorLabel(actor),
        versions: {
          create: {
            versionNo: 1,
            expression: 'MATERIAL_COST / (1 - EX_WORK_RATE)',
            status: 'ACTIVE',
            changeNotes: 'Seeded ex-work formula',
            createdBy: actorLabel(actor),
            dependencies: {
              create: [
                { variableCode: 'MATERIAL_COST', dependencyType: 'VARIABLE' },
                { variableCode: 'EX_WORK_RATE', dependencyType: 'VARIABLE' },
              ],
            },
          },
        },
      },
    });
    void formula;
  }

  await prisma.costingConfiguration.update({
    where: { id: config.id },
    data: { status: 'ACTIVE', updatedBy: actorLabel(actor) },
  });

  return version.id;
}

export async function executeCalculatorPreview(request: CalculatorPreviewRequest): Promise<CalculatorPreviewResult> {
  const configurationVersionId = await ensureDefaultCostingConfiguration();
  const blockingReasons: string[] = [];
  let baseAmount = request.baseAmount ?? 0;
  let materialPreview: CostingPreviewResult | undefined;

  const rawMaterialPrices = await loadRawMaterialPriceHints(request.targetCurrency);

  if (request.materialNumber) {
    const layerInputs = {
      ...buildLayerInputsFromCalculatorRows(request.rows),
    };
    const built = buildCostingRequestFromPreviewPayload({
      materialNumber: request.materialNumber,
      quantity: request.quantity,
      lengthMeters: request.lengthMeters,
      currency: request.targetCurrency,
      configurationVersionId,
      costingDate: request.costingDate,
      layerInputs,
    });
    if ('error' in built) {
      blockingReasons.push(built.error);
    } else {
      materialPreview = await executeCostingPreview(built);
      if (materialPreview.blockingReasons.length > 0) {
        blockingReasons.push(...materialPreview.blockingReasons);
      }
      const materialCost = Number(materialPreview.totals.materialCost || 0);
      if (materialCost > 0) {
        baseAmount = materialCost;
      }
    }
  }

  const { lines, total } = stackCalculatorRows(request.rows, {
    baseAmount,
    quantity: request.quantity ?? 1,
    lengthMeters: request.lengthMeters ?? 1000,
    rawMaterialPrices,
  });

  const orchestratedTotal =
    materialPreview?.status === 'READY' && materialPreview.totals.manufacturingTotal
      ? materialPreview.totals.manufacturingTotal
      : null;

  const helpExamples = [
    'Material + Scrap + Ex-Work: set cable material number, add SCRAP 3–5%, then MARGIN 6% (ex-work).',
    'Incoterm stack: add INCOTERM FOB/CIF with % of base after material cost.',
    'Manual base: leave material empty, set base amount, stack FIXED_VALUE or % lines.',
  ];

  return {
    status: blockingReasons.length === 0 ? 'READY' : 'NOT_READY',
    targetCurrency: request.targetCurrency,
    baseAmount,
    lines,
    calculatorTotal: total,
    orchestratedTotal,
    materialPreview,
    configurationVersionId,
    blockingReasons,
    helpExamples,
  };
}
