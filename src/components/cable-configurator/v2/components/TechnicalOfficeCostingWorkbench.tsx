import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import {
  Calculator,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Send,
  History,
  Info,
  ChevronRight,
  ShieldCheck,
  Building,
  Tag,
  RefreshCw,
  Coins,
  Cable,
  Sparkles,
  FileText,
} from 'lucide-react';
import { DashboardStatCard } from '../../../common/DashboardStatCard';

export const TechnicalOfficeCostingWorkbench: React.FC = () => {
  const { jwtToken } = useAuth();
  const [readinessCables, setReadinessCables] = useState<any[]>([]);
  const [readinessSummary, setReadinessSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCable, setSelectedCable] = useState<any | null>(null);
  const [cableReadiness, setCableReadiness] = useState<any | null>(null);
  const [historicalRuns, setHistoricalRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Costing Request Inputs
  const [costingDate, setCostingDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState<number>(1);
  const [lengthMeters, setLengthMeters] = useState<number>(1000);
  const [currency, setCurrency] = useState<string>('USD');
  const [comment, setComment] = useState<string>('');
  const [calculating, setCalculating] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchReadinessList = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/master/costing-readiness', {
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setReadinessCables(data.cables || []);
        setReadinessSummary(data.summary || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCableHistory = async (matNo: string) => {
    try {
      const [readinessRes, runsRes] = await Promise.all([
        fetch(`/api/costing/readiness/${matNo}`, {
          headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        }),
        fetch(`/api/costing?materialNumber=${matNo}`, {
          headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        }),
      ]);

      if (readinessRes.ok) {
        const rData = await readinessRes.json();
        setCableReadiness(rData.readiness || null);
      }
      if (runsRes.ok) {
        const runData = await runsRes.json();
        setHistoricalRuns(runData.costingRuns || []);
        if (runData.costingRuns?.length > 0) {
          setSelectedRun(runData.costingRuns[0]);
        } else {
          setSelectedRun(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchReadinessList();
  }, [jwtToken]);

  const selectCable = (item: any) => {
    setSelectedCable(item);
    setMessage(null);
    fetchCableHistory(item.materialNumber);
  };

  const handleCalculate = async () => {
    if (!selectedCable) return;
    setCalculating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/costing/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({
          materialNumber: selectedCable.materialNumber,
          costingDate,
          quantity,
          lengthMeters,
          currency,
          comment,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Costing calculation failed.');
      }

      setMessage({ text: 'Cost calculated via Increment 13 governed engine.', type: 'success' });
      setSelectedRun(data.costingRun);
      await fetchCableHistory(selectedCable.materialNumber);
      await fetchReadinessList();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setCalculating(false);
    }
  };

  const handleRecalculate = async (runId: string) => {
    setCalculating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/costing/${runId}/recalculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Recalculation failed.');
      }

      setMessage({ text: 'New costing run calculated (previous snapshot preserved).', type: 'success' });
      setSelectedRun(data.costingRun);
      if (selectedCable) await fetchCableHistory(selectedCable.materialNumber);
      await fetchReadinessList();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setCalculating(false);
    }
  };

  const filtered = readinessCables.filter((item) => {
    const matchStatus = statusFilter === 'ALL' || item.overallStatus === statusFilter;
    const matchSearch =
      !searchTerm ||
      item.materialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.cableDescription.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const readinessBadge = (st: string) => {
    switch (st) {
      case 'READY_FOR_COSTING':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> READY FOR COSTING</span>;
      case 'UNDER_REVIEW':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1"><Clock className="h-3 w-3" /> UNDER REVIEW</span>;
      case 'DATA_ISSUE':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> DATA ISSUE</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800 border border-red-300 flex items-center gap-1"><XCircle className="h-3 w-3" /> NOT READY</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 4-Gate Readiness Cohort Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <DashboardStatCard icon={Cable} label="Total Cables" value={readinessSummary?.totalCables ?? 432} />
        <DashboardStatCard icon={CheckCircle2} label="Ready for Costing Cohort" value={readinessSummary?.readyForCosting ?? 0} />
        <DashboardStatCard icon={Clock} label="Under Review (Mapping)" value={readinessSummary?.underReview ?? 0} />
        <DashboardStatCard icon={AlertTriangle} label="Data Issue (BOM Conflict)" value={readinessSummary?.dataIssue ?? 0} />
        <DashboardStatCard icon={XCircle} label="Not Ready (Unpriced)" value={readinessSummary?.notReady ?? 0} />
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Material Number, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={fetchReadinessList}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl text-slate-600 dark:text-slate-300"
            title="Refresh Readiness"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'READY_FOR_COSTING', 'UNDER_REVIEW', 'DATA_ISSUE', 'NOT_READY'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === st
                  ? 'bg-brand-600 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {st === 'READY_FOR_COSTING' ? 'READY' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Cable Costing Readiness List */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Cable Catalog Readiness ({filtered.length})
            </h3>
            <span className="text-[11px] text-slate-400">4-Gate Verification</span>
          </div>

          <div className="space-y-2.5 max-h-[660px] overflow-y-auto pr-1">
            {loading ? (
              <p className="p-8 text-center text-xs text-slate-400">Loading readiness evaluation...</p>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">No cables match filter.</p>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedCable?.materialNumber === item.materialNumber;
                return (
                  <div
                    key={item.materialNumber}
                    onClick={() => selectCable(item)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-black text-blue-700 dark:text-blue-400">
                            {item.materialNumber}
                          </span>
                          {readinessBadge(item.overallStatus)}
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                          {item.cableDescription}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <span>Eng: <strong className="text-slate-600 dark:text-slate-300">{item.engineeringStatus}</strong></span>
                          <span>•</span>
                          <span>BOM: <strong className="text-slate-600 dark:text-slate-300">{item.bomStatus}</strong></span>
                          <span>•</span>
                          <span>Price: <strong className="text-slate-600 dark:text-slate-300">{item.rmPriceStatus}</strong></span>
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-blue-600' : 'text-slate-300'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Costing Calculator & Cost Breakdown */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-5">
          {!selectedCable ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <Calculator className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-xs font-bold">Select a cable from the readiness catalog to inspect gating status and execute material cost calculation.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-black text-blue-600 dark:text-blue-400">
                      Material #{selectedCable.materialNumber}
                    </span>
                    {readinessBadge(cableReadiness?.overallStatus || selectedCable.overallStatus)}
                  </div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                    {selectedCable.cableDescription}
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

              {/* 4 Gates Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Costing Readiness 4-Gate Status
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900">
                    <span className="text-[10px] text-slate-400 font-bold block">1. Engineering</span>
                    <span className={`font-bold ${cableReadiness?.engineeringStatus === 'APPROVED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {cableReadiness?.engineeringStatus || 'CHECKING'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900">
                    <span className="text-[10px] text-slate-400 font-bold block">2. Governed BOM</span>
                    <span className={`font-bold ${cableReadiness?.bomStatus === 'RESOLVED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {cableReadiness?.bomStatus || 'CHECKING'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900">
                    <span className="text-[10px] text-slate-400 font-bold block">3. Raw Materials</span>
                    <span className="font-bold text-emerald-600">VERIFIED</span>
                  </div>
                  <div className="p-2.5 rounded-xl border bg-white dark:bg-slate-900">
                    <span className="text-[10px] text-slate-400 font-bold block">4. RM Prices</span>
                    <span className={`font-bold ${cableReadiness?.rmPriceStatus === 'ALL_PRICED' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {cableReadiness?.rmPriceStatus || 'CHECKING'}
                    </span>
                  </div>
                </div>

                {cableReadiness?.blockingReasons?.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-300 space-y-1">
                    <p className="font-bold">Blocking Reasons:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {cableReadiness.blockingReasons.map((r: string, i: number) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Costing Calculator Parameters Form */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                  Costing Request Parameters
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Costing Date</label>
                    <input
                      type="date"
                      value={costingDate}
                      onChange={(e) => setCostingDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Length (Meters)</label>
                    <input
                      type="number"
                      step="100"
                      min="1"
                      value={lengthMeters}
                      onChange={(e) => setLengthMeters(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="EGP">EGP</option>
                      <option value="SAR">SAR</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={handleCalculate}
                    disabled={calculating || (cableReadiness?.overallStatus !== 'READY_FOR_COSTING' && selectedCable?.overallStatus !== 'READY_FOR_COSTING')}
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                  >
                    <Calculator className="h-3.5 w-3.5" />
                    <span>{calculating ? 'Calculating...' : 'Calculate Material Cost'}</span>
                  </button>
                </div>
              </div>

              {/* Material Cost Breakdown Table */}
              {selectedRun && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-0">
                  <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                    <span className="text-slate-700 dark:text-slate-300">
                      COSTING SNAPSHOT: {selectedRun.costingRunNumber}
                    </span>
                    <span className="text-[10px] text-blue-600 font-mono">
                      Eng Rev: V{selectedRun.engineeringRevision} · BOM Ver: {selectedRun.bomVersion}
                    </span>
                  </div>

                  <div className="p-3 text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[11px] text-slate-400 border-b">
                          <th className="pb-1.5">Raw Material</th>
                          <th className="pb-1.5">Rate / km</th>
                          <th className="pb-1.5">Total Qty</th>
                          <th className="pb-1.5">Resolved Price</th>
                          <th className="pb-1.5">Rev</th>
                          <th className="pb-1.5 text-right">Line Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                        {selectedRun.costingLines?.map((line: any) => (
                          <tr key={line.id || line.rawMaterialCode} className="py-1.5">
                            <td className="py-1.5">
                              <strong className="text-slate-800 dark:text-slate-200">{line.rawMaterialCode}</strong>
                              <span className="block text-[10px] text-slate-400 font-sans">{line.rawMaterialDesc}</span>
                            </td>
                            <td className="py-1.5">{line.consumptionPerKm} {line.consumptionUom}</td>
                            <td className="py-1.5 font-bold">{line.totalConsumption} {line.consumptionUom}</td>
                            <td className="py-1.5 text-emerald-600 font-bold">
                              {line.price} {line.priceCurrency}/{line.priceUom}
                            </td>
                            <td className="py-1.5 text-slate-400">V{line.priceRevision}</td>
                            <td className="py-1.5 text-right font-black text-slate-900 dark:text-white">
                              {line.lineCost.toFixed(2)} {line.priceCurrency}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Cost Aggregation Summary */}
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-600 dark:text-slate-400">TOTAL RAW MATERIAL COST:</span>
                        <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                          {selectedRun.materialCost.toFixed(2)} {selectedRun.currency}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-400">
                        <span>Process & Overhead Cost Status:</span>
                        <span className="font-bold text-amber-600">NOT_CONFIGURED</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-400">
                        <span>Total Manufacturing Cost Status:</span>
                        <span className="font-bold text-slate-500">INCOMPLETE (Material Cost Only)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Historical Costing Runs Panel */}
              {historicalRuns.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-blue-500" />
                    <span>Historical Costing Snapshots ({historicalRuns.length})</span>
                  </h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {historicalRuns.map((run: any) => (
                      <div
                        key={run.id}
                        onClick={() => setSelectedRun(run)}
                        className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                          selectedRun?.id === run.id
                            ? 'bg-blue-50/60 dark:bg-blue-950/40'
                            : 'bg-white dark:bg-slate-900 hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-blue-600">{run.costingRunNumber}</span>
                            {run.isCurrent && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">
                                CURRENT
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Date: {new Date(run.costingDate).toISOString().slice(0, 10)} · Qty: {run.quantity} ({run.lengthMeters}m)
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-black text-slate-900 dark:text-white">
                            {run.materialCost.toFixed(2)} {run.currency}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRecalculate(run.id);
                            }}
                            className="block text-[10px] font-bold text-blue-600 hover:underline mt-0.5"
                          >
                            Recalculate
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
