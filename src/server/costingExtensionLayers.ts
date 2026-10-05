import { getPrisma } from './db';

export interface ExtensionLayerResult {
  layer: 'METAL_RATE' | 'LOGISTICS' | 'PACKING';
  status: 'CONFIGURED' | 'NOT_CONFIGURED' | 'NOT_READY';
  amount: number | null;
  currency: string | null;
  ruleCode: string | null;
  message: string;
  details?: Record<string, unknown>;
}

function isEffective(
  effectiveFrom: Date | null,
  effectiveTo: Date | null,
  costingDate: Date
): boolean {
  if (effectiveFrom && costingDate < effectiveFrom) return false;
  if (effectiveTo && costingDate > effectiveTo) return false;
  return true;
}

/** Resolve governed metal rate. Does not substitute customer commercial rates unless explicitly configured. */
export async function resolveMetalRateLayer(input: {
  metalType: string;
  costingDate: string;
  currency?: string;
  customerRate?: number | null;
}): Promise<ExtensionLayerResult> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      layer: 'METAL_RATE',
      status: 'NOT_READY',
      amount: null,
      currency: null,
      ruleCode: null,
      message: 'Database not available.',
    };
  }

  const costingDate = new Date(input.costingDate);
  const rules = await prisma.costingMetalRate.findMany({
    where: {
      metalType: input.metalType,
      isCurrent: true,
      workflowStatus: 'ACTIVE',
      status: 'ACTIVE',
    },
    orderBy: { versionNo: 'desc' },
  });

  const match = rules.find((r) => isEffective(r.effectiveFrom, r.effectiveTo, costingDate));
  if (!match) {
    return {
      layer: 'METAL_RATE',
      status: 'NOT_CONFIGURED',
      amount: null,
      currency: input.currency || null,
      ruleCode: null,
      message: `No active governed metal rate for ${input.metalType}. CONFIGURATION_REQUIRED.`,
      details: { metalType: input.metalType, customerRateProvided: input.customerRate != null },
    };
  }

  if (match.rate == null) {
    return {
      layer: 'METAL_RATE',
      status: 'NOT_CONFIGURED',
      amount: null,
      currency: match.currency,
      ruleCode: match.code,
      message: `Metal rate rule ${match.code} exists but amount is not configured.`,
    };
  }

  return {
    layer: 'METAL_RATE',
    status: 'CONFIGURED',
    amount: Number(match.rate),
    currency: match.currency,
    ruleCode: match.code,
    message: `Governed metal rate ${match.code}`,
    details: { rateSource: match.rateSource, unit: match.unit },
  };
}

/** Resolve incoterm + destination logistics cost. */
export async function resolveLogisticsLayer(input: {
  incoterm?: string | null;
  destination?: string | null;
  costingDate: string;
}): Promise<ExtensionLayerResult> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      layer: 'LOGISTICS',
      status: 'NOT_READY',
      amount: null,
      currency: null,
      ruleCode: null,
      message: 'Database not available.',
    };
  }

  const incoterm = (input.incoterm || '').trim().toUpperCase();
  if (!incoterm) {
    return {
      layer: 'LOGISTICS',
      status: 'NOT_CONFIGURED',
      amount: null,
      currency: null,
      ruleCode: null,
      message: 'Incoterm not specified.',
    };
  }

  const costingDate = new Date(input.costingDate);
  const rules = await prisma.costingLogisticsRule.findMany({
    where: {
      incoterm,
      isCurrent: true,
      workflowStatus: 'ACTIVE',
      status: 'ACTIVE',
      OR: [{ destination: null }, { destination: input.destination?.trim() || '' }],
    },
    orderBy: [{ priority: 'asc' }, { versionNo: 'desc' }],
  });

  const dest = (input.destination || '').trim();
  const match =
    rules.find((r) => r.destination === dest && isEffective(r.effectiveFrom, r.effectiveTo, costingDate)) ||
    rules.find((r) => !r.destination && isEffective(r.effectiveFrom, r.effectiveTo, costingDate));

  if (!match) {
    return {
      layer: 'LOGISTICS',
      status: 'NOT_CONFIGURED',
      amount: null,
      currency: null,
      ruleCode: null,
      message: `No logistics rule for ${incoterm}${dest ? ` + ${dest}` : ''}.`,
      details: { incoterm, destination: dest || null },
    };
  }

  if (match.cost == null) {
    return {
      layer: 'LOGISTICS',
      status: 'NOT_CONFIGURED',
      amount: null,
      currency: match.currency,
      ruleCode: match.code,
      message: `Logistics rule ${match.code} exists but cost is not configured.`,
    };
  }

  return {
    layer: 'LOGISTICS',
    status: 'CONFIGURED',
    amount: Number(match.cost),
    currency: match.currency,
    ruleCode: match.code,
    message: `Logistics rule ${match.code}`,
    details: { basis: match.basis },
  };
}

