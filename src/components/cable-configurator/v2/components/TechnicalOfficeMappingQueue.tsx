import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../../../context/AuthContext';
import {
  FileText,
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
  CheckSquare,
  Square,
  FileSpreadsheet,
  Filter,
} from 'lucide-react';

function mappingAccessToken(jwtToken: string | null): string | null {
  if (jwtToken) return jwtToken;
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem('jwt_access_token');
}

function mappingAuthHeaders(token: string | null, json = false): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function downloadAuthenticatedFile(token: string | null, path: string, fallbackName: string) {
  const res = await fetch(path, { headers: mappingAuthHeaders(token) });
  if (!res.ok) {
    const text = await res.text();
    let message = `Download failed (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep status message */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const named = /filename="?([^"]+)"?/i.exec(disposition);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = named?.[1] || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const TechnicalOfficeMappingQueue: React.FC = () => {
  const { jwtToken } = useAuth();
  const token = mappingAccessToken(jwtToken);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMapping, setSelectedMapping] = useState<any | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Multi-select bulk state
  const [selectedMaterialNumbers, setSelectedMaterialNumbers] = useState<string[]>([]);
  const [showBulkActionModal, setShowBulkActionModal] = useState<boolean>(false);
  const [bulkAction, setBulkAction] = useState<'SUBMIT' | 'ASSIGN' | 'APPROVE' | 'REJECT' | 'VALIDATE'>('VALIDATE');
  const [bulkValidationReport, setBulkValidationReport] = useState<any | null>(null);
  const [bulkReviewer, setBulkReviewer] = useState<string>('');
  const [bulkComment, setBulkComment] = useState<string>('');
  const [bulkSubmitting, setBulkSubmitting] = useState<boolean>(false);

  // Excel Import State
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [importSubmitting, setImportSubmitting] = useState<boolean>(false);

  // Edit / Workflow State
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<any>({});
  const [actionComment, setActionComment] = useState<string>('');
  const [assignedReviewer, setAssignedReviewer] = useState<string>('');
  const [actionSubmitting, setActionSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/master/engineering-mappings', {
        headers: mappingAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setMappings(data.mappings || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (matNo: string) => {
    setLoadingDetail(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/master/engineering-mappings/${matNo}`, {
        headers: mappingAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
        setSelectedMapping(data.current);
        setEditForm({
          family: data.current.family || '',
          voltage: data.current.voltage || '',
          conductor: data.current.conductor || '',
          conductorSize: data.current.size || '',
          cores: data.current.cores || '',
          insulation: data.current.insulation || '',
          screen: data.current.screen || '',
          armour: data.current.armour || '',
          sheath: data.current.sheath || '',
          sheathColour: data.current.sheathColour || '',
          coreColour: data.current.coreColour || '',
          standard: data.current.standard || '',
          specialAdditives: data.current.specialAdditives || '',
          comments: data.current.comments || '',
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, [token]);

  const filtered = mappings.filter((m) => {
    const matchStatus = statusFilter === 'ALL' || m.workflowStatus === statusFilter;
    const matchSearch =
      !searchTerm ||
      m.materialNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.customerCode?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const toggleSelectAll = () => {
    if (selectedMaterialNumbers.length === filtered.length) {
      setSelectedMaterialNumbers([]);
    } else {
      setSelectedMaterialNumbers(filtered.map((m) => m.materialNumber));
    }
  };

  const toggleSelect = (mat: string) => {
    if (selectedMaterialNumbers.includes(mat)) {
      setSelectedMaterialNumbers(selectedMaterialNumbers.filter((m) => m !== mat));
    } else {
      setSelectedMaterialNumbers([...selectedMaterialNumbers, mat]);
    }
  };

  const handleExportExcel = async () => {
    const query = new URLSearchParams();
    if (statusFilter !== 'ALL') query.set('workflowStatus', statusFilter);
    if (searchTerm) query.set('q', searchTerm);
    try {
      await downloadAuthenticatedFile(
        token,
        `/api/master/engineering-mappings-export?${query.toString()}`,
        'Engineering_Mapping_Export.xlsx'
      );
    } catch (err: any) {
      setMessage({ text: err.message || 'Export failed', type: 'error' });
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

        const res = await fetch('/api/master/engineering-mappings/import/preview', {
          method: 'POST',
          headers: mappingAuthHeaders(token, true),
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
    setImportSubmitting(true);
    try {
      const rows = importPreview.rows.map((r: any) => ({
        'Material Number': r.materialNumber,
        ...r.parsedInput,
      }));
      const res = await fetch('/api/master/engineering-mappings/import/commit', {
        method: 'POST',
        headers: mappingAuthHeaders(token, true),
        body: JSON.stringify({ rows, sourceFile: importFileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import commit failed');
      setMessage({ text: `Successfully imported ${data.importedCount} engineering mappings as Drafts.`, type: 'success' });
      setShowImportModal(false);
      setImportPreview(null);
      await fetchMappings();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setImportSubmitting(false);
    }
  };

  const handleRunBulkValidation = async () => {
    if (!selectedMaterialNumbers.length) return;
    setBulkSubmitting(true);
    try {
      const res = await fetch('/api/master/engineering-mappings/bulk/validate', {
        method: 'POST',
        headers: mappingAuthHeaders(token, true),
        body: JSON.stringify({ materialNumbers: selectedMaterialNumbers }),
      });
      const data = await res.json();
      setBulkValidationReport(data);
      setShowBulkActionModal(true);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleExecuteBulkAction = async () => {
    if (!selectedMaterialNumbers.length) return;
    setBulkSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/master/engineering-mappings/bulk/actions', {
        method: 'POST',
        headers: mappingAuthHeaders(token, true),
        body: JSON.stringify({
          materialNumbers: selectedMaterialNumbers,
          action: bulkAction,
          assignedReviewer: bulkAction === 'ASSIGN' ? bulkReviewer : undefined,
          comments: bulkComment || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk operation failed');
      setMessage({ text: `Bulk ${bulkAction} processed successfully for ${data.processedCount} mappings.`, type: 'success' });
      setShowBulkActionModal(false);
      setBulkValidationReport(null);
      setSelectedMaterialNumbers([]);
      await fetchMappings();
      if (selectedMapping) await fetchDetail(selectedMapping.materialNumber);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedMapping) return;
    setActionSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/master/engineering-mappings/${selectedMapping.materialNumber}`, {
        method: 'PUT',
        headers: mappingAuthHeaders(token, true),
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save mapping');
      setMessage({ text: 'Mapping updated successfully as DRAFT.', type: 'success' });
      setIsEditing(false);
      await fetchDetail(selectedMapping.materialNumber);
      await fetchMappings();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleWorkflowAction = async (action: 'SUBMIT' | 'ASSIGN' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'CANCEL') => {
    if (!selectedMapping) return;
    setActionSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/master/engineering-mappings/${selectedMapping.materialNumber}/actions`, {
        method: 'POST',
        headers: mappingAuthHeaders(token, true),
        body: JSON.stringify({
          action,
          assignedReviewer: action === 'ASSIGN' ? assignedReviewer : undefined,
          comments: actionComment || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to execute ${action}`);
      setMessage({ text: `Action ${action} completed successfully. Status: ${data.mapping?.workflowStatus}`, type: 'success' });
      setActionComment('');
      await fetchDetail(selectedMapping.materialNumber);
      await fetchMappings();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionSubmitting(false);
    }
  };

  const statusBadge = (st: string) => {
    switch (st) {
      case 'APPROVED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> APPROVED</span>;
      case 'UNDER_REVIEW':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300 flex items-center gap-1"><Clock className="h-3 w-3" /> UNDER REVIEW</span>;
      case 'SUBMITTED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-1"><Send className="h-3 w-3" /> SUBMITTED</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800 border border-red-300 flex items-center gap-1"><XCircle className="h-3 w-3" /> REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-800 border border-slate-300 flex items-center gap-1"><Edit3 className="h-3 w-3" /> DRAFT</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Workbench Action Header: Import / Export / Search / Multi-Select Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-80">
              <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Material Number, description, customer code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={fetchMappings}
              className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl text-slate-600 dark:text-slate-300"
              title="Refresh Workbench"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {/* Workbench Toolset: Export Template / Upload Mappings */}
          <div className="flex flex-wrap items-center gap-2">
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
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Import Mapping Excel</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Template</span>
            </button>
          </div>
        </div>

        {/* Filters & Multi-Selection Action Strip */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
            {['ALL', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].map((st) => (
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
          </div>

          {/* Bulk Action Controls */}
          {selectedMaterialNumbers.length > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-2xl">
              <span className="text-xs font-black text-blue-800 dark:text-blue-300">
                {selectedMaterialNumbers.length} selected
              </span>
              <button
                onClick={handleRunBulkValidation}
                className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow"
              >
                Validate & Batch Actions
              </button>
              <button
                onClick={() => setSelectedMaterialNumbers([])}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800 px-1"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Split Grid: Queue on Left, Side-by-Side Review on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Queue List with Selection Checkboxes */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <button onClick={toggleSelectAll} className="text-slate-500 hover:text-blue-600">
                {selectedMaterialNumbers.length === filtered.length && filtered.length > 0 ? (
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Mapping Queue ({filtered.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Current revisions</span>
          </div>

          <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
            {loading ? (
              <p className="p-8 text-center text-xs text-slate-400">Loading mappings...</p>
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-400">No cable mappings matching filter.</p>
            ) : (
              filtered.map((m) => {
                const isSelected = selectedMapping?.materialNumber === m.materialNumber;
                const isChecked = selectedMaterialNumbers.includes(m.materialNumber);
                return (
                  <div
                    key={m.materialNumber}
                    className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(m.materialNumber);
                      }}
                      className="mt-0.5 text-slate-400 hover:text-blue-600"
                    >
                      {isChecked ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                    </button>
                    <div
                      onClick={() => fetchDetail(m.materialNumber)}
                      className="flex-1 cursor-pointer flex items-start justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-black text-blue-700 dark:text-blue-400">
                            {m.materialNumber}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600">
                            V{m.revision}
                          </span>
                          {statusBadge(m.workflowStatus)}
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 mt-1">
                          {m.description}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Cust: <span className="font-bold text-slate-600 dark:text-slate-300">{m.customerCode || 'N/A'}</span> · Item: <span className="font-mono">{m.itemCode || 'N/A'}</span>
                        </p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? 'rotate-90 text-blue-600' : 'text-slate-300'}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Side-by-Side Review & Action Panel */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-5">
          {!selectedMapping ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <FileText className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-xs font-bold">Select a cable from the queue to view source vs governed data.</p>
            </div>
          ) : loadingDetail ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading details...</div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-black text-blue-600 dark:text-blue-400">
                      Material #{selectedMapping.materialNumber}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600">
                      Revision V{selectedMapping.revision}
                    </span>
                    {statusBadge(selectedMapping.workflowStatus)}
                  </div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                    {selectedMapping.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {!isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>{selectedMapping.workflowStatus === 'APPROVED' ? 'Revise Mapping' : 'Edit Mapping'}</span>
                    </button>
                  )}
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

              {/* Strict Side-by-Side Table: Source Data vs Approved / Candidate Mapping */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 dark:bg-slate-800/80 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                  <span className="text-slate-700 dark:text-slate-300">ATTRIBUTE COMPARISON</span>
                  <div className="flex gap-6 text-[11px] font-bold">
                    <span className="text-slate-500">ORIGINAL SOURCE (IMMUTABLE)</span>
                    <span className="text-blue-600 dark:text-blue-400">
                      {isEditing ? 'EDITING VALUES' : 'GOVERNED MAPPING (V' + selectedMapping.revision + ')'}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {/* Family */}
                  <RowComp
                    label="Cable Family"
                    source="NULL (Spec Code: "
                    sourceSuffix={(detailData?.cable?.customerCode || 'N/A') + ' - NOT Family)'}
                    approved={selectedMapping.family}
                    suggested={detailData?.current?.suggested?.family?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.family}
                        placeholder="e.g. LV, MV, HV..."
                        onChange={(e) => setEditForm({ ...editForm, family: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Voltage */}
                  <RowComp
                    label="Voltage"
                    source="NULL (Not in Cable List)"
                    approved={selectedMapping.voltage}
                    suggested={detailData?.current?.suggested?.voltage?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.voltage}
                        placeholder="e.g. 600/1000V, 12/20kV..."
                        onChange={(e) => setEditForm({ ...editForm, voltage: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Conductor Material */}
                  <RowComp
                    label="Conductor"
                    source="NULL"
                    approved={selectedMapping.conductor}
                    suggested={detailData?.current?.suggested?.conductor?.value}
                    isEditing={isEditing}
                    editComponent={
                      <select
                        value={editForm.conductor}
                        onChange={(e) => setEditForm({ ...editForm, conductor: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      >
                        <option value="">-- Select --</option>
                        <option value="Copper">Copper (CU)</option>
                        <option value="Aluminum">Aluminum (AL)</option>
                      </select>
                    }
                  />

                  {/* Conductor Size */}
                  <RowComp
                    label="Conductor Size (mm²)"
                    source="NULL"
                    approved={selectedMapping.size}
                    suggested={detailData?.current?.suggested?.conductorSize?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.conductorSize}
                        placeholder="e.g. 16, 25, 50..."
                        onChange={(e) => setEditForm({ ...editForm, conductorSize: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Number of Cores */}
                  <RowComp
                    label="Number of Cores"
                    source="NULL"
                    approved={selectedMapping.cores}
                    suggested={detailData?.current?.suggested?.cores?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.cores}
                        placeholder="e.g. 1, 3, 4..."
                        onChange={(e) => setEditForm({ ...editForm, cores: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Insulation */}
                  <RowComp
                    label="Insulation Material"
                    source="NULL"
                    approved={selectedMapping.insulation}
                    suggested={detailData?.current?.suggested?.insulation?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.insulation}
                        placeholder="e.g. XLPE, PVC, EPR..."
                        onChange={(e) => setEditForm({ ...editForm, insulation: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Screen */}
                  <RowComp
                    label="Screen Type"
                    source="NULL"
                    approved={selectedMapping.screen}
                    suggested={detailData?.current?.suggested?.screen?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.screen}
                        placeholder="e.g. NONE, CTS, CWS..."
                        onChange={(e) => setEditForm({ ...editForm, screen: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Armour */}
                  <RowComp
                    label="Armour Type"
                    source="NULL"
                    approved={selectedMapping.armour}
                    suggested={detailData?.current?.suggested?.armour?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.armour}
                        placeholder="e.g. NONE, SWA, STA, AWA..."
                        onChange={(e) => setEditForm({ ...editForm, armour: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Sheath */}
                  <RowComp
                    label="Sheath Material"
                    source="NULL"
                    approved={selectedMapping.sheath}
                    suggested={detailData?.current?.suggested?.sheath?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.sheath}
                        placeholder="e.g. PVC, LSHF, MDPE, PE..."
                        onChange={(e) => setEditForm({ ...editForm, sheath: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Sheath & Core Colour */}
                  <RowComp
                    label="Sheath Colour"
                    source="NULL"
                    approved={selectedMapping.sheathColour}
                    suggested={detailData?.current?.suggested?.sheathColour?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.sheathColour}
                        placeholder="e.g. BLK, RED..."
                        onChange={(e) => setEditForm({ ...editForm, sheathColour: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Standard */}
                  <RowComp
                    label="Cable Standard"
                    source="NULL"
                    approved={selectedMapping.standard}
                    suggested={detailData?.current?.suggested?.standard?.value}
                    isEditing={isEditing}
                    editComponent={
                      <input
                        type="text"
                        value={editForm.standard}
                        placeholder="e.g. IEC 60502-1..."
                        onChange={(e) => setEditForm({ ...editForm, standard: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-950 font-bold"
                      />
                    }
                  />

                  {/* Diameter (Authoritative Source) */}
                  <div className="grid grid-cols-12 p-2.5 items-center bg-slate-50/60 dark:bg-slate-900/40">
                    <div className="col-span-4 font-bold text-slate-700 dark:text-slate-300">Outer Diameter (mm)</div>
                    <div className="col-span-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {detailData?.cable?.diameter ? `${detailData.cable.diameter} mm (SOURCE)` : 'NULL'}
                    </div>
                    <div className="col-span-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {detailData?.cable?.diameter ? `${detailData.cable.diameter} mm` : 'NULL'}
                    </div>
                  </div>

                  {/* Weight (Authoritative Source) */}
                  <div className="grid grid-cols-12 p-2.5 items-center bg-slate-50/60 dark:bg-slate-900/40">
                    <div className="col-span-4 font-bold text-slate-700 dark:text-slate-300">Approx Weight (kg/km)</div>
                    <div className="col-span-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {detailData?.cable?.weight ? `${detailData.cable.weight} kg/km (SOURCE)` : 'NULL'}
                    </div>
                    <div className="col-span-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                      {detailData?.cable?.weight ? `${detailData.cable.weight} kg/km` : 'NULL'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Edit Mode Save / Cancel Buttons */}
              {isEditing && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Change Comments / Justification
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Setting engineering family and standard based on approved specification..."
                      value={editForm.comments || ''}
                      onChange={(e) => setEditForm({ ...editForm, comments: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveDraft}
                      disabled={actionSubmitting}
                      className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow"
                    >
                      {actionSubmitting ? 'Saving...' : 'Save As Draft'}
                    </button>
                  </div>
                </div>
              )}

              {/* Review & Approval Actions Section */}
              {!isEditing && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Governance Actions & Transition
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Assign Reviewer</label>
                      <input
                        type="text"
                        placeholder="e.g. Eng. Tamer (Technical Office)"
                        value={assignedReviewer}
                        onChange={(e) => setAssignedReviewer(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">Decision / Comment</label>
                      <input
                        type="text"
                        placeholder="e.g. Technical review confirmed against IEC specification..."
                        value={actionComment}
                        onChange={(e) => setActionComment(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedMapping.workflowStatus === 'DRAFT' && (
                      <button
                        onClick={() => handleWorkflowAction('SUBMIT')}
                        disabled={actionSubmitting}
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Submit for Review</span>
                      </button>
                    )}

                    {(selectedMapping.workflowStatus === 'SUBMITTED' || selectedMapping.workflowStatus === 'DRAFT') && (
                      <button
                        onClick={() => handleWorkflowAction('ASSIGN')}
                        disabled={actionSubmitting || !assignedReviewer}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>Assign Reviewer</span>
                      </button>
                    )}

                    {(selectedMapping.workflowStatus === 'SUBMITTED' || selectedMapping.workflowStatus === 'UNDER_REVIEW') && (
                      <>
                        <button
                          onClick={() => handleWorkflowAction('APPROVE')}
                          disabled={actionSubmitting}
                          className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>Approve & Publish Authoritative</span>
                        </button>
                        <button
                          onClick={() => handleWorkflowAction('REJECT')}
                          disabled={actionSubmitting}
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Reject Mapping</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Revision History Section */}
              {detailData?.history && detailData.history.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-blue-500" />
                    <span>Revision History ({detailData.history.length})</span>
                  </h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                    {detailData.history.map((rev: any) => (
                      <div key={rev.id || rev.revision} className="p-3 bg-white dark:bg-slate-900 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-slate-700 dark:text-slate-300">V{rev.revision}</span>
                          {statusBadge(rev.workflowStatus)}
                          {rev.isCurrent && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                              CURRENT
                            </span>
                          )}
                          <span className="text-slate-400 text-[11px] truncate max-w-xs">
                            {rev.comments || 'No comment'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {rev.approvedBy ? `Approved by ${rev.approvedBy}` : rev.createdBy ? `Created by ${rev.createdBy}` : ''}
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

      {/* Bulk Action & Validation Quality Modal */}
      {showBulkActionModal && bulkValidationReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                <span>Bulk Validation & Quality Control</span>
              </h3>
              <button
                onClick={() => setShowBulkActionModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Close
              </button>
            </div>

            {/* Validation Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] uppercase font-bold text-slate-400">Selected</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{bulkValidationReport.totalSelected}</p>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">Valid</p>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{bulkValidationReport.validCount}</p>
              </div>
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                <p className="text-[10px] uppercase font-bold text-red-700 dark:text-red-400">Invalid / Errors</p>
                <p className="text-xl font-black text-red-700 dark:text-red-400">{bulkValidationReport.invalidCount}</p>
              </div>
            </div>

            {/* Quality Summary Warning if errors */}
            {bulkValidationReport.invalidCount > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>Quality Control: {bulkValidationReport.invalidCount} record(s) contain errors or missing fields.</span>
                </p>
                <p className="text-[11px] text-amber-800">
                  Batch approval is strictly blocked until all selected records pass compatibility and required attribute validation.
                </p>
              </div>
            )}

            {/* Invalid rows table if any */}
            {bulkValidationReport.results.filter((r: any) => !r.valid).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500">Records Requiring Correction:</p>
                <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y text-xs">
                  {bulkValidationReport.results
                    .filter((r: any) => !r.valid)
                    .map((r: any) => (
                      <div key={r.materialNumber} className="p-2 bg-red-50/50 dark:bg-red-950/20">
                        <span className="font-mono font-bold text-blue-600">{r.materialNumber}: </span>
                        <span className="text-red-600">{r.errors.map((e: any) => e.message).join(' · ')}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Choose Bulk Action */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Select Bulk Operation</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['SUBMIT', 'ASSIGN', 'APPROVE', 'REJECT'] as const).map((act) => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setBulkAction(act)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      bulkAction === act
                        ? 'bg-blue-600 text-white border-blue-600 shadow'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {act}
                  </button>
                ))}
              </div>

              {bulkAction === 'ASSIGN' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Assign To Reviewer</label>
                  <input
                    type="text"
                    placeholder="e.g. Eng. Tamer (Technical Office)"
                    value={bulkReviewer}
                    onChange={(e) => setBulkReviewer(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Comment / Decision Note</label>
                <input
                  type="text"
                  placeholder="e.g. Batch verified against approved customer specifications..."
                  value={bulkComment}
                  onChange={(e) => setBulkComment(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setShowBulkActionModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteBulkAction}
                disabled={bulkSubmitting || (bulkAction === 'APPROVE' && !bulkValidationReport.canApproveAllSelected)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow"
              >
                {bulkSubmitting ? 'Processing...' : `Execute Bulk ${bulkAction}`}
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
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <span>Import Preview: {importFileName}</span>
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <p className="text-[10px] uppercase font-bold text-slate-400">Total Rows</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{importPreview.totalRows}</p>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <p className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400">Valid</p>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-400">{importPreview.validCount}</p>
              </div>
              <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800">
                <p className="text-[10px] uppercase font-bold text-red-700 dark:text-red-400">Invalid</p>
                <p className="text-xl font-black text-red-700 dark:text-red-400">{importPreview.invalidCount}</p>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <p className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400">Duplicates</p>
                <p className="text-xl font-black text-amber-700 dark:text-amber-400">{importPreview.duplicateCount}</p>
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
                        <span className="font-mono font-bold text-blue-600">Row {r.rowNumber} ({r.materialNumber}): </span>
                        <span>{r.errors.map((e: any) => e.message).join(' · ')}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Note: Uploading mappings updates or creates <strong>DRAFT</strong> revisions. It does <strong>NOT</strong> overwrite raw CableMaster extract values or automatically approve cables.
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
                disabled={importSubmitting || !importPreview.canSubmit}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow"
              >
                {importSubmitting ? 'Importing...' : 'Commit as Drafts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function RowComp({
  label,
  source,
  sourceSuffix,
  approved,
  suggested,
  isEditing,
  editComponent,
}: {
  label: string;
  source: string;
  sourceSuffix?: string;
  approved?: string | null;
  suggested?: string | null;
  isEditing: boolean;
  editComponent: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 p-2.5 items-center hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
      <div className="col-span-4 font-bold text-slate-700 dark:text-slate-300">{label}</div>
      <div className="col-span-4 text-slate-400 font-mono text-[11px]">
        <span>{source}</span>
        {sourceSuffix && <span className="text-amber-700 dark:text-amber-400 font-semibold">{sourceSuffix}</span>}
      </div>
      <div className="col-span-4">
        {isEditing ? (
          editComponent
        ) : approved ? (
          <span className="font-bold text-emerald-700 dark:text-emerald-400 font-mono">{approved}</span>
        ) : suggested ? (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-mono italic">{suggested}</span>
            <span className="text-[9px] font-black px-1 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300">
              Suggested
            </span>
          </div>
        ) : (
          <span className="text-slate-300 font-mono">MISSING</span>
        )}
      </div>
    </div>
  );
}
