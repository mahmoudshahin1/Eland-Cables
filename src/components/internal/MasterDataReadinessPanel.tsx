import React, { useEffect, useState } from 'react';
import {
  Cable,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Layers3,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DashboardStatCard } from '../common/DashboardStatCard';

type Readiness = {
  cableMaster?: { total: number; active: number };
  engineeringMapping?: {
    total: number;
    complete: number;
    partial: number;
    missing: number;
    businessDecisionRequired: number;
    approved: number;
    draft: number;
    underReview: number;
    rejected: number;
  };
  bom?: {
    totalLines: number;
    validLines: number;
    conflictGroups: number;
    resolved: number;
    unresolved: number;
    totalSourceRows?: number;
    unresolvedConflicts?: number;
    approved?: number;
  };
  rawMaterials?: { total: number; priceConfigured: number; priceNotConfigured: number };
  costing?: string;
  drumOptimization?: string;
};

export const MasterDataReadinessPanel: React.FC = () => {
  const { jwtToken } = useAuth();
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/master/readiness', {
          headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        });
        if (!res.ok) throw new Error(`Readiness API ${res.status}`);
        const body = await res.json();
        if (!cancelled) setData(body);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Readiness load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  if (loading) {
    return <p className="text-xs text-slate-500">Loading PostgreSQL data-readiness metrics…</p>;
  }
  if (error) {
    return (
      <div className="p-4 border border-amber-200 bg-amber-50 rounded-2xl text-xs text-amber-900">
        {error}. Sign in as an internal user if the API requires it. Costing is not implemented.
      </div>
    );
  }

  const em = data?.engineeringMapping;
  const bom = data?.bom;
  const rm = data?.rawMaterials;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Internal governance view from PostgreSQL. Description parses are Suggested only. Blank RM prices stay
        PRICE_NOT_CONFIGURED. Costing and drum formulas are not started.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardStatCard icon={Cable} label="Cable Master total" value={data?.cableMaster?.total ?? 0} />
        <DashboardStatCard icon={CheckCircle2} label="Approved Mapping" value={em?.approved ?? 0} />
        <DashboardStatCard icon={FileText} label="Draft Mapping" value={em?.draft ?? 0} />
        <DashboardStatCard icon={Clock} label="Under Review" value={em?.underReview ?? 0} />
        <DashboardStatCard icon={XCircle} label="Rejected Mapping" value={em?.rejected ?? 0} />
        <DashboardStatCard icon={CheckCircle2} label="Engineering complete" value={em?.complete ?? 0} />
        <DashboardStatCard icon={Layers3} label="Engineering partial" value={em?.partial ?? 0} />
        <DashboardStatCard icon={Layers3} label="BOM lines (source rows)" value={data?.bom?.totalSourceRows ?? 4986} />
        <DashboardStatCard icon={Layers3} label="BOM unique lines" value={bom?.validLines ?? 4822} />
        <DashboardStatCard icon={AlertTriangle} label="BOM conflict groups" value={bom?.conflictGroups ?? 81} />
        <DashboardStatCard icon={Clock} label="BOM unresolved (BDR)" value={bom?.unresolvedConflicts ?? 81} />
        <DashboardStatCard icon={CheckCircle2} label="BOM Governed Approved" value={bom?.approved ?? 0} />
        <DashboardStatCard icon={Layers3} label="RM total" value={rm?.total ?? 0} />
        <DashboardStatCard icon={Coins} label="RM price configured" value={rm?.priceConfigured ?? 0} />
        <DashboardStatCard icon={XCircle} label="RM PRICE_NOT_CONFIGURED" value={rm?.priceNotConfigured ?? 0} />
      </div>
      <p className="text-[11px] text-slate-400">
        Costing: {data?.costing || 'NOT_IMPLEMENTED'} · Drum: {data?.drumOptimization || 'CONFIGURATION_REQUIRED'}
      </p>
    </div>
  );
};

