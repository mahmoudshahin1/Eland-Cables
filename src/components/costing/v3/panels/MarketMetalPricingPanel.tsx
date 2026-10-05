import React, { useMemo, useState } from 'react';
import { Eye, Info, Lock, Pencil, Plus } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingCard,
  CostingDrawer,
  CostingEmptyState,
  CostingField,
  CostingInfoPanel,
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
import { costingApi } from '../costingV3Api';
import { CostingPanelProps } from './types';
import { MARKET_METAL_PRICE_UOM, MARKET_METAL_TYPES } from '../../../../domain/marketMetalPriceDefaults';

type DefaultRow = Record<string, unknown>;

const emptyDraft = {
  metalType: 'COPPER',
  priceRate: '',
  effectiveFrom: '',
  effectiveTo: '',
  status: 'DRAFT',
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

function pricingCategory(metal: string) {
  return metal === 'ALUMINIUM' ? 'MARKET_METAL_ALUMINIUM' : 'MARKET_METAL_COPPER';
}

function formatAuditTimestamp(value: unknown): string {
  if (!value) return '';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function lastUpdatedLabel(row: DefaultRow | undefined | null) {
  if (!row) return '';
  const when = formatAuditTimestamp(row.updatedAt || row.createdAt);
  if (!when) return '';
  const who = String(row.updatedBy || row.createdBy || '').trim() || 'System Configuration';
  return `${who} · ${when}`;
}

export const MarketMetalPricingPanel: React.FC<CostingPanelProps> = ({
  token,
  data,
  loading,
  refresh,
  setError,
}) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'add' | 'edit' | 'view'>('add');
  const [editing, setEditing] = useState<DefaultRow | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [filters, setFilters] = useState({ metalType: '', status: '' });

  const filtered = useMemo(() => {
    return data.marketMetalPriceDefaults.filter((row) => {
      if (filters.metalType && String(row.metalType) !== filters.metalType) return false;
      if (filters.status && String(row.status) !== filters.status) return false;
      return true;
    });
  }, [data.marketMetalPriceDefaults, filters]);

  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(filtered, 10);

  const activeByMetal = useMemo(() => {
    const pick = (metal: string) =>
      data.marketMetalPriceDefaults.find((row) => String(row.metalType) === metal && String(row.status) === 'ACTIVE');
    return { copper: pick('COPPER'), aluminium: pick('ALUMINIUM') };
  }, [data.marketMetalPriceDefaults]);

  const latestByMetal = useMemo(() => {
    const rowTime = (row: DefaultRow) => new Date(String(row.updatedAt || row.createdAt || 0)).getTime();
    const pick = (metal: string) => {
      const rows = data.marketMetalPriceDefaults.filter((row) => String(row.metalType) === metal);
      let latest: DefaultRow | undefined;
      for (const row of rows) {
        if (!latest || rowTime(row) >= rowTime(latest)) latest = row;
      }
      return latest;
    };
    return { copper: pick('COPPER'), aluminium: pick('ALUMINIUM') };
  }, [data.marketMetalPriceDefaults]);

  const openCreate = (metalType = 'COPPER') => {
    setEditing(null);
    setHistory([]);
    setMode('add');
    setDraft({
      ...emptyDraft,
      metalType,
      priceRate: metalType === 'COPPER' ? '14600' : '3300',
      effectiveFrom: new Date().toISOString().slice(0, 10),
    });
    setOpen(true);
  };

  const fillFromRow = (row: DefaultRow, nextMode: 'edit' | 'view') => {
    setEditing(row);
    setMode(nextMode);
    setDraft({
      metalType: String(row.metalType || 'COPPER'),
      priceRate: String(row.priceRate ?? ''),
      effectiveFrom: isoDate(row.effectiveFrom),
      effectiveTo: isoDate(row.effectiveTo),
      status: String(row.status || 'DRAFT'),
      notes: String(row.notes || ''),
    });
    setOpen(true);
  };

  const loadHistory = async (row: DefaultRow) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await costingApi(token, `/api/admin/costing/market-metal-price-defaults/${row.id}/audit`);
      setHistory((res.events as Record<string, unknown>[]) || []);
      fillFromRow(row, 'view');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load history');
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
        metalType: draft.metalType,
        priceRate: Number(draft.priceRate),
        priceUom: MARKET_METAL_PRICE_UOM,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo || null,
        status: mode === 'add' ? 'DRAFT' : draft.status,
        notes: draft.notes,
      };
      if (editing) {
        await costingApi(token, `/api/admin/costing/market-metal-price-defaults/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await costingApi(token, '/api/admin/costing/market-metal-price-defaults', {
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

  const runAction = async (row: DefaultRow, action: 'ACTIVATE' | 'DEACTIVATE') => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, `/api/admin/costing/market-metal-price-defaults/${row.id}/actions`, {
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

  const readOnly = mode === 'view';

  return (
    <>
      <CostingPageHeader
        title="Market Metal Pricing"
        breadcrumb="Costing > Market Metal Pricing"
        actions={
          <CostingBtn variant="primary" onClick={() => openCreate('COPPER')}>
            <Plus className="h-4 w-4" /> Add Default
          </CostingBtn>
        }
      />
      <p className="text-sm text-slate-600 -mt-2 mb-4">
        System defaults for Copper and Aluminium (USD/MT). Copied onto new inquiry headers only — existing
        inquiries and costing never re-read these values.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {(['COPPER', 'ALUMINIUM'] as const).map((metal) => {
          const active = metal === 'COPPER' ? activeByMetal.copper : activeByMetal.aluminium;
          const latest = metal === 'COPPER' ? latestByMetal.copper : latestByMetal.aluminium;
          const updated = lastUpdatedLabel(active || latest);
          return (
            <div key={metal}>
            <CostingCard>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metalLabel(metal)}</p>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">{pricingCategory(metal)}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {active ? `${Number(active.priceRate).toLocaleString()} ${MARKET_METAL_PRICE_UOM}` : '—'}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      <Lock className="h-3 w-3" /> Basis {MARKET_METAL_PRICE_UOM}
                    </span>
                    <CostingBadge tone={active ? 'success' : 'neutral'}>{active ? 'ACTIVE' : 'NONE'}</CostingBadge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {active
                      ? `Effective from ${isoDate(active.effectiveFrom)}${active.effectiveTo ? ` to ${isoDate(active.effectiveTo)}` : ''}`
                      : 'No active system default'}
                  </p>
                  {updated && <p className="text-[11px] text-slate-400 mt-0.5">Last updated: {updated}</p>}
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {active ? (
                    <CostingBtn onClick={() => fillFromRow(active, 'edit')}>Edit</CostingBtn>
                  ) : (
                    <CostingBtn variant="primary" onClick={() => openCreate(metal)}>
                      Set default
                    </CostingBtn>
                  )}
                </div>
              </div>
            </CostingCard>
            </div>
          );
        })}
      </div>

      <div className="mb-4">
        <CostingInfoPanel icon={<Info className="h-4 w-4 text-blue-600" />} title="Market Metal Price Rule">
          <ul className="list-disc pl-4 space-y-1">
            <li>
              These are <span className="font-semibold">system defaults</span> (USD/MT) for the LME/market metals
              Copper and Aluminium. Basis is locked to {MARKET_METAL_PRICE_UOM} and currency is always USD.
            </li>
            <li>
              On new inquiry creation, the ACTIVE default is copied onto the inquiry header and tagged{' '}
              <span className="font-semibold">SYSTEM_DEFAULT</span>. If a user enters a different rate on the inquiry,
              it is tagged <span className="font-semibold">INQUIRY_OVERRIDE</span> and costing uses the inquiry value.
            </li>
            <li>
              Changing a default here <span className="font-semibold">never</span> re-prices existing inquiries or
              historical costing runs — those keep their create-time snapshot.
            </li>
            <li>
              Metal <span className="font-semibold">consumption quantities always come from the BOM</span>; only the
              per-MT price is driven by these defaults / the inquiry header.
            </li>
          </ul>
        </CostingInfoPanel>
      </div>

      <CostingToolbar>
        <CostingLabeled label="Metal">
          <CostingSelect
            value={filters.metalType}
            onChange={(e) => setFilters({ ...filters, metalType: e.target.value })}
          >
            <option value="">All</option>
            {MARKET_METAL_TYPES.map((m) => (
              <option key={m} value={m}>
                {metalLabel(m)}
              </option>
            ))}
          </CostingSelect>
        </CostingLabeled>
        <CostingLabeled label="Status">
          <CostingSelect value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option>
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </CostingSelect>
        </CostingLabeled>
      </CostingToolbar>

      <CostingCard>
        {loading ? (
          <CostingTableSkeleton cols={6} rows={5} />
        ) : paged.length === 0 ? (
          <CostingEmptyState
            title="No market metal defaults"
            hint="Add Copper and Aluminium system defaults for new inquiries."
          />
        ) : (
          <>
            <CostingTable>
              <thead>
                <tr>
                  <CostingTh>Metal</CostingTh>
                  <CostingTh>Price</CostingTh>
                  <CostingTh>UOM</CostingTh>
                  <CostingTh>Effective</CostingTh>
                  <CostingTh>Status</CostingTh>
                  <CostingTh>Actions</CostingTh>
                </tr>
              </thead>
              <tbody>
                {paged.map((row) => (
                  <tr key={String(row.id)} className="hover:bg-slate-50">
                    <CostingTd>{metalLabel(String(row.metalType))}</CostingTd>
                    <CostingTd>{Number(row.priceRate).toLocaleString()}</CostingTd>
                    <CostingTd>{String(row.priceUom || MARKET_METAL_PRICE_UOM)}</CostingTd>
                    <CostingTd>
                      {isoDate(row.effectiveFrom)}
                      {row.effectiveTo ? ` → ${isoDate(row.effectiveTo)}` : ''}
                    </CostingTd>
                    <CostingTd>
                      <CostingBadge tone={statusToneLocal(String(row.status))}>{String(row.status)}</CostingBadge>
                    </CostingTd>
                    <CostingTd>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          className="text-slate-600 p-1 rounded hover:bg-slate-100"
                          onClick={() => fillFromRow(row, 'view')}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="text-blue-700 p-1 rounded hover:bg-blue-50"
                          onClick={() => fillFromRow(row, 'edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <CostingRowMenu
                          items={[
                            { label: 'Edit', onClick: () => fillFromRow(row, 'edit') },
                            {
                              label: String(row.status) === 'ACTIVE' ? 'Deactivate' : 'Activate',
                              onClick: () =>
                                void runAction(row, String(row.status) === 'ACTIVE' ? 'DEACTIVATE' : 'ACTIVATE'),
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
      </CostingCard>

      <CostingDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={mode === 'add' ? 'Add market metal default' : mode === 'edit' ? 'Edit default' : 'View default'}
        footer={
          mode === 'view' ? (
            <CostingBtn onClick={() => setOpen(false)}>Close</CostingBtn>
          ) : (
            <>
              <CostingBtn onClick={() => setOpen(false)}>Cancel</CostingBtn>
              <CostingBtn variant="primary" disabled={busy} onClick={() => void save()}>
                {busy ? 'Saving…' : 'Save'}
              </CostingBtn>
            </>
          )
        }
      >
        <div className="space-y-3">
          <CostingField label="Metal">
            <CostingSelect
              disabled={readOnly || Boolean(editing)}
              value={draft.metalType}
              onChange={(e) => setDraft({ ...draft, metalType: e.target.value })}
            >
              {MARKET_METAL_TYPES.map((m) => (
                <option key={m} value={m}>
                  {metalLabel(m)}
                </option>
              ))}
            </CostingSelect>
          </CostingField>
          <CostingField label={`Price (${MARKET_METAL_PRICE_UOM})`}>
            <CostingInput
              type="number"
              min="0"
              step="any"
              disabled={readOnly}
              value={draft.priceRate}
              placeholder={draft.metalType === 'COPPER' ? '14600' : '3300'}
              onChange={(e) => setDraft({ ...draft, priceRate: e.target.value })}
            />
          </CostingField>
          <CostingField label="Price UOM">
            <CostingInput value={MARKET_METAL_PRICE_UOM} disabled />
          </CostingField>
          <CostingField label="Effective From">
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
          {mode !== 'add' && (
            <CostingField label="Status">
              <CostingSelect
                disabled={readOnly}
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </CostingSelect>
            </CostingField>
          )}
          <CostingField label="Notes">
            <CostingInput
              disabled={readOnly}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </CostingField>
          {history.length > 0 && (
            <div className="pt-2 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-500 mb-2">Audit</p>
              <ul className="space-y-1 text-xs text-slate-600 max-h-40 overflow-auto">
                {history.map((ev) => (
                  <li key={String(ev.id)}>
                    {String(ev.action)} · {String(ev.at || '').slice(0, 19)} · {String(ev.actorName || '')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CostingDrawer>
    </>
  );
};
