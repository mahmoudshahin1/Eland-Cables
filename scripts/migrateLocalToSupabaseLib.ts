/**
 * Pure helpers for local → Supabase migration remapping / dependency checks.
 * Kept free of Prisma I/O so unit tests can cover ID remaps without DB access.
 */

/** Models whose `incotermId` columns reference Incoterm.id (not Incoterm.code). */
export const INCOTERM_ID_COLUMNS: Record<string, string[]> = {
  CustomerShippingCostRate: ['incotermId'],
  ShippingCostTransactionSnapshot: ['incotermId'],
};

/** Required Incoterm.id FKs (blocking if unmapped). */
export const REQUIRED_INCOTERM_COLUMNS: Record<string, string[]> = {
  CustomerShippingCostRate: ['incotermId'],
};

/** Customer.id columns remapped via Customer.code (mirrors migrate script). */
export const CUSTOMER_ID_COLUMNS: Record<string, string[]> = {
  Customer: ['id'],
  CustomerAddress: ['customerId'],
  CustomerContact: ['customerId'],
  CustomerExternalMapping: ['customerId'],
  CommercialInquiry: ['customerMasterId', 'customerId'],
  CommercialQuotation: ['customerMasterId', 'customerId'],
  CommercialCommitment: ['customerMasterId', 'customerId'],
  EpcSalesOrder: ['customerMasterId', 'customerId'],
  SalesAgreement: ['customerMasterId', 'customerId'],
  CommercialPricingRule: ['customerId'],
  CommercialDiscountRule: ['customerId'],
  WorkflowInstance: ['customerMasterId'],
  CustomerDeliveryCombination: ['customerId'],
  CustomerShippingCostRate: ['customerId'],
  ShippingCostTransactionSnapshot: ['customerId'],
  ContainerStudy: ['customerMasterId', 'customerId'],
  CustomerServiceCase: ['customerId'],
  SupportChatSession: ['customerId'],
  /** Auth — remapped via Customer.code to TARGET Customer ids */
  UserAccount: ['customerId'],
  CustomerUser: ['customerId'],
};

export const REQUIRED_CUSTOMER_COLUMNS: Record<string, string[]> = {
  CustomerAddress: ['customerId'],
  CustomerContact: ['customerId'],
  CustomerExternalMapping: ['customerId'],
  CustomerDeliveryCombination: ['customerId'],
  CustomerShippingCostRate: ['customerId'],
  CustomerServiceCase: ['customerId'],
  SupportChatSession: ['customerId'],
  CustomerUser: ['customerId'],
};

export type CodeMasterRow = {
  id: string;
  code: string;
};

export type CodeMasterMatch = {
  code: string;
  sourceId: string;
  targetId: string;
};

export type CodeMasterMap = {
  sourceIdToCode: Map<string, string>;
  sourceCodeToId: Map<string, string>;
  targetCodeToId: Map<string, string>;
  /** source row id → effective target id (match-by-code → target id; new → source id) */
  sourceIdToTargetId: Map<string, string>;
  matched: CodeMasterMatch[];
  /** Codes absent on target — insert preserving source id */
  toCreate: Array<{ code: string; sourceId: string }>;
  /** matched where sourceId !== targetId (dependents must remap) */
  idRemaps: CodeMasterMatch[];
  sourceDuplicateCodes: Array<{ code: string; sourceIds: string[] }>;
};

export type FkRemapIssue = {
  model: string;
  column: string;
  sourceValue: string;
  severity: 'blocking' | 'warning';
  reason: string;
  rowCount: number;
};

/**
 * Build source→target id map for shared masters keyed by unique `code`
 * (e.g. Incoterm). Same pattern as Customer: match by code, preserve target id,
 * create missing codes with source id, never duplicate codes.
 */
