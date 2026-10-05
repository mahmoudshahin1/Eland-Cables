import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pencil, Plus } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingEmptyState,
  CostingField,
  CostingInput,
  CostingLabeled,
  CostingPageHeader,
  CostingPagination,
  CostingRowMenu,
  CostingSelect,
  CostingSidePanel,
  CostingSplit,
  CostingTable,
  CostingTableSkeleton,
  CostingTd,
  CostingTh,
  CostingToolbar,
  statusTone,
} from '../CostingUiPrimitives';
import { pendingApprovalIds, summarizeBulkApprove, usePagedRows } from '../costingUiUtils';
import { costingApi, downloadCostingFile } from '../costingV3Api';
import { CostingPanelProps } from './types';

export const ExchangeRatesPanel: React.FC<CostingPanelProps> = ({
  token,
  data,
  loading,
  refresh,
  setError,
  intent,
  onIntentConsumed,
}) => {
  const [currency, setCurrency] = useState('');
  const [status, setStatus] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    fromCurrency: 'USD',
    toCurrency: 'EGP',
    rate: '',
    effectiveFrom: '',
    effectiveTo: '',
    name: '',
    sourceReference: 'Daily rate',
  });

  useEffect(() => {
    if (intent?.action === 'add') {
      setOpen(true);
      onIntentConsumed?.();
    }
  }, [intent, onIntentConsumed]);

  const baseCode = useMemo(() => {
    const base = data.currencies.find((c) => c.isBaseCurrency);
    return String(base?.code || 'EGP');
  }, [data.currencies]);

  const currencyCodes = useMemo(
    () => Array.from(new Set(data.currencies.map((c) => String(c.code)).filter(Boolean))),
    [data.currencies]
  );

  const filtered = useMemo(() => {
    return data.exchangeRates.filter((r) => {
      if (currency && String(r.fromCurrency) !== currency && String(r.toCurrency) !== currency) return false;
      if (status && String(r.workflowStatus) !== status) return false;
      const from = r.effectiveFrom ? String(r.effectiveFrom).slice(0, 10) : '';
      const to = r.effectiveTo ? String(r.effectiveTo).slice(0, 10) : '';
      if (effectiveFrom && from && from < effectiveFrom) return false;
      if (effectiveTo && to && to > effectiveTo) return false;
      return true;
    });
  }, [data.exchangeRates, currency, status, effectiveFrom, effectiveTo]);

  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(filtered);
  const pendingIds = useMemo(() => pendingApprovalIds(filtered, ['SUBMITTED']), [filtered]);

  const openEdit = (r: Record<string, unknown>) => {
    setDraft({
      fromCurrency: String(r.fromCurrency || 'USD'),
      toCurrency: String(r.toCurrency || baseCode),
      rate: String(r.rate ?? ''),
      effectiveFrom: r.effectiveFrom ? String(r.effectiveFrom).slice(0, 10) : '',
      effectiveTo: r.effectiveTo ? String(r.effectiveTo).slice(0, 10) : '',
      name: String(r.name || ''),
      sourceReference: String(r.sourceReference || r.name || ''),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!token || !draft.rate) return;
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, '/api/admin/costing/exchange-rates', {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name || `${draft.fromCurrency} → ${draft.toCurrency}`,
          fromCurrency: draft.fromCurrency,
          toCurrency: draft.toCurrency,
          rate: Number(draft.rate),
          effectiveFrom: draft.effectiveFrom || null,
          effectiveTo: draft.effectiveTo || null,
          sourceReference: draft.sourceReference || undefined,
        }),
      });
      setOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const approveAll = async () => {
    if (!token || pendingIds.length === 0) return;
    if (
      !window.confirm(
        `Approve ${pendingIds.length} submitted exchange rate${pendingIds.length === 1 ? '' : 's'} on the current list? Only SUBMITTED rows are approved.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = (await costingApi(token, '/api/admin/costing/exchange-rates/bulk-approve', {
        method: 'POST',
        body: JSON.stringify({ ids: pendingIds }),
      })) as { approvedCount: number; skippedCount: number; failedCount: number; failed?: Array<{ error: string }> };
      await refresh();
      if (result.failedCount || result.skippedCount) setError(summarizeBulkApprove(result));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve all failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CostingPageHeader title="Exchange Rates" breadcrumb="Costing Configuration > Exchange Rates" />
      <CostingSplit
        table={
          <div className="w-full">
            <CostingToolbar
              actions={
                <>
                  <CostingBtn onClick={() => void downloadCostingFile(token, '/api/admin/costing/bulk-import/template/exchange_rates', 'Exchange_Rates_Template.xlsx')}>
                    Export
                  </CostingBtn>
                  <CostingBtn variant="primary" onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" /> Add Rate
                  </CostingBtn>
                </>
              }
            >
              <CostingLabeled label="Currency">
                <CostingSelect value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-36">
                  <option value="">All</option>
                  {currencyCodes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </CostingSelect>
              </CostingLabeled>
              <CostingLabeled label="Effective From">
                <div className="flex items-center gap-1">
                  <CostingInput type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="w-36" />
                  <span className="text-slate-400">–</span>
                  <CostingInput type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className="w-36" />
                </div>
              </CostingLabeled>
              <CostingLabeled label="Status">
                <CostingSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
                  <option value="">All</option>
                  {['DRAFT', 'SUBMITTED', 'APPROVED', 'ACTIVE', 'INACTIVE'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </CostingSelect>
              </CostingLabeled>
              <CostingBtn onClick={() => void approveAll()} disabled={busy || pendingIds.length === 0}>
                <CheckCircle2 className="h-4 w-4" /> Approve all{pendingIds.length ? ` (${pendingIds.length})` : ''}
              </CostingBtn>
            </CostingToolbar>

            {loading ? (
              <CostingTableSkeleton cols={7} />
            ) : total === 0 ? (
              <CostingEmptyState title="No exchange rates found" />
            ) : (
              <>
                <CostingTable>
                  <thead>
                    <tr>
                      <CostingTh>Currency</CostingTh>
                      <CostingTh>Rate to Base ({baseCode})</CostingTh>
                      <CostingTh>Effective From</CostingTh>
                      <CostingTh>Effective To</CostingTh>
                      <CostingTh>Status</CostingTh>
                      <CostingTh>Notes</CostingTh>
                      <CostingTh>Actions</CostingTh>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => (
                      <tr key={String(r.id)} className="hover:bg-slate-50">
                        <CostingTd className="font-mono font-semibold">{String(r.fromCurrency)}</CostingTd>
                        <CostingTd className="text-right font-semibold">
                          {r.rate != null ? Number(r.rate).toFixed(4) : '—'}
                        </CostingTd>
                        <CostingTd>{r.effectiveFrom ? String(r.effectiveFrom).slice(0, 10) : '—'}</CostingTd>
                        <CostingTd>{r.effectiveTo ? String(r.effectiveTo).slice(0, 10) : '—'}</CostingTd>
                        <CostingTd>
                          <CostingBadge tone={statusTone(String(r.workflowStatus))}>{String(r.workflowStatus)}</CostingBadge>
                        </CostingTd>
                        <CostingTd className="text-xs text-slate-500">{String(r.sourceReference || r.name || '—')}</CostingTd>
                        <CostingTd>
                          <div className="flex items-center gap-1">
                            <button type="button" className="p-1 text-blue-700 rounded hover:bg-blue-50" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <CostingRowMenu items={[{ label: 'Edit', onClick: () => openEdit(r) }]} />
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
            title="Add / Edit Exchange Rate"
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
            <CostingField label="From Currency" required>
              <CostingSelect value={draft.fromCurrency} onChange={(e) => setDraft({ ...draft, fromCurrency: e.target.value })}>
                {currencyCodes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </CostingSelect>
            </CostingField>
            <CostingField label="To Currency" required>
              <CostingSelect value={draft.toCurrency} onChange={(e) => setDraft({ ...draft, toCurrency: e.target.value })}>
                {currencyCodes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </CostingSelect>
            </CostingField>
            <CostingField label={`Rate to Base (${baseCode})`} required>
              <CostingInput value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
            </CostingField>
            <CostingField label="Effective From">
              <CostingInput type="date" value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} />
            </CostingField>
            <CostingField label="Effective To">
              <CostingInput type="date" value={draft.effectiveTo} onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value })} />
            </CostingField>
            <CostingField label="Notes">
              <CostingInput value={draft.sourceReference} onChange={(e) => setDraft({ ...draft, sourceReference: e.target.value })} />
            </CostingField>
          </CostingSidePanel>
        }
      />
    </>
  );
};
