import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, FileSpreadsheet, Pencil, Plus, Trash2, X } from 'lucide-react';
import { DrumMasterRecord } from '../../types';
import { APPROVED_DRUM_TEMPLATE_HEADERS } from '../../domain/drumMasterExcelImport';
import { buildDrumDescription, resolveDrumDescription } from '../../services/drumMasterService';
import {
  commitDrumExcelViaApi,
  createDrumViaApi,
  deleteOrDeactivateDrumViaApi,
  downloadMasterExcel,
  previewDrumExcelViaApi,
  updateDrumViaApi,
  type DrumExcelPreviewResponse,
} from '../../services/masterDataApiService';

type FormMode = 'idle' | 'add' | 'edit';

type DrumFormState = {
  drumCode: string;
  flange: string;
  barrel: string;
  innerWidth: string;
  outerWidth: string;
  capacity: string;
  clearanceMm: string;
  maxWeight: string;
  emptyDrumNetWeightKg: string;
  description: string;
};

const EMPTY_FORM: DrumFormState = {
  drumCode: '',
  flange: '',
  barrel: '',
  innerWidth: '',
  outerWidth: '',
  capacity: '',
  clearanceMm: '',
  maxWeight: '',
  emptyDrumNetWeightKg: '',
  description: '',
};

function numToField(value: number | null | undefined): string {
  return value == null || !Number.isFinite(Number(value)) ? '' : String(value);
}

function drumToForm(drum: DrumMasterRecord): DrumFormState {
  return {
    drumCode: drum.drumCode,
    flange: numToField(drum.flange),
    barrel: numToField(drum.barrel),
    innerWidth: numToField(drum.innerWidth),
    outerWidth: numToField(drum.outerWidth),
    capacity: numToField(drum.capacity),
    clearanceMm: numToField(drum.clearanceMm),
    maxWeight: numToField(drum.maxWeight),
    emptyDrumNetWeightKg: numToField(drum.emptyDrumNetWeightKg),
    description: drum.description || '',
  };
}

function parseRequiredPositive(raw: string, label: string): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: `${label} is required. Blank is not stored as zero.` };
  const n = Number(trimmed.replace(/,/g, ''));
  if (!Number.isFinite(n)) return { ok: false, message: `${label} must be a valid number.` };
  if (n <= 0) return { ok: false, message: `${label} must be greater than zero.` };
  return { ok: true, value: n };
}

function parseRequiredNonNegative(raw: string, label: string): { ok: true; value: number } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, message: `${label} is required. Blank is not stored as zero.` };
  const n = Number(trimmed.replace(/,/g, ''));
  if (!Number.isFinite(n)) return { ok: false, message: `${label} must be a valid number.` };
  if (n < 0) return { ok: false, message: `${label} cannot be negative.` };
  return { ok: true, value: n };
}

