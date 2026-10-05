/**
 * Phase 10 reporting MVP — whitelist aggregations only.
 * No arbitrary SQL, no Power BI, no export engine, no customer cost fields.
 */

export const REPORT_RUNTIME_MODE = 'WHITELIST_AGGREGATION_MVP' as const;

export type ReportWhitelistEntityCode =
  | 'CommercialInquiry'
  | 'CommercialQuotation'
  | 'BomDuplicateObservation'
  | 'RawMaterial'
  | 'CableMaster';

export type ReportAggregationCode =
  | 'count'
  | 'countByStatus'
  | 'unresolvedCount'
  | 'unpricedCount'
  | 'activeCount';

export interface ReportEntityWhitelistEntry {
  entityCode: ReportWhitelistEntityCode;
  allowedFields: readonly string[];
  aggregations: readonly ReportAggregationCode[];
  /** Internal-only datasets must never be customer-visible. */
  internalOnly: boolean;
}

export const REPORT_ENTITY_WHITELIST: readonly ReportEntityWhitelistEntry[] = [
  {
    entityCode: 'CommercialInquiry',
    allowedFields: ['id', 'status', 'inquiryNumber'],
    aggregations: ['count', 'countByStatus'],
    internalOnly: false,
  },
  {
    entityCode: 'CommercialQuotation',
    allowedFields: ['id', 'status', 'quotationNumber'],
    aggregations: ['count', 'countByStatus'],
    internalOnly: false,
  },
  {
    entityCode: 'BomDuplicateObservation',
    allowedFields: ['id', 'investigationStatus'],
    aggregations: ['unresolvedCount'],
    internalOnly: true,
  },
  {
    entityCode: 'RawMaterial',
    allowedFields: ['id', 'priceStatus'],
    aggregations: ['unpricedCount'],
    internalOnly: true,
  },
  {
    entityCode: 'CableMaster',
    allowedFields: ['id', 'status', 'materialNumber'],
    aggregations: ['activeCount'],
    internalOnly: true,
  },
];

const FORBIDDEN_FIELD_TOKENS = [
  'unitCost',
  'totalCost',
  'materialCost',
  'margin',
  'costingRun',
  'metal',
  'lme',
  'password',
  'passwordHash',
];

export function whitelistEntryForEntity(entityCode: string): ReportEntityWhitelistEntry | null {
  return REPORT_ENTITY_WHITELIST.find((e) => e.entityCode === entityCode) ?? null;
}

export function assertReportDefinitionAllowed(input: {
  entityCode: string;
  fieldCodes: unknown;
  customerVisible?: boolean;
}): { ok: true; entry: ReportEntityWhitelistEntry; fieldCodes: string[] } {
  const entry = whitelistEntryForEntity(String(input.entityCode || '').trim());
  if (!entry) {
    const err = new Error(
      `Report entity ${input.entityCode || '(empty)'} is not on the reporting whitelist.`
    ) as Error & { code: string };
    err.code = 'REPORT_ENTITY_NOT_WHITELISTED';
    throw err;
  }
  const rawFields = Array.isArray(input.fieldCodes) ? input.fieldCodes.map((f) => String(f)) : [];
  for (const field of rawFields) {
    const lower = field.toLowerCase();
    if (FORBIDDEN_FIELD_TOKENS.some((tok) => lower.includes(tok.toLowerCase()))) {
      const err = new Error(`Report field ${field} is forbidden (cost/secret).`) as Error & { code: string };
      err.code = 'REPORT_FIELD_FORBIDDEN';
      throw err;
    }
    if (!entry.allowedFields.includes(field)) {
      const err = new Error(`Report field ${field} is not whitelisted for ${entry.entityCode}.`) as Error & {
        code: string;
      };
      err.code = 'REPORT_FIELD_NOT_WHITELISTED';
      throw err;
    }
  }
  if (input.customerVisible && entry.internalOnly) {
    const err = new Error(`${entry.entityCode} reports cannot be customer-visible.`) as Error & { code: string };
    err.code = 'REPORT_CUSTOMER_VISIBLE_FORBIDDEN';
    throw err;
  }
  return { ok: true, entry, fieldCodes: rawFields };
}

export function defaultAggregationForEntity(entityCode: ReportWhitelistEntityCode): ReportAggregationCode {
  const entry = whitelistEntryForEntity(entityCode)!;
  return entry.aggregations[0];
}

export function isGenericBiEngineEnabled(): boolean {
  return false;
}
