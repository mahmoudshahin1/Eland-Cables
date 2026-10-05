import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingEmptyState,
  CostingField,
  CostingInput,
  CostingPageHeader,
  CostingPagination,
  CostingRowMenu,
  CostingSearchInput,
  CostingSelect,
  CostingSidePanel,
  CostingSplit,
  CostingTable,
  CostingTableSkeleton,
  CostingTd,
  CostingTh,
  CostingToolbar,
  pricingCategoryHint,
} from '../CostingUiPrimitives';
import { usePagedRows } from '../costingUiUtils';
import { costingApi, downloadCostingFile } from '../costingV3Api';
import { CostingPanelProps } from './types';

function pricingBadgeTone(cat: string): 'copper' | 'aluminium' | 'neutral' {
  if (cat === 'MARKET_METAL_COPPER') return 'copper';
  if (cat === 'MARKET_METAL_ALUMINIUM') return 'aluminium';
  return 'neutral';
}

function metalBadgeTone(metal: string): 'copper' | 'aluminium' | 'neutral' {
  if (metal === 'COPPER') return 'copper';
  if (metal === 'ALUMINIUM') return 'aluminium';
  return 'neutral';
}

function rmCode(row: Record<string, unknown>) {
  return String(row.rawMaterialCode || row.code || '');
}

const EMPTY_DRAFT = {
  code: '',
  description: '',
  shortDescription: '',
  category: 'METAL',
  uom: 'kg',
  pricingCategory: 'STANDARD_RAW_MATERIAL',
  metalType: 'NONE',
  notes: '',
  active: true,
};

