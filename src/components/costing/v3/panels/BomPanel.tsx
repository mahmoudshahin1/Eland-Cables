import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingEmptyState,
  CostingField,
  CostingInput,
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
import { usePagedRows } from '../costingUiUtils';
import { costingApi, downloadCostingFile } from '../costingV3Api';
import { CostingPanelProps } from './types';

const EMPTY_DRAFT = {
  cableMaterialNumber: '',
  rawMaterial: '',
  consumption: '',
  uom: 'kg / km',
  scrapPercent: '',
  effectiveFrom: '',
  active: true,
};

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

export const BomPanel: React.FC<CostingPanelProps> = ({
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
  const [family, setFamily] = useState('');
  const [approval, setApproval] = useState('');
  const [active, setActive] = useState('');
  const [open, setOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const rmMap = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    data.rawMaterials.forEach((r) => m.set(String(r.rawMaterialCode || r.code), r));
    return m;
  }, [data.rawMaterials]);

  const families = useMemo(
    () => Array.from(new Set(data.boms.map((b) => String(b.family || b.cableFamily || '')).filter(Boolean))).sort(),
    [data.boms]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.boms.filter((b) => {
      if (family && String(b.family || b.cableFamily || '') !== family) return false;
      if (approval && String(b.workflowStatus || b.status) !== approval) return false;
      if (active && String(b.status) !== active) return false;
      if (!q) return true;
      const rm = rmMap.get(String(b.rawMaterial));
      return [b.cableMaterialNumber, b.rawMaterial, rm?.description].some((v) =>
        String(v || '').toLowerCase().includes(q)
      );
    });
  }, [data.boms, search, family, approval, active, rmMap]);

  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(filtered);

  const openCreate = () => {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setOpen(true);
  };

  const openEdit = (b: Record<string, unknown>) => {
    setSelectedId(String(b.id));
    setDraft({
      cableMaterialNumber: String(b.cableMaterialNumber || ''),
      rawMaterial: String(b.rawMaterial || ''),
      consumption: String(b.weight ?? b.consumption ?? ''),
      uom: String(b.unitKm || b.uom || 'kg / km'),
      scrapPercent: b.scrapPercent != null ? String(Number(b.scrapPercent).toFixed(2)) : '',
      effectiveFrom: b.effectiveFrom ? String(b.effectiveFrom).slice(0, 10) : '',
      active: String(b.status) !== 'INACTIVE',
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
    const first = data.boms[0];
    if (!first) return;
    primed.current = true;
    openEdit(first);
  }, [data.boms, intent?.action]);

  const saveLine = async () => {
    if (!token) return;
    if (!draft.cableMaterialNumber.trim() || !draft.rawMaterial || !draft.consumption) {
      setError('Cable, raw material and consumption are required.');
      return;
    }
    setError(null);
    try {
      const sibling = data.boms.find((b) => String(b.cableMaterialNumber) === draft.cableMaterialNumber.trim());
      await costingApi(token, '/api/admin/costing/bulk-import/commit', {
        method: 'POST',
        body: JSON.stringify({
          kind: 'boms',
          sourceFile: 'ui-bom-line.xlsx',
          rows: [
            {
              'Customer Code': String(sibling?.customerCode || ''),
              'Item Code': String(sibling?.itemCode || ''),
              'Cable Material Number': draft.cableMaterialNumber.trim(),
              'Raw Material Code': draft.rawMaterial,
              Consumption: Number(draft.consumption),
              UOM: draft.uom,
              'Scrap %': draft.scrapPercent === '' ? '' : Number(draft.scrapPercent),
              'Effective From': draft.effectiveFrom,
              Active: draft.active ? 'Yes' : 'No',
            },
          ],
        }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'BOM line save failed');
    }
  };

  return (
    <>
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-slate-900">BOM / Cable Materials</h1>
        <p className="text-[13px] text-slate-500 mt-1">Costing Configuration &gt; BOM / Cable Materials</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <CostingSearchInput value={search} onChange={setSearch} placeholder="Search cable or material..." />
        <FilterSelect label="Family" value={family} onChange={setFamily} options={families} />
        <FilterSelect
          label="Approval Status"
          value={approval}
          onChange={setApproval}
          options={['DRAFT', 'SUBMITTED', 'APPROVED', 'ACTIVE']}
        />
        <FilterSelect label="Active" value={active} onChange={setActive} options={['ACTIVE', 'INACTIVE']} />
        <div className="flex items-center gap-2 ml-auto">
          <CostingBtn
            onClick={() =>
              void downloadCostingFile(token, '/api/admin/costing/bulk-import/template/boms', 'Cable_BOM.xlsx')
            }
          >
            Export
          </CostingBtn>
          <CostingBtn variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add BOM Line
          </CostingBtn>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 w-full">
          {loading ? (
            <CostingTableSkeleton cols={10} />
          ) : total === 0 ? (
            <CostingEmptyState title="No BOM lines match your filters" />
          ) : (
            <>
              <CostingTable>
                <thead>
                  <tr>
                    <CostingTh>Cable Material No.</CostingTh>
                    <CostingTh>Raw Material Code</CostingTh>
                    <CostingTh>Raw Material Description</CostingTh>
                    <CostingTh>Consumption</CostingTh>
                    <CostingTh>UOM</CostingTh>
                    <CostingTh>Scrap %</CostingTh>
                    <CostingTh>Effective From</CostingTh>
                    <CostingTh>Status</CostingTh>
                    <CostingTh>Approval Status</CostingTh>
                    <CostingTh>Actions</CostingTh>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((b) => {
                    const rm = rmMap.get(String(b.rawMaterial));
                    const id = String(b.id);
                    return (
                      <tr key={id} className={selectedId === id ? 'bg-blue-50/60' : 'hover:bg-slate-50'}>
                        <CostingTd className="font-mono">{String(b.cableMaterialNumber)}</CostingTd>
                        <CostingTd className="font-mono">{String(b.rawMaterial)}</CostingTd>
                        <CostingTd>{rm ? String(rm.description || '--') : '--'}</CostingTd>
                        <CostingTd>{b.weight != null ? Number(b.weight).toFixed(2) : '--'}</CostingTd>
                        <CostingTd>{String(b.unitKm || b.uom || 'kg / km')}</CostingTd>
                        <CostingTd>{b.scrapPercent != null ? Number(b.scrapPercent).toFixed(2) : '0.00'}</CostingTd>
                        <CostingTd>{b.effectiveFrom ? String(b.effectiveFrom).slice(0, 10) : '--'}</CostingTd>
                        <CostingTd>
                          <CostingBadge tone={statusTone(String(b.status))}>{String(b.status)}</CostingBadge>
                        </CostingTd>
                        <CostingTd>
                          <CostingBadge tone={statusTone(String(b.workflowStatus || b.status))}>
                            {String(b.workflowStatus || b.status)}
                          </CostingBadge>
                        </CostingTd>
                        <CostingTd>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              className="p-1 text-[#0052CC] rounded hover:bg-blue-50"
                              onClick={() => openEdit(b)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <CostingRowMenu
                              items={[
                                { label: 'Edit', onClick: () => openEdit(b) },
                                {
                                  label: 'Bulk Data Management',
                                  onClick: () => onNavigate('bulk_import', { bulkKind: 'boms' }),
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

        <CostingSidePanel
          title="Add / Edit BOM Line"
          open={open}
          onClose={() => setOpen(false)}
          footer={
            <>
              <CostingBtn onClick={() => setOpen(false)}>Cancel</CostingBtn>
              <CostingBtn variant="primary" onClick={() => void saveLine()}>
                Save
              </CostingBtn>
            </>
          }
        >
          <CostingField label="Cable Material No." required>
            <CostingInput
              value={draft.cableMaterialNumber}
              onChange={(e) => setDraft({ ...draft, cableMaterialNumber: e.target.value })}
            />
          </CostingField>
          <CostingField label="Raw Material" required>
            <CostingSelect value={draft.rawMaterial} onChange={(e) => setDraft({ ...draft, rawMaterial: e.target.value })}>
              <option value="">Select raw material…</option>
              {data.rawMaterials.map((r) => {
                const code = String(r.rawMaterialCode || r.code);
                return (
                  <option key={code} value={code}>
                    {code} - {String(r.description)}
                  </option>
                );
              })}
            </CostingSelect>
          </CostingField>
          <CostingField label="Consumption" required>
            <CostingInput value={draft.consumption} onChange={(e) => setDraft({ ...draft, consumption: e.target.value })} />
          </CostingField>
          <CostingField label="UOM" required>
            <CostingSelect value={draft.uom} onChange={(e) => setDraft({ ...draft, uom: e.target.value })}>
              <option value="kg / km">kg / km</option>
              <option value="kg">kg</option>
              <option value="PCS">PCS</option>
            </CostingSelect>
          </CostingField>
          <CostingField label="Scrap %">
            <CostingInput value={draft.scrapPercent} onChange={(e) => setDraft({ ...draft, scrapPercent: e.target.value })} />
          </CostingField>
          <CostingField label="Effective From" required>
            <CostingInput type="date" value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} />
          </CostingField>
          <CostingField label="Active">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
          </CostingField>
        </CostingSidePanel>
      </div>
    </>
  );
};
