import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingCard,
  CostingKpiCard,
  CostingOptionBBanner,
  CostingPageHeader,
  CostingTable,
  CostingTd,
  CostingTh,
  gateStatusBadge,
} from '../CostingUiPrimitives';
import { costingApi } from '../costingV3Api';
import { CostingPanelProps } from './types';

type CheckStatus = 'PASS' | 'FAIL' | 'NOT_VERIFIED' | 'UNSIGNED';

type ProductionReadinessPayload = {
  overallStatus: 'PRODUCTION_READY' | 'NOT_PRODUCTION_READY';
  productionReady: boolean;
  blockers: string[];
  checklist: Array<{ id: string; label: string; status: CheckStatus; mandatory: boolean; detail?: string }>;
  areas: Array<{ id: string; label: string; status: CheckStatus; detail?: string }>;
  masterData?: {
    total: number;
    ready: number;
    blocked: number;
    warning: number;
    notChecked: number;
  };
  golden?: Array<{
    materialNumber: string;
    governanceStatus: string;
    engineStatus: string;
    gate4Blocked?: boolean;
    missing?: string[];
  }>;
  decision5?: {
    signed: boolean;
    status: string;
    option: string;
    optionLabel: string;
    signedAt?: string | null;
    signedBy?: string | null;
  };
  evaluatedAt?: string;
  source?: Record<string, string>;
};

function overallTone(ready: boolean) {
  return ready ? 'success' : 'danger';
}

