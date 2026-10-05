import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import {
  Layers3,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Send,
  Eye,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Info,
  ChevronRight,
  ShieldCheck,
  Building2,
  GitBranch,
  Calendar,
  Sliders,
  Scale,
} from 'lucide-react';
import {
  CONTROLLED_BOM_DECISION_CATEGORIES,
} from '../../../../services/bomGovernanceService';
import { DashboardStatCard } from '../../../common/DashboardStatCard';

export const TechnicalOfficeBomGovernanceQueue: React.FC = () => {
  const { jwtToken } = useAuth();
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [counts, setCounts] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedConflict, setSelectedConflict] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Investigation & Decision Form
  const [investigationCategory, setInvestigationCategory] = useState<string>('BUSINESS_DECISION_REQUIRED');
  const [governedWeight, setGovernedWeight] = useState<string>('');
  const [governedUom, setGovernedUom] = useState<string>('kg');
  const [governedVersion, setGovernedVersion] = useState<string>('1');
  const [governedPlant, setGovernedPlant] = useState<string>('');
  const [governedRoute, setGovernedRoute] = useState<string>('');
  const [governedEffectiveFrom, setGovernedEffectiveFrom] = useState<string>('');
  const [decisionComment, setDecisionComment] = useState<string>('');
  const [assignedToUser, setAssignedToUser] = useState<string>('');
  const [actionSubmitting, setActionSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchConflicts = async () => {
    setLoading(true);
    try {
      const [confRes, readRes] = await Promise.all([
        fetch('/api/master/bom-conflicts', {
          headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        }),
        fetch('/api/master/readiness', {
          headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        }),
      ]);

      if (confRes.ok) {
        const data = await confRes.json();
        setConflicts(data.conflicts || []);
      }
      if (readRes.ok) {
        const readData = await readRes.json();
        setCounts(readData.bom || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConflicts();
  }, [jwtToken]);

  const selectConflictItem = (item: any) => {
    setSelectedConflict(item);
    setMessage(null);
    setInvestigationCategory(item.currentClassification || 'BUSINESS_DECISION_REQUIRED');
    setGovernedWeight(item.selectedWeight != null ? String(item.selectedWeight) : String(item.weightA));
    setGovernedUom(item.governedUom || item.uom || 'kg');
    setGovernedVersion(item.bomVersion ? String(item.bomVersion) : '1');
    setGovernedPlant(item.plant || '');
    setGovernedRoute(item.manufacturingRoute || '');
    setGovernedEffectiveFrom(item.effectiveFrom ? new Date(item.effectiveFrom).toISOString().slice(0, 10) : '');
    setDecisionComment(item.comment || '');
    setAssignedToUser(item.assignedTo || '');
  };

  const handleExportExcel = async () => {
    const query = new URLSearchParams();
    if (statusFilter !== 'ALL') query.set('investigationStatus', statusFilter);
    if (searchTerm) query.set('q', searchTerm);
    try {
      const res = await fetch(`/api/master/bom-conflicts-export?${query.toString()}`, {
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'BOM_Conflicts_Register.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage({ text: err.message || 'Export failed', type: 'error' });
    }
  };

  const handleExecuteWorkflowAction = async (action: 'ASSIGN' | 'START_REVIEW' | 'DECIDE' | 'RESOLVE' | 'APPROVE' | 'REJECT' | 'REOPEN') => {
    if (!selectedConflict) return;
    setActionSubmitting(true);
    setMessage(null);
    try {
      const payload: any = {
        action,
        decisionCategory: investigationCategory,
        comment: decisionComment,
        assignedTo: action === 'ASSIGN' ? assignedToUser : undefined,
      };

      if (action === 'RESOLVE' || action === 'APPROVE') {
        payload.selectedWeight = governedWeight ? Number(governedWeight) : undefined;
        payload.governedUom = governedUom || 'kg';
        payload.bomVersion = governedVersion ? Number(governedVersion) : 1;
        payload.plant = governedPlant || undefined;
        payload.manufacturingRoute = governedRoute || undefined;
        payload.effectiveFrom = governedEffectiveFrom || undefined;
      }

      const res = await fetch(`/api/master/bom-conflicts/${selectedConflict.conflictId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to execute ${action}`);
      }

      setMessage({ text: `BOM Governance action ${action} executed successfully.`, type: 'success' });
      await fetchConflicts();
      if (data.conflict) {
        setSelectedConflict((prev: any) => ({ ...prev, ...data.conflict }));
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionSubmitting(false);
    }
  };

  const filtered = conflicts.filter((c) => {
    const matchStatus = statusFilter === 'ALL' || c.investigationStatus === statusFilter;
    const matchSearch =
      !searchTerm ||
      c.conflictId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cableMaterialNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cable?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.rawMaterial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.rawMaterialDesc?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const statusBadge = (st: string) => {
    switch (st) {
      case 'APPROVED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> APPROVED</span>;
      case 'RESOLVED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-100 text-teal-800 border border-teal-300 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> RESOLVED</span>;
      case 'UNDER_REVIEW':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1"><Clock className="h-3 w-3" /> UNDER REVIEW</span>;
      case 'ASSIGNED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1"><Send className="h-3 w-3" /> ASSIGNED</span>;
      case 'DECISION_REQUIRED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> DECISION REQ</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800 border border-red-300 flex items-center gap-1"><XCircle className="h-3 w-3" /> REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> BDR</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Dashboard KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <DashboardStatCard icon={Layers3} label="Total BOM Rows" value="4,986" />
        <DashboardStatCard icon={CheckCircle2} label="Unique Valid Lines" value={counts?.validLines ?? 4822} />
        <DashboardStatCard icon={AlertTriangle} label="Conflict Groups" value={counts?.conflictGroups ?? 81} />
        <DashboardStatCard
          icon={Clock}
          label="Under Review / BDR"
          value={(counts?.businessDecisionRequired ?? 0) + (counts?.underReview ?? 0) + (counts?.assigned ?? 0)}
        />
        <DashboardStatCard icon={GitBranch} label="Resolved" value={counts?.resolved ?? 0} />
        <DashboardStatCard icon={ShieldCheck} label="Approved Governed" value={counts?.approved ?? 0} />
      </div>

      {/* Search, Filter & Export Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Conflict ID, Cable, Raw Material..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={fetchConflicts}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl text-slate-600 dark:text-slate-300"
            title="Refresh Conflicts"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'BUSINESS_DECISION_REQUIRED', 'ASSIGNED', 'UNDER_REVIEW', 'RESOLVED', 'APPROVED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === st
                  ? 'bg-brand-600 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {st === 'BUSINESS_DECISION_REQUIRED' ? 'BDR' : st}
            </button>
          ))}
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow ml-2"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Register</span>
          </button>
        </div>
      </div>

      {/* Main Split Screen: Conflict Register (Left) & Evidence & Decision (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Conflict List */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
              BOM Conflict Register ({filtered.length})
            </h3>
            <span className="text-[11px] text-slate-400">Multiple Weight Occurrences</span>
          </div>

          <div className="space-y-2.5 max-h-[660px] overflow-y-auto pr-1">
            {loading ? (
              <p className="p-8 text-center text-xs text-slate-400">Loading BOM conflicts...</p>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">No BOM conflicts match filter.</p>
            ) : (
              filtered.map((c) => {
                const isSelected = selectedConflict?.conflictId === c.conflictId;
                return (
                  <div
                    key={c.conflictId}
                    onClick={() => selectConflictItem(c)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/30 shadow-md ring-2 ring-purple-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-black text-purple-700 dark:text-purple-400">
                            {c.conflictId}
                          </span>
                          {statusBadge(c.investigationStatus)}
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                          {c.cableMaterialNumber} — {c.cable}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span>RM: <strong className="text-slate-800 dark:text-slate-200 font-mono">{c.rawMaterial}</strong></span>
                          <span>•</span>
                          <span className="font-mono text-red-600 font-bold">{c.weightA} {c.uom}</span>
                          <span>vs</span>
                          <span className="font-mono text-red-600 font-bold">{c.weightB} {c.uom}</span>
                          <span>({c.occurrenceCount} rows)</span>
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-purple-600' : 'text-slate-300'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Evidence & Decision Panel */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-5">
          {!selectedConflict ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <Layers3 className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-xs font-bold">Select a conflict group from the register to inspect source evidence and record decisions.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-black text-purple-600 dark:text-purple-400">
                      {selectedConflict.conflictId}
                    </span>
                    {statusBadge(selectedConflict.investigationStatus)}
                  </div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                    Cable: <span className="font-mono">{selectedConflict.cableMaterialNumber}</span> · {selectedConflict.cable}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Raw Material: <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{selectedConflict.rawMaterial}</span> ({selectedConflict.rawMaterialDesc || 'Standard Raw Material'})
                  </p>
                </div>
              </div>

              {message && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    message.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  <Info className="h-4 w-4 shrink-0" />
                  <span>{message.text}</span>
                </div>
              )}

              {/* Immutable Source Evidence Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                  <span className="text-slate-700 dark:text-slate-300">SOURCE EVIDENCE (IMMUTABLE EXTRACT ROWS)</span>
                  <span className="text-[10px] text-slate-400 font-bold">Worksheet: Cable Materials</span>
                </div>

                <div className="p-3 space-y-2 text-xs">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[11px] text-slate-400 border-b">
                        <th className="pb-1.5">Source Row</th>
                        <th className="pb-1.5">Cable Material</th>
                        <th className="pb-1.5">Raw Material</th>
                        <th className="pb-1.5">Consumption</th>
                        <th className="pb-1.5">UOM</th>
                        <th className="pb-1.5">Nature</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                      {Array.isArray(selectedConflict.sourceRows) && selectedConflict.sourceRows.map((rNum: number, idx: number) => {
                        const val = idx === 0 ? selectedConflict.weightA : selectedConflict.weightB;
                        return (
                          <tr key={rNum} className="py-1.5">
                            <td className="py-1 font-bold text-blue-600">Row #{rNum}</td>
                            <td className="py-1">{selectedConflict.cableMaterialNumber}</td>
                            <td className="py-1">{selectedConflict.rawMaterial}</td>
                            <td className="py-1 font-bold text-red-600">{val}</td>
                            <td className="py-1">{selectedConflict.uom}</td>
                            <td className="py-1 text-slate-400 font-sans">Source extract row</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-slate-500 pt-1">
                    * The source workbook contains no plant, route, date, or version columns. Original rows are preserved and never averaged or deleted.
                  </p>
                </div>
              </div>

              {/* Decision & Governance Form */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Governance Classification & Resolution
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Controlled Decision Category
                    </label>
                    <select
                      value={investigationCategory}
                      onChange={(e) => setInvestigationCategory(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    >
                      {CONTROLLED_BOM_DECISION_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Governed Consumption (Authoritative Value)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.001"
                        placeholder="e.g. 135.23"
                        value={governedWeight}
                        onChange={(e) => setGovernedWeight(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                      />
                      <input
                        type="text"
                        value={governedUom}
                        readOnly
                        className="w-20 px-2 py-1.5 text-xs rounded-xl border bg-slate-100 text-slate-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Conditional Dimension Evidence Inputs based on category */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Plant Specification
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Plant 1 (Helwan)"
                      value={governedPlant}
                      onChange={(e) => setGovernedPlant(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Manufacturing Route / Machine
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Extrusion Line #2"
                      value={governedRoute}
                      onChange={(e) => setGovernedRoute(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Effective From Date
                    </label>
                    <input
                      type="date"
                      value={governedEffectiveFrom}
                      onChange={(e) => setGovernedEffectiveFrom(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Justification / Evidence Comment (Mandatory)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Manufacturing specification confirmed 135.23 kg/km for single-core line..."
                    value={decisionComment}
                    onChange={(e) => setDecisionComment(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>

                {/* Workflow Buttons */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  {selectedConflict.investigationStatus === 'BUSINESS_DECISION_REQUIRED' && (
                    <>
                      <button
                        onClick={() => handleExecuteWorkflowAction('START_REVIEW')}
                        disabled={actionSubmitting}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>Start Review</span>
                      </button>
                    </>
                  )}

                  {(selectedConflict.investigationStatus === 'UNDER_REVIEW' || selectedConflict.investigationStatus === 'ASSIGNED' || selectedConflict.investigationStatus === 'DECISION_REQUIRED') && (
                    <>
                      <button
                        onClick={() => handleExecuteWorkflowAction('RESOLVE')}
                        disabled={actionSubmitting || !decisionComment}
                        className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>Resolve Conflict</span>
                      </button>
                    </>
                  )}

                  {selectedConflict.investigationStatus === 'RESOLVED' && (
                    <>
                      <button
                        onClick={() => handleExecuteWorkflowAction('APPROVE')}
                        disabled={actionSubmitting}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Approve Governed BOM Line</span>
                      </button>
                      <button
                        onClick={() => handleExecuteWorkflowAction('REJECT')}
                        disabled={actionSubmitting}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Reject Decision</span>
                      </button>
                    </>
                  )}

                  {(selectedConflict.investigationStatus === 'APPROVED' || selectedConflict.investigationStatus === 'REJECTED') && (
                    <button
                      onClick={() => handleExecuteWorkflowAction('REOPEN')}
                      disabled={actionSubmitting}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Reopen Investigation</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
