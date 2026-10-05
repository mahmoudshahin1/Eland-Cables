import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../../context/AuthContext';
import {
  DollarSign,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Send,
  Edit3,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  Eye,
  Layers,
  History,
  Info,
  Download,
  Upload,
  Coins,
  Calendar,
  Building,
  Tag,
  CheckSquare,
  Square,
} from 'lucide-react';
import { DashboardStatCard } from '../../../common/DashboardStatCard';

export const TechnicalOfficePriceGovernanceQueue: React.FC = () => {
  const { jwtToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [readinessItems, setReadinessItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedRm, setSelectedRm] = useState<any | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // New Price Proposal State
  const [showNewPriceModal, setShowNewPriceModal] = useState<boolean>(false);
  const [newPriceForm, setNewPriceForm] = useState({
    price: '',
    currency: 'USD',
    uom: 'kg',
    priceBasis: 'PER_KG',
    effectiveFrom: '',
    effectiveTo: '',
    supplier: '',
    source: '',
    comment: '',
  });

  // Excel Import State
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionComment, setActionComment] = useState<string>('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchReadiness = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/master/raw-material-price-readiness', {
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setReadinessItems(data.items || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (rmCode: string) => {
    setLoadingHistory(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/master/raw-material-prices/${rmCode}`, {
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPriceHistory(data.prices || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchReadiness();
  }, [jwtToken]);

  const selectRmItem = (item: any) => {
    setSelectedRm(item);
    fetchHistory(item.code);
    setNewPriceForm({
      price: '',
      currency: item.currency || 'USD',
      uom: item.uom || 'kg',
      priceBasis: item.priceBasis || 'PER_KG',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      supplier: item.supplier || '',
      source: 'Procurement Proposal',
      comment: '',
    });
  };

  const handleExportExcel = async () => {
    const query = new URLSearchParams();
    if (statusFilter !== 'ALL') query.set('workflowStatus', statusFilter);
    try {
      const res = await fetch(`/api/master/raw-material-prices-export?${query.toString()}`, {
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(String(data.error || `Export failed (${res.status})`));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Raw_Material_Prices_Template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleFileSelect = (file: File) => {
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!(data instanceof ArrayBuffer)) return;
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];

        const res = await fetch('/api/master/raw-material-prices/import/preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
          },
          body: JSON.stringify({ rows, sourceFile: file.name }),
        });
        const result = await res.json();
        setImportPreview(result.preview);
        setShowImportModal(true);
      } catch (err: any) {
        setMessage({ text: `Failed to parse Excel: ${err.message}`, type: 'error' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCommitImport = async () => {
    if (!importPreview || !importPreview.canSubmit) return;
    setSubmitting(true);
    try {
      const rows = importPreview.rows.map((r: any) => r.parsedInput);
      const res = await fetch('/api/master/raw-material-prices/import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({ rows, sourceFile: importFileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import commit failed');
      setMessage({ text: `Successfully imported ${data.importedCount} price proposals as DRAFT.`, type: 'success' });
      setShowImportModal(false);
      setImportPreview(null);
      await fetchReadiness();
      if (selectedRm) await fetchHistory(selectedRm.code);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDraftPrice = async () => {
    if (!selectedRm) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/master/raw-material-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({
          rawMaterialCode: selectedRm.code,
          price: newPriceForm.price ? Number(newPriceForm.price) : null,
          currency: newPriceForm.currency,
          uom: newPriceForm.uom,
          priceBasis: newPriceForm.priceBasis,
          effectiveFrom: newPriceForm.effectiveFrom || null,
          effectiveTo: newPriceForm.effectiveTo || null,
          supplier: newPriceForm.supplier || null,
          source: newPriceForm.source || 'Procurement proposal',
          comment: newPriceForm.comment || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create price draft');
      setMessage({ text: 'Price proposal created in DRAFT status.', type: 'success' });
      setShowNewPriceModal(false);
      await fetchReadiness();
      await fetchHistory(selectedRm.code);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkflowAction = async (priceId: string, action: 'SUBMIT' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'EXPIRE' | 'CANCEL') => {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/master/raw-material-prices/${priceId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
        body: JSON.stringify({
          action,
          comment: actionComment || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to execute ${action}`);
      setMessage({ text: `Price proposal ${action} executed successfully.`, type: 'success' });
      setActionComment('');
      await fetchReadiness();
      if (selectedRm) await fetchHistory(selectedRm.code);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = readinessItems.filter((item) => {
    const matchStatus = statusFilter === 'ALL' || item.readinessState === statusFilter || item.workflowStatus === statusFilter;
    const matchSearch =
      !searchTerm ||
      item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.supplier?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const statusBadge = (st: string) => {
    switch (st) {
      case 'APPROVED':
      case 'READY':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> APPROVED</span>;
      case 'UNDER_REVIEW':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1"><Clock className="h-3 w-3" /> UNDER REVIEW</span>;
      case 'SUBMITTED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1"><Send className="h-3 w-3" /> SUBMITTED</span>;
      case 'EXPIRED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-800 border border-slate-300 flex items-center gap-1"><History className="h-3 w-3" /> EXPIRED</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800 border border-red-300 flex items-center gap-1"><XCircle className="h-3 w-3" /> REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> UNPRICED</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Dashboard Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <DashboardStatCard icon={Layers} label="Total Raw Materials" value={summary?.totalRawMaterials ?? 74} />
        <DashboardStatCard icon={CheckCircle2} label="Priced & Ready" value={summary?.priced ?? 0} />
        <DashboardStatCard icon={AlertTriangle} label="PRICE_NOT_CONFIGURED" value={summary?.unpriced ?? 74} />
        <DashboardStatCard icon={History} label="Expired Prices" value={summary?.expired ?? 0} />
        <DashboardStatCard icon={ShieldCheck} label="Costing Engine" value="Gated / Blocked" />
        <DashboardStatCard icon={XCircle} label="Zero Price Rule" value="Strictly Blocked" />
      </div>

      {/* Toolbar: Search, Filters & Import/Export */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search RM code, description, supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={fetchReadiness}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl text-slate-600 dark:text-slate-300"
            title="Refresh Prices"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'UNPRICED', 'APPROVED', 'UNDER_REVIEW', 'EXPIRED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                statusFilter === st
                  ? 'bg-brand-600 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow ml-2"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import Price Excel</span>
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Template</span>
          </button>
        </div>
      </div>

      {/* Main Split View: Raw Materials (Left) & Price History / Proposal (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Raw Material Master List */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
              Raw Materials ({filtered.length})
            </h3>
            <span className="text-[11px] text-slate-400">74 Official Codes</span>
          </div>

          <div className="space-y-2.5 max-h-[660px] overflow-y-auto pr-1">
            {loading ? (
              <p className="p-8 text-center text-xs text-slate-400">Loading raw materials...</p>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">No raw materials match filter.</p>
            ) : (
              filtered.map((r) => {
                const isSelected = selectedRm?.code === r.code;
                return (
                  <div
                    key={r.code}
                    onClick={() => selectRmItem(r)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/30 shadow-md ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-black text-emerald-700 dark:text-emerald-400">
                            {r.code}
                          </span>
                          {statusBadge(r.readinessState)}
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                          {r.description}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span>UOM: <strong className="text-slate-700 dark:text-slate-300 font-mono">{r.uom}</strong></span>
                          <span>•</span>
                          <span>
                            Price:{' '}
                            {r.configuredPrice != null ? (
                              <strong className="text-emerald-600 font-mono">
                                {r.configuredPrice} {r.currency}/{r.uom}
                              </strong>
                            ) : (
                              <span className="text-amber-700 italic">PRICE_NOT_CONFIGURED</span>
                            )}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-emerald-600' : 'text-slate-300'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Price History & Governance Action Panel */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-5">
          {!selectedRm ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <Coins className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-xs font-bold">Select a Raw Material to inspect historical price records or submit a governed price proposal.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-black text-emerald-600 dark:text-emerald-400">
                      {selectedRm.code}
                    </span>
                    {statusBadge(selectedRm.readinessState)}
                  </div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                    {selectedRm.description}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Category: {selectedRm.materialType} · Master UOM: <span className="font-mono">{selectedRm.uom}</span>
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => setShowNewPriceModal(true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow flex items-center gap-1.5"
                  >
                    <Coins className="h-3.5 w-3.5" />
                    <span>Propose New Price</span>
                  </button>
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

              {/* Price History Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                  <span className="text-slate-700 dark:text-slate-300">PRICE REVISION & TEMPORAL HISTORY</span>
                  <span className="text-[10px] text-slate-400 font-bold">{priceHistory.length} Record(s)</span>
                </div>

                <div className="p-3 text-xs">
                  {loadingHistory ? (
                    <p className="text-center py-6 text-slate-400">Loading price records...</p>
                  ) : priceHistory.length === 0 ? (
                    <div className="text-center py-8 space-y-1">
                      <p className="font-bold text-amber-700">No prices configured for this Raw Material.</p>
                      <p className="text-[11px] text-slate-400">Price is PRICE_NOT_CONFIGURED. Blank prices are never stored as zero.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {priceHistory.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-emerald-600 font-mono">
                                {p.price} {p.currency} / {p.uom}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold">
                                Rev V{p.revision}
                              </span>
                              {statusBadge(p.workflowStatus)}
                            </div>
                            <p className="text-[11px] text-slate-500">
                              Effective:{' '}
                              <strong className="text-slate-700 dark:text-slate-300">
                                {p.effectiveFrom ? new Date(p.effectiveFrom).toISOString().slice(0, 10) : 'Open-Ended'}
                              </strong>{' '}
                              to{' '}
                              <strong className="text-slate-700 dark:text-slate-300">
                                {p.effectiveTo ? new Date(p.effectiveTo).toISOString().slice(0, 10) : 'Present'}
                              </strong>{' '}
                              · Basis: <span className="font-mono">{p.priceBasis}</span>
                            </p>
                            {p.supplier && <p className="text-[11px] text-slate-400">Supplier: {p.supplier}</p>}
                            {p.comment && <p className="text-[11px] text-slate-400 italic">"{p.comment}"</p>}
                          </div>

                          {/* Workflow Actions for this record */}
                          <div className="flex flex-wrap gap-1.5 self-start md:self-auto">
                            {p.workflowStatus === 'DRAFT' && (
                              <button
                                onClick={() => handleWorkflowAction(p.id, 'SUBMIT')}
                                disabled={submitting}
                                className="px-3 py-1 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold flex items-center gap-1 shadow"
                              >
                                <Send className="h-3 w-3" />
                                <span>Submit</span>
                              </button>
                            )}
                            {(p.workflowStatus === 'SUBMITTED' || p.workflowStatus === 'UNDER_REVIEW') && (
                              <>
                                <button
                                  onClick={() => handleWorkflowAction(p.id, 'APPROVE')}
                                  disabled={submitting}
                                  className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 shadow"
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  onClick={() => handleWorkflowAction(p.id, 'REJECT')}
                                  disabled={submitting}
                                  className="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold flex items-center gap-1 shadow"
                                >
                                  <XCircle className="h-3 w-3" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New Price Proposal Modal */}
      {showNewPriceModal && selectedRm && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-600" />
                <span>Propose Price for {selectedRm.code}</span>
              </h3>
              <button
                onClick={() => setShowNewPriceModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Price Amount (Required &gt; 0)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="e.g. 13500.00"
                    value={newPriceForm.price}
                    onChange={(e) => setNewPriceForm({ ...newPriceForm, price: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Currency
                  </label>
                  <select
                    value={newPriceForm.currency}
                    onChange={(e) => setNewPriceForm({ ...newPriceForm, currency: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="EGP">EGP - Egyptian Pound</option>
                    <option value="SAR">SAR - Saudi Riyal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Price UOM
                  </label>
                  <input
                    type="text"
                    value={newPriceForm.uom}
                    onChange={(e) => setNewPriceForm({ ...newPriceForm, uom: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Price Basis
                  </label>
                  <select
                    value={newPriceForm.priceBasis}
                    onChange={(e) => setNewPriceForm({ ...newPriceForm, priceBasis: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold"
                  >
                    <option value="PER_KG">PER_KG (per kilogram)</option>
                    <option value="PER_TON">PER_TON (per metric ton)</option>
                    <option value="PER_METER">PER_METER (per linear meter)</option>
                    <option value="PER_PCS">PER_PCS (per piece)</option>
                    <option value="PER_M2">PER_M2 (per square meter)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Effective From Date
                  </label>
                  <input
                    type="date"
                    value={newPriceForm.effectiveFrom}
                    onChange={(e) => setNewPriceForm({ ...newPriceForm, effectiveFrom: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Effective To Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={newPriceForm.effectiveTo}
                    onChange={(e) => setNewPriceForm({ ...newPriceForm, effectiveTo: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Supplier / Vendor Source
                </label>
                <input
                  type="text"
                  placeholder="e.g. Elsewedy Copper Smelter / LME Cash Official"
                  value={newPriceForm.supplier}
                  onChange={(e) => setNewPriceForm({ ...newPriceForm, supplier: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  Comment / Justification Note
                </label>
                <input
                  type="text"
                  placeholder="e.g. Procurement Q3 contracted price index..."
                  value={newPriceForm.comment}
                  onChange={(e) => setNewPriceForm({ ...newPriceForm, comment: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowNewPriceModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDraftPrice}
                disabled={submitting || !newPriceForm.price}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow"
              >
                {submitting ? 'Creating...' : 'Create Price Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Preview Modal */}
      {showImportModal && importPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-600" />
                <span>Price Import Preview: {importFileName}</span>
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] uppercase font-bold text-slate-400">Total Rows</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{importPreview.totalRows}</p>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">Valid</p>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{importPreview.validCount}</p>
              </div>
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                <p className="text-[10px] uppercase font-bold text-red-700 dark:text-red-400">Invalid / Overlapping</p>
                <p className="text-xl font-black text-red-700 dark:text-red-400">{importPreview.invalidCount}</p>
              </div>
            </div>

            {importPreview.invalidCount > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                <p className="font-bold">Errors found in uploaded Excel. Import is blocked until errors are resolved.</p>
                <div className="max-h-36 overflow-y-auto mt-2 divide-y">
                  {importPreview.rows
                    .filter((r: any) => !r.valid)
                    .map((r: any) => (
                      <div key={r.rowNumber} className="py-1">
                        <span className="font-mono font-bold text-emerald-700">Row {r.rowNumber} ({r.rawMaterialCode}): </span>
                        <span>{r.errors.map((e: any) => e.message).join(' · ')}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Note: Uploading prices creates records in <strong>DRAFT</strong> status. Excel import <strong>NEVER</strong> creates directly APPROVED prices.
            </p>

            <div className="flex gap-2 justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCommitImport}
                disabled={submitting || !importPreview.canSubmit}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow"
              >
                {submitting ? 'Importing...' : 'Commit as Drafts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
