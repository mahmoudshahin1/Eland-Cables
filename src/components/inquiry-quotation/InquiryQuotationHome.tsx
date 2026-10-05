import React, { useMemo, useRef, useState } from 'react';
import {
  Calculator,
  Download,
  Home,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { UserAccount, ErpRequestHeader } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  applyHomeFilters,
  DEFAULT_IQ_GRID_COLUMNS,
  InquiryQuotationHomeRow,
  inquiryStatusFilterOptions,
  IqGridColumn,
  IqHomeFilters,
  listInquiriesAndQuotations,
  listInquiriesAndQuotationsFromHeaders,
  rowsToCsv,
  sortHomeRows,
} from '../../services/inquiryQuotationHomeService';
import { canSubmitInquiry, isInquirySubmitted } from '../../services/inquiryWorkflowService';

const VIEWS_KEY = 'energya_iq_home_saved_views_v1';

function statusBadgeClass(status: string): string {
  const value = status.toLowerCase();
  if (value === 'open' || value === 'opened') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
  }
  if (value === 'submitted') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
  }
  if (value.includes('cancel')) {
    return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';
  }
  if (value.includes('sent to technical') || value.includes('technical')) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  }
  return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
}

interface InquiryQuotationHomeProps {
  onOpenTransaction: (id: string) => void;
  onNew: () => void;
  title?: string;
  headers?: ErpRequestHeader[];
  onSubmitInquiry?: (id: string) => void | Promise<void>;
  onUpdateInquiry?: (id: string) => void;
}

