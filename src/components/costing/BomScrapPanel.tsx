import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Cable, Download, RefreshCw, Save, Search, AlertTriangle, CheckCircle2, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { resolveScrapImportSheetName } from '../../services/cableScrapTemplateService';

type CableOption = { materialNumber: string; description: string };

type BomScrapLine = {
  id: string;
  source: 'GOVERNED' | 'SOURCE';
  rawMaterialCode: string;
  rawMaterialDescription: string;
  consumptionPerKm: number;
  uom: string;
  scrapPercent: number | null;
  bomVersion: number;
  status: string;
};

type Props = {
  token: string | null;
  lang: 'en' | 'ar';
};

type ImportPreviewRow = {
  rowNumber: number;
  cableMaterialNumber: string;
  scrapPercent: number | null;
  metal: string;
  family: string;
  status: 'VALID' | 'ERROR' | 'WARNING';
  bomLineCount: number;
  errors: Array<{ field: string; message: string; code: string }>;
  warnings: Array<{ field: string; message: string; code: string }>;
};

function parseApiBody(text: string, path: string): Record<string, unknown> {
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.trimStart().startsWith('<!')) {
      throw new Error(
        `API returned HTML for ${path}. Restart dev server (npm run dev) or rebuild (npm run build).`
      );
    }
    throw new Error(`API returned non-JSON for ${path}`);
  }
}

