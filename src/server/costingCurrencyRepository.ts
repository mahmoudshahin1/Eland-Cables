import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { normalizeCostingCurrency } from '../domain/currencyConversion';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

async function appendAudit(
  entityId: string,
  action: string,
  actor: { id?: string; name?: string; email?: string },
  oldValue?: unknown,
  newValue?: unknown
) {
  const prisma = requirePrisma();
  await prisma.auditEvent.create({
    data: {
      actorId: actor.id,
      actorName: actorLabel(actor),
      entity: 'CostingCurrency',
      entityId,
      action,
      oldValue: oldValue != null ? (oldValue as Prisma.InputJsonValue) : undefined,
      newValue: newValue != null ? (newValue as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function listCostingCurrencies(filter?: { status?: 'ACTIVE' | 'INACTIVE' }) {
  const prisma = requirePrisma();
  const rows = await prisma.costingCurrency.findMany({
    where: filter?.status ? { status: filter.status } : undefined,
    orderBy: [{ isBaseCurrency: 'desc' }, { code: 'asc' }],
  });
  const codes = new Set(rows.map((r) => r.code));
  return rows.filter((row) => {
    const normalized = normalizeCostingCurrency(row.code);
    return !(normalized && normalized !== row.code && codes.has(normalized));
  });
}

export async function listActiveCurrencyCodes(): Promise<string[]> {
  const prisma = requirePrisma();
  const rows = await prisma.costingCurrency.findMany({
    where: { status: 'ACTIVE' },
    select: { code: true },
    orderBy: { code: 'asc' },
  });
  return Array.from(new Set(rows.map((r) => normalizeCostingCurrency(r.code)).filter(Boolean)));
}

export async function createCostingCurrency(
  input: {
    code: string;
    name: string;
    symbol?: string;
    isBaseCurrency?: boolean;
    decimalPlaces?: number;
    notes?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const code = normalizeCostingCurrency(input.code);
  if (!code) throw Object.assign(new Error('Currency code is required.'), { code: 'VALIDATION_ERROR' });

  if (input.isBaseCurrency) {
    await prisma.costingCurrency.updateMany({ data: { isBaseCurrency: false }, where: { isBaseCurrency: true } });
  }

  const created = await prisma.costingCurrency.create({
    data: {
      code,
      name: input.name.trim(),
      symbol: input.symbol?.trim() || null,
      isBaseCurrency: Boolean(input.isBaseCurrency),
      decimalPlaces: input.decimalPlaces ?? 2,
      notes: input.notes?.trim() || null,
      createdBy: actorLabel(actor),
      updatedBy: actorLabel(actor),
    },
  });
  await appendAudit(created.code, 'CREATE', actor, undefined, created);
  return created;
}

export async function updateCostingCurrency(
  code: string,
  input: Partial<{
    name: string;
    symbol: string;
    isBaseCurrency: boolean;
    decimalPlaces: number;
    status: 'ACTIVE' | 'INACTIVE';
    notes: string;
  }>,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const normalized = normalizeCostingCurrency(code);
  const existing = await prisma.costingCurrency.findUnique({ where: { code: normalized } });
  if (!existing) return null;

  if (input.isBaseCurrency) {
    await prisma.costingCurrency.updateMany({ data: { isBaseCurrency: false }, where: { isBaseCurrency: true } });
  }

  const updated = await prisma.costingCurrency.update({
    where: { code: normalized },
    data: {
      name: input.name?.trim() ?? existing.name,
      symbol: input.symbol !== undefined ? input.symbol.trim() || null : existing.symbol,
      isBaseCurrency: input.isBaseCurrency ?? existing.isBaseCurrency,
      decimalPlaces: input.decimalPlaces ?? existing.decimalPlaces,
      status: input.status ?? existing.status,
      notes: input.notes !== undefined ? input.notes.trim() || null : existing.notes,
      updatedBy: actorLabel(actor),
    },
  });
  await appendAudit(updated.code, 'UPDATE', actor, existing, updated);
  return updated;
}

function usageCodesFor(code: string): string[] {
  const raw = (code || '').trim().toUpperCase();
  const normalized = normalizeCostingCurrency(raw);
  const aliases = new Set([raw, normalized].filter(Boolean));
  if (normalized === 'LE' || raw === 'EGP') {
    aliases.add('LE');
    aliases.add('EGP');
  }
  return Array.from(aliases);
}

export async function deleteCostingCurrency(
  code: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const requested = (code || '').trim().toUpperCase();
  const normalized = normalizeCostingCurrency(requested);
  const existing =
    (await prisma.costingCurrency.findUnique({ where: { code: requested } })) ||
    (normalized ? await prisma.costingCurrency.findUnique({ where: { code: normalized } }) : null);
  if (!existing) return null;

  if (existing.isBaseCurrency) {
    throw Object.assign(new Error('The base currency cannot be deleted.'), { code: 'CURRENCY_IN_USE' });
  }

  const codes = usageCodesFor(existing.code);
  const currencyFilter = { in: codes };

  const [
    exchangeRates,
    rmPrices,
    rmMaster,
    costingRuns,
    inquiries,
    quotations,
    pricingRules,
    pricingSnapshots,
    metalRates,
    logisticsRules,
    packingRules,
    metalCostComponents,
  ] = await Promise.all([
    prisma.costingExchangeRate.count({
      where: { OR: [{ fromCurrency: currencyFilter }, { toCurrency: currencyFilter }] },
    }),
    prisma.rawMaterialPrice.count({ where: { currency: currencyFilter } }),
    prisma.rawMaterial.count({ where: { currency: currencyFilter } }),
    prisma.costingRun.count({ where: { currency: currencyFilter } }),
    prisma.commercialInquiry.count({ where: { currency: currencyFilter } }),
    prisma.commercialQuotation.count({ where: { currency: currencyFilter } }),
    prisma.commercialPricingRule.count({ where: { currency: currencyFilter } }),
    prisma.commercialPricingSnapshot.count({ where: { currency: currencyFilter } }),
    prisma.costingMetalRate.count({ where: { currency: currencyFilter } }),
    prisma.costingLogisticsRule.count({ where: { currency: currencyFilter } }),
    prisma.costingPackingRule.count({ where: { currency: currencyFilter } }),
    prisma.costingMetalCostComponent.count({ where: { currencyCode: currencyFilter } }),
  ]);

  const usedBy: string[] = [];
  if (exchangeRates) usedBy.push('exchange rates');
  if (rmPrices) usedBy.push('raw material prices');
  if (rmMaster) usedBy.push('raw materials');
  if (costingRuns) usedBy.push('costing runs');
  if (inquiries) usedBy.push('inquiries');
  if (quotations) usedBy.push('quotations');
  if (pricingRules) usedBy.push('pricing rules');
  if (pricingSnapshots) usedBy.push('pricing snapshots');
  if (metalRates) usedBy.push('metal rates');
  if (logisticsRules) usedBy.push('logistics rules');
  if (packingRules) usedBy.push('packing rules');
  if (metalCostComponents) usedBy.push('metal cost components');

  if (usedBy.length > 0) {
    throw Object.assign(
      new Error(`Currency ${existing.code} is in use (${usedBy.join(', ')}) and cannot be deleted.`),
      { code: 'CURRENCY_IN_USE' }
    );
  }

  await prisma.costingCurrency.delete({ where: { code: existing.code } });
  await appendAudit(existing.code, 'DELETE', actor, existing, undefined);
  return existing;
}

export async function getCurrencyWithCurrentRate(code: string) {
  const prisma = requirePrisma();
  const normalized = normalizeCostingCurrency(code);
  const currency = await prisma.costingCurrency.findUnique({ where: { code: normalized } });
  if (!currency) return null;

  const base = await prisma.costingCurrency.findFirst({ where: { isBaseCurrency: true, status: 'ACTIVE' } });
  const baseCode = base?.code || 'LE';
  const now = new Date();

  const rate = await prisma.costingExchangeRate.findFirst({
    where: {
      fromCurrency: normalized,
      toCurrency: baseCode,
      isCurrent: true,
      workflowStatus: { in: ['ACTIVE', 'APPROVED'] },
      status: 'ACTIVE',
      OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
      AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }],
    },
    orderBy: [{ effectiveFrom: 'desc' }, { updatedAt: 'desc' }],
  });

  return {
    ...currency,
    currentExchangeRate: rate ? Number(rate.rate) : null,
    currentRateEffectiveFrom: rate?.effectiveFrom ?? null,
    baseCurrencyCode: baseCode,
  };
}
