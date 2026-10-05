import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pencil, Plus } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingEmptyState,
  CostingField,
  CostingInput,
  CostingOptionBBanner,
  CostingPageHeader,
  CostingPagination,
  CostingRowMenu,
  CostingSearchInput,
  CostingSelect,
  CostingSidePanel,
  CostingTable,
  CostingTableSkeleton,
  CostingTd,
  CostingTh,
  statusTone,
} from '../CostingUiPrimitives';
import { pendingApprovalIds, summarizeBulkApprove, usePagedRows } from '../costingUiUtils';
import { costingApi, downloadCostingFile } from '../costingV3Api';
import { CostingPanelProps } from './types';
import { equivalentPricePerKg, formatCanonicalUom, canonicalizePriceUom } from '../../../../domain/priceUom';

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600 shrink-0">
      <span className="whitespace-nowrap">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white text-slate-800 min-w-[88px]"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDash(value?: string | null) {
  return value ? value.slice(0, 10) : '--';
}

export const RawMaterialPricesPanel: React.FC<CostingPanelProps> = ({
  token,
  data,
  loading,
  refresh,
  setError,
  intent,
  onIntentConsumed,
}) => {
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('');
  const [approval, setApproval] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    rawMaterialCode: '',
    price: '',
    currency: 'USD',
    uom: 'MT',
    effectiveFrom: '',
    effectiveTo: '',
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.rmPrices.filter((p) => {
      if (currency && String(p.currency) !== currency) return false;
      if (approval && String(p.workflowStatus) !== approval) return false;
      if (status && String(p.status) !== status) return false;
      if (!q) return true;
      return String(p.rawMaterialCode || '').toLowerCase().includes(q);
    });
  }, [data.rmPrices, search, currency, approval, status]);

  const rmDesc = useMemo(() => {
    const m = new Map<string, string>();
    data.rawMaterials.forEach((r) => m.set(String(r.rawMaterialCode || r.code), String(r.description || '')));
    return m;
  }, [data.rawMaterials]);

  const openEdit = (p: Record<string, unknown>) => {
    setDraft({
      rawMaterialCode: String(p.rawMaterialCode || ''),
      price: p.price != null ? String(p.price) : '',
      currency: String(p.currency || 'USD'),
      uom: String(p.uom || 'MT'),
      effectiveFrom: p.effectiveFrom ? String(p.effectiveFrom).slice(0, 10) : '',
      effectiveTo: p.effectiveTo ? String(p.effectiveTo).slice(0, 10) : '',
    });
    setOpen(true);
  };

  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(rows);
  const pendingIds = useMemo(() => pendingApprovalIds(rows), [rows]);

  useEffect(() => {
    if (intent?.action === 'add') {
      setOpen(true);
      onIntentConsumed?.();
    }
  }, [intent, onIntentConsumed]);

  const approve = async (id: string, workflowStatus?: string) => {
    if (!token) return;
    setBusy(true);
    try {
      if (workflowStatus === 'DRAFT') {
        await costingApi(token, `/api/admin/costing/raw-material-prices/${id}/actions`, {
          method: 'POST',
          body: JSON.stringify({ action: 'SUBMIT' }),
        });
      }
      await costingApi(token, `/api/admin/costing/raw-material-prices/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action: 'APPROVE' }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const approveAll = async () => {
    if (!token || pendingIds.length === 0) return;
    if (
      !window.confirm(
        `Approve ${pendingIds.length} submitted price${pendingIds.length === 1 ? '' : 's'} on the current list? Draft, rejected, and already approved rows are not changed.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = (await costingApi(token, '/api/admin/costing/raw-material-prices/bulk-approve', {
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

  const save = async () => {
    if (!token || !draft.rawMaterialCode) return;
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, '/api/admin/costing/raw-material-prices', {
        method: 'POST',
        body: JSON.stringify({
          rawMaterialCode: draft.rawMaterialCode,
          price: draft.price ? Number(draft.price) : null,
          currency: draft.currency,
          uom: draft.uom,
          priceBasis:
            draft.uom === 'MT' || draft.uom === 'ton'
              ? 'PER_TON'
              : draft.uom === 'PCS'
                ? 'PER_PCS'
                : draft.uom === 'M'
                  ? 'PER_METER'
                  : 'PER_KG',
          effectiveFrom: draft.effectiveFrom || null,
          effectiveTo: draft.effectiveTo || null,
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

  const equivalent = equivalentPricePerKg(draft.price ? Number(draft.price) : null, draft.uom, draft.currency);

  return (
    <>
      <CostingPageHeader title="Raw Material Prices" breadcrumb="Costing > Raw Material Prices" />
      <CostingOptionBBanner className="mb-4" />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <CostingSearchInput value={search} onChange={setSearch} placeholder="Search by material code..." />
        <FilterSelect label="Currency" value={currency} onChange={setCurrency} options={['USD', 'EUR', 'LE', 'EGP', 'GBP', 'SAR']} />
        <FilterSelect
          label="Approval Status"
          value={approval}
          onChange={setApproval}
          options={['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']}
        />
        <CostingBtn onClick={() => void approveAll()} disabled={busy || pendingIds.length === 0}>
          <CheckCircle2 className="h-4 w-4" /> Approve all{pendingIds.length ? ` (${pendingIds.length})` : ''}
        </CostingBtn>
        <FilterSelect label="Status" value={status} onChange={setStatus} options={['ACTIVE', 'INACTIVE', 'EXPIRED']} />
        <div className="flex items-center gap-2 ml-auto">
          <CostingBtn onClick={() => void downloadCostingFile(token, '/api/master/raw-material-prices-export', 'Raw_Material_Prices.xlsx')}>
            Export
          </CostingBtn>
          <CostingBtn variant="primary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Price
          </CostingBtn>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full">
      {loading ? (
        <CostingTableSkeleton cols={10} />
      ) : total === 0 ? (
        <CostingEmptyState title="No raw material prices found" />
      ) : (
        <>
          <CostingTable>
            <thead>
              <tr>
                <CostingTh>Raw Material Code</CostingTh>
                <CostingTh>Description</CostingTh>
                <CostingTh>Currency</CostingTh>
                <CostingTh>Unit Price</CostingTh>
                <CostingTh>UOM</CostingTh>
                <CostingTh>Effective From</CostingTh>
                <CostingTh>Effective To</CostingTh>
                <CostingTh>Status</CostingTh>
                <CostingTh>Approval Status</CostingTh>
                <CostingTh>Actions</CostingTh>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => {
                const code = String(p.rawMaterialCode);
                const canonical = canonicalizePriceUom(String(p.uom || ''));
                return (
                  <tr key={String(p.id)} className="hover:bg-slate-50">
                    <CostingTd className="font-mono text-slate-900">{code}</CostingTd>
                    <CostingTd>{rmDesc.get(code) || String(p.rawMaterialDesc || '--')}</CostingTd>
                    <CostingTd>{String(p.currency || '--')}</CostingTd>
                    <CostingTd>{p.price != null ? Number(p.price).toFixed(2) : '--'}</CostingTd>
                    <CostingTd>{canonical ? formatCanonicalUom(canonical) : String(p.uom || '--')}</CostingTd>
                    <CostingTd>{formatDash(p.effectiveFrom ? String(p.effectiveFrom) : null)}</CostingTd>
                    <CostingTd>{formatDash(p.effectiveTo ? String(p.effectiveTo) : null)}</CostingTd>
                    <CostingTd>
                      <CostingBadge tone={statusTone(String(p.status))}>{String(p.status)}</CostingBadge>
                    </CostingTd>
                    <CostingTd>
                      <CostingBadge tone={statusTone(String(p.workflowStatus))}>{String(p.workflowStatus)}</CostingBadge>
                    </CostingTd>
                    <CostingTd>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          className="p-1 text-[#0052CC] rounded hover:bg-blue-50"
                          onClick={() => openEdit(p)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <CostingRowMenu
                          items={[
                            { label: 'Edit', onClick() { openEdit(p); } },
                            ...(String(p.workflowStatus) !== 'APPROVED'
                              ? [{ label: 'Submit / Approve', onClick: () => void approve(String(p.id), String(p.workflowStatus)) }]
                              : []),
                          ]}
                        />
                      </div>
                    </CostingTd>
                  </tr>
                );
              })}
            </tbody>
          </CostingTable>
          <CostingPagination page={page} pageCount={pageCount} total={total} from={from} to={to} onPage={setPage} />
        </>
      )}
        </div>
      <CostingSidePanel
        title="Add / Edit Raw Material Price"
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
        <CostingField label="Raw Material Code" required>
          <CostingInput
            value={draft.rawMaterialCode}
            onChange={(e) => setDraft({ ...draft, rawMaterialCode: e.target.value.toUpperCase() })}
          />
        </CostingField>
        <CostingField label="Unit Price">
          <CostingInput value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
        </CostingField>
        <CostingField label="Currency" required>
          <CostingSelect value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
            {['USD', 'EUR', 'LE', 'EGP'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
        <CostingField label="UOM" required>
          <CostingSelect value={draft.uom} onChange={(e) => setDraft({ ...draft, uom: e.target.value })}>
            <option value="kg">kg</option>
            <option value="MT">MT</option>
            <option value="PCS">PCS</option>
            <option value="m">m</option>
          </CostingSelect>
        </CostingField>
        {equivalent && (
          <p className="text-sm text-slate-600">
            Equivalent Cost <span className="font-semibold text-slate-900">{equivalent.label}</span>
          </p>
        )}
        <CostingField label="Effective From">
          <CostingInput type="date" value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} />
        </CostingField>
        <CostingField label="Effective To">
          <CostingInput type="date" value={draft.effectiveTo} onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value })} />
        </CostingField>
      </CostingSidePanel>
      </div>
    </>
  );
};