export const BomScrapPanel: React.FC<Props> = ({ token, lang }) => {
  const rtl = lang === 'ar';
  const [cables, setCables] = useState<CableOption[]>([]);
  const [cableSearch, setCableSearch] = useState('');
  const [selectedCable, setSelectedCable] = useState('');
  const [cableDescription, setCableDescription] = useState<string | null>(null);
  const [lines, setLines] = useState<BomScrapLine[]>([]);
  const [draftScrap, setDraftScrap] = useState<Record<string, string>>({});
  const [bulkScrapPercent, setBulkScrapPercent] = useState('2');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [templateMetal, setTemplateMetal] = useState('ALL');
  const [templateFamily, setTemplateFamily] = useState('ALL');
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers || {}),
        },
      });
      const text = await res.text();
      const body = parseApiBody(text, path);
      if (!res.ok) {
        throw new Error(String(body.error || `Request failed (${res.status})`));
      }
      return body;
    },
    [token]
  );

  const loadCables = useCallback(async () => {
    const q = cableSearch.trim();
    const url = q
      ? `/api/admin/costing/bom-scrap/cables?search=${encodeURIComponent(q)}`
      : '/api/admin/costing/bom-scrap/cables';
    const data = await api(url);
    setCables((data.cables as CableOption[]) || []);
  }, [api, cableSearch]);

  const loadBom = useCallback(
    async (matNo: string) => {
      if (!matNo) return;
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const data = await api(`/api/admin/costing/bom-scrap?cable=${encodeURIComponent(matNo)}`);
        const rows = (data.lines as BomScrapLine[]) || [];
        setLines(rows);
        setCableDescription((data.cableDescription as string) || null);
        const draft: Record<string, string> = {};
        rows.forEach((r) => {
          draft[r.id] = r.scrapPercent != null ? String(r.scrapPercent) : '';
        });
        setDraftScrap(draft);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load BOM');
        setLines([]);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    void loadCables().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cables'));
  }, [loadCables]);

  useEffect(() => {
    if (selectedCable) void loadBom(selectedCable);
  }, [selectedCable, loadBom]);

  const dirtyCount = useMemo(() => {
    return lines.filter((line) => {
      const draft = draftScrap[line.id] ?? '';
      const current = line.scrapPercent != null ? String(line.scrapPercent) : '';
      return draft !== current;
    }).length;
  }, [lines, draftScrap]);

  const save = async () => {
    if (!selectedCable) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updates = lines.map((line) => {
        const raw = (draftScrap[line.id] ?? '').trim();
        return {
          id: line.id,
          source: line.source,
          scrapPercent: raw === '' ? null : Number(raw),
        };
      });
      const data = await api('/api/admin/costing/bom-scrap', {
        method: 'PUT',
        body: JSON.stringify({ cableMaterialNumber: selectedCable, updates }),
      });
      const saved = (data.lines as BomScrapLine[]) || [];
      setLines(saved);
      const draft: Record<string, string> = {};
      saved.forEach((r) => {
        draft[r.id] = r.scrapPercent != null ? String(r.scrapPercent) : '';
      });
      setDraftScrap(draft);
      setSuccess(lang === 'en' ? 'Standard scrap saved for this cable BOM.' : 'تم حفظ نسب الهالك القياسية.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const applyBulkScrap = (percent: string) => {
    const value = percent.trim();
    if (value === '' || Number.isNaN(Number(value))) return;
    const next: Record<string, string> = { ...draftScrap };
    lines.forEach((l) => {
      next[l.id] = value;
    });
    setDraftScrap(next);
  };

  const downloadTemplate = async () => {
    setError(null);
    setSuccess(null);
    try {
      const params = new URLSearchParams();
      if (templateMetal && templateMetal !== 'ALL') params.set('metal', templateMetal);
      if (templateFamily && templateFamily !== 'ALL') params.set('family', templateFamily);
      const qs = params.toString();
      const templatePath = `/api/master/cable-scrap-template-export${qs ? `?${qs}` : ''}`;
      const res = await fetch(templatePath, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const hint = body.hint ? ` ${body.hint}` : '';
        throw new Error(String(body.error || `Download failed (${res.status})`) + hint);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Costing_Reference_Workbook_${templateMetal}_${templateFamily}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(lang === 'en' ? 'Template downloaded.' : 'تم تنزيل القالب.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const handleImportFile = async (file: File, applyImmediately = false) => {
    setError(null);
    setSuccess(null);
    setImportBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = resolveScrapImportSheetName(wb.SheetNames);
      if (!sheetName) {
        throw new Error(
          lang === 'en'
            ? 'No importable sheet found. Use the Cable_BOM sheet from the downloaded template.'
            : 'لم يتم العثور على ورقة قابلة للاستيراد. استخدم ورقة Cable_BOM من القالب.'
        );
      }
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (rows.length === 0) {
        throw new Error(lang === 'en' ? 'The uploaded file has no data rows.' : 'الملف المرفوع لا يحتوي على بيانات.');
      }
      setImportRows(rows);
      const previewData = await api('/api/master/cable-scrap-import/preview', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      const previewRows = (previewData.rows as ImportPreviewRow[]) || [];
      setImportPreview(previewRows);

      const validCount = previewRows.filter((r) => r.status === 'VALID').length;
      if (applyImmediately && validCount > 0) {
        await commitImportRows(rows, previewRows);
      } else if (applyImmediately && validCount === 0) {
        const errorRows = previewRows.filter((r) => r.status === 'ERROR').length;
        const skipped = previewRows.filter((r) => r.status === 'WARNING').length;
        setError(
          lang === 'en'
            ? `No rows applied. ${errorRows} error(s), ${skipped} skipped (blank Scrap %). Review the preview table.`
            : `لم يُطبَّق أي صف. ${errorRows} خطأ، ${skipped} تم تخطيه.`
        );
      }
    } catch (e) {
      setImportRows([]);
      setImportPreview([]);
      setError(e instanceof Error ? e.message : 'Import preview failed');
    } finally {
      setImportBusy(false);
    }
  };

  const commitImportRows = async (
    rows: Record<string, unknown>[],
    previewRows?: ImportPreviewRow[]
  ) => {
    const data = await api('/api/master/cable-scrap-import/commit', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
    const updated = Number(data.updatedCables || 0);
    const skipped = Number(data.skippedRows || 0);
    const errors = (data.errors as Array<{ rowNumber: number; message: string }>) || [];
    const preview = previewRows ?? importPreview;
    const bomLinesUpdated = preview
      .filter((r) => r.status === 'VALID')
      .reduce((sum, r) => sum + r.bomLineCount, 0);

    if (errors.length > 0) {
      setError(
        lang === 'en'
          ? `Applied scrap to ${updated} cable(s) (${bomLinesUpdated} BOM lines); ${errors.length} row(s) failed.`
          : `تم تطبيق الهالك على ${updated} كابل؛ فشل ${errors.length} صف.`
      );
    } else {
      setSuccess(
        lang === 'en'
          ? `Scrap % saved on ${bomLinesUpdated} governed BOM line(s) across ${updated} cable(s)${skipped ? ` (${skipped} row(s) skipped).` : '.'} Check Master Data → Cable BOM or select a cable below.`
          : `تم حفظ الهالك على ${bomLinesUpdated} سطر BOM عبر ${updated} كابل.`
      );
    }
    setImportRows([]);
    setImportPreview([]);
    window.dispatchEvent(new CustomEvent('cableBomsUpdated'));
    if (selectedCable) void loadBom(selectedCable);
  };

  const commitImport = async () => {
    if (importRows.length === 0) return;
    setImportBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await commitImportRows(importRows, importPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import commit failed');
    } finally {
      setImportBusy(false);
    }
  };

  const importValidCount = importPreview.filter((r) => r.status === 'VALID').length;

  return (
    <div className="space-y-4" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h3 className="font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Upload className="h-5 w-5 text-red-600" />
          {lang === 'en' ? 'Bulk upload — Cable scrap by Metal & Family' : 'رفع جماعي — هالك الكابلات حسب المعدن والعائلة'}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400">
          {lang === 'en'
            ? 'Upload the Cable_BOM sheet (or full workbook). Only Scrap % is imported — it updates governed BOM scrap, not Cable Master. Cable_Master and Costing_Reference sheets are reference-only.'
            : 'ارفع ورقة Cable_BOM (أو المصنف الكامل). يتم استيراد نسبة الهالك فقط — تحديث هالك BOM المعتمد وليس سجل الكابلات. أوراق Cable_Master و Costing_Reference للمرجع فقط.'}
        </p>
        <div className="grid md:grid-cols-4 gap-2">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">{lang === 'en' ? 'Metal' : 'المعدن'}</label>
            <select className="w-full border rounded-lg px-2 py-1.5 text-sm" value={templateMetal} onChange={(e) => setTemplateMetal(e.target.value)}>
              <option value="ALL">{lang === 'en' ? 'All metals' : 'كل المعادن'}</option>
              <option value="CU">CU</option>
              <option value="AL">AL</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">{lang === 'en' ? 'Family' : 'العائلة'}</label>
            <select className="w-full border rounded-lg px-2 py-1.5 text-sm" value={templateFamily} onChange={(e) => setTemplateFamily(e.target.value)}>
              <option value="ALL">{lang === 'en' ? 'All families' : 'كل العائلات'}</option>
              <option value="LV">LV</option>
              <option value="MV">MV</option>
              <option value="HV">HV</option>
            </select>
          </div>
          <div className="md:col-span-2 flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              className="px-4 py-2 rounded-lg border font-bold text-xs flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              {lang === 'en' ? 'Download template' : 'تنزيل القالب'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importBusy}
              className="px-4 py-2 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {importBusy ? (lang === 'en' ? 'Processing…' : 'جاري المعالجة…') : lang === 'en' ? 'Upload & apply' : 'رفع وتطبيق'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file, true);
                e.target.value = '';
              }}
            />
            {importPreview.length > 0 && importValidCount > 0 && (
              <button
                type="button"
                disabled={importBusy}
                onClick={() => void commitImport()}
                className="px-4 py-2 rounded-lg border font-bold text-xs disabled:opacity-50"
              >
                {lang === 'en' ? `Re-apply ${importValidCount} row(s)` : `إعادة تطبيق ${importValidCount}`}
              </button>
            )}
          </div>
        </div>
        {importPreview.length > 0 && (
          <div className="rounded-xl border overflow-x-auto max-h-48">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left bg-slate-800 text-white">
                  <th className="p-2">#</th>
                  <th className="p-2">{lang === 'en' ? 'Material No.' : 'رقم المادة'}</th>
                  <th className="p-2">Metal</th>
                  <th className="p-2">Family</th>
                  <th className="p-2">Scrap %</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.map((row) => (
                  <tr key={row.rowNumber} className="border-t">
                    <td className="p-2">{row.rowNumber}</td>
                    <td className="p-2 font-mono">{row.cableMaterialNumber}</td>
                    <td className="p-2">{row.metal}</td>
                    <td className="p-2">{row.family}</td>
                    <td className="p-2 font-bold">{row.scrapPercent != null ? `${row.scrapPercent}%` : '—'}</td>
                    <td className="p-2">
                      <span
                        className={
                          row.status === 'VALID'
                            ? 'text-emerald-700'
                            : row.status === 'WARNING'
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }
                      >
                        {row.status}
                        {row.errors[0] ? ` — ${row.errors[0].message}` : row.warnings[0] ? ` — ${row.warnings[0].message}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4">
        <h3 className="font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-2">
          <Cable className="h-5 w-5" />
          {lang === 'en' ? 'Step 1 — Set standard scrap per BOM item' : 'الخطوة 1 — تعيين الهالك القياسي لكل مادة'}
        </h3>
        <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
          {lang === 'en'
            ? 'Select a cable, review consumption per km for each raw material, then enter the standard scrap % used in costing.'
            : 'اختر الكابل، راجع الاستهلاك لكل كم، ثم أدخل نسبة الهالك القياسية المستخدمة في التكلفة.'}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          {success}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">
            {lang === 'en' ? 'Search cable' : 'بحث عن كابل'}
          </label>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              placeholder={lang === 'en' ? 'Code or name…' : 'الكود أو الاسم…'}
              value={cableSearch}
              onChange={(e) => setCableSearch(e.target.value)}
            />
            <button type="button" onClick={() => void loadCables()} className="px-3 py-2 border rounded-lg">
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">
            {lang === 'en' ? 'Cable' : 'الكابل'}
          </label>
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm font-semibold"
            value={selectedCable}
            onChange={(e) => setSelectedCable(e.target.value)}
          >
            <option value="">{lang === 'en' ? '— Select cable —' : '— اختر كابل —'}</option>
            {cables.map((c) => (
              <option key={c.materialNumber} value={c.materialNumber}>
                {c.materialNumber} — {c.description}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedCable && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold">{selectedCable}</p>
              {cableDescription && <p className="text-xs text-slate-500">{cableDescription}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg border bg-white text-xs font-bold">
                <span className="text-slate-600 whitespace-nowrap">{lang === 'en' ? 'Set all' : 'تعيين الكل'}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="w-16 border-0 bg-transparent px-1 py-0.5 text-sm font-bold text-slate-900 outline-none"
                  value={bulkScrapPercent}
                  onChange={(e) => setBulkScrapPercent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyBulkScrap(bulkScrapPercent);
                  }}
                  aria-label={lang === 'en' ? 'Scrap percent for all rows' : 'نسبة الهالك لكل الصفوف'}
                />
                <span className="text-slate-400">%</span>
              </label>
              <button
                type="button"
                onClick={() => applyBulkScrap(bulkScrapPercent)}
                className="px-3 py-1.5 rounded-lg border text-xs font-bold"
              >
                {lang === 'en' ? 'Apply' : 'تطبيق'}
              </button>
              <button
                type="button"
                onClick={() => void loadBom(selectedCable)}
                className="px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {lang === 'en' ? 'Reload' : 'تحديث'}
              </button>
              <button
                type="button"
                disabled={saving || dirtyCount === 0}
                onClick={() => void save()}
                className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? (lang === 'en' ? 'Saving…' : 'جاري الحفظ…') : lang === 'en' ? 'Save scrap' : 'حفظ الهالك'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b bg-slate-50 dark:bg-slate-800">
                  <th className="p-3">{lang === 'en' ? 'Raw material' : 'المادة الخام'}</th>
                  <th className="p-3">{lang === 'en' ? 'Description' : 'الوصف'}</th>
                  <th className="p-3">{lang === 'en' ? 'Consumption / km' : 'الاستهلاك / كم'}</th>
                  <th className="p-3">{lang === 'en' ? 'UOM' : 'الوحدة'}</th>
                  <th className="p-3 w-36">{lang === 'en' ? 'Scrap %' : 'الهالك %'}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      {lang === 'en' ? 'Loading BOM…' : 'جاري تحميل قائمة المواد…'}
                    </td>
                  </tr>
                ) : lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      {lang === 'en' ? 'No BOM lines for this cable.' : 'لا توجد مواد في قائمة المواد لهذا الكابل.'}
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-3 font-mono font-bold">{line.rawMaterialCode}</td>
                      <td className="p-3">{line.rawMaterialDescription}</td>
                      <td className="p-3 font-semibold">{line.consumptionPerKm.toLocaleString()}</td>
                      <td className="p-3">{line.uom}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={99.99}
                            step={0.01}
                            className="w-full border rounded-lg px-2 py-1.5 font-bold"
                            placeholder="0"
                            value={draftScrap[line.id] ?? ''}
                            onChange={(e) =>
                              setDraftScrap((prev) => ({ ...prev, [line.id]: e.target.value }))
                            }
                          />
                          <span className="text-slate-400">%</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {lines.some((l) => l.source === 'SOURCE') && (
            <p className="text-xs text-amber-700">
              {lang === 'en'
                ? 'Some lines are from source BOM only — saving will create governed BOM records with your scrap rates.'
                : 'بعض الأسطر من قائمة المواد المصدر فقط — الحفظ سينشئ سجلات معتمدة بنسب الهالك.'}
            </p>
          )}
        </>
      )}
    </div>
  );
};
