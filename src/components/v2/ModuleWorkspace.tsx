/**
 * Module workspace contract UI — header, summary, KPIs (real or NOT AVAILABLE), actions, surfaces.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Lock } from 'lucide-react';
import type { ModuleWorkspaceContract, WorkspaceKpiSpec } from '../../platform/moduleIa';
import { useAuth } from '../../context/AuthContext';

const VERMILION = '#E10600';
const NAVY = '#0B1F3A';

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    LIVE: 'bg-emerald-100 text-emerald-800',
    PARTIAL: 'bg-amber-100 text-amber-900',
    FROZEN: 'bg-sky-100 text-sky-900',
    PLANNED: 'bg-slate-100 text-slate-600',
    STUB: 'bg-slate-100 text-slate-600',
    NOT_IMPLEMENTED: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded ${colors[status] || 'bg-slate-100 text-slate-700'}`}>
      {status}
    </span>
  );
}

function KpiTile({ kpi, token }: { kpi: WorkspaceKpiSpec; token: string | null }): React.ReactElement {
  const [value, setValue] = useState<string>('…');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (kpi.availability !== 'LIVE' || !kpi.sourceApi) {
      setValue('NOT AVAILABLE');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(kpi.sourceApi!, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          if (!cancelled) {
            setErr(`${res.status}`);
            setValue('NOT AVAILABLE');
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (typeof data.total === 'number') setValue(String(data.total));
        else if (data.summary?.totalUsers != null) setValue(String(data.summary.totalUsers));
        else if (data.summary?.userCount != null) setValue(String(data.summary.userCount));
        else if (data.summary?.users != null) setValue(String(data.summary.users));
        else if (data.summary?.total != null) setValue(String(data.summary.total));
        else if (data.summary?.ready != null) setValue(String(data.summary.ready));
        else if (data.kpis) setValue(String(Object.keys(data.kpis).length));
        else if (Array.isArray(data.customers)) setValue(String(data.total ?? data.customers.length));
        else if (data.summary && typeof data.summary === 'object') {
          const keys = Object.keys(data.summary);
          setValue(keys.length ? String(data.summary[keys[0]]) : 'LOADED');
        } else setValue('LOADED');
      } catch {
        if (!cancelled) {
          setErr('fetch');
          setValue('NOT AVAILABLE');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kpi, token]);

  return (
    <div className="border border-slate-200 bg-white p-3 min-w-[8rem]">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{kpi.label}</div>
      <div className="mt-1 text-xl font-semibold text-[#0B1F3A] tabular-nums">{value}</div>
      {kpi.availability !== 'LIVE' && (
        <div className="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
          <Lock className="h-3 w-3" />
          {kpi.notes || 'No live source'}
        </div>
      )}
      {err && <div className="mt-1 text-[10px] text-amber-700">Source {err}</div>}
    </div>
  );
}

export function ModuleWorkspaceView({
  contract,
  children,
}: {
  contract: ModuleWorkspaceContract;
  children?: React.ReactNode;
}) {
  const { jwtToken } = useAuth();
  const token = jwtToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('jwt_access_token') : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: VERMILION }}>
            {contract.header.subtitle}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[#0B1F3A]">{contract.header.title}</h1>
            {statusBadge(contract.header.status)}
          </div>
          <p className="mt-2 text-sm text-slate-600 max-w-3xl">{contract.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {contract.primaryActions.map((a) =>
            a.kind === 'v1' ? (
              <a
                key={a.id}
                href={a.href}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {a.label}
              </a>
            ) : (
              <Link
                key={a.id}
                to={a.href}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: NAVY }}
              >
                {a.label}
              </Link>
            )
          )}
        </div>
      </div>

      {contract.kpis.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            KPIs (live sources only)
          </div>
          <div className="flex flex-wrap gap-3">
            {contract.kpis.map((kpi) => (
              <div key={kpi.id}>
                <KpiTile kpi={kpi} token={token} />
              </div>
            ))}
          </div>
        </div>
      )}

      {contract.surfaces.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Module surfaces
          </div>
          <div className="flex flex-wrap gap-2">
            {contract.surfaces.map((s) => (
              <Link
                key={s.surface}
                to={s.path}
                className="px-3 py-1.5 text-sm border border-slate-200 hover:border-[#0B1F3A]/40 bg-white"
              >
                {s.label}
                <span className="ml-2 text-[10px] text-slate-400">{s.availability}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {contract.masterEntities.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Master data (owned)
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {contract.masterEntities.map((e) => (
              <li key={e.entityCode}>
                <Link
                  to={e.path}
                  className="block border border-slate-200 bg-white px-3 py-2 hover:border-[#0B1F3A]/40"
                >
                  <div className="font-medium text-[#0B1F3A] text-sm">{e.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Owner {e.ownerModuleId} · {e.scope}
                    {e.permissions[0] ? ` · ${e.permissions[0]}` : ''}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {contract.invariants.length > 0 && (
        <div className="border border-slate-200 bg-[#F7F8FA] px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Invariants
          </div>
          <ul className="text-xs text-slate-600 list-disc pl-4 space-y-0.5">
            {contract.invariants.map((inv) => (
              <li key={inv}>{inv}</li>
            ))}
          </ul>
        </div>
      )}

      {contract.recentActivity.availability === 'NOT_AVAILABLE' && (
        <p className="text-xs text-slate-500">
          Recent activity: NOT AVAILABLE
          {contract.recentActivity.notes ? ` — ${contract.recentActivity.notes}` : ''}
        </p>
      )}

      {children}
    </div>
  );
}