function formatWhen(value?: string): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function DrumMasterAdminPanel({
  drums,
  jwtToken,
  onReload,
  onError,
}: {
  drums: DrumMasterRecord[];
  jwtToken?: string | null;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [mode, setMode] = useState<FormMode>('idle');
  const [form, setForm] = useState<DrumFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [excelName, setExcelName] = useState('');
  const [excelRows, setExcelRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<DrumExcelPreviewResponse | null>(null);
  const [excelBusy, setExcelBusy] = useState(false);

  const rows = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return drums.filter((drum) => {
      if (statusFilter !== 'ALL' && drum.status !== statusFilter) return false;
      if (!qLower) return true;
      return (
        drum.drumCode.toLowerCase().includes(qLower) ||
        resolveDrumDescription(drum).toLowerCase().includes(qLower)
      );
    });
  }, [drums, q, statusFilter]);

  const resetForm = () => {
    setMode('idle');
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const startAdd = () => {
    setMode('add');
    setForm(EMPTY_FORM);
    setFormError(null);
    onError(null);
  };

  const startEdit = (drum: DrumMasterRecord) => {
    setMode('edit');
    setForm(drumToForm(drum));
    setFormError(null);
    onError(null);
  };

  const validateForm = (): DrumMasterRecord | null => {
    const drumCode = form.drumCode.trim();
    if (!drumCode) {
      setFormError('Drum Code is required.');
      return null;
    }
    const flange = parseRequiredPositive(form.flange, 'Flange');
    const barrel = parseRequiredPositive(form.barrel, 'Barrel');
    const innerWidth = parseRequiredPositive(form.innerWidth, 'Inner Width');
    const outerWidth = parseRequiredPositive(form.outerWidth, 'Outer Width');
    const capacity = parseRequiredPositive(form.capacity, 'Capacity');
    const clearanceMm = parseRequiredPositive(form.clearanceMm, 'Clearance Mm');
    const maxWeight = parseRequiredPositive(form.maxWeight, 'Max Load Kg');
    const emptyDrumNetWeightKg = parseRequiredNonNegative(form.emptyDrumNetWeightKg, 'Empty Drum Net Weight Kg');
    const firstError = [flange, barrel, innerWidth, outerWidth, capacity, clearanceMm, maxWeight, emptyDrumNetWeightKg].find(
      (item) => item.ok === false
    );
    if (firstError && firstError.ok === false) {
      setFormError(firstError.message);
      return null;
    }
    if (
      flange.ok &&
      barrel.ok &&
      innerWidth.ok &&
      outerWidth.ok &&
      capacity.ok &&
      clearanceMm.ok &&
      maxWeight.ok &&
      emptyDrumNetWeightKg.ok
    ) {
      if (innerWidth.value > outerWidth.value) {
        setFormError('Inner Width cannot be greater than Outer Width.');
        return null;
      }
      if (barrel.value >= flange.value) {
        setFormError('Barrel cannot be greater than or equal to Flange.');
        return null;
      }
      const description =
        form.description.trim() ||
        buildDrumDescription(flange.value, barrel.value, innerWidth.value, outerWidth.value);
      return {
        id: `drm-${drumCode}`,
        drumCode,
        description,
        flange: flange.value,
        barrel: barrel.value,
        innerWidth: innerWidth.value,
        outerWidth: outerWidth.value,
        capacity: capacity.value,
        clearanceMm: clearanceMm.value,
        maxWeight: maxWeight.value,
        emptyDrumNetWeightKg: emptyDrumNetWeightKg.value,
        dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
        capacityUom: 'CONFIGURATION_REQUIRED',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return null;
  };

  const saveAdd = async () => {
    const payload = validateForm();
    if (!payload) return;
    setSaving(true);
    onError(null);
    const result = await createDrumViaApi(payload, jwtToken);
    setSaving(false);
    if (result.ok === false) {
      setFormError(result.error);
      return;
    }
    resetForm();
    await onReload();
  };

  const saveUpdate = async () => {
    const payload = validateForm();
    if (!payload) return;
    setSaving(true);
    onError(null);
    const result = await updateDrumViaApi(payload.drumCode, { ...payload, status: 'ACTIVE' }, jwtToken);
    setSaving(false);
    if (result.ok === false) {
      setFormError(result.error);
      return;
    }
    resetForm();
    await onReload();
  };

  const removeDrumByCode = async (drumCode: string, fromForm: boolean) => {
    const confirmed = window.confirm(
      `Delete or deactivate ${drumCode}? Referenced drums are deactivated. Unused drums may be deleted.`
    );
    if (!confirmed) return;
    setSaving(true);
    onError(null);
    const result = await deleteOrDeactivateDrumViaApi(drumCode, jwtToken);
    setSaving(false);
    if (result.ok === false) {
      if (fromForm) setFormError(result.error);
      else onError(result.error);
      return;
    }
    if (fromForm || form.drumCode === drumCode) resetForm();
    await onReload();
  };

  const removeDrum = async () => {
    const drumCode = form.drumCode.trim();
    if (!drumCode) return;
    await removeDrumByCode(drumCode, true);
  };

  const parseExcel = (file: File) => {
    setExcelName(file.name);
    setPreview(null);
    onError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!(data instanceof ArrayBuffer)) throw new Error('Could not read file.');
        const wb = XLSX.read(data, { type: 'array' });
        const preferred =
          wb.SheetNames.find((name) => name.trim().toLowerCase() === 'drum master template') || wb.SheetNames[0];
        const parsed = XLSX.utils.sheet_to_json(wb.Sheets[preferred], { defval: '' }) as Record<string, unknown>[];
        if (!parsed.length) {
          onError('The uploaded spreadsheet contains no data rows.');
          setExcelRows([]);
          return;
        }
        setExcelRows(parsed);
      } catch (err: any) {
        onError(err?.message || 'Failed to parse Drum Master file.');
        setExcelRows([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const runPreview = async () => {
    if (!excelRows.length) {
      onError('Upload the approved Drum Master template first.');
      return;
    }
    setExcelBusy(true);
    onError(null);
    const result = await previewDrumExcelViaApi(excelRows, jwtToken, excelName);
    setExcelBusy(false);
    if (result.ok === false) {
      setPreview(null);
      onError(result.error);
      return;
    }
    setPreview(result.preview);
  };

  const runCommit = async () => {
    if (!preview || !excelRows.length) return;
    if (preview.summary.newCount + preview.summary.updateCount === 0) {
      onError('There are no NEW or UPDATE rows to commit.');
      return;
    }
    const confirmed = window.confirm(
      `Approve Drum Master import? NEW ${preview.summary.newCount}, UPDATE ${preview.summary.updateCount}. ERROR rows will not be written.`
    );
    if (!confirmed) return;
    setExcelBusy(true);
    onError(null);
    const result = await commitDrumExcelViaApi(excelRows, jwtToken, excelName);
    setExcelBusy(false);
    if (result.ok === false) {
      onError(result.error);
      return;
    }
    setPreview(result.preview);
    await onReload();
  };

  const field = (key: keyof DrumFormState, label: string, required = true, readOnly = false) => (
    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
      {label}
      {required ? ' *' : ''}
      <input
        value={form[key]}
        readOnly={readOnly}
        onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
        className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold">Drum Master ({drums.length})</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search drum code or description"
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 min-w-[220px]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
            <button
              type="button"
              onClick={() => void downloadMasterExcel('drums', jwtToken || '', { q, status: statusFilter })}
              className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 flex items-center gap-1"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button
              type="button"
              onClick={startAdd}
              className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Drum
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          Complete Drum Master list. Suitability for a cable does not hide records. Excel uses the 10 approved template
          columns only.
        </p>

        {mode !== 'idle' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wide">
                {mode === 'add' ? 'Add Drum' : `Edit ${form.drumCode}`}
              </h4>
              <button type="button" onClick={resetForm} className="text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {field('drumCode', 'Drum Code', true, mode === 'edit')}
              {field('flange', 'Flange')}
              {field('barrel', 'Barrel')}
              {field('innerWidth', 'Inner Width')}
              {field('outerWidth', 'Outer Width')}
              {field('capacity', 'Capacity')}
              {field('clearanceMm', 'Clearance Mm')}
              {field('maxWeight', 'Max Load Kg')}
              {field('emptyDrumNetWeightKg', 'Empty Drum Net Weight Kg')}
              {field('description', 'Description', false)}
            </div>
            {formError ? <p className="text-xs font-bold text-red-600">{formError}</p> : null}
            <div className="flex flex-wrap gap-2">
              {mode === 'add' ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveAdd()}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white"
                >
                  Add Drum
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveUpdate()}
                    className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white"
                  >
                    Update Drum
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void removeDrum()}
                    className="px-3 py-2 text-xs font-bold rounded-xl border border-red-200 text-red-700"
                  >
                    Delete / Deactivate Drum
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={resetForm}
                className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
              <tr>
                <th className="p-2 text-left">Drum Code</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-right">Flange</th>
                <th className="p-2 text-right">Barrel</th>
                <th className="p-2 text-right">Inner Width</th>
                <th className="p-2 text-right">Outer Width</th>
                <th className="p-2 text-right">Capacity</th>
                <th className="p-2 text-right">Clearance</th>
                <th className="p-2 text-right">Max Load</th>
                <th className="p-2 text-right">Empty Drum Net Weight</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Last updated</th>
                <th className="p-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((drum) => (
                <tr key={drum.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2 font-mono font-bold">{drum.drumCode}</td>
                  <td className="p-2 text-slate-600 dark:text-slate-300">{resolveDrumDescription(drum)}</td>
                  <td className="p-2 text-right font-mono">{drum.flange}</td>
                  <td className="p-2 text-right font-mono">{drum.barrel}</td>
                  <td className="p-2 text-right font-mono">{drum.innerWidth}</td>
                  <td className="p-2 text-right font-mono">{drum.outerWidth}</td>
                  <td className="p-2 text-right font-mono">{drum.capacity}</td>
                  <td className="p-2 text-right font-mono">{drum.clearanceMm ?? '—'}</td>
                  <td className="p-2 text-right font-mono">{drum.maxWeight ?? '—'}</td>
                  <td className="p-2 text-right font-mono">{drum.emptyDrumNetWeightKg ?? '—'}</td>
                  <td className="p-2">{drum.status}</td>
                  <td className="p-2 whitespace-nowrap">{formatWhen(drum.updatedAt)}</td>
                  <td className="p-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-[10px] font-bold text-blue-700 mr-2 inline-flex items-center gap-1"
                      onClick={() => startEdit(drum)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-[10px] font-bold text-red-600 inline-flex items-center gap-1"
                      onClick={() => void removeDrumByCode(drum.drumCode, false)}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete/Deactivate
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={13} className="p-6 text-center text-slate-500">
                    No drums match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Excel import — approved 10-column template
        </h3>
        <p className="text-[11px] text-slate-500">
          Columns: {APPROVED_DRUM_TEMPLATE_HEADERS.join(', ')}. Preview classifies NEW / UPDATE / UNCHANGED / ERROR.
          Nothing is written until you approve. ERROR rows are skipped. Existing Drum Codes are updated, never
          duplicated.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) parseExcel(file);
            }}
          />
          <button
            type="button"
            disabled={excelBusy || excelRows.length === 0}
            onClick={() => void runPreview()}
            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200"
          >
            Preview
          </button>
          <button
            type="button"
            disabled={
              excelBusy || !preview || preview.summary.newCount + preview.summary.updateCount === 0
            }
            onClick={() => void runCommit()}
            className="px-3 py-2 text-xs font-bold rounded-xl bg-brand-600 text-white"
          >
            Approve import
          </button>
          {excelName ? <span className="text-[11px] text-slate-500">{excelName} · {excelRows.length} rows</span> : null}
        </div>
        {preview ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
              <div className="rounded-xl border border-slate-200 p-2">
                Total
                <div className="text-sm font-extrabold">{preview.summary.totalRows}</div>
              </div>
              <div className="rounded-xl border border-emerald-200 p-2">
                NEW
                <div className="text-sm font-extrabold text-emerald-700">{preview.summary.newCount}</div>
              </div>
              <div className="rounded-xl border border-amber-200 p-2">
                UPDATE
                <div className="text-sm font-extrabold text-amber-700">{preview.summary.updateCount}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-2">
                UNCHANGED
                <div className="text-sm font-extrabold">{preview.summary.unchangedCount}</div>
              </div>
              <div className="rounded-xl border border-red-200 p-2">
                ERROR
                <div className="text-sm font-extrabold text-red-700">{preview.summary.errorCount}</div>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[320px]">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Row</th>
                    <th className="p-2 text-left">Drum Code</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Changes / errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.drumCode}`} className="border-t border-slate-100">
                      <td className="p-2">{row.rowNumber}</td>
                      <td className="p-2 font-mono font-bold">{row.drumCode || '—'}</td>
                      <td className="p-2 font-bold">{row.status}</td>
                      <td className="p-2">
                        {row.status === 'UPDATE'
                          ? row.changes
                              .map((change) => `${change.field}: ${change.existing ?? '—'} → ${change.uploaded ?? '—'}`)
                              .join('; ')
                          : row.status === 'ERROR'
                            ? row.errors.map((issue) => issue.message).join('; ')
                            : row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