function loadViews(): { name: string; columns: IqGridColumn[]; filters: IqHomeFilters }[] {
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const InquiryQuotationHome: React.FC<InquiryQuotationHomeProps> = ({
  onOpenTransaction,
  onNew,
  title = 'Inquiry / Quotation Workspace',
  headers,
  onSubmitInquiry,
  onUpdateInquiry,
}) => {
  const { currentUser, hasPermission } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [sortKey, setSortKey] = useState<keyof InquiryQuotationHomeRow>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [columns, setColumns] = useState<IqGridColumn[]>(DEFAULT_IQ_GRID_COLUMNS);
  const [showCols, setShowCols] = useState(false);
  const [viewName, setViewName] = useState('');
  const [savedViews, setSavedViews] = useState(loadViews);
  const [toast, setToast] = useState<string | null>(null);
  const [filters, setFilters] = useState<IqHomeFilters>({
    search: '',
    status: 'ALL',
    customer: '',
    currency: 'ALL',
    createdBy: '',
    version: '',
    dateFrom: '',
    dateTo: '',
    transactionType: 'ALL',
  });
  const dragCol = useRef<number | null>(null);
  const hideCost = currentUser?.userType === 'customer';

  const canCreate = currentUser?.userType === 'customer' || hasPermission('salesQuotations');
  const canUpdate = canCreate;
  const canCancel = currentUser?.userType === 'internal' && hasPermission('salesQuotations');
  const canCalculate = currentUser?.userType === 'internal' && (hasPermission('costingPricing') || hasPermission('salesQuotations'));
  const canSubmit = canCreate;
  const canExport = hasPermission('salesQuotations') || hasPermission('reportsAnalytics') || currentUser?.userType === 'customer';

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const listed = useMemo(
    () =>
      headers
        ? listInquiriesAndQuotationsFromHeaders(headers, currentUser as UserAccount | null)
        : listInquiriesAndQuotations(currentUser as UserAccount | null),
    [headers, currentUser]
  );

  const rows = useMemo(() => {
    const filtered = applyHomeFilters(listed, filters);
    return sortHomeRows(filtered, sortKey, sortDir);
  }, [listed, filters, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const visibleCols = columns.filter((c) => c.visible && !(hideCost && c.sensitive));

  const statuses = useMemo(() => inquiryStatusFilterOptions(currentUser, listed), [currentUser, listed]);
  const currencies = useMemo(() => Array.from(new Set(listed.map((h) => h.currency))), [listed]);

  const selected = rows.find((r) => r.id === selectedId);

  const onSort = (key: keyof InquiryQuotationHomeRow) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const moveColumn = (from: number, to: number) => {
    setColumns((prev) => {
      const visIds = visibleCols.map((c) => c.id);
      const fromId = visIds[from];
      const toId = visIds[to];
      const next = [...prev];
      const i = next.findIndex((c) => c.id === fromId);
      const j = next.findIndex((c) => c.id === toId);
      if (i < 0 || j < 0) return prev;
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      return next;
    });
  };

  const resize = (id: string, width: number) => {
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, width: Math.max(56, width) } : c)));
  };

  const exportCsv = () => {
    if (!canExport) return;
    const csv = rowsToCsv(rows, visibleCols);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inquiry-quotation-home.csv';
    a.click();
  };

  const saveView = () => {
    if (!viewName.trim()) return;
    const next = [...savedViews.filter((v) => v.name !== viewName.trim()), { name: viewName.trim(), columns, filters }];
    setSavedViews(next);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    notify(`Saved view “${viewName.trim()}”`);
  };

  const stubNext = (label: string) =>
    notify(`${label} is reserved for the next inquiry/quotation increment. Home increment only.`);

  const handleSubmit = async () => {
    if (!selected || !onSubmitInquiry) return;
    if (!canSubmitInquiry(selected.source)) {
      notify('This inquiry is already submitted.');
      return;
    }
    await onSubmitInquiry(selected.id);
    notify(`Inquiry ${selected.transactionNo} submitted.`);
  };

  const handleUpdate = () => {
    if (!selected) return;
    if (onUpdateInquiry) {
      onUpdateInquiry(selected.id);
      if (isInquirySubmitted(selected.source)) {
        notify(`Revision V${(selected.version || 1) + 1} opened for editing.`);
      }
      return;
    }
    onOpenTransaction(selected.id);
  };

  return (
    <div className="space-y-4">
      <div className="bg-brand-600 text-white rounded-2xl p-5 border border-brand-700">
        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">EPC Digital Manufacturing Platform</p>
        <h1 className="text-2xl font-extrabold mt-1">{title}</h1>
        <p className="text-xs text-slate-300 mt-1">
          Production-grade register. Opening a row uses the accepted prototype transaction form (header/lines not rebuilt).
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2">
        <button className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 flex items-center gap-1">
          <Home className="h-3.5 w-3.5" /> Home
        </button>
        {canCreate && (
          <button onClick={onNew} className="px-3 py-2 rounded-lg text-xs font-bold bg-accent-500 text-white flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        )}
        {canUpdate && (
          <button
            disabled={!selected}
            onClick={handleUpdate}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 text-white disabled:opacity-40"
          >
            Update
          </button>
        )}
        {canCancel && (
          <button disabled={!selected} onClick={() => stubNext('Cancel')} className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 disabled:opacity-40 flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" /> Cancel
          </button>
        )}
        {canCalculate && (
          <button disabled={!selected} onClick={() => stubNext('Calculate')} className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 disabled:opacity-40 flex items-center gap-1">
            <Calculator className="h-3.5 w-3.5" /> Calculate
          </button>
        )}
        {canSubmit && (
          <button
            disabled={!selected || !onSubmitInquiry || (selected ? !canSubmitInquiry(selected.source) : true)}
            onClick={() => void handleSubmit()}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white disabled:opacity-40 flex items-center gap-1"
          >
            <Send className="h-3.5 w-3.5" /> Submit
          </button>
        )}
        {canExport && (
          <button onClick={exportCsv} className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 flex items-center gap-1 ml-auto">
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        )}
        <button onClick={() => setShowCols((s) => !s)} className="px-3 py-2 rounded-lg text-xs font-bold border border-slate-300 flex items-center gap-1">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Columns
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
        <div className="col-span-2 relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-slate-400" />
          <input
            value={filters.search}
            onChange={(e) => {
              setFilters({ ...filters, search: e.target.value });
              setPage(1);
            }}
            placeholder="Search number, customer, ref, owner…"
            className="w-full pl-7 pr-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
        </div>
        <select
          value={filters.transactionType}
          onChange={(e) => setFilters({ ...filters, transactionType: e.target.value })}
          className="py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
        >
          <option value="ALL">All types</option>
          <option value="Inquiry">Inquiry</option>
          <option value="Quotation">Quotation</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
        >
          <option value="ALL">All statuses</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          value={filters.customer}
          onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
          placeholder="Customer"
          className="py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
        />
        <select
          value={filters.currency}
          onChange={(e) => setFilters({ ...filters, currency: e.target.value })}
          className="py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
        >
          <option value="ALL">Currency</option>
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          value={filters.createdBy}
          onChange={(e) => setFilters({ ...filters, createdBy: e.target.value })}
          placeholder="Created by"
          className="py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
        />
        <input
          value={filters.version}
          onChange={(e) => setFilters({ ...filters, version: e.target.value })}
          placeholder="Version"
          className="py-2 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
        />
      </div>

      {showCols && (
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-xs space-y-2 border border-slate-200 dark:border-slate-700">
          <p className="font-bold">Column configuration (saved with views — new fields can be added in DEFAULT_IQ_GRID_COLUMNS)</p>
          <div className="flex flex-wrap gap-2">
            {columns.map((c) => (
              <label key={c.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={c.visible}
                  onChange={() => setColumns((prev) => prev.map((x) => (x.id === c.id ? { ...x, visible: !x.visible } : x)))}
                />
                {c.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="View name"
              className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent"
            />
            <button onClick={saveView} className="px-2 py-1 rounded bg-blue-600 text-white font-bold">
              Save view
            </button>
            {savedViews.map((v) => (
              <button
                key={v.name}
                onClick={() => {
                  setColumns(v.columns);
                  setFilters(v.filters);
                }}
                className="px-2 py-1 rounded border"
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-auto shadow-sm">
        <table className="text-[11px] border-collapse min-w-full">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800">
              {visibleCols.map((col, idx) => (
                <th
                  key={col.id}
                  draggable
                  onDragStart={() => (dragCol.current = idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragCol.current !== null) moveColumn(dragCol.current, idx);
                    dragCol.current = null;
                  }}
                  onClick={() => onSort(col.id as keyof InquiryQuotationHomeRow)}
                  className="p-2 text-left font-bold whitespace-nowrap border-b border-slate-200 dark:border-slate-700 cursor-pointer select-none relative"
                  style={{ width: col.width, minWidth: col.width }}
                >
                  {col.label}
                  {sortKey === col.id ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  <span
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const startX = e.clientX;
                      const startW = col.width;
                      const move = (ev: MouseEvent) => resize(String(col.id), startW + ev.clientX - startX);
                      const up = () => {
                        window.removeEventListener('mousemove', move);
                        window.removeEventListener('mouseup', up);
                      };
                      window.addEventListener('mousemove', move);
                      window.addEventListener('mouseup', up);
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                onDoubleClick={() => onOpenTransaction(row.id)}
                className={`cursor-pointer border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/70 dark:hover:bg-slate-800 ${
                  selectedId === row.id ? 'bg-blue-50 dark:bg-slate-800' : ''
                }`}
              >
                {visibleCols.map((col) => (
                  <td
                    key={col.id}
                    className={`p-2 whitespace-nowrap ${col.align === 'right' ? 'text-right font-mono' : ''} ${col.align === 'center' ? 'text-center' : ''}`}
                  >
                    {col.id === 'transactionNo' ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenTransaction(row.id);
                        }}
                        className="font-bold text-blue-700 dark:text-blue-400 hover:underline"
                      >
                        {row.transactionNo}
                      </button>
                    ) : col.id === 'status' ? (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold inline-block ${statusBadgeClass(row.status)}`}>
                        {row.status}
                      </span>
                    ) : col.id === 'totalValue' ? (
                      row.totalValue.toLocaleString()
                    ) : (
                      String(row[col.id as keyof InquiryQuotationHomeRow] ?? '')
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          {rows.length} transactions · page {page}/{pageCount}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="border rounded px-2 py-1 bg-transparent"
          >
            {[8, 12, 25, 50].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 border rounded disabled:opacity-40">
            Prev
          </button>
          <button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 border rounded disabled:opacity-40">
            Next
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
};
