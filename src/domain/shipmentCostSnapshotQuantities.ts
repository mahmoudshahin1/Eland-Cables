/** Prisma-free B4-C quantity aggregation and currency homogeneity. */

export type SnapshotQuantityLine = {
  containerTypeCode: string;
  containerQuantity: number;
};

export type QuantityAggregateOk = {
  ok: true;
  lines: SnapshotQuantityLine[];
};

export type QuantityAggregateFail = {
  ok: false;
  issueCode: 'CONTAINER_TYPE_NOT_FOUND' | 'RESULT_INTEGRITY_FAILED';
};

export type QuantityAggregateResult = QuantityAggregateOk | QuantityAggregateFail;

/**
 * Count physical result containers by typeCode.
 * Ignores drumCountQ3 and any client-supplied quantities.
 */
export function aggregateResultContainerQuantities(
  containers: Array<{ typeCode?: string | null }>
): QuantityAggregateResult {
  if (!containers.length) {
    return { ok: false, issueCode: 'RESULT_INTEGRITY_FAILED' };
  }
  const counts = new Map<string, number>();
  for (const row of containers) {
    const typeCode = String(row.typeCode ?? '').trim();
    if (!typeCode) {
      return { ok: false, issueCode: 'CONTAINER_TYPE_NOT_FOUND' };
    }
    counts.set(typeCode, (counts.get(typeCode) ?? 0) + 1);
  }
  const lines = [...counts.entries()]
    .map(([containerTypeCode, containerQuantity]) => ({ containerTypeCode, containerQuantity }))
    .sort((a, b) => a.containerTypeCode.localeCompare(b.containerTypeCode));
  if (!lines.length || lines.some((line) => line.containerQuantity <= 0)) {
    return { ok: false, issueCode: 'RESULT_INTEGRITY_FAILED' };
  }
  return { ok: true, lines };
}

export function assertHomogeneousCurrency(currencyCodes: string[]): { ok: true; currencyCode: string } | { ok: false } {
  const unique = [...new Set(currencyCodes.map((code) => String(code ?? '').trim()).filter(Boolean))];
  if (unique.length !== 1) return { ok: false };
  return { ok: true, currencyCode: unique[0] };
}
