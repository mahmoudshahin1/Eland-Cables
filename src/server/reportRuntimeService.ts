import { DomainError, issue } from '../platform/errors/domainError';
import {
  assertReportDefinitionAllowed,
  defaultAggregationForEntity,
  type ReportAggregationCode,
  type ReportWhitelistEntityCode,
} from '../platform/reporting/reportRuntime';
import { getPrisma } from './db';
import { appendServerAudit } from './serverAudit';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export type ReportRunRow = { key: string; value: number };

export async function runWhitelistedReport(input: {
  code: string;
  actor: { id?: string; name?: string; email?: string };
}): Promise<{
  code: string;
  name: string;
  entityCode: string;
  aggregation: ReportAggregationCode;
  generatedAt: string;
  rows: ReportRunRow[];
  mode: 'WHITELIST_AGGREGATION_MVP';
  note: string;
}> {
  const prisma = requirePrisma();
  const def = await prisma.reportDefinition.findFirst({
    where: { code: input.code.trim(), status: 'ACTIVE' },
  });
  if (!def) {
    throw issue('NOT_FOUND', `Report definition ${input.code} was not found.`);
  }
  let allowed;
  try {
    allowed = assertReportDefinitionAllowed({
      entityCode: def.entityCode,
      fieldCodes: def.fieldCodes,
      customerVisible: def.customerVisible,
    });
  } catch (err) {
    const e = err as Error & { code?: string };
    throw issue('VALIDATION_FAILED', e.message);
  }
  const aggregation = defaultAggregationForEntity(allowed.entry.entityCode);
  const rows = await executeAggregation(allowed.entry.entityCode, aggregation);
  await appendServerAudit({
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email,
    entity: 'ReportDefinition',
    entityId: def.code,
    action: 'RUN',
    newValue: { entityCode: def.entityCode, aggregation, rowCount: rows.length },
    message: `Ran whitelist report ${def.code}`,
  });
  return {
    code: def.code,
    name: def.name,
    entityCode: def.entityCode,
    aggregation,
    generatedAt: new Date().toISOString(),
    rows,
    mode: 'WHITELIST_AGGREGATION_MVP',
    note: 'Counts only; no arbitrary SQL, export engine, or cost fields.',
  };
}

async function executeAggregation(
  entityCode: ReportWhitelistEntityCode,
  aggregation: ReportAggregationCode
): Promise<ReportRunRow[]> {
  const prisma = requirePrisma();
  if (entityCode === 'CommercialInquiry') {
    if (aggregation === 'count') {
      const n = await prisma.commercialInquiry.count({ where: { isCurrent: true } });
      return [{ key: 'total', value: n }];
    }
    const groups = await prisma.commercialInquiry.groupBy({
      by: ['status'],
      where: { isCurrent: true },
      _count: true,
    });
    return groups.map((g) => ({ key: g.status, value: g._count }));
  }
  if (entityCode === 'CommercialQuotation') {
    if (aggregation === 'count') {
      const n = await prisma.commercialQuotation.count({ where: { isCurrent: true } });
      return [{ key: 'total', value: n }];
    }
    const groups = await prisma.commercialQuotation.groupBy({
      by: ['status'],
      where: { isCurrent: true },
      _count: true,
    });
    return groups.map((g) => ({ key: g.status, value: g._count }));
  }
  if (entityCode === 'BomDuplicateObservation') {
    const n = await prisma.bomDuplicateObservation.count({
      where: { investigationStatus: { not: 'RESOLVED' } },
    });
    return [{ key: 'unresolved', value: n }];
  }
  if (entityCode === 'RawMaterial') {
    const n = await prisma.rawMaterial.count({ where: { priceStatus: 'PRICE_NOT_CONFIGURED' } });
    return [{ key: 'unpriced', value: n }];
  }
  if (entityCode === 'CableMaster') {
    const n = await prisma.cableMaster.count({ where: { status: 'ACTIVE' } });
    return [{ key: 'active', value: n }];
  }
  throw new DomainError('VALIDATION_FAILED', `Unsupported report aggregation ${aggregation} for ${entityCode}.`);
}
