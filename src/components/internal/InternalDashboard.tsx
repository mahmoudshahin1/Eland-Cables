import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InternalPortalTab } from '../../types';
import { fetchMyWorkflowTasks, type MyWorkflowTask } from '../../services/workflowApiService';
import { useAuth } from '../../context/AuthContext';
import { internalPathForTab } from '../../app/shellRoutes';
import {
  Sliders,
  FileText,
  FileCheck,
  Users,
  Wrench,
  AlertTriangle,
  Coins,
  FileSpreadsheet,
  BarChart3,
  TrendingUp,
  PieChart as PieChartIcon,
  Bell,
  Activity,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import {
  Card,
  StatCard,
  Button,
  Badge,
} from '../ui';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';

interface InternalDashboardProps {
  onNavigateTab: (tab: InternalPortalTab) => void;
}

export const InternalDashboard: React.FC<InternalDashboardProps> = ({ onNavigateTab }) => {
  const { jwtToken, currentUser } = useAuth();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<{
    activeCustomers: number;
    openInquiries: number;
    openQuotations: number;
    bomConflicts: number;
    unpricedRawMaterials: number;
    technicalOfficeRequests: number;
    pendingApprovals: number;
    inquiryByStatus: Array<{ status: string; count: number }>;
  } | null>(null);

  const [tasks, setTasks] = useState<MyWorkflowTask[]>([]);

  useEffect(() => {
    if (!jwtToken) return;
    fetch('/api/admin/platform/dashboard/kpis', {
      headers: { Authorization: `Bearer ${jwtToken}` },
    })
      .then((r) => r.json())
      .then((d) => setKpis(d.kpis || null))
      .catch(() => setKpis(null));
    void fetchMyWorkflowTasks(jwtToken).then(setTasks).catch(() => setTasks([]));
  }, [jwtToken]);

  const salesOrdersByStatus = (kpis?.inquiryByStatus || []).map((row, i) => ({
    name: row.status,
    value: row.count,
    color: ['#1d4fa1', '#f59e0b', '#10b981', '#64748b', '#f04e30'][i % 5],
  }));

  const inquiryTotal = (kpis?.inquiryByStatus || []).reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="space-y-6">
      {tasks.length > 0 && (
        <Card className="p-4 border border-slate-200">
          <h2 className="text-sm font-bold text-slate-900 mb-2">My Tasks</h2>
          <ul className="space-y-1.5 text-xs text-slate-700">
            {tasks.slice(0, 8).map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() =>
                    navigate(internalPathForTab('sales_quotations'), { state: { inquiryId: task.entityId } })
                  }
                >
                  {task.title}
                </button>
                <span className="font-mono text-slate-500">{task.currentStepCode}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {/* Executive Command Center Hero Banner */}
      <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 rounded-2xl p-5 sm:p-6 text-white border border-brand-800 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute top-0 inset-inline-end-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/3" />
        <div className="relative z-10 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <span className="bg-white/15 text-white text-[11px] px-2.5 py-0.5 rounded-md font-semibold tracking-wide backdrop-blur-sm">
              INTERNAL ENTERPRISE PORTAL
            </span>
            <span className="text-[12px] text-white/80 font-mono bg-black/20 px-2 py-0.5 rounded-md">
              Logged in: {currentUser?.fullName || currentUser?.email || '—'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
            Dashboard Overview — Executive Command Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-200 mt-1.5 max-w-3xl font-normal leading-relaxed">
            One Platform. All Teams. Complete Visibility into Sales, Technical Office, Costing, Production, and Finance.
          </p>
        </div>
        <div className="relative z-10 flex items-center flex-wrap gap-2.5 shrink-0">
          <Button
            variant="primary"
            size="sm"
            leadingIcon={Sliders}
            onClick={() => onNavigateTab('cable_configurator')}
            className="bg-brand-500 hover:bg-brand-400 text-white border-0 shadow-md font-semibold"
          >
            Cable Parameters
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={FileSpreadsheet}
            onClick={() => onNavigateTab('master_data')}
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm"
          >
            Excel Master Data Import
          </Button>
          <Button
            variant="accent"
            size="sm"
            leadingIcon={BarChart3}
            onClick={() => onNavigateTab('reports_analytics')}
            className="shadow-md font-semibold"
          >
            Reports
          </Button>
        </div>
      </div>

      {/* Live KPI metrics from PostgreSQL */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="h-full">
          <StatCard
            icon={FileText}
            label="Open Inquiries"
            value={kpis?.openInquiries ?? '—'}
            onViewAll={() => onNavigateTab('sales_quotations')}
          />
        </div>
        <div className="h-full">
          <StatCard
            icon={FileCheck}
            label="Open Quotations"
            value={kpis?.openQuotations ?? '—'}
            onViewAll={() => onNavigateTab('sales_quotations')}
          />
        </div>
        <div className="h-full">
          <StatCard
            icon={Users}
            label="Active Customers"
            value={kpis?.activeCustomers ?? '—'}
            onViewAll={() => onNavigateTab('master_data')}
          />
        </div>
        <div className="h-full">
          <StatCard
            icon={Wrench}
            label="TO Requests"
            value={kpis?.technicalOfficeRequests ?? '—'}
            onViewAll={() => onNavigateTab('technical_office')}
          />
        </div>
        <div className="h-full">
          <StatCard
            icon={AlertTriangle}
            label="BOM Conflicts"
            value={kpis?.bomConflicts ?? '—'}
            onViewAll={() => onNavigateTab('master_data')}
          />
        </div>
        <div className="h-full">
          <StatCard
            icon={Coins}
            label="Unpriced Materials"
            value={kpis?.unpricedRawMaterials ?? '—'}
            onViewAll={() => onNavigateTab('costing_pricing')}
          />
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sales Orders by Status Donut */}
        <div className="lg:col-span-4">
          <Card
            title={
              <span className="flex items-center gap-2 uppercase tracking-wider text-xs">
                <PieChartIcon className="h-4 w-4 text-brand-600" />
                Inquiries by Status
              </span>
            }
            className="h-full shadow-[var(--shadow-card)] flex flex-col justify-between"
          >
            <div className="h-56 relative my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salesOrdersByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {salesOrdersByStatus.map((entry, idx) => (
                      <Cell key={`c-${idx}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f2c5c',
                      borderRadius: '8px',
                      color: '#fff',
                      border: 'none',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-extrabold font-display text-slate-900">
                  {inquiryTotal || '—'}
                </span>
                <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">
                  Current inquiries
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-100">
              {salesOrdersByStatus.map((s) => (
                <div key={s.name} className="flex items-center gap-2 bg-slate-50/60 p-1.5 rounded-lg border border-slate-100">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-slate-600 font-medium truncate text-[11px]">{s.name}:</span>
                  <span className="font-bold text-slate-900 ms-auto text-[11px] font-mono">{s.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Monthly Sales (USD) Bar Chart */}
        <div className="lg:col-span-4">
          <Card
            title={
              <span className="flex items-center gap-2 uppercase tracking-wider text-xs">
                <TrendingUp className="h-4 w-4 text-brand-600" />
                Monthly Sales (USD Millions)
              </span>
            }
            className="h-full shadow-[var(--shadow-card)]"
          >
            <div className="h-64 w-full flex flex-col items-center justify-center text-xs text-slate-500 text-center px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <BarChart3 className="h-8 w-8 text-slate-300 mb-2" />
              <p className="max-w-xs leading-relaxed text-slate-600">
                No data configured. Sales order values are not connected (D365 NOT_CONNECTED). This chart does not
                invent revenue.
              </p>
            </div>
          </Card>
        </div>

        {/* Top Customers by Sales */}
        <div className="lg:col-span-4">
          <Card
            title={
              <span className="flex items-center gap-2 uppercase tracking-wider text-xs">
                <Users className="h-4 w-4 text-brand-600" />
                Top Customers by Sales (USD)
              </span>
            }
            className="h-full shadow-[var(--shadow-card)]"
          >
            <div className="h-64 w-full flex flex-col items-center justify-center text-xs text-slate-500 text-center px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Users className="h-8 w-8 text-slate-300 mb-2" />
              <p className="max-w-xs leading-relaxed text-slate-600">
                No data configured. Customer ranking requires live orders; none are sourced from ERP.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom Activities & Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title={
            <span className="flex items-center gap-2 uppercase tracking-wider text-xs">
              <Activity className="h-4 w-4 text-brand-600" />
              Recent Activities
            </span>
          }
          className="shadow-[var(--shadow-card)]"
        >
          <div className="py-6 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-center">
            <p className="text-xs text-slate-500">
              No data configured. Activity feed is not wired to AuditEvent for this dashboard.
            </p>
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2 uppercase tracking-wider text-xs">
              <Bell className="h-4 w-4 text-brand-600" />
              Alerts & Notifications
            </span>
          }
          className="shadow-[var(--shadow-card)]"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-slate-50/60 rounded-xl border border-slate-100 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 leading-relaxed">
                No data configured. Overdue invoices, MES delays, and LME prices are not official platform data.
                Unpriced materials and BOM conflicts are shown in the KPI row above (live PostgreSQL counts).
              </p>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigateTab('finance_collections')}
                className="text-[11px] font-semibold"
              >
                Finance (NOT_IMPLEMENTED)
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigateTab('orders_production')}
                className="text-[11px] font-semibold"
              >
                Production (NOT_CONNECTED)
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onNavigateTab('costing_pricing')}
                className="text-[11px] font-semibold"
              >
                Costing Configuration
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
