import React, { useEffect, useState } from 'react';
import { AlertTriangle, Coins, FileCheck, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DashboardStatCard } from '../common/DashboardStatCard';

type Kpis = {
  openInquiries: number;
  openQuotations: number;
  bomConflicts: number;
  unpricedRawMaterials: number;
};

export const ReportsAnalytics: React.FC = () => {
  const { jwtToken } = useAuth();
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    if (!jwtToken) return;
    fetch('/api/admin/platform/dashboard/kpis', {
      headers: { Authorization: `Bearer ${jwtToken}` },
    })
      .then((r) => r.json())
      .then((d) => setKpis(d.kpis || null))
      .catch(() => setKpis(null));
  }, [jwtToken]);

  return (
    <div className="space-y-6">
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700">
        <span className="text-xs font-bold text-amber-200 uppercase tracking-widest bg-amber-800/60 px-2.5 py-1 rounded-md">
          REPORT_RUNTIME_WHITELIST_MVP
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight mt-2">Reports &amp; Analytics</h1>
        <p className="text-xs text-slate-300 mt-1">
          There is no Power BI embed and no arbitrary query engine. Governed reports run as whitelist
          aggregations only (counts). Cost, metal, and LME fields are excluded. Live counts below are
          PostgreSQL KPIs for authorized internal users.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DashboardStatCard icon={FileText} label="Open inquiries" value={kpis?.openInquiries ?? '—'} />
        <DashboardStatCard icon={FileCheck} label="Open quotations" value={kpis?.openQuotations ?? '—'} />
        <DashboardStatCard icon={AlertTriangle} label="BOM conflicts" value={kpis?.bomConflicts ?? '—'} />
        <DashboardStatCard icon={Coins} label="Unpriced materials" value={kpis?.unpricedRawMaterials ?? '—'} />
      </div>
    </div>
  );
};