export const ProductionReadinessPanel: React.FC<CostingPanelProps> = ({ token, onNavigate }) => {
  const [data, setData] = useState<ProductionReadinessPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await costingApi(token, '/api/admin/costing/production-readiness')) as ProductionReadinessPayload;
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load production readiness');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = Boolean(data?.productionReady);
  const md = data?.masterData;

  return (
    <>
      <CostingPageHeader
        title="Production Readiness"
        breadcrumb="Costing > Production Readiness"
        actions={
          <CostingBtn onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </CostingBtn>
        }
      />
      <CostingOptionBBanner className="mb-4" />
      <div
        className={`mb-4 rounded-xl border px-4 py-3 ${
          ready ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'
        }`}
        role="status"
      >
        <p className="text-xs font-semibold uppercase tracking-wide">
          Business Decision 5: {data?.decision5?.signed ? 'Signed' : 'Pending'}
        </p>
        <p className="text-lg font-bold mt-0.5">
          {data?.decision5?.optionLabel || 'OPTION B — LME / BASE METAL ONLY'}
        </p>
        <p className="text-sm mt-1">
          Status <strong>{data?.decision5?.status || 'UNSIGNED'}</strong>. Option A (landed metal) is not activated from
          this screen. A sign-off record is required before production; this control does not change Direct RM pricing.
        </p>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <CostingKpiCard
          label="Overall"
          value={ready ? 'PRODUCTION READY' : 'NOT PRODUCTION READY'}
          icon={ready ? BadgeCheck : ShieldAlert}
          tone={ready ? 'green' : 'red'}
          subtitle={data?.evaluatedAt ? `Evaluated ${new Date(data.evaluatedAt).toLocaleString()}` : undefined}
        />
        <CostingKpiCard
          label="Cables ready"
          value={md ? `${md.ready} / ${md.total}` : '—'}
          icon={CheckCircle2}
          tone="green"
          subtitle="READY_FOR_COSTING vs platform cables"
        />
        <CostingKpiCard
          label="Blocked"
          value={md?.blocked ?? '—'}
          icon={XCircle}
          tone="red"
          subtitle="NOT_READY / DATA_ISSUE"
        />
        <CostingKpiCard
          label="Warning"
          value={md?.warning ?? '—'}
          icon={AlertTriangle}
          tone="orange"
          subtitle="UNDER_REVIEW"
        />
      </div>

      <div className="mb-4">
        <CostingCard
          title="Overall status"
          subtitle="PRODUCTION READY is shown only when every mandatory gate is PASS. Live CI is not assumed."
        >
          <div className="flex flex-wrap items-center gap-2">
            <CostingBadge tone={overallTone(ready)}>{data?.overallStatus || (loading ? '…' : 'NOT_PRODUCTION_READY')}</CostingBadge>
            <CostingBadge tone="info">Option B</CostingBadge>
            <CostingBadge tone={data?.decision5?.signed ? 'success' : 'warning'}>
              Decision 5 {data?.decision5?.status || 'UNSIGNED'}
            </CostingBadge>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Source: {data?.source?.governance || 'evaluateCableCostingReadiness'} · golden{' '}
            {data?.source?.golden || 'getGoldenRegressionProbeStatus'} · tests/tsc {data?.source?.ci || 'NOT_VERIFIED'}
          </p>
        </CostingCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <CostingCard title="Blockers" subtitle="Computed from live readiness counts — not hardcoded.">
          {loading && !data && <p className="text-sm text-slate-500">Loading…</p>}
          {data && data.blockers.length === 0 && (
            <p className="text-sm text-slate-600">No blockers on the current control snapshot.</p>
          )}
          {data && data.blockers.length > 0 && (
            <ul className="space-y-2 text-sm text-slate-700 list-disc pl-4">
              {data.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-brand-700 underline"
            onClick={() => onNavigate('readiness')}
          >
            Open Costing Readiness workbench
          </button>
        </CostingCard>
        <CostingCard title="Mandatory checklist">
          <CostingTable>
            <thead>
              <tr>
                <CostingTh>Gate</CostingTh>
                <CostingTh>Status</CostingTh>
              </tr>
            </thead>
            <tbody>
              {(data?.checklist || []).map((row) => (
                <tr key={row.id}>
                  <CostingTd>
                    <p className="font-semibold text-slate-800">
                      {row.label}
                      {row.mandatory ? <span className="text-[10px] text-slate-400 ml-1">MANDATORY</span> : null}
                    </p>
                    {row.detail && <p className="text-xs text-slate-500 mt-0.5">{row.detail}</p>}
                  </CostingTd>
                  <CostingTd>{gateStatusBadge(row.status)}</CostingTd>
                </tr>
              ))}
            </tbody>
          </CostingTable>
        </CostingCard>
      </div>

      <CostingCard title="Eight area statuses" subtitle="Engineering, BOM, RM, prices, FX, scrap, golden set, Decision 5." className="mb-4">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {(data?.areas || []).map((area) => (
            <div key={area.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50/60">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">{area.label}</p>
                {gateStatusBadge(area.status)}
              </div>
              {area.detail && <p className="text-xs text-slate-500 mt-2">{area.detail}</p>}
            </div>
          ))}
        </div>
      </CostingCard>

      <CostingCard title="Golden cables" subtitle="Live ENERGYA probe identities 10009487–10009490.">
        <CostingTable>
          <thead>
            <tr>
              <CostingTh>Material</CostingTh>
              <CostingTh>Governance</CostingTh>
              <CostingTh>Engine probe</CostingTh>
              <CostingTh>Notes</CostingTh>
            </tr>
          </thead>
          <tbody>
            {(data?.golden || []).map((row) => (
              <tr key={row.materialNumber}>
                <CostingTd className="font-mono">{row.materialNumber}</CostingTd>
                <CostingTd>
                  {row.governanceStatus === 'READY_FOR_COSTING' ? (
                    <CostingBadge tone="success">Ready</CostingBadge>
                  ) : (
                    <CostingBadge tone="warning">{row.governanceStatus}</CostingBadge>
                  )}
                </CostingTd>
                <CostingTd>
                  {row.engineStatus === 'READY' ? (
                    <CostingBadge tone="success">READY</CostingBadge>
                  ) : (
                    <CostingBadge tone="neutral">{row.engineStatus}</CostingBadge>
                  )}
                </CostingTd>
                <CostingTd className="text-xs text-slate-500">
                  {row.missing?.slice(0, 2).join(' · ') || (row.gate4Blocked ? 'Gate 4 blocked' : '—')}
                </CostingTd>
              </tr>
            ))}
          </tbody>
        </CostingTable>
      </CostingCard>
    </>
  );
};
