import React, { useEffect, useMemo, useState } from 'react';
import { Eye, History, Pencil, Plus, Upload } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingCard,
  CostingDrawer,
  CostingEmptyState,
  CostingField,
  CostingInput,
  CostingLabeled,
  CostingPageHeader,
  CostingPagination,
  CostingRowMenu,
  CostingSelect,
  CostingTable,
  CostingTableSkeleton,
  CostingTd,
  CostingTh,
  CostingToolbar,
} from '../CostingUiPrimitives';
import { usePagedRows } from '../costingUiUtils';
import { costingApi, downloadCostingFile } from '../costingV3Api';
import { CostingPanelProps } from './types';
import {
  METAL_COST_COMPONENT_TYPES,
  METAL_COST_METALS,
  METAL_COST_PRICE_BASES,
  METAL_COST_STATUSES,
} from '../../../../domain/metalCostComponents';

type ComponentRow = Record<string, unknown>;

const emptyDraft = {
  metal: 'COPPER',
  componentType: 'PREMIUM',
  value: '',
  currencyCode: 'USD',
  priceBasis: 'MT',
  effectiveFrom: '',
  effectiveTo: '',
  status: 'DRAFT',
  reference: '',
  notes: '',
};

function isoDate(value: unknown) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function statusToneLocal(status: string): 'success' | 'info' | 'danger' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'DRAFT') return 'info';
  if (status === 'INACTIVE') return 'danger';
  return 'neutral';
}

function metalLabel(metal: string) {
  return metal === 'ALUMINIUM' ? 'Aluminium' : metal === 'COPPER' ? 'Copper' : metal;
}

function basisLabel(basis: string) {
  if (basis === 'FIXED_AMOUNT') return 'Fixed Amount';
  if (basis === 'PERCENTAGE') return 'Percentage';
  return basis;
}

