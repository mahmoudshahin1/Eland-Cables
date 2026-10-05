import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cable, CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw, Upload, X } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingCard,
  CostingInput,
  CostingKpiCard,
  CostingOptionBBanner,
  CostingPageHeader,
  CostingPagination,
  CostingTable,
  CostingTd,
  CostingTh,
  CostingToolbar,
  gateStatusBadge,
} from '../CostingUiPrimitives';
import { costingApi } from '../costingV3Api';
import { CostingPanelProps } from './types';
import { CostingV3Page } from '../costingV3Nav';
import { COSTING_BULK_IMPORT_OPTIONS, CostingBulkImportKind } from '../../../../services/costingBulkImportService';

type SummaryKpis = {
  total: number;
  ready: number;
  blocked: number;
  warning: number;
  notChecked: number;
  gate1Failures: number;
  gate2Failures: number;
  gate3Failures: number;
  gate4Failures: number;
  topBlockers: Array<{ reason: string; count: number }>;
};

type TableRow = {
  materialNumber: string;
  cableDescription: string;
  family?: string | null;
  overallStatus: string;
  engineeringStatus: string;
  bomStatus: string;
  rmPriceStatus: string;
  gate1: 'PASS' | 'BLOCKED' | 'WARN';
  gate2: 'PASS' | 'BLOCKED' | 'WARN';
  gate3: 'PASS' | 'BLOCKED' | 'WARN';
  gate4: 'PASS' | 'BLOCKED' | 'WARN';
  blockerCount: number;
  blockingReasons?: string[];
};

type GateDetail = { gate: number; label: string; status: 'PASS' | 'BLOCKED' | 'WARN'; detail?: string };
type ActionLink = { label: string; tab: string; intent?: Record<string, unknown> };

type CableDetail = {
  cable: TableRow;
  gates: GateDetail[];
  blockingReasons: string[];
  whyNotCosted: string[];
  actions: ActionLink[];
  engineProbe?: { status?: string; missing?: string[] };
};

type GoldenRow = {
  materialNumber: string;
  governanceStatus: string;
  engineStatus: string;
  gate4Blocked: boolean;
  missing: string[];
};

const STATUS_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'READY', label: 'Ready' },
  { id: 'BLOCKED', label: 'Blocked' },
  { id: 'WARNING', label: 'Warning' },
  { id: 'NOT_CHECKED', label: 'Not Checked' },
] as const;

function overallBadge(status: string) {
  if (status === 'READY_FOR_COSTING') return <CostingBadge tone="success">Ready</CostingBadge>;
  if (status === 'UNDER_REVIEW') return <CostingBadge tone="warning">Under Review</CostingBadge>;
  if (status === 'DATA_ISSUE') return <CostingBadge tone="danger">Data Issue</CostingBadge>;
  return <CostingBadge tone="neutral">Not Ready</CostingBadge>;
}

function gateDot(status: 'PASS' | 'BLOCKED' | 'WARN') {
  if (status === 'PASS') return <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" title="Pass" />;
  if (status === 'BLOCKED') return <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" title="Blocked" />;
  return <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" title="Warning" />;
}

