/**
 * Reusable ERP list pattern — filterable table chrome for V2 master/transaction surfaces.
 * Typed columns only; no drag-drop form builder.
 */

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export interface ErpListColumn<T> {
  id: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface ErpListPanelProps<T> {
  title: string;
  subtitle?: string;
  rows: T[];
  columns: ErpListColumn<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, q: string) => boolean;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  emptyMessage?: string;
  permissionDenied?: boolean;
  toolbarExtra?: React.ReactNode;
  onRowClick?: (row: T) => void;
}

export function ErpListPanel<T>({
  title,
  subtitle,
  rows,
  columns,
  rowKey,
  searchPlaceholder = 'Filter…',
  searchFilter,
  primaryAction,
  emptyMessage = 'No rows.',
  permissionDenied,
  toolbarExtra,
  onRowClick,
}: ErpListPanelProps<T>) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query || !searchFilter) return rows;
    return rows.filter((r) => searchFilter(r, query));
  }, [rows, q, searchFilter]);

  if (permissionDenied) {
    return (
      <div className="border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        You do not have permission to view this list (403). Effective Access is authoritative.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0B1F3A]">{title}</h2>
          {subtitle && <p className="text-sm text-slate-600 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbarExtra}
          {searchFilter && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 bg-white min-w-[12rem]"
              />
            </div>
          )}
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
              className="px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#0B1F3A' }}
            >
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>
      <div className="border border-slate-200 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-[#F7F8FA] text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((c) => (
                <th key={c.id} className={`px-3 py-2 font-semibold ${c.className || ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={rowKey(row)}
                className={`border-t border-slate-100 ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((c) => (
                  <td key={c.id} className={`px-3 py-2 text-slate-800 ${c.className || ''}`}>
                    {c.accessor(row)}
                  </td>
                ))}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500">{filtered.length} row(s)</div>
    </div>
  );
}
