import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Layers,
  ArrowRight,
  Filter,
  Check,
  Cable,
} from 'lucide-react';
import { ExcelPreImportSummary, ExcelRowValidationResult } from '../types';
import {
  downloadCableMasterExcelTemplateV2,
  preValidateExcelRowsV2,
  importValidRowsToCableMaster,
} from '../services/technicalOfficeServiceV2';
import { DashboardStatCard } from '../../../common/DashboardStatCard';
import { useAuth } from '../../../../context/AuthContext';

export const TechnicalOfficeExcelPreImport: React.FC = () => {
  const { jwtToken } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ExcelPreImportSummary | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'VALID' | 'INVALID' | 'EXISTING' | 'NEW'>('ALL');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setImportedCount(null);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

        const preValidation = preValidateExcelRowsV2(rows);
        setSummary(preValidation);
      } catch (err) {
        console.error('Error reading Excel file:', err);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!summary) return;
    if (!jwtToken) {
      setImportError('Sign in is required to write Cable Master to PostgreSQL.');
      return;
    }
    setImportError(null);
    const validRows = summary.rowResults.filter((r) => r.isValid);
    const result = await importValidRowsToCableMaster(validRows, jwtToken);
    if (result.ok === false) {
      setImportError(result.error);
      setImportedCount(result.importedCount);
      return;
    }
    setImportedCount(result.importedCount);
  };

  const filteredRows = summary
    ? summary.rowResults.filter((r) => {
        if (filterMode === 'VALID') return r.isValid;
        if (filterMode === 'INVALID') return !r.isValid;
        if (filterMode === 'EXISTING') return r.isExisting;
        if (filterMode === 'NEW') return !r.isExisting;
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Banner & Action Bar */}
      <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Method B: Bulk Excel Pre-Import & Validation
          </span>
          <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
            44-Column Engineering Cable Master Sync
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Validate every row against IEC/BS cross-parameter rules before writing into the Master Catalog.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={downloadCableMasterExcelTemplateV2}
            className="px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-black transition-all flex items-center space-x-2 border border-slate-200 dark:border-slate-700"
          >
            <Download className="h-4 w-4 text-blue-500" />
            <span>Download 44-Col Template</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls,.csv"
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-black shadow-lg shadow-blue-600/20 transition-all flex items-center space-x-2"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Excel File</span>
          </button>
        </div>
      </div>

      {/* Uploaded File Pre-Import Validation Dashboard */}
      {summary && (
        <div className="space-y-6">
          {/* Summary Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <DashboardStatCard icon={Layers} label="Total Rows" value={summary.totalRows} />
            <DashboardStatCard icon={CheckCircle2} label="Valid Rows" value={summary.validRows} />
            <DashboardStatCard icon={XCircle} label="Invalid Rows" value={summary.invalidRows} />
            <DashboardStatCard icon={AlertTriangle} label="Duplicates" value={summary.duplicateRows} />
            <DashboardStatCard icon={Cable} label="Existing Cables" value={summary.existingCableRows} />
            <DashboardStatCard icon={Cable} label="New Cables" value={summary.newCableRows} />
          </div>

          {/* Import Banner with Status / Success Receipt */}
          {importedCount !== null ? (
            <div className="p-4 bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-100">
                    Import Completed Successfully!
                  </h4>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    {importedCount} valid cable master records written to the database. All catalog views and cable parameter views updated.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-bold text-slate-900 dark:text-white">File:</span> {fileName} •{' '}
                <span className="font-bold text-slate-900 dark:text-white">{summary.validRows} valid rows ready for import.</span>
                {importError ? (
                  <p className="mt-1 text-red-600 dark:text-red-400 font-semibold">{importError}</p>
                ) : null}
              </div>
              <button
                onClick={() => void handleImport()}
                disabled={summary.validRows === 0}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center space-x-2 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span>Import {summary.validRows} Valid Rows</span>
              </button>
            </div>
          )}

          {/* Row-by-Row Pre-Import Table */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            {/* Table Header / Filter Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                Row-by-Row Diagnostic Report ({filteredRows.length} Rows)
              </span>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(['ALL', 'VALID', 'INVALID', 'EXISTING', 'NEW'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setFilterMode(m)}
                    className={`px-3 py-1 text-xs font-bold rounded-xl border transition-all ${
                      filterMode === m
                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Row</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Material #</th>
                    <th className="py-2.5 px-3">Customer Code</th>
                    <th className="py-2.5 px-3">Cable Description</th>
                    <th className="py-2.5 px-3">Errors / Diagnostics</th>
                    <th className="py-2.5 px-3">Suggested Correction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredRows.map((row) => (
                    <tr
                      key={row.rowNumber}
                      className={
                        row.isValid
                          ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                          : 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70'
                      }
                    >
                      <td className="py-3 px-3 font-mono font-bold text-slate-500">#{row.rowNumber}</td>
                      <td className="py-3 px-3">
                        {row.isValid ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1 w-max">
                            <CheckCircle2 className="h-3 w-3" /> Valid
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700 flex items-center gap-1 w-max">
                            <XCircle className="h-3 w-3" /> Invalid
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {row.materialNumber}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-700 dark:text-slate-300">{row.customerCode}</td>
                      <td className="py-3 px-3 font-mono text-[11px] max-w-xs truncate text-slate-800 dark:text-slate-200">
                        {row.description}
                      </td>
                      <td className="py-3 px-3 text-rose-600 dark:text-rose-400 font-medium">
                        {row.errors.length > 0 ? (
                          <ul className="list-disc pl-3 space-y-0.5 text-[11px]">
                            {row.errors.map((e, idx) => (
                              <li key={idx}>{e}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 text-[11px]">
                        {row.suggestedCorrections.length > 0 ? (
                          <ul className="list-disc pl-3 space-y-0.5 text-blue-600 dark:text-blue-400 font-medium">
                            {row.suggestedCorrections.map((s, idx) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