export const RawMaterialsPanel: React.FC<CostingPanelProps> = ({
  token,
  data,
  loading,
  refresh,
  setError,
  intent,
  onIntentConsumed,
}) => {
  const [search, setSearch] = useState('');
  const [metalType, setMetalType] = useState('');
  const [pricingCategory, setPricingCategory] = useState('');
  const [active, setActive] = useState('');
  const [open, setOpen] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.rawMaterials.filter((r) => {
      if (metalType && String(r.metalType || 'NONE') !== metalType) return false;
      if (pricingCategory && String(r.pricingCategory || 'STANDARD_RAW_MATERIAL') !== pricingCategory) return false;
      if (active === 'Yes' && String(r.status) !== 'ACTIVE') return false;
      if (active === 'No' && String(r.status) === 'ACTIVE') return false;
      if (!q) return true;
      return [rmCode(r), r.description, r.pricingCategory].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [data.rawMaterials, search, metalType, pricingCategory, active]);

  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(rows);

  const openCreate = () => {
    setEditingCode(null);
    setDraft(EMPTY_DRAFT);
    setOpen(true);
  };

  const openEdit = (row: Record<string, unknown>) => {
    setEditingCode(rmCode(row));
    setDraft({
      code: rmCode(row),
      description: String(row.description || ''),
      shortDescription: String(row.shortDescription || ''),
      category: String(row.category || row.materialType || 'METAL'),
      uom: String(row.uom || 'kg'),
      pricingCategory: String(row.pricingCategory || 'STANDARD_RAW_MATERIAL'),
      metalType: String(row.metalType || 'NONE'),
      notes: String(row.notes || ''),
      active: String(row.status) !== 'INACTIVE',
    });
    setOpen(true);
  };

  const primed = React.useRef(false);
  useEffect(() => {
    if (intent?.action === 'add') {
      openCreate();
      onIntentConsumed?.();
    }
  }, [intent, onIntentConsumed]);

  useEffect(() => {
    if (primed.current || intent?.action === 'add') return;
    const first = data.rawMaterials[0];
    if (!first) return;
    primed.current = true;
    openEdit(first);
  }, [data.rawMaterials, intent?.action]);

  const save = async () => {
    if (!token || !draft.code) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        code: draft.code,
        description: draft.description || draft.code,
        shortDescription: draft.shortDescription || undefined,
        uom: draft.uom,
        category: draft.category,
        pricingCategory: draft.pricingCategory,
        metalType: draft.metalType,
        notes: draft.notes || undefined,
        status: draft.active ? 'ACTIVE' : 'INACTIVE',
      };
      if (editingCode) {
        await costingApi(token, `/api/master/raw-materials/${encodeURIComponent(editingCode)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await costingApi(token, '/api/master/raw-materials', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (row: Record<string, unknown>) => {
    if (!token) return;
    const code = rmCode(row);
    const next = String(row.status) === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setBusy(true);
    try {
      await costingApi(token, `/api/master/raw-materials/${encodeURIComponent(code)}`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CostingPageHeader title="Raw Material Master" breadcrumb="Costing > Raw Material Master" />
      <CostingSplit
        table={
        <div className="w-full">
          <CostingToolbar
            actions={
              <>
                <CostingBtn onClick={() => void downloadCostingFile(token, '/api/admin/costing/bulk-import/template/raw_materials', 'Raw_Material_Master.xlsx')}>
                  Export
                </CostingBtn>
                <CostingBtn variant="primary" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Add Raw Material
                </CostingBtn>
              </>
            }
          >
            <CostingSearchInput value={search} onChange={setSearch} placeholder="Search by code or description..." />
            <CostingSelect value={metalType} onChange={(e) => setMetalType(e.target.value)} className="w-40">
              <option value="">Metal Type: All</option>
              {['COPPER', 'ALUMINIUM', 'NONE'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </CostingSelect>
            <CostingSelect value={pricingCategory} onChange={(e) => setPricingCategory(e.target.value)} className="w-56">
              <option value="">Pricing Category: All</option>
              {['MARKET_METAL_COPPER', 'MARKET_METAL_ALUMINIUM', 'STANDARD_RAW_MATERIAL'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </CostingSelect>
            <CostingSelect value={active} onChange={(e) => setActive(e.target.value)} className="w-36">
              <option value="">Active: All</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </CostingSelect>
          </CostingToolbar>
          {loading ? (
            <CostingTableSkeleton cols={8} />
          ) : total === 0 ? (
            <CostingEmptyState title="No raw materials match your filters" />
          ) : (
            <>
              <CostingTable>
                <thead>
                  <tr>
                    <CostingTh>Code</CostingTh>
                    <CostingTh>Description</CostingTh>
                    <CostingTh>Material Type</CostingTh>
                    <CostingTh>UOM</CostingTh>
                    <CostingTh>Pricing Category</CostingTh>
                    <CostingTh>Metal Type</CostingTh>
                    <CostingTh>Active</CostingTh>
                    <CostingTh>Actions</CostingTh>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => {
                    const cat = String(r.pricingCategory || 'STANDARD_RAW_MATERIAL');
                    const metal = String(r.metalType || 'NONE');
                    const code = rmCode(r);
                    return (
                      <tr key={code} className={editingCode === code ? 'bg-blue-50/60' : 'hover:bg-slate-50'}>
                        <CostingTd className="font-mono font-semibold">{code}</CostingTd>
                        <CostingTd>{String(r.description)}</CostingTd>
                        <CostingTd>{String(r.category || r.materialType || '—')}</CostingTd>
                        <CostingTd>{String(r.uom)}</CostingTd>
                        <CostingTd>
                          <CostingBadge tone={pricingBadgeTone(cat)}>{cat}</CostingBadge>
                        </CostingTd>
                        <CostingTd>
                          <CostingBadge tone={metalBadgeTone(metal)}>{metal}</CostingBadge>
                        </CostingTd>
                        <CostingTd>{String(r.status) === 'ACTIVE' ? 'Yes' : 'No'}</CostingTd>
                        <CostingTd>
                          <div className="flex items-center gap-1">
                            <button type="button" className="p-1 text-blue-700 rounded hover:bg-blue-50" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <CostingRowMenu
                              items={[
                                { label: 'Edit', onClick: () => openEdit(r) },
                                {
                                  label: String(r.status) === 'ACTIVE' ? 'Deactivate' : 'Activate',
                                  onClick: () => void deactivate(r),
                                },
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
        }
        panel={
        <CostingSidePanel
          title="Add / Edit Raw Material"
          open={open}
          onClose={() => setOpen(true)}
          footer={
            <>
              <CostingBtn onClick={() => { setDraft(editingCode ? draft : EMPTY_DRAFT); }}>Cancel</CostingBtn>
              <CostingBtn variant="primary" onClick={() => void save()} disabled={busy}>
                Save
              </CostingBtn>
            </>
          }
        >
          <CostingField label="Raw Material Code" required>
            <CostingInput
              value={draft.code}
              disabled={Boolean(editingCode)}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
            />
          </CostingField>
          <CostingField label="Description" required>
            <CostingInput value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </CostingField>
          <CostingField label="Short Description">
            <CostingInput value={draft.shortDescription} onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })} />
          </CostingField>
          <CostingField label="Material Type" required>
            <CostingSelect value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {['METAL', 'COMPOUND', 'PACKING', 'OTHER'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </CostingSelect>
          </CostingField>
          <CostingField label="UOM" required>
            <CostingSelect value={draft.uom} onChange={(e) => setDraft({ ...draft, uom: e.target.value })}>
              {['kg', 'MT', 'm', 'pcs'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </CostingSelect>
          </CostingField>
          <CostingField label="Pricing Category" required>
            <CostingSelect
              value={draft.pricingCategory}
              onChange={(e) => {
                const pc = e.target.value;
                const nextMetal = pc === 'MARKET_METAL_COPPER' ? 'COPPER' : pc === 'MARKET_METAL_ALUMINIUM' ? 'ALUMINIUM' : 'NONE';
                setDraft({ ...draft, pricingCategory: pc, metalType: nextMetal });
              }}
            >
              {['STANDARD_RAW_MATERIAL', 'MARKET_METAL_COPPER', 'MARKET_METAL_ALUMINIUM'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </CostingSelect>
            {pricingCategoryHint(draft.pricingCategory)}
          </CostingField>
          <CostingField label="Metal Type" required>
            <CostingSelect value={draft.metalType} onChange={(e) => setDraft({ ...draft, metalType: e.target.value })}>
              {['NONE', 'COPPER', 'ALUMINIUM'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </CostingSelect>
          </CostingField>
          <CostingField label="Active">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Active
            </label>
          </CostingField>
          <CostingField label="Notes">
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[72px]"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </CostingField>
        </CostingSidePanel>
        }
      />
    </>
  );
};