/** Resolve drum/packing cost from governed packing rules. */
export async function resolvePackingLayer(input: {
  drumCode?: string | null;
  costingDate: string;
}): Promise<ExtensionLayerResult> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      layer: 'PACKING',
      status: 'NOT_READY',
      amount: null,
      currency: null,
      ruleCode: null,
      message: 'Database not available.',
    };
  }

  const drumCode = (input.drumCode || '').trim();
  if (!drumCode) {
    return {
      layer: 'PACKING',
      status: 'NOT_CONFIGURED',
      amount: null,
      currency: null,
      ruleCode: null,
      message: 'Drum not specified. CONFIGURATION_REQUIRED.',
    };
  }

  const costingDate = new Date(input.costingDate);
  const rules = await prisma.costingPackingRule.findMany({
    where: {
      isCurrent: true,
      workflowStatus: 'ACTIVE',
      status: 'ACTIVE',
      OR: [{ drumCode }, { drumCode: null }],
    },
    orderBy: { versionNo: 'desc' },
  });

  const match =
    rules.find((r) => r.drumCode === drumCode && isEffective(r.effectiveFrom, r.effectiveTo, costingDate)) ||
    rules.find((r) => !r.drumCode && isEffective(r.effectiveFrom, r.effectiveTo, costingDate));

  if (!match) {
    return {
      layer: 'PACKING',
      status: 'NOT_CONFIGURED',
      amount: null,
      currency: null,
      ruleCode: null,
      message: `No packing rule for drum ${drumCode}. CONFIGURATION_REQUIRED.`,
      details: { drumCode },
    };
  }

  if (match.packingCost == null) {
    return {
      layer: 'PACKING',
      status: 'NOT_CONFIGURED',
      amount: null,
      currency: match.currency,
      ruleCode: match.code,
      message: `Packing rule ${match.code} exists but cost is not configured.`,
    };
  }

  return {
    layer: 'PACKING',
    status: 'CONFIGURED',
    amount: Number(match.packingCost),
    currency: match.currency,
    ruleCode: match.code,
    message: `Packing rule ${match.code}`,
    details: { basis: match.basis },
  };
}

export async function resolveAllExtensionLayers(input: {
  costingDate: string;
  currency?: string;
  incoterm?: string | null;
  destination?: string | null;
  drumCode?: string | null;
  copperRate?: number | null;
  aluminiumRate?: number | null;
}) {
  const [copper, aluminium, logistics, packing] = await Promise.all([
    resolveMetalRateLayer({ metalType: 'COPPER', costingDate: input.costingDate, currency: input.currency, customerRate: input.copperRate }),
    resolveMetalRateLayer({ metalType: 'ALUMINIUM', costingDate: input.costingDate, currency: input.currency, customerRate: input.aluminiumRate }),
    resolveLogisticsLayer({ incoterm: input.incoterm, destination: input.destination, costingDate: input.costingDate }),
    resolvePackingLayer({ drumCode: input.drumCode, costingDate: input.costingDate }),
  ]);
  return { copper, aluminium, logistics, packing };
}
