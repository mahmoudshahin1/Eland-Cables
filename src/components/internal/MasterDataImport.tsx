import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Download,
  FileText,
  AlertCircle,
  Database,
  Layers3,
  Package,
  Box,
} from 'lucide-react';
import { downloadExcelTemplate, downloadCsvTemplate } from '../../services/cableCatalogService';
import { downloadBomExcelTemplate, downloadBomCsvTemplate } from '../../services/cableBomService';
import { downloadDrumExcelTemplate, downloadDrumCsvTemplate } from '../../services/drumMasterService';
import {
  commitKind,
  detectImportKind,
  fetchOfficialWorkbook,
  previewKind,
  resolveWorkbookImportRows,
  sheetToObjects,
} from '../../services/importPipelineService';
import { ImportBatchRecord, MasterImportKind } from '../../types';
import { useAuth } from '../../context/AuthContext';

export const MasterDataImport: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { currentUser, jwtToken } = useAuth();
  const [importType, setImportType] = useState<MasterImportKind>('cables');
  const [fileName, setFileName] = useState<string>('');
  const [parsedData, setParsedData] = useState<Record<string, unknown>[]>([]);
  const [importing, setImporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<ImportBatchRecord | null>(null);
  const [officialBatches, setOfficialBatches] = useState<ImportBatchRecord[]>([]);
  const [pgNote, setPgNote] = useState<string | null>(null);
  const [officialRows, setOfficialRows] = useState<{
    rmRows: Record<string, unknown>[];
    drumRows: Record<string, unknown>[];
    cableRows: Record<string, unknown>[];
    bomRows: Record<string, unknown>[];
  } | null>(null);

  const importedBy = currentUser?.email || currentUser?.fullName || 'internal-user';

  const resetPreview = () => {
    setParsedData([]);
    setFileName('');
    setLastBatch(null);
    setOfficialBatches([]);
    setOfficialRows(null);
    setErrorMessage(null);
    setPgNote(null);
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setErrorMessage(null);
    setLastBatch(null);
    setOfficialBatches([]);
    setOfficialRows(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!(data instanceof ArrayBuffer)) throw new Error('Could not read file as binary.');
        const wb = XLSX.read(data, { type: 'array' });
        const resolved = resolveWorkbookImportRows(wb, importType);
        if (resolved.rows.length === 0) {
          setErrorMessage('The uploaded spreadsheet contains no data rows.');
          return;
        }
        setImportType(resolved.kind);
        setParsedData(resolved.rows);
      } catch (err: any) {
        setErrorMessage(`Failed to parse file: ${err.message || 'Unknown error'}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handlePreview = () => {
    if (parsedData.length === 0) {
      setErrorMessage('Upload a spreadsheet first. Sample seeding with invented defaults is disabled.');
      return;
    }
    setImporting(true);
    setErrorMessage(null);
    setPgNote(null);
    try {
      const result = previewKind(importType, parsedData, fileName || 'upload.xlsx', importedBy);
      setLastBatch(result.batch);
      setOfficialBatches([]);
    } catch (err: any) {
      setErrorMessage('Error validating data: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const postPostgresCommit = async (kind: MasterImportKind, rows: Record<string, unknown>[], source: string) => {
    if (!jwtToken) {
      throw new Error('Sign in is required to commit master data to PostgreSQL. Browser-only import is no longer authoritative.');
    }
    const res = await fetch('/api/master/imports/commit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({ kind, rows, sourceFile: source }),
    });
    if (res.status === 401) {
      throw new Error('Sign in is required to write PostgreSQL. Import was not committed.');
    }
    if (res.status === 503) {
      throw new Error('PostgreSQL is unavailable. Import was not committed (localStorage is not authoritative).');
    }
    if (res.status === 422) {
      const body = await res.json();
      throw new Error(body.message || 'PostgreSQL rejected the import. No partial write.');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `PostgreSQL commit failed (${res.status}).`);
    }
    return true;
  };

  const handleConfirm = async () => {
    if (parsedData.length === 0) {
      setErrorMessage('Upload a spreadsheet first. Sample seeding with invented defaults is disabled.');
      return;
    }
    const preview = previewKind(importType, parsedData, fileName || 'upload.xlsx', importedBy);
    setLastBatch(preview.batch);
    if (preview.batch.errorCount > 0) {
      setErrorMessage('Import has ERROR rows. The transaction was not committed.');
      return;
    }
    setImporting(true);
    setErrorMessage(null);
    setPgNote(null);
    try {
      await postPostgresCommit(importType, parsedData, fileName || 'upload.xlsx');
      // Non-authoritative compatibility mirror only after PostgreSQL success
      const result = commitKind(importType, parsedData, fileName || 'upload.xlsx', importedBy, {
        persist: true,
        mirrorBatchToLocalStorage: true,
      });
      setLastBatch(result.batch);
      setPgNote('Committed to PostgreSQL (authoritative). Browser store updated as a non-authoritative mirror.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Import commit failed.');
    } finally {
      setImporting(false);
    }
  };

  const loadOfficial = async () => {
    setImporting(true);
    setErrorMessage(null);
    setPgNote(null);
    try {
      const rmWb = await fetchOfficialWorkbook('/source/Raw%20Material%20List.xlsx');
      const drumWb = await fetchOfficialWorkbook('/source/Drum%20List.xlsx');
      const cableWb = await fetchOfficialWorkbook('/source/Energya%20Cable%20Master%20Data.xlsx');

      const rmRows = sheetToObjects(rmWb);
      const drumRows = sheetToObjects(drumWb);
      const cableRows = sheetToObjects(cableWb, 'Cable List');
      const bomRows = sheetToObjects(cableWb, 'Cable Materials');

      const batches = [
        previewKind('raw_materials', rmRows, 'Raw Material List.xlsx', importedBy).batch,
        previewKind('cables', cableRows, 'Energya Cable Master Data.xlsx (Cable List)', importedBy).batch,
        previewKind('boms', bomRows, 'Energya Cable Master Data.xlsx (Cable Materials)', importedBy).batch,
        previewKind('drums', drumRows, 'Drum List.xlsx', importedBy).batch,
      ];
      setOfficialBatches(batches);
      setOfficialRows({ rmRows, drumRows, cableRows, bomRows });
      setLastBatch(batches[1]);
      setFileName('Official ENERGYA extracts (preview — confirm to commit)');
      setParsedData(cableRows);
      setImportType('cables');
    } catch (err: any) {
      const status = typeof err.message === 'string' && err.message.includes('404') ? 'DATA_REQUIRED' : null;
      setErrorMessage(
        status
          ? 'Official ENERGYA workbooks are not in this environment (DATA_REQUIRED). Production Cable List onboarding is stopped. Do not fabricate cables. Use Import Center with a real extract when it is available.'
          : err.message || 'Official extract load failed.'
      );
    } finally {
      setImporting(false);
    }
  };

  const confirmOfficial = async () => {
    const cache = officialRows;
    if (!cache) {
      setErrorMessage('Preview official workbooks first.');
      return;
    }
    setImporting(true);
    setErrorMessage(null);
    try {
      const jobs: Array<{ kind: MasterImportKind; rows: Record<string, unknown>[]; source: string }> = [
        { kind: 'raw_materials', rows: cache.rmRows, source: 'Raw Material List.xlsx' },
        { kind: 'cables', rows: cache.cableRows, source: 'Energya Cable Master Data.xlsx (Cable List)' },
        { kind: 'drums', rows: cache.drumRows, source: 'Drum List.xlsx' },
        { kind: 'boms', rows: cache.bomRows, source: 'Energya Cable Master Data.xlsx (Cable Materials)' },
      ];
      const committed: ImportBatchRecord[] = [];
      for (const job of jobs) {
        const preview = previewKind(job.kind, job.rows, job.source, importedBy);
        if (preview.batch.errorCount > 0) {
          committed.push(preview.batch);
          continue;
        }
        await postPostgresCommit(job.kind, job.rows, job.source);
        committed.push(
          commitKind(job.kind, job.rows, job.source, importedBy, {
            persist: true,
            mirrorBatchToLocalStorage: true,
          }).batch
        );
      }
      setOfficialBatches(committed);
      setLastBatch(committed[committed.length - 1] || null);
      setPgNote('Official extracts committed to PostgreSQL (authoritative). Browser mirror updated after success.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Official confirm failed.');
    } finally {
      setImporting(false);
    }
  };

  const kinds: { id: MasterImportKind; label: string; icon: React.ElementType }[] = [
    { id: 'cables', label: 'Cable Master', icon: Package },
    { id: 'boms', label: 'Cable BOM', icon: Layers3 },
    { id: 'raw_materials', label: 'Raw Materials', icon: Database },
    { id: 'drums', label: 'Drum Master', icon: Box },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-red-300 uppercase tracking-widest bg-red-800/60 px-2.5 py-1 rounded-md border border-red-600/40">
            IMPORT CENTER — EXTENDED (NOT A SECOND FRAMEWORK)
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">Validate, preview, commit, audit</h1>
          <p className="text-xs text-slate-300 mt-1">
            Invalid rows are not committed. Duplicate BOM weights are skipped, not auto-fixed. Missing prices stay
            PRICE_NOT_CONFIGURED. PCS is not converted to kg.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadOfficial}
            disabled={importing}
            className="px-4 py-2.5 rounded-xl bg-accent-500 hover:bg-accent-600 text-slate-950 font-bold text-xs shadow-lg"
          >
            Preview official ENERGYA workbooks
          </button>
          <button
            onClick={confirmOfficial}
            disabled={importing || !officialRows}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-lg"
          >
            Confirm valid official kinds
          </button>
          {importType === 'boms' && (
            <>
              <button onClick={downloadBomExcelTemplate} className="px-3 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1">
                <Download className="h-4 w-4" /> BOM template
              </button>
              <button onClick={downloadBomCsvTemplate} className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs flex items-center gap-1">
                <FileText className="h-4 w-4" /> CSV
              </button>
            </>
          )}
          {importType === 'cables' && (
            <>
              <button onClick={downloadExcelTemplate} className="px-3 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1">
                <Download className="h-4 w-4" /> Cable template
              </button>
              <button onClick={downloadCsvTemplate} className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs flex items-center gap-1">
                <FileText className="h-4 w-4" /> CSV
              </button>
            </>
          )}
          {importType === 'drums' && (
            <>
              <button onClick={downloadDrumExcelTemplate} className="px-3 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1">
                <Download className="h-4 w-4" /> Drum template
              </button>
              <button onClick={downloadDrumCsvTemplate} className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-xs flex items-center gap-1">
                <FileText className="h-4 w-4" /> CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl w-fit">
        {kinds.map((k) => (
          <button
            key={k.id}
            onClick={() => {
              setImportType(k.id);
              resetPreview();
            }}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
              importType === k.id ? 'bg-white dark:bg-slate-900 text-blue-700 shadow' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <k.icon className="h-4 w-4" />
            {k.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-sm font-bold">1. Upload {importType} spreadsheet</h3>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) processFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer bg-slate-50 dark:bg-slate-800/50 space-y-3 border-slate-300 hover:border-red-500"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processFile(file);
              }}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center mx-auto">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <p className="text-xs font-bold">{fileName ? `File: ${fileName}` : 'Click or drop Excel / CSV'}</p>
            <p className="text-[11px] text-slate-400">{parsedData.length} preview rows</p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-100 dark:bg-red-950/60 border border-red-300 rounded-xl text-xs text-red-700 flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {pgNote && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">{pgNote}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={handlePreview}
              disabled={importing}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-2"
            >
              {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Preview & validate ({parsedData.length})
            </button>
            <button
              onClick={handleConfirm}
              disabled={importing || !lastBatch || lastBatch.errorCount > 0 || parsedData.length === 0}
              className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2"
            >
              Confirm import
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-sm font-bold">2. Preview / import audit</h3>
          {officialBatches.length > 0 && (
            <div className="space-y-1 text-xs border border-slate-200 rounded-xl p-2">
              {officialBatches.map((b) => (
                <p key={b.batchNumber}>
                  {b.dataType}: <span className="font-bold">{b.status}</span> · errors {b.errorCount} · warnings {b.warningCount}
                </p>
              ))}
            </div>
          )}
          {!lastBatch ? (
            <p className="text-xs text-slate-500">
              Preview first. Confirm requires PostgreSQL success (authoritative). Browser store is mirrored only after
              PG commit. ERROR rejects the
              kind. Conflicting BOM weights are skipped (BUSINESS_DECISION_REQUIRED), not averaged.
            </p>
          ) : (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 font-bold">
                {lastBatch.status === 'COMMITTED' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                )}
                {lastBatch.batchNumber} · {lastBatch.status}
              </div>
              <p>
                Valid {lastBatch.successCount} · Errors {lastBatch.errorCount} · Warnings {lastBatch.warningCount} ·
                Duplicates {lastBatch.duplicateCount || 0} · Skipped/Rejected {lastBatch.skippedCount || 0} · Rows{' '}
                {lastBatch.rowCount}
                {lastBatch.information?.length ? ` · information ${lastBatch.information.length}` : ''}
              </p>
              <p className="text-slate-500">{lastBatch.sourceFile}</p>
              {lastBatch.errors.length > 0 && (
                <div className="max-h-48 overflow-auto border border-slate-200 rounded-xl">
                  <table className="w-full">
                    <tbody>
                      {lastBatch.errors.slice(0, 40).map((e, i) => (
                        <tr key={`e-${i}`} className="border-t border-slate-100">
                          <td className="p-1.5 font-mono">r{e.rowNumber}</td>
                          <td className="p-1.5 text-red-700">ERROR {e.code}</td>
                          <td className="p-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {lastBatch.skipped && lastBatch.skipped.length > 0 && (
                <div className="max-h-32 overflow-auto border border-slate-200 rounded-xl">
                  <table className="w-full">
                    <tbody>
                      {lastBatch.skipped.slice(0, 20).map((e, i) => (
                        <tr key={`s-${i}`} className="border-t border-slate-100">
                          <td className="p-1.5 font-mono">r{e.rowNumber}</td>
                          <td className="p-1.5">SKIP {e.code}</td>
                          <td className="p-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {lastBatch.warnings.length > 0 && (
                <div className="max-h-32 overflow-auto border border-amber-100 rounded-xl">
                  <table className="w-full">
                    <tbody>
                      {lastBatch.warnings.slice(0, 20).map((e, i) => (
                        <tr key={`w-${i}`} className="border-t border-amber-50">
                          <td className="p-1.5 font-mono">r{e.rowNumber}</td>
                          <td className="p-1.5 text-amber-800">WARN {e.code}</td>
                          <td className="p-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
