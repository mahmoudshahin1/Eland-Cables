import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingSidePanel,
  CostingSplit,
  CostingEmptyState,
  CostingField,
  CostingInput,
  CostingPageHeader,
  CostingPagination,
  CostingRowMenu,
  CostingSearchInput,
  CostingSelect,
  CostingTable,
  CostingTableSkeleton,
  CostingTd,
  CostingTh,
  CostingToolbar,
  statusTone,
} from '../CostingUiPrimitives';
import { usePagedRows } from '../costingUiUtils';
import { costingApi } from '../costingV3Api';
import { CostingPanelProps } from './types';
import { normalizeCostingCurrency } from '../../../../domain/currencyConversion';

type CurrencyRow = Record<string, unknown>;

export const CurrenciesPanel: React.FC<CostingPanelProps> = ({
  token,
  data,
  loading,
  refresh,
  setError,
  onNavigate,
  intent,
  onIntentConsumed,
}) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CurrencyRow | null>(null);
  const [draft, setDraft] = useState({
    code: '',
    name: '',
    symbol: '',
    isBaseCurrency: false,
    decimalPlaces: 2,
    notes: '',
    status: 'ACTIVE',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (intent?.action === 'add') {
      setEditing(null);
      setDraft({ code: '', name: '', symbol: '', isBaseCurrency: false, decimalPlaces: 2, notes: '', status: 'ACTIVE' });
      setOpen(true);
      onIntentConsumed?.();
    }
  }, [intent, onIntentConsumed]);

  const currencies = useMemo(() => {
    const seen = new Set<string>();
    return data.currencies.filter((c) => {
      const key = normalizeCostingCurrency(String(c.code || '')) || String(c.code || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data.currencies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currencies;
    return currencies.filter((c) =>
      [c.code, c.name, c.symbol].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [currencies, search]);

  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(filtered);

  const openCreate = () => {
    setEditing(null);
    setDraft({ code: '', name: '', symbol: '', isBaseCurrency: false, decimalPlaces: 2, notes: '', status: 'ACTIVE' });
    setOpen(true);
  };

  const openEdit = (row: CurrencyRow) => {
    setEditing(row);
    setDraft({
      code: String(row.code || ''),
      name: String(row.name || ''),
      symbol: String(row.symbol || ''),
      isBaseCurrency: Boolean(row.isBaseCurrency),
      decimalPlaces: Number(row.decimalPlaces ?? 2),
      notes: String(row.notes || ''),
      status: String(row.status || 'ACTIVE'),
    });
    setOpen(true);
  };

  const toggleActive = async (row: CurrencyRow) => {
    if (!token) return;
    const next = String(row.status) === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, `/api/admin/costing/currencies/${encodeURIComponent(String(row.code))}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const removeCurrency = async (row: CurrencyRow) => {
    if (!token) return;
    const code = String(row.code || '');
    if (row.isBaseCurrency) {
      setError('The base currency cannot be deleted.');
      return;
    }
    if (!window.confirm(`Delete currency ${code}? This is only allowed if it is not used anywhere.`)) return;
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, `/api/admin/costing/currencies/${encodeURIComponent(code)}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action: 'DELETE' }),
      });
      if (editing && String(editing.code) === code) setOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!token || !draft.code || !draft.name) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await costingApi(token, `/api/admin/costing/currencies/${encodeURIComponent(draft.code)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: draft.name,
            symbol: draft.symbol,
            isBaseCurrency: draft.isBaseCurrency,
            decimalPlaces: draft.decimalPlaces,
            notes: draft.notes,
            status: draft.status,
          }),
        });
      } else {
        await costingApi(token, '/api/admin/costing/currencies', {
          method: 'POST',
          body: JSON.stringify(draft),
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

  return (
    <>
      <CostingPageHeader title="Currencies" breadcrumb="Costing Configuration > Currencies" />
      <CostingSplit
        table={
          <div className="w-full">
      <CostingToolbar
        actions={
          <>
            <CostingBtn>Export</CostingBtn>
            <CostingBtn variant="primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Currency
            </CostingBtn>
          </>
        }
      >
        <CostingSearchInput value={search} onChange={setSearch} placeholder="Search currency…" />
      </CostingToolbar>

      {loading ? (
        <CostingTableSkeleton cols={9} />
      ) : total === 0 ? (
        <CostingEmptyState title="No currencies found" hint="Add a currency or adjust your search." />
      ) : (
        <>
          <CostingTable>
            <thead>
              <tr>
                <CostingTh>Code</CostingTh>
                <CostingTh>Name</CostingTh>
                <CostingTh>Symbol</CostingTh>
                <CostingTh>Base Currency</CostingTh>
                <CostingTh>Decimal Places</CostingTh>
                <CostingTh>Active</CostingTh>
                <CostingTh>Current Rate</CostingTh>
                <CostingTh>Effective From</CostingTh>
                <CostingTh>Actions</CostingTh>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr key={String(c.code)} className="hover:bg-slate-50">
                  <CostingTd className="font-mono font-semibold">{String(c.code)}</CostingTd>
                  <CostingTd>{String(c.name)}</CostingTd>
                  <CostingTd>{String(c.symbol || '—')}</CostingTd>
                  <CostingTd>{c.isBaseCurrency ? 'Yes' : '—'}</CostingTd>
                  <CostingTd>{String(c.decimalPlaces ?? 2)}</CostingTd>
                  <CostingTd>
                    <CostingBadge tone={statusTone(String(c.status))}>{String(c.status || '—')}</CostingBadge>
                  </CostingTd>
                  <CostingTd>{c.currentExchangeRate != null ? String(c.currentExchangeRate) : '—'}</CostingTd>
                  <CostingTd>
                    {c.currentRateEffectiveFrom ? String(c.currentRateEffectiveFrom).slice(0, 10) : '—'}
                  </CostingTd>
                  <CostingTd>
                    <div className="flex items-center gap-1">
                      <button type="button" className="text-blue-700 p-1 rounded hover:bg-blue-50" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="text-red-600 p-1 rounded hover:bg-red-50 disabled:opacity-40"
                        disabled={busy || Boolean(c.isBaseCurrency)}
                        title={c.isBaseCurrency ? 'Base currency cannot be deleted' : 'Delete unused currency'}
                        onClick={() => void removeCurrency(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <CostingRowMenu
                        items={[
                          { label: 'Edit', onClick: () => openEdit(c) },
                          {
                            label: String(c.status) === 'ACTIVE' ? 'Deactivate' : 'Activate',
                            onClick: () => void toggleActive(c),
                          },
                          {
                            label: 'Delete',
                            danger: true,
                            onClick: () => void removeCurrency(c),
                          },
                          {
                            label: 'View History',
                            onClick: () => onNavigate('audit', { auditEntity: String(c.code) }),
                          },
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
          </div>
        }
        panel={
      <CostingSidePanel
        title={editing ? 'Edit Currency' : 'Add Currency'}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <>
            <CostingBtn onClick={() => setOpen(false)}>Cancel</CostingBtn>
            <CostingBtn variant="primary" onClick={() => void save()} disabled={busy}>
              Save
            </CostingBtn>
          </>
        }
      >
        <CostingField label="Currency Code" required>
          <CostingInput value={draft.code} disabled={Boolean(editing)} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
        </CostingField>
        <CostingField label="Currency Name" required>
          <CostingInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </CostingField>
        <CostingField label="Symbol">
          <CostingInput value={draft.symbol} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} />
        </CostingField>
        <CostingField label="Base Currency">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.isBaseCurrency} onChange={(e) => setDraft({ ...draft, isBaseCurrency: e.target.checked })} />
            Set as base currency
          </label>
        </CostingField>
        <CostingField label="Decimal Places">
          <CostingInput type="number" value={draft.decimalPlaces} onChange={(e) => setDraft({ ...draft, decimalPlaces: Number(e.target.value) })} />
        </CostingField>
        {editing && (
          <CostingField label="Active">
            <CostingSelect value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </CostingSelect>
          </CostingField>
        )}
        <CostingField label="Notes">
          <CostingInput value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </CostingField>
      </CostingSidePanel>
        }
      />
    </>
  );
};