export function buildCodeMasterMap(
  sourceRows: CodeMasterRow[],
  targetRows: CodeMasterRow[]
): CodeMasterMap {
  const map: CodeMasterMap = {
    sourceIdToCode: new Map(),
    sourceCodeToId: new Map(),
    targetCodeToId: new Map(),
    sourceIdToTargetId: new Map(),
    matched: [],
    toCreate: [],
    idRemaps: [],
    sourceDuplicateCodes: [],
  };

  const byCode = new Map<string, string[]>();
  for (const row of sourceRows) {
    const code = String(row.code || '').trim();
    const id = String(row.id);
    map.sourceIdToCode.set(id, code);
    const ids = byCode.get(code) || [];
    ids.push(id);
    byCode.set(code, ids);
    if (!map.sourceCodeToId.has(code)) map.sourceCodeToId.set(code, id);
  }
  for (const [code, ids] of byCode) {
    if (ids.length > 1) map.sourceDuplicateCodes.push({ code, sourceIds: ids });
  }

  for (const row of targetRows) {
    map.targetCodeToId.set(String(row.code || '').trim(), String(row.id));
  }

  for (const row of sourceRows) {
    const code = String(row.code || '').trim();
    const sourceId = String(row.id);
    const targetId = map.targetCodeToId.get(code);
    if (targetId) {
      map.sourceIdToTargetId.set(sourceId, targetId);
      const match = { code, sourceId, targetId };
      map.matched.push(match);
      if (sourceId !== targetId) map.idRemaps.push(match);
    } else {
      map.sourceIdToTargetId.set(sourceId, sourceId);
      map.toCreate.push({ code, sourceId });
    }
  }

  return map;
}

/** Target parent ids that will exist after the master step (existing + to-create). */
export function effectiveTargetParentIds(map: CodeMasterMap): Set<string> {
  const ids = new Set<string>();
  for (const targetId of map.targetCodeToId.values()) ids.add(targetId);
  for (const row of map.toCreate) ids.add(row.sourceId);
  return ids;
}

/**
 * Remap FK columns using a sourceId→targetId map.
 * Required missing refs → errors; optional missing refs → null.
 */
export function remapIdFields(
  model: string,
  row: Record<string, unknown>,
  columns: string[] | undefined,
  sourceIdToTargetId: Map<string, string>,
  requiredColumns: string[] = []
): { row: Record<string, unknown>; errors: string[]; remapped: string[] } {
  const errors: string[] = [];
  const remapped: string[] = [];
  if (!columns?.length) return { row, errors, remapped };
  const next = { ...row };
  for (const col of columns) {
    const val = next[col];
    if (val == null || val === '') continue;
    const raw = String(val);
    const mapped = sourceIdToTargetId.get(raw);
    if (mapped) {
      if (mapped !== raw) remapped.push(col);
      next[col] = mapped;
      continue;
    }
    const required = requiredColumns.includes(col);
    if (required) {
      errors.push(`${model}.${col}=${raw} has no parent match and cannot be created`);
    } else {
      next[col] = null;
      remapped.push(col);
    }
  }
  return { row: next, errors, remapped };
}

export function remapIncotermFields(
  model: string,
  row: Record<string, unknown>,
  incotermMap: CodeMasterMap
): { row: Record<string, unknown>; errors: string[]; remapped: string[] } {
  return remapIdFields(
    model,
    row,
    INCOTERM_ID_COLUMNS[model],
    incotermMap.sourceIdToTargetId,
    REQUIRED_INCOTERM_COLUMNS[model] || []
  );
}

export function remapCustomerFieldsPure(
  model: string,
  row: Record<string, unknown>,
  customerMap: {
    sourceIdToTargetId: Map<string, string>;
    sourceIdToCode: Map<string, string>;
    sourceCodeToId: Map<string, string>;
    targetCodeToId: Map<string, string>;
  }
): { row: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const cols = CUSTOMER_ID_COLUMNS[model];
  if (!cols || model === 'Customer') return { row, errors };
  const next = { ...row };
  for (const col of cols) {
    const val = next[col];
    if (val == null || val === '') continue;
    const raw = String(val);
    const mappedById = customerMap.sourceIdToTargetId.get(raw);
    if (mappedById) {
      next[col] = mappedById;
      continue;
    }
    const code =
      customerMap.sourceIdToCode.get(raw) ??
      (customerMap.sourceCodeToId.has(raw) ? raw : null);
    if (code) {
      const sourceId = customerMap.sourceCodeToId.get(code);
      const targetId = sourceId
        ? customerMap.sourceIdToTargetId.get(sourceId)
        : customerMap.targetCodeToId.get(code);
      if (targetId) {
        next[col] = targetId;
        continue;
      }
    }
    const directTarget = customerMap.targetCodeToId.get(raw);
    if (directTarget) {
      next[col] = directTarget;
      continue;
    }
    const required = (REQUIRED_CUSTOMER_COLUMNS[model] || []).includes(col);
    if (required) {
      errors.push(
        `${model}.${col}=${raw} (code=${code ?? '?'}) has no Customer match and cannot be created`
      );
    } else if (col === 'customerMasterId') {
      next[col] = null;
    }
  }
  return { row: next, errors };
}

