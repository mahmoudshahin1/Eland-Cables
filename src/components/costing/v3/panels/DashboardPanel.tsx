import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Calculator,
  ClipboardCheck,
  DollarSign,
  Info,
  Layers3,
  Package,
  Recycle,
  ShieldAlert,
  Tag,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CostingV3Page } from '../costingV3Nav';
import { CostingBulkImportKind } from '../../../../services/costingBulkImportService';
import { CostingPanelProps } from './types';
import {
  CostingBadge,
  CostingCard,
  CostingEmptyState,
  CostingInfoPanel,
  CostingKpiCard,
  CostingTable,
  CostingTd,
  CostingTh,
  statusTone,
} from '../CostingUiPrimitives';
import { costingApi } from '../costingV3Api';

const READINESS_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#94a3b8'];

type ReadinessRow = {
  materialNumber?: string;
  overallStatus?: string;
  blockingReasons?: string[];
};

function isToday(value: unknown): boolean {
  if (!value) return false;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isWithinDays(value: unknown, days: number): boolean {
  if (!value) return false;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function readinessBucket(status: string | undefined): 'ready' | 'warning' | 'blocked' | 'unchecked' {
  const s = (status || '').toUpperCase();
  if (s.includes('READY')) return 'ready';
  if (s.includes('WARNING') || s.includes('WARN')) return 'warning';
  if (s.includes('NOT') || s.includes('BLOCK') || s.includes('MISSING')) return 'blocked';
  return 'unchecked';
}

export const DashboardPanel: React.FC<CostingPanelProps> = ({ token, data, loading, onNavigate }) => {
  const d = data.dashboard;
  const [readiness, setReadiness] = useState<ReadinessRow[]>([]);

  useEffect(() => {
    if (!token) return;
    void costingApi(token, '/api/admin/costing/readiness')
      .then((res) => setReadiness((res.cables as ReadinessRow[]) || []))
      .catch(() => setReadiness([]));
  }, [token]);

  const costingAuditRows = useMemo(
    () =>
      data.audit.filter((row) => {
        const action = String(row.action || '').toUpperCase();
        return ['VALIDATE', 'CALCULATE', 'PREVIEW', 'COSTING'].some((t) => action.includes(t));
      }),
    [data.audit]
  );

  const calculationsToday = useMemo(
    () => costingAuditRows.filter((row) => isToday(row.at || row.createdAt)).length,
    [costingAuditRows]
  );

  const materialsUpdated30d = useMemo(
    () =>
      data.audit.filter(
        (row) =>
          String(row.entity || '').includes('RawMaterial') && isWithinDays(row.at || row.createdAt, 30)
      ).length,
    [data.audit]
  );

  const priceUpdates30d = useMemo(
    () =>
      data.audit.filter(
        (row) =>
          (String(row.entity || '').includes('RawMaterialPrice') ||
            String(row.entity || '').includes('ImportBatch')) &&
          isWithinDays(row.at || row.createdAt, 30)
      ).length,
    [data.audit]
  );

  const openValidations = useMemo(() => {
    if (!d) return { total: 0, critical: 0, warning: 0 };
    const critical = (d.bom.pendingApproval ?? 0) + (d.costingRuns.failed ?? 0);
    const warning =
      (d.rawMaterialPrices.pendingApproval ?? 0) + (d.scrapRules.underCreation ?? 0) + (d.imports.failed ?? 0);
    return { total: critical + warning, critical, warning };
  }, [d]);

  const readinessSummary = useMemo(() => {
    const counts = { ready: 0, warning: 0, blocked: 0, unchecked: 0 };
    for (const row of readiness) {
      counts[readinessBucket(row.overallStatus)] += 1;
    }
    const total = readiness.length || 1;
    const pct = Math.round((counts.ready / total) * 100);
    return {
      counts,
      pct,
      chart: [
        { name: 'Ready', value: counts.ready, color: READINESS_COLORS[0] },
        { name: 'Warning', value: counts.warning, color: READINESS_COLORS[1] },
        { name: 'Blocked', value: counts.blocked, color: READINESS_COLORS[2] },
        { name: 'Not Checked', value: counts.unchecked, color: READINESS_COLORS[3] },
      ].filter((x) => x.value > 0),
    };
  }, [readiness]);

  const topMaterials = useMemo(() => {
    const usage = new Map<string, { code: string; description: string; total: number; uom: string }>();
    for (const line of data.boms) {
      const code = String(line.rawMaterial || '');
      if (!code) continue;
      const weight = Number(line.weight) || 0;
      const prev = usage.get(code) || {
        code,
        description: String(line.rawMaterialDescription || code),
        total: 0,
        uom: String(line.unitKm || 'kg'),
      };
      prev.total += weight;
      usage.set(code, prev);
    }
    return [...usage.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [data.boms]);

  const trendData = useMemo(() => {
    const days: Record<string, { label: string; calculations: number; priceUpdates: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const key = dt.toISOString().slice(0, 10);
      days[key] = { label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), calculations: 0, priceUpdates: 0 };
    }
    for (const row of data.audit) {
      const key = String(row.at || row.createdAt || '').slice(0, 10);
      if (!days[key]) continue;
      const action = String(row.action || '').toUpperCase();
      const entity = String(row.entity || '');
      if (['VALIDATE', 'CALCULATE', 'PREVIEW'].some((t) => action.includes(t))) days[key].calculations += 1;
      if (entity.includes('RawMaterialPrice') || entity.includes('ImportBatch')) days[key].priceUpdates += 1;
    }
    return Object.values(days);
  }, [data.audit]);

  const activeFx = useMemo(() => {
    return data.exchangeRates
      .filter((r) => String(r.workflowStatus) === 'ACTIVE')
      .slice(0, 4)
      .map((r) => ({
        pair: `${String(r.fromCurrency)}/${String(r.toCurrency)}`,
        rate: Number(r.rate),
        date: r.effectiveFrom ? String(r.effectiveFrom).slice(0, 10) : '—',
      }));
  }, [data.exchangeRates]);

  const activeScrap = useMemo(
    () => data.scrapRules.filter((r) => String(r.workflowStatus) === 'ACTIVE').slice(0, 3),
    [data.scrapRules]
  );

  const quickActions: Array<{
    label: string;
    page: CostingV3Page;
    icon: React.ElementType;
    intent?: { bulkKind?: CostingBulkImportKind; action?: 'add' };
  }> = [
    { label: 'New Costing Calculation', page: 'validation', icon: Calculator },
    { label: 'Add Raw Material', page: 'raw_materials', icon: Package, intent: { action: 'add' } },
    { label: 'Upload RM Prices', page: 'bulk_import', icon: Upload, intent: { bulkKind: 'raw_material_prices' } },
    { label: 'Update Cable BOM', page: 'bulk_import', icon: Layers3, intent: { bulkKind: 'boms' } },
    { label: 'Metal Cost Components', page: 'metal_cost_components', icon: DollarSign },
    { label: 'View Validation', page: 'validation', icon: ClipboardCheck },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <CostingKpiCard
          label="Direct RM Cost (Today)"
          value="—"
          icon={Wallet}
          tone="blue"
          subtitle="Not tracked at dashboard level"
        />
        <CostingKpiCard
          label="Costing Calculations (Today)"
          value={loading ? '…' : calculationsToday || d?.costingRuns.completed || '—'}
          icon={Calculator}
          tone="orange"
          subtitle={calculationsToday ? 'From audit events today' : 'Last 30 days if no runs today'}
        />
        <CostingKpiCard
          label="Materials Updated (30 Days)"
          value={loading ? '…' : materialsUpdated30d || '—'}
          icon={Package}
          tone="green"
          subtitle="Raw material master changes"
        />
        <CostingKpiCard
          label="Price Updates (30 Days)"
          value={loading ? '…' : priceUpdates30d || d?.rawMaterialPrices.active || '—'}
          icon={Tag}
          tone="purple"
          subtitle="Price imports and approvals"
        />
        <CostingKpiCard
          label="Open Validations"
          value={loading ? '…' : openValidations.total || '—'}
          icon={ShieldAlert}
          tone="red"
          breakdown={
            openValidations.total > 0 ? (
              <div className="flex gap-2 mt-1 text-[10px]">
                <span className="text-red-600 font-semibold">Critical {openValidations.critical}</span>
                <span className="text-amber-600 font-semibold">Warning {openValidations.warning}</span>
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <CostingCard title="Costing Overview (Last 7 Days)" subtitle="Calculations and price updates from audit trail">
          {trendData.every((d) => d.calculations === 0 && d.priceUpdates === 0) ? (
            <CostingEmptyState title="No trend data yet" hint="Run validations or import prices to populate this chart." />
          ) : (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="calculations" name="Calculations" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="priceUpdates" name="Price Updates" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CostingCard>

        <CostingCard
          title="Recent Costing Calculations"
          action={
            <button type="button" className="text-xs text-brand-600 font-semibold hover:underline" onClick={() => onNavigate('audit')}>
              View all →
            </button>
          }
        >
          {costingAuditRows.length === 0 ? (
            <CostingEmptyState title="No costing calculations recorded" hint="Run validation from the Validation tab." />
          ) : (
            <div className="overflow-auto -mx-4">
              <CostingTable>
                <thead>
                  <tr>
                    <CostingTh>Cable</CostingTh>
                    <CostingTh>User</CostingTh>
                    <CostingTh>Calculated On</CostingTh>
                    <CostingTh>Status</CostingTh>
                  </tr>
                </thead>
                <tbody>
                  {costingAuditRows.slice(0, 6).map((row) => (
                    <tr key={String(row.id)} className="hover:bg-slate-50">
                      <CostingTd className="font-mono text-xs">{String(row.entityId || '—')}</CostingTd>
                      <CostingTd>{String(row.actorName || '—')}</CostingTd>
                      <CostingTd className="text-xs text-slate-500">
                        {row.at ? new Date(String(row.at)).toLocaleString() : '—'}
                      </CostingTd>
                      <CostingTd>
                        <CostingBadge tone={statusTone(String(row.action))}>{String(row.action || '—')}</CostingBadge>
                      </CostingTd>
                    </tr>
                  ))}
                </tbody>
              </CostingTable>
            </div>
          )}
        </CostingCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <CostingCard title="Costing Readiness" subtitle="ELAND regression cable matrix">
          {readiness.length === 0 ? (
            <CostingEmptyState title="Readiness not loaded" hint="Requires costing preview permission." />
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative h-36 w-36 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={readinessSummary.chart} dataKey="value" innerRadius={42} outerRadius={58} paddingAngle={2}>
                      {readinessSummary.chart.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-slate-800">{readinessSummary.pct}%</span>
                </div>
              </div>
              <ul className="text-xs space-y-1.5 text-slate-600">
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Ready ({readinessSummary.counts.ready})</li>
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-500" /> Warning ({readinessSummary.counts.warning})</li>
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" /> Blocked ({readinessSummary.counts.blocked})</li>
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-slate-400" /> Not Checked ({readinessSummary.counts.unchecked})</li>
              </ul>
            </div>
          )}
        </CostingCard>

        <CostingCard title="Top Materials by Usage" subtitle="From governed BOM consumption">
          {topMaterials.length === 0 ? (
            <CostingEmptyState title="No BOM consumption data" />
          ) : (
            <CostingTable>
              <thead>
                <tr>
                  <CostingTh>Material Code</CostingTh>
                  <CostingTh>Description</CostingTh>
                  <CostingTh className="text-right">Consumption</CostingTh>
                  <CostingTh>UOM</CostingTh>
                </tr>
              </thead>
              <tbody>
                {topMaterials.map((m) => (
                  <tr key={m.code}>
                    <CostingTd className="font-mono text-xs">{m.code}</CostingTd>
                    <CostingTd className="text-xs">{m.description}</CostingTd>
                    <CostingTd className="text-right tabular-nums">{m.total.toLocaleString()}</CostingTd>
                    <CostingTd>{m.uom}</CostingTd>
                  </tr>
                ))}
              </tbody>
            </CostingTable>
          )}
        </CostingCard>

        <CostingCard title="Quick Actions">
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onNavigate(item.page, item.intent)}
                  className="flex flex-col items-center gap-2 text-center text-[11px] font-semibold text-slate-700 border border-slate-200 rounded-xl px-2 py-3 hover:bg-slate-50 hover:border-brand-300 transition-colors"
                >
                  <span className="h-9 w-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </CostingCard>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <CostingInfoPanel
          icon={<Info className="h-4 w-4 text-blue-600" />}
          title="Current Costing Mode"
          tone="info"
        >
          <strong>Option B — LME / Base Metal Price Only.</strong> Premium, Shipping and Clearance are not included in
          Direct Raw Material Cost.
        </CostingInfoPanel>

        <CostingInfoPanel
          icon={<Recycle className="h-4 w-4 text-emerald-600" />}
          title="Active Scrap Rules"
          tone="success"
        >
          {activeScrap.length === 0 ? (
            <span>No active scrap rules.</span>
          ) : (
            <ul className="space-y-1">
              {activeScrap.map((r) => (
                <li key={String(r.id)}>
                  <strong>{String(r.code || r.name)}</strong>{' '}
                  {r.scrapRate != null ? `${(Number(r.scrapRate) * 100).toFixed(2)}%` : '—'}{' '}
                  <CostingBadge tone="success">ACTIVE</CostingBadge>
                </li>
              ))}
            </ul>
          )}
        </CostingInfoPanel>

        <CostingInfoPanel
          icon={<ArrowLeftRight className="h-4 w-4 text-amber-600" />}
          title={`Exchange Rates${activeFx[0]?.date ? ` (${activeFx[0].date})` : ''}`}
          tone="warning"
        >
          {activeFx.length === 0 ? (
            <span>No active exchange rates configured.</span>
          ) : (
            <ul className="space-y-1">
              {activeFx.map((fx) => (
                <li key={fx.pair}>
                  <strong>{fx.pair}</strong>: {Number.isFinite(fx.rate) ? fx.rate.toFixed(4) : '—'}
                </li>
              ))}
            </ul>
          )}
        </CostingInfoPanel>
      </div>
    </div>
  );
};