const CableReadinessDetailPanel: React.FC<{
  detail: CableDetail | null;
  loading: boolean;
  onClose: () => void;
  onNavigate: (page: CostingV3Page, intent?: CostingPanelProps['intent']) => void;
}> = ({ detail, loading, onClose, onNavigate }) => {
  if (!detail && !loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-label="Close detail" />
      <aside className="relative w-full max-w-lg bg-white shadow-xl border-l border-slate-200 flex flex-col max-h-full">
        <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">Cable readiness detail</p>
            <h2 className="text-lg font-bold text-slate-900 font-mono">{detail?.cable.materialNumber || '…'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{detail?.cable.cableDescription}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && <p className="text-sm text-slate-500">Loading gates and engine probe…</p>}
          {detail && (
            <>
              <div className="flex items-center gap-2">{overallBadge(detail.cable.overallStatus)}</div>
              <CostingCard title="Readiness gates (1–5)">
                <div className="space-y-2">
                  {detail.gates.map((g) => (
                    <div key={g.gate} className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold inline-flex items-center justify-center shrink-0">
                          {g.gate}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{g.label}</p>
                          {g.detail && <p className="text-xs text-slate-500 mt-0.5 break-words">{g.detail}</p>}
                        </div>
                      </div>
                      {gateStatusBadge(g.status)}
                    </div>
                  ))}
                </div>
              </CostingCard>
              {(detail.whyNotCosted.length > 0 || detail.cable.overallStatus !== 'READY_FOR_COSTING') && (
                <CostingCard title="Why this cable cannot be costed">
                  <ul className="text-xs text-slate-700 space-y-2 list-disc pl-4">
                    {(detail.whyNotCosted.length ? detail.whyNotCosted : detail.blockingReasons).map((r, i) => (
                      <li key={i} className="break-words">
                        {r}
                      </li>
                    ))}
                  </ul>
                </CostingCard>
              )}
              {detail.actions.length > 0 && (
                <CostingCard title="Recommended actions">
                  <div className="flex flex-wrap gap-2">
                    {detail.actions.map((action) => (
                      <CostingBtn
                        key={action.label}
                        variant="secondary"
                        onClick={() => {
                          onNavigate(action.tab as CostingV3Page, action.intent as CostingPanelProps['intent']);
                          onClose();
                        }}
                      >
                        {action.label}
                      </CostingBtn>
                    ))}
                  </div>
                </CostingCard>
              )}
              {detail.engineProbe && (
                <p className="text-[11px] text-slate-400">
                  Engine probe: {detail.engineProbe.status || 'NOT_CHECKED'} (persist: false). Gate 5 uses the same orchestrator as inquiry costing preview.
                </p>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

export const ReadinessWorkbenchPanel: React.FC<CostingPanelProps> = ({ token, setError, onNavigate }) => {
  const [summary, setSummary] = useState<SummaryKpis | null>(null);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['id']>('ALL');
  const [gateFilter, setGateFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<CableDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [golden, setGolden] = useState<GoldenRow[]>([]);
  const [bulkKind, setBulkKind] = useState<CostingBulkImportKind>('raw_material_prices');

  const pageSize = 25;

  const loadSummary = useCallback(async () => {
    if (!token) return;
    const res = await costingApi(token, '/api/admin/costing/readiness/summary');
    setSummary((res.summary as SummaryKpis) || null);
  }, [token]);

  const loadTable = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      status: statusFilter,
    });
    if (search.trim()) params.set('search', search.trim());
    if (gateFilter) params.set('gate', gateFilter);
    const res = await costingApi(token, `/api/admin/costing/readiness/cables?${params.toString()}`);
    setRows((res.cables as TableRow[]) || []);
    setTotal(Number(res.total || 0));
    setPageCount(Number(res.pageCount || 1));
  }, [token, page, search, statusFilter, gateFilter]);

  const loadGolden = useCallback(async () => {
    if (!token) return;
    const res = await costingApi(token, '/api/admin/costing/readiness/golden-regression');
    setGolden((res.cables as GoldenRow[]) || []);
  }, [token]);

  const refreshAll = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await Promise.all([loadSummary(), loadTable(), loadGolden()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load readiness workbench');
    } finally {
      setBusy(false);
    }
  }, [token, loadSummary, loadTable, loadGolden, setError]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    void loadTable();
  }, [loadTable]);

  const openDetail = async (materialNumber: string) => {
    if (!token) return;
    setDetailLoading(true);
    setDetail(null);
    setError(null);
    try {
      const res = await costingApi(token, `/api/admin/costing/readiness/cables/${encodeURIComponent(materialNumber)}`);
      setDetail(res as CableDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cable detail');
    } finally {
      setDetailLoading(false);
    }
  };

  const kpiPct = useMemo(() => {
    const t = summary?.total || 0;
    return (n: number) => (t ? `${((n / t) * 100).toFixed(1)}%` : '—');
  }, [summary?.total]);

  return (
    <>
      <CostingPageHeader
        title="Costing Readiness"
        breadcrumb="Costing > Costing Readiness"
        actions={
          <CostingBtn variant="secondary" onClick={() => void refreshAll()} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-1 inline ${busy ? 'animate-spin' : ''}`} />
            Refresh
          </CostingBtn>
        }
      />
      <CostingOptionBBanner className="mb-4" />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <button type="button" className="text-left" onClick={() => { setStatusFilter('ALL'); setPage(1); }}>
          <CostingKpiCard label="Total Cables" value={summary?.total ?? '—'} icon={Cable} tone="blue" subtitle={kpiPct(summary?.total ?? 0)} />
        </button>
        <button type="button" className="text-left" onClick={() => { setStatusFilter('READY'); setPage(1); }}>
          <CostingKpiCard label="Ready" value={summary?.ready ?? '—'} icon={CheckCircle2} tone="green" subtitle={kpiPct(summary?.ready ?? 0)} />
        </button>
        <button type="button" className="text-left" onClick={() => { setStatusFilter('BLOCKED'); setPage(1); }}>
          <CostingKpiCard label="Blocked" value={summary?.blocked ?? '—'} icon={XCircle} tone="red" subtitle={kpiPct(summary?.blocked ?? 0)} />
        </button>
        <button type="button" className="text-left" onClick={() => { setStatusFilter('WARNING'); setPage(1); }}>
          <CostingKpiCard label="Warning" value={summary?.warning ?? '—'} icon={AlertTriangle} tone="orange" subtitle={kpiPct(summary?.warning ?? 0)} />
        </button>
        <button type="button" className="text-left" onClick={() => { setStatusFilter('NOT_CHECKED'); setPage(1); }}>
          <CostingKpiCard label="Not Checked" value={summary?.notChecked ?? '—'} icon={HelpCircle} tone="purple" subtitle={kpiPct(summary?.notChecked ?? 0)} />
        </button>
      </div>

      {summary?.topBlockers?.length ? (
        <CostingCard title="Top blockers (platform-wide)" className="mb-4">
          <ul className="text-xs text-slate-600 space-y-1">
            {summary.topBlockers.slice(0, 5).map((b) => (
              <li key={b.reason}>
                <span className="font-semibold text-slate-800">{b.count}×</span> {b.reason}
              </li>
            ))}
          </ul>
        </CostingCard>
      ) : null}

      <CostingCard title="Cable readiness register">
        <CostingToolbar
          actions={
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setStatusFilter(f.id); setPage(1); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    statusFilter === f.id ? 'bg-brand-800 text-white border-brand-800' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          <CostingInput
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search material number, description, family…"
            className="max-w-xs"
          />
          <select
            value={gateFilter}
            onChange={(e) => { setGateFilter(e.target.value); setPage(1); }}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
          >
            <option value="">All gates</option>
            <option value="1">Gate 1 failing</option>
            <option value="2">Gate 2 failing</option>
            <option value="3">Gate 3 failing</option>
            <option value="4">Gate 4 failing</option>
          </select>
        </CostingToolbar>

        <CostingTable>
          <thead>
            <tr>
              <CostingTh>Material #</CostingTh>
              <CostingTh>Description</CostingTh>
              <CostingTh>Family</CostingTh>
              <CostingTh>Status</CostingTh>
              <CostingTh>G1</CostingTh>
              <CostingTh>G2</CostingTh>
              <CostingTh>G3</CostingTh>
              <CostingTh>G4</CostingTh>
              <CostingTh>Blockers</CostingTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.materialNumber}
                className="hover:bg-slate-50 cursor-pointer"
                onClick={() => void openDetail(row.materialNumber)}
              >
                <CostingTd className="font-mono font-semibold">{row.materialNumber}</CostingTd>
                <CostingTd className="max-w-[220px] truncate">{row.cableDescription}</CostingTd>
                <CostingTd>{row.family || '—'}</CostingTd>
                <CostingTd>{overallBadge(row.overallStatus)}</CostingTd>
                <CostingTd>{gateDot(row.gate1)}</CostingTd>
                <CostingTd>{gateDot(row.gate2)}</CostingTd>
                <CostingTd>{gateDot(row.gate3)}</CostingTd>
                <CostingTd>{gateDot(row.gate4)}</CostingTd>
                <CostingTd className="text-right">{row.blockerCount}</CostingTd>
              </tr>
            ))}
          </tbody>
        </CostingTable>
        <CostingPagination
          page={page}
          pageCount={pageCount}
          total={total}
          from={total === 0 ? 0 : (page - 1) * pageSize + 1}
          to={Math.min(page * pageSize, total)}
          onPage={setPage}
        />
      </CostingCard>

      <CostingCard title="Bulk Resolve Data Gaps" className="mt-4">
        <p className="text-xs text-slate-600 mb-3">
          Use governed bulk import for prices, BOM, scrap, currencies and FX. Apply runs through existing Costing Configuration workflows — nothing is auto-approved. After apply, return here and refresh to recalculate readiness (step 7 in bulk wizard).
        </p>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Impact preview: bulk apply cannot estimate cable-level READY counts before commit. Refresh readiness after apply to see live gate changes.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {COSTING_BULK_IMPORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setBulkKind(opt.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                bulkKind === opt.id ? 'bg-brand-800 text-white border-brand-800' : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <CostingBtn
          variant="primary"
          onClick={() => onNavigate('bulk_import', { bulkKind, bulkStep: 1 })}
        >
          <Upload className="h-4 w-4 mr-1 inline" />
          Open bulk import wizard
        </CostingBtn>
      </CostingCard>

      <CostingCard title="Golden regression — probe cables 10009487–10009490" className="mt-4">
        <p className="text-xs text-slate-500 mb-3">
          Governance gates (1–4) plus engine probe (gate 5). Market metal inquiry prices are not supplied in this probe — expect INQUIRY_COPPER_PRICE_REQUIRED at engine unless header rates are passed in Validation.
        </p>
        <CostingTable>
          <thead>
            <tr>
              <CostingTh>Cable</CostingTh>
              <CostingTh>Governance</CostingTh>
              <CostingTh>Engine</CostingTh>
              <CostingTh>Gate 4</CostingTh>
              <CostingTh>Sample blockers</CostingTh>
            </tr>
          </thead>
          <tbody>
            {golden.map((g) => (
              <tr key={g.materialNumber} className="hover:bg-slate-50 cursor-pointer" onClick={() => void openDetail(g.materialNumber)}>
                <CostingTd className="font-mono">{g.materialNumber}</CostingTd>
                <CostingTd>{overallBadge(g.governanceStatus)}</CostingTd>
                <CostingTd>
                  <CostingBadge tone={g.engineStatus === 'READY' ? 'success' : 'neutral'}>{g.engineStatus}</CostingBadge>
                </CostingTd>
                <CostingTd>{g.gate4Blocked ? <CostingBadge tone="danger">Blocked</CostingBadge> : <CostingBadge tone="success">Pass</CostingBadge>}</CostingTd>
                <CostingTd className="text-xs text-slate-600 max-w-md truncate">{g.missing.join(' · ') || '—'}</CostingTd>
              </tr>
            ))}
          </tbody>
        </CostingTable>
      </CostingCard>

      <CableReadinessDetailPanel
        detail={detail}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        onNavigate={onNavigate}
      />
    </>
  );
};