export const MetalCostComponentsPanel: React.FC<CostingPanelProps> = ({
  token,
  data,
  loading,
  refresh,
  setError,
  onNavigate,
  intent,
  onIntentConsumed,
}) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'edit' | 'view'>('add');
  const [editing, setEditing] = useState<ComponentRow | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [filters, setFilters] = useState({
    metal: '',
    componentType: '',
    currency: '',
    priceBasis: '',
    status: '',
    effectiveDate: '',
  });

  const currencies = useMemo(
    () => data.currencies.filter((c) => String(c.status || 'ACTIVE') === 'ACTIVE'),
    [data.currencies]
  );

  useEffect(() => {
    if (intent?.action === 'add') {
      openCreate();
      onIntentConsumed?.();
    }
  }, [intent, onIntentConsumed]);

  const filtered = useMemo(() => {
    return data.metalCostComponents.filter((row) => {
      if (filters.metal && String(row.metal) !== filters.metal) return false;
      if (filters.componentType && String(row.componentType) !== filters.componentType) return false;
      if (filters.currency && String(row.currencyCode || '') !== filters.currency) return false;
      if (filters.priceBasis && String(row.priceBasis) !== filters.priceBasis) return false;
      if (filters.status && String(row.status) !== filters.status) return false;
      if (filters.effectiveDate) {
        const day = filters.effectiveDate;
        const from = isoDate(row.effectiveFrom);
        const to = isoDate(row.effectiveTo) || '9999-12-31';
        if (day < from || day > to) return false;
      }
      return true;
    });
  }, [data.metalCostComponents, filters]);

  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(filtered, 10);

  const openCreate = () => {
    setEditing(null);
    setHistory([]);
    setMode('add');
    setDraft({
      ...emptyDraft,
      currencyCode: String(currencies.find((c) => String(c.code) === 'USD')?.code || currencies[0]?.code || 'USD'),
    });
    setOpen(true);
  };

  const fillFromRow = (row: ComponentRow, nextMode: 'edit' | 'view') => {
    setEditing(row);
    setMode(nextMode);
    setDraft({
      metal: String(row.metal || 'COPPER'),
      componentType: String(row.componentType || 'PREMIUM'),
      value: String(row.value ?? ''),
      currencyCode: String(row.currencyCode || ''),
      priceBasis: String(row.priceBasis || 'MT'),
      effectiveFrom: isoDate(row.effectiveFrom),
      effectiveTo: isoDate(row.effectiveTo),
      status: String(row.status || 'DRAFT'),
      reference: String(row.reference || ''),
      notes: String(row.notes || ''),
    });
    setOpen(true);
  };

  const loadHistory = async (row: ComponentRow) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await costingApi(token, `/api/admin/costing/metal-cost-components/${row.id}/audit`);
      setHistory((res.events as Record<string, unknown>[]) || []);
      fillFromRow(row, 'view');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load history');
      onNavigate('audit', { auditEntity: String(row.id) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        metal: draft.metal,
        componentType: draft.componentType,
        value: Number(draft.value),
        currency: draft.currencyCode,
        priceBasis: draft.priceBasis,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo || null,
        status: mode === 'add' ? 'DRAFT' : draft.status,
        reference: draft.reference,
        notes: draft.notes,
      };
      if (editing) {
        await costingApi(token, `/api/admin/costing/metal-cost-components/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await costingApi(token, '/api/admin/costing/metal-cost-components', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (row: ComponentRow, action: 'ACTIVATE' | 'DEACTIVATE') => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, `/api/admin/costing/metal-cost-components/${row.id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const uploadBulk = async (file: File) => {
    if (!token) return;
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    setBusy(true);
    setError(null);
    try {
      const preview = await costingApi(token, '/api/admin/costing/bulk-import/preview', {
        method: 'POST',
        body: JSON.stringify({ kind: 'metal_cost_components', rows, sourceFile: file.name }),
      });
      const batch = preview.batch as { errorCount?: number };
      if (Number(batch?.errorCount) > 0) {
        setError('Bulk validate found errors. Open Bulk Data Management to review, or fix the file.');
        return;
      }
      await costingApi(token, '/api/admin/costing/bulk-import/commit', {
        method: 'POST',
        body: JSON.stringify({ kind: 'metal_cost_components', rows, sourceFile: file.name }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk upload failed');
    } finally {
      setBusy(false);
    }
  };

  const readOnly = mode === 'view';

  return (
    <>
      <CostingPageHeader
        title="Metal Cost Components"
        breadcrumb="Costing > Metal Cost Components"
        actions={
          <CostingBtn variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Cost Component
          </CostingBtn>
        }
      />
      <p className="text-sm text-slate-600 -mt-2 mb-4">
        Maintain Premium, Shipping and Clearance values for future landed-cost calculation.
      </p>

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-900">Current Costing Mode: Option B — LME/Base Only</p>
          <p className="text-sm text-amber-800">
            Premium / Shipping / Clearance are currently not included in Direct Raw Material Cost.
          </p>
        </div>
        <CostingBadge tone="warning">Not included — Option B</CostingBadge>
      </div>

      <CostingToolbar>
        <CostingLabeled label="Metal">
          <CostingSelect value={filters.metal} onChange={(e) => setFilters({ ...filters, metal: e.target.value })}>
            <option value="">All</option>
            {METAL_COST_METALS.map((m) => (
              <option key={m} value={m}>
                {metalLabel(m)}
              </option>
            ))}
          </CostingSelect>
        </CostingLabeled>
        <CostingLabeled label="Component Type">
          <CostingSelect
            value={filters.componentType}
            onChange={(e) => setFilters({ ...filters, componentType: e.target.value })}
          >
            <option value="">All</option>
            {METAL_COST_COMPONENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </CostingSelect>
        </CostingLabeled>
        <CostingLabeled label="Currency">
          <CostingSelect value={filters.currency} onChange={(e) => setFilters({ ...filters, currency: e.target.value })}>
            <option value="">All</option>
            {currencies.map((c) => (
              <option key={String(c.code)} value={String(c.code)}>
                {String(c.code)}
              </option>
            ))}
          </CostingSelect>
        </CostingLabeled>
        <CostingLabeled label="Price Basis">
          <CostingSelect
            value={filters.priceBasis}
            onChange={(e) => setFilters({ ...filters, priceBasis: e.target.value })}
          >
            <option value="">All</option>
            {METAL_COST_PRICE_BASES.map((b) => (
              <option key={b} value={b}>
                {basisLabel(b)}
              </option>
            ))}
          </CostingSelect>
        </CostingLabeled>
        <CostingLabeled label="Status">
          <CostingSelect value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option>
            {METAL_COST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </CostingSelect>
        </CostingLabeled>
        <CostingLabeled label="Effective Date">
          <CostingInput
            type="date"
            value={filters.effectiveDate}
            onChange={(e) => setFilters({ ...filters, effectiveDate: e.target.value })}
          />
        </CostingLabeled>
      </CostingToolbar>

      {loading ? (
        <CostingTableSkeleton cols={9} />
      ) : total === 0 ? (
        <CostingEmptyState title="No metal cost components" hint="Add a component or adjust filters. Values do not affect current costing." />
      ) : (
        <>
          <CostingTable>
            <thead>
              <tr>
                <CostingTh>Metal</CostingTh>
                <CostingTh>Component</CostingTh>
                <CostingTh>Value</CostingTh>
                <CostingTh>Currency</CostingTh>
                <CostingTh>Basis</CostingTh>
                <CostingTh>Effective From</CostingTh>
                <CostingTh>Effective To</CostingTh>
                <CostingTh>Status</CostingTh>
                <CostingTh>Actions</CostingTh>
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => (
                <tr key={String(row.id)} className="hover:bg-slate-50">
                  <CostingTd>{metalLabel(String(row.metal))}</CostingTd>
                  <CostingTd>{String(row.componentType).charAt(0) + String(row.componentType).slice(1).toLowerCase()}</CostingTd>
                  <CostingTd>{Number(row.value).toFixed(2)}</CostingTd>
                  <CostingTd>{String(row.currencyCode || '')}</CostingTd>
                  <CostingTd>{basisLabel(String(row.priceBasis))}</CostingTd>
                  <CostingTd>{isoDate(row.effectiveFrom) || '—'}</CostingTd>
                  <CostingTd>{isoDate(row.effectiveTo) || '—'}</CostingTd>
                  <CostingTd>
                    <CostingBadge tone={statusToneLocal(String(row.status))}>
                      {String(row.status).charAt(0) + String(row.status).slice(1).toLowerCase()}
                    </CostingBadge>
                  </CostingTd>
                  <CostingTd>
                    <div className="flex items-center gap-1">
                      <button type="button" className="text-slate-600 p-1 rounded hover:bg-slate-100" onClick={() => fillFromRow(row, 'view')}>
                        <Eye className="h-4 w-4" />
                      </button>
                      <button type="button" className="text-blue-700 p-1 rounded hover:bg-blue-50" onClick={() => fillFromRow(row, 'edit')}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <CostingRowMenu
                        items={[
                          { label: 'Edit', onClick: () => fillFromRow(row, 'edit') },
                          {
                            label: String(row.status) === 'ACTIVE' ? 'Deactivate' : 'Activate',
                            onClick: () => void runAction(row, String(row.status) === 'ACTIVE' ? 'DEACTIVATE' : 'ACTIVATE'),
                          },
                          { label: 'View History', onClick: () => void loadHistory(row) },
                        ]}
                      />
                    </div>
                  </CostingTd>
                </tr>
              ))}
            </tbody>
          </CostingTable>
          <CostingPagination page={page} pageCount={pageCount} total={total} from={from} to={to} onPage={setPage} />
        </>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mt-6">
        <CostingCard title="How It Works (Current Mode: Option B)">
          <p className="text-sm font-semibold text-slate-800 mb-2">Current Direct RM Cost = Base/LME Metal Cost + Standard RM Cost</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {['Premium', 'Shipping', 'Clearance'].map((label) => (
              <span key={label} className="text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                {label}: Not included — Option B
              </span>
            ))}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-semibold">Future (When Option A is selected)</p>
            <p>Landed Metal Price = Base/LME + Premium + Shipping + Clearance</p>
            <p className="text-xs mt-1">This formula is not wired into the costing engine yet.</p>
          </div>
          <ul className="mt-3 text-xs text-slate-600 list-disc pl-4 space-y-1">
            <li>These values currently do not affect Direct RM Cost.</li>
            <li>Direct RM Cost remains Consumption × Applied Price.</li>
            <li>Copper / Aluminium still come from the inquiry header USD/MT.</li>
          </ul>
        </CostingCard>

        <CostingCard
          title="Bulk Data Management"
          subtitle="Template → Upload → Validate → Preview → Apply. Uploads enter Draft and are never auto-approved."
        >
          <div className="flex flex-wrap gap-2 mb-3 text-[11px] font-semibold text-slate-500">
            {['Template', 'Upload', 'Validate', 'Preview', 'Apply'].map((step, i) => (
              <span key={step} className="inline-flex items-center gap-1">
                <span className="h-5 w-5 rounded-full bg-slate-100 text-slate-700 inline-flex items-center justify-center">{i + 1}</span>
                {step}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <CostingBtn
              onClick={() =>
                void downloadCostingFile(
                  token,
                  '/api/admin/costing/bulk-import/template/metal_cost_components',
                  'Metal_Cost_Components.xlsx'
                )
              }
            >
              Download Template
            </CostingBtn>
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold cursor-pointer hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              Choose File
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void uploadBulk(e.target.files[0])}
              />
            </label>
            <CostingBtn onClick={() => onNavigate('bulk_import', { bulkKind: 'metal_cost_components' })}>
              Open full bulk wizard
            </CostingBtn>
          </div>
        </CostingCard>
      </div>

      <CostingDrawer
        title={mode === 'add' ? 'Add Cost Component' : mode === 'edit' ? 'Edit Cost Component' : 'View Cost Component'}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <>
            <CostingBtn onClick={() => setOpen(false)}>Cancel</CostingBtn>
            {mode !== 'view' && (
              <CostingBtn variant="primary" disabled={busy} onClick={() => void save()}>
                Save
              </CostingBtn>
            )}
          </>
        }
      >
        <CostingField label="Metal" required>
          <CostingSelect
            disabled={readOnly}
            value={draft.metal}
            onChange={(e) => setDraft({ ...draft, metal: e.target.value })}
          >
            {METAL_COST_METALS.map((m) => (
              <option key={m} value={m}>
                {metalLabel(m)}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
        <CostingField label="Component Type" required>
          <CostingSelect
            disabled={readOnly}
            value={draft.componentType}
            onChange={(e) => setDraft({ ...draft, componentType: e.target.value })}
          >
            {METAL_COST_COMPONENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
        <CostingField label="Value" required>
          <CostingInput
            type="number"
            min={0}
            step="0.01"
            disabled={readOnly}
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
        </CostingField>
        <CostingField label="Currency" required>
          <CostingSelect
            disabled={readOnly}
            value={draft.currencyCode}
            onChange={(e) => setDraft({ ...draft, currencyCode: e.target.value })}
          >
            {currencies.map((c) => (
              <option key={String(c.code)} value={String(c.code)}>
                {String(c.code)}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
        <CostingField label="Price Basis" required>
          <CostingSelect
            disabled={readOnly}
            value={draft.priceBasis}
            onChange={(e) => setDraft({ ...draft, priceBasis: e.target.value })}
          >
            <option value="KG">KG (Per Kilogram)</option>
            <option value="MT">MT (Per Metric Ton)</option>
            <option value="FIXED_AMOUNT">Fixed Amount</option>
            <option value="PERCENTAGE">Percentage</option>
          </CostingSelect>
        </CostingField>
        <CostingField label="Effective From" required>
          <CostingInput
            type="date"
            disabled={readOnly}
            value={draft.effectiveFrom}
            onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })}
          />
        </CostingField>
        <CostingField label="Effective To">
          <CostingInput
            type="date"
            disabled={readOnly}
            value={draft.effectiveTo}
            onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value })}
          />
        </CostingField>
        <CostingField label="Status">
          <CostingSelect
            disabled={readOnly || mode === 'add'}
            value={mode === 'add' ? 'DRAFT' : draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
          >
            {METAL_COST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
        <CostingField label="Reference">
          <CostingInput
            disabled={readOnly}
            value={draft.reference}
            onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
          />
        </CostingField>
        <CostingField label="Notes">
          <textarea
            disabled={readOnly}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            rows={3}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </CostingField>
        <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-100">
          <p>
            <strong>Premium</strong> — metal premium over LME/base. <strong>Shipping</strong> — freight. <strong>Clearance</strong> — customs/clearance.
          </p>
          <p>Supported Price Basis: KG, MT, Fixed Amount, Percentage (stored as entered; no silent conversion).</p>
        </div>
        {history.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-semibold text-slate-700 mb-1 inline-flex items-center gap-1">
              <History className="h-3.5 w-3.5" /> History
            </p>
            <ul className="text-xs text-slate-600 space-y-1">
              {history.map((event) => (
                <li key={String(event.id)}>
                  {String(event.action)} · {event.at ? new Date(String(event.at)).toLocaleString() : ''} · {String(event.actorName || '')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CostingDrawer>
    </>
  );
};