/** Only insert masters whose code is absent on target (preserve target rows for matches). */
export function filterRowsToCreateByCode(
  rows: Record<string, unknown>[],
  map: CodeMasterMap
): Record<string, unknown>[] {
  const createIds = new Set(map.toCreate.map((c) => c.sourceId));
  return rows.filter((r) => createIds.has(String((r as { id: unknown }).id)));
}

/**
 * Simulate prepared dependent rows: customer + incoterm remaps.
 * Returns orphan FK issues after remapping against effective target parents.
 */
export function prepareDependentRow(
  model: string,
  row: Record<string, unknown>,
  customerMap: {
    sourceIdToTargetId: Map<string, string>;
    sourceIdToCode: Map<string, string>;
    sourceCodeToId: Map<string, string>;
    targetCodeToId: Map<string, string>;
  },
  incotermMap: CodeMasterMap
): { row: Record<string, unknown>; errors: string[] } {
  const customer = remapCustomerFieldsPure(model, row, customerMap);
  if (customer.errors.length) return { row: customer.row, errors: customer.errors };
  const incoterm = remapIncotermFields(model, customer.row, incotermMap);
  return { row: incoterm.row, errors: incoterm.errors };
}

export function collectOrphanFkAfterRemap(input: {
  model: string;
  preparedRows: Record<string, unknown>[];
  columns: string[];
  requiredColumns: string[];
  effectiveParentIds: Set<string>;
}): FkRemapIssue[] {
  const issues: FkRemapIssue[] = [];
  for (const col of input.columns) {
    const required = input.requiredColumns.includes(col);
    const counts = new Map<string, number>();
    for (const row of input.preparedRows) {
      const val = row[col];
      if (val == null || val === '') continue;
      const raw = String(val);
      if (input.effectiveParentIds.has(raw)) continue;
      counts.set(raw, (counts.get(raw) || 0) + 1);
    }
    for (const [sourceValue, rowCount] of counts) {
      issues.push({
        model: input.model,
        column: col,
        sourceValue,
        severity: required ? 'blocking' : 'warning',
        reason: required
          ? `Prepared ${input.model}.${col} does not resolve to a target parent that exists or will be created`
          : `Prepared ${input.model}.${col} orphan cleared/left unresolved (nullable)`,
        rowCount,
      });
    }
  }
  return issues;
}

/** True when parent appears before child in migration order. */
export function isParentBeforeChild(
  order: string[],
  parent: string,
  child: string
): boolean {
  const pi = order.indexOf(parent);
  const ci = order.indexOf(child);
  return pi >= 0 && ci >= 0 && pi < ci;
}

/**
 * Validate that every distinct FK value in source rows remaps to an effective target parent.
 */
export function validateFkValuesAgainstMap(input: {
  model: string;
  column: string;
  distinctValues: Array<{ value: string; rowCount: number }>;
  sourceIdToTargetId: Map<string, string>;
  effectiveParentIds: Set<string>;
  required: boolean;
}): FkRemapIssue[] {
  const issues: FkRemapIssue[] = [];
  for (const { value, rowCount } of input.distinctValues) {
    if (value == null || value === '') continue;
    const mapped = input.sourceIdToTargetId.get(value);
    if (mapped && input.effectiveParentIds.has(mapped)) continue;
    // Already a target parent id (e.g. previously remapped)
    if (input.effectiveParentIds.has(value)) continue;
    issues.push({
      model: input.model,
      column: input.column,
      sourceValue: value,
      severity: input.required ? 'blocking' : 'warning',
      reason: input.required
        ? `FK value is not a known source parent id and cannot be remapped or created (required)`
        : `Nullable FK value is not a known source parent id — will be set to NULL on apply`,
      rowCount,
    });
  }
  return issues;
}
