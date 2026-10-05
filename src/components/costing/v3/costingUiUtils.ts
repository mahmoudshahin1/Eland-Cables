import { useMemo, useState } from 'react';

export const PAGE_SIZE = 5;

export function usePagedRows<T>(rows: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);

  const paged = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  );

  return {
    page: safePage,
    setPage,
    pageCount,
    pageSize,
    total: rows.length,
    paged,
    from: rows.length === 0 ? 0 : (safePage - 1) * pageSize + 1,
    to: Math.min(safePage * pageSize, rows.length),
  };
}

export function pricingSourceLabel(pricingCategory?: string): string {
  if (pricingCategory === 'MARKET_METAL_COPPER') return 'INQUIRY HEADER COPPER PRICE';
  if (pricingCategory === 'MARKET_METAL_ALUMINIUM') return 'INQUIRY HEADER ALUMINIUM PRICE';
  return 'RAW MATERIAL PRICE MASTER';
}

export function formatPricingSourceDisplay(source?: string): string {
  const s = (source || '').toUpperCase();
  if (s.includes('INQUIRY') || s.includes('HEADER')) return 'INQUIRY HEADER';
  if (s.includes('MASTER')) return 'RAW MATERIAL MASTER';
  return source || '—';
}

export function pendingApprovalIds(
  rows: Array<Record<string, unknown>>,
  eligibleStatuses: string[] = ['SUBMITTED', 'UNDER_REVIEW']
) {
  const allowed = new Set(eligibleStatuses.map((s) => s.toUpperCase()));
  return rows
    .filter((row) => allowed.has(String(row.workflowStatus || '').toUpperCase()))
    .map((row) => String(row.id || ''))
    .filter(Boolean);
}

export function summarizeBulkApprove(result: {
  approvedCount: number;
  skippedCount: number;
  failedCount: number;
  failed?: Array<{ error: string }>;
}) {
  const parts = [`Approved ${result.approvedCount}`];
  if (result.failedCount) {
    const first = result.failed?.[0]?.error;
    parts.push(`${result.failedCount} failed${first ? ` (${first})` : ''}`);
  }
  if (result.skippedCount) parts.push(`${result.skippedCount} skipped (not submitted)`);
  return parts.join('. ');
}
