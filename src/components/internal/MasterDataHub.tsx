import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Cable,
  CheckCircle2,
  Coins,
  Layers3,
  Search,
  ShieldAlert,
  Ship,
} from 'lucide-react';
import { WoodenDrumIcon } from '../common/WoodenDrumIcon';
import { useAuth } from '../../context/AuthContext';
import { computeMasterDataQuality } from '../../services/masterDataQualityService';
import { DrumMasterAdminPanel } from './DrumMasterAdminPanel';
import { CustomerMasterAdminPanel } from './CustomerMasterAdminPanel';
import {
  deactivateRawMaterialViaApi,
  downloadMasterExcel,
  fetchMasterBoms,
  fetchMasterCables,
  fetchMasterDrums,
  fetchMasterImportHistory,
  fetchMasterRawMaterials,
  localMasterSnapshots,
  mirrorMasterDataToLocalStorage,
  resolveMasterListPreferringPostgres,
} from '../../services/masterDataApiService';
import { MasterDataImport } from './MasterDataImport';
import { MarketMetalImportPanel } from './MarketMetalImportPanel';
import { ShippingCostMasterPanel } from './ShippingCostMasterPanel';
import { MasterDataReadinessPanel } from './MasterDataReadinessPanel';
import { CableMasterAttachmentsButton } from './CableMasterAttachmentsPanel';
import { canEditLineTechnicalAttachments } from '../../domain/inquiryLineAttachments';
import {
  CableBomRawMaterial,
  DrumMasterRecord,
  ImportBatchRecord,
  MasterCableCatalogItem,
  RawMaterialMasterRecord,
} from '../../types';
import { DashboardStatCard } from '../common/DashboardStatCard';

type HubTab = 'quality' | 'readiness' | 'customers' | 'cables' | 'boms' | 'raw' | 'drums' | 'import' | 'metals' | 'shipping';

function useMasterTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const evts = [
      'cableCatalogUpdated',
      'cableBomsUpdated',
      'drumMasterUpdated',
      'rawMaterialsUpdated',
      'importBatchesUpdated',
    ];
    evts.forEach((e) => window.addEventListener(e, bump));
    return () => evts.forEach((e) => window.removeEventListener(e, bump));
  }, []);
  return tick;
}

function FilterBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative max-w-md">
      <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      />
    </div>
  );
}

function qualityKpiIcon(key: string) {
  const k = key.toLowerCase();
  if (k.includes('drum')) return WoodenDrumIcon;
  if (k.includes('cable')) return Cable;
  if (k.includes('bom')) return Layers3;
  if (k.includes('raw') || k.includes('material')) return Layers3;
  if (k.includes('price') || k.includes('costing')) return Coins;
  if (k.includes('invalid') || k.includes('missing')) return AlertTriangle;
  return ShieldAlert;
}

export const MasterDataHub: React.FC = () => {
  const { jwtToken, currentUser } = useAuth();
  const canEditCableAttachments = canEditLineTechnicalAttachments({
    userType: currentUser?.userType,
    permissions: currentUser?.permissions,
  });
  const tick = useMasterTick();
  const [tab, setTab] = useState<HubTab>('quality');
  const [q, setQ] = useState('');
  const [cables, setCables] = useState<MasterCableCatalogItem[]>([]);
  const [boms, setBoms] = useState<CableBomRawMaterial[]>([]);
  const [drums, setDrums] = useState<DrumMasterRecord[]>([]);
  const [rms, setRms] = useState<RawMaterialMasterRecord[]>([]);
  const [batches, setBatches] = useState<ImportBatchRecord[]>([]);
  const [dataSource, setDataSource] = useState<'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK'>('LOCALSTORAGE_FALLBACK');
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const local = localMasterSnapshots();
    if (!jwtToken) {
      setCables(local.cables);
      setBoms(local.boms);
      setDrums(local.drums);
      setRms(local.rawMaterials);
      setBatches(local.importBatches);
      setDataSource('LOCALSTORAGE_FALLBACK');
      return;
    }
    const [cRes, bRes, dRes, rRes, iRes] = await Promise.all([
      fetchMasterCables(jwtToken),
      fetchMasterBoms(jwtToken),
      fetchMasterDrums(jwtToken),
      fetchMasterRawMaterials(jwtToken),
      fetchMasterImportHistory(jwtToken),
    ]);
    const c = resolveMasterListPreferringPostgres(cRes, local.cables);
    const b = resolveMasterListPreferringPostgres(bRes, local.boms);
    const d = resolveMasterListPreferringPostgres(dRes, local.drums);
    const r = resolveMasterListPreferringPostgres(rRes, local.rawMaterials);
    const i = resolveMasterListPreferringPostgres(iRes, local.importBatches);
    setCables(c.data);
    setBoms(b.data);
    setDrums(d.data);
    setRms(r.data);
    setBatches(i.data);
    const anyPg =
      c.source === 'POSTGRESQL' ||
      b.source === 'POSTGRESQL' ||
      d.source === 'POSTGRESQL' ||
      r.source === 'POSTGRESQL';
    setDataSource(anyPg ? 'POSTGRESQL' : 'LOCALSTORAGE_FALLBACK');
    if (cRes.ok) mirrorMasterDataToLocalStorage({ cables: cRes.data });
    if (bRes.ok) mirrorMasterDataToLocalStorage({ boms: bRes.data });
    if (dRes.ok) mirrorMasterDataToLocalStorage({ drums: dRes.data });
    if (rRes.ok) mirrorMasterDataToLocalStorage({ rawMaterials: rRes.data });
  }, [jwtToken]);

  useEffect(() => {
    void reload();
  }, [reload, tick]);

  const quality = useMemo(
    () => computeMasterDataQuality({ cables, boms, drums, rawMaterials: rms }),
    [cables, boms, drums, rms]
  );

  const onDeactivateRm = async (code: string) => {
    setActionError(null);
    const result = await deactivateRawMaterialViaApi(code, jwtToken);
    if (result.ok === false) {
      setActionError(result.error);
      return;
    }
    await reload();
  };

  const tabs: { id: HubTab; label: string; icon: React.ElementType }[] = [
    { id: 'quality', label: 'Data Quality', icon: ShieldAlert },
    { id: 'readiness', label: 'Readiness', icon: AlertTriangle },
    { id: 'customers', label: 'Customers', icon: Building2 },
    { id: 'cables', label: 'Cable Master', icon: Cable },
    { id: 'boms', label: 'Cable BOM', icon: Layers3 },
    { id: 'raw', label: 'Raw Materials', icon: Layers3 },
    { id: 'drums', label: 'Drum Master', icon: WoodenDrumIcon },
    { id: 'import', label: 'Import Center', icon: CheckCircle2 },
    { id: 'metals', label: 'LME Prices', icon: Coins },
    { id: 'shipping', label: 'Shipping Cost', icon: Ship },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700">
        <span className="text-[10px] font-bold uppercase tracking-widest bg-white/10 px-2 py-1 rounded">
          Task 04A — PostgreSQL primary (localStorage mirror only; full SoT = Task 04B)
        </span>
        <h1 className="text-2xl font-extrabold mt-2">Cable, BOM, Raw Material & Drum Masters</h1>
        <p className="text-xs text-slate-300 mt-1">
          Official ENERGYA extracts import through the Import Center into PostgreSQL. Hub grids and quality KPIs read
          PostgreSQL when signed in. Stale browser copies never override a successful API response (including empty
          lists). Degraded localStorage fallback is non-authoritative. Source:{' '}
          <span className="font-bold text-white">{dataSource}</span>.
        </p>
        {actionError ? <p className="text-xs text-amber-200 mt-2 font-bold">{actionError}</p> : null}
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setQ('');
            }}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
              tab === t.id ? 'bg-white dark:bg-slate-900 text-blue-700 shadow' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'import' && <MasterDataImport />}
      {tab === 'metals' && <MarketMetalImportPanel />}
      {tab === 'shipping' && <ShippingCostMasterPanel />}

      {tab === 'readiness' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="text-sm font-bold mb-3">Increment 5 — data governance readiness</h3>
          <MasterDataReadinessPanel />
        </div>
      )}

      {tab === 'quality' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {Object.entries(quality.kpi).map(([k, v]) => (
              <DashboardStatCard
                key={k}
                icon={qualityKpiIcon(k)}
                label={k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                value={v}
              />
            ))}
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 text-sm font-bold">
              Issues ({quality.issues.length} shown, first 200)
            </div>
            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Severity</th>
                    <th className="p-2 text-left">Domain</th>
                    <th className="p-2 text-left">Key</th>
                    <th className="p-2 text-left">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {quality.issues.slice(0, 200).map((i, idx) => (
                    <tr key={idx} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-2">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            i.severity === 'ERROR'
                              ? 'bg-red-100 text-red-700'
                              : i.severity === 'WARNING'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {i.severity}
                        </span>
                      </td>
                      <td className="p-2">{i.domain}</td>
                      <td className="p-2 font-mono">{i.key}</td>
                      <td className="p-2">{i.message}</td>
                    </tr>
                  ))}
                  {quality.issues.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-500">
                        No quality issues in current store. Import official extracts if masters are empty.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <h3 className="text-sm font-bold mb-2">Recent import batches</h3>
            {batches.length === 0 ? (
              <p className="text-xs text-slate-500">No import batches yet. Use Import Center.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="p-1">Batch</th>
                    <th className="p-1">Type</th>
                    <th className="p-1">File</th>
                    <th className="p-1">OK / Err</th>
                    <th className="p-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 12).map((b) => (
                    <tr key={b.batchNumber} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="p-1 font-mono">{b.batchNumber}</td>
                      <td className="p-1">{b.dataType}</td>
                      <td className="p-1">{b.sourceFile}</td>
                      <td className="p-1">
                        {b.successCount}/{b.errorCount}
                      </td>
                      <td className="p-1 font-bold">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'customers' && <CustomerMasterAdminPanel jwtToken={jwtToken} onError={setActionError} />}
      {tab === 'cables' && (
        <CableGrid
          cables={cables}
          q={q}
          setQ={setQ}
          jwtToken={jwtToken}
          canEditAttachments={canEditCableAttachments}
        />
      )}
      {tab === 'boms' && <BomGrid boms={boms} q={q} setQ={setQ} jwtToken={jwtToken} />}
      {tab === 'raw' && <RawGrid rms={rms} q={q} setQ={setQ} jwtToken={jwtToken} onDeactivate={onDeactivateRm} />}
      {tab === 'drums' && (
        <DrumMasterAdminPanel drums={drums} jwtToken={jwtToken} onReload={reload} onError={setActionError} />
      )}
    </div>
  );
};

function CableGrid({
  cables,
  q,
  setQ,
  jwtToken,
  canEditAttachments,
}: {
  cables: MasterCableCatalogItem[];
  q: string;
  setQ: (v: string) => void;
  jwtToken?: string | null;
  canEditAttachments: boolean;
}) {
  const rows = cables.filter((c) =>
    `${c.cableCode} ${c.itemCode} ${c.customerCode} ${c.family || ''} ${c.description}`
      .toLowerCase()
      .includes(q.toLowerCase())
  );
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-bold">Cable Master ({rows.length})</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterBar value={q} onChange={setQ} placeholder="Search material / item / spec / description" />
          <button
            type="button"
            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200"
            onClick={() => void downloadMasterExcel('cables', jwtToken || '', { q })}
          >
            Export Excel
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
            <tr>
              <th className="p-2 text-left">Material No</th>
              <th className="p-2 text-left">Item Code</th>
              <th className="p-2 text-left">Spec</th>
              <th className="p-2 text-left">Family</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-right">Weight</th>
              <th className="p-2 text-right">Ø</th>
              <th className="p-2 text-left">Price</th>
              <th className="p-2 text-center">Attachments</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 500).map((c) => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-mono font-bold">{c.cableCode}</td>
                <td className="p-2 font-mono">{c.itemCode}</td>
                <td className="p-2">{c.customerCode}</td>
                <td className="p-2">{c.family || '—'}</td>
                <td className="p-2 max-w-[320px] truncate">{c.description}</td>
                <td className="p-2 text-right font-mono">{c.approxWeightKgKm}</td>
                <td className="p-2 text-right font-mono">{c.outerDiameterMm}</td>
                <td className="p-2">
                  {c.priceConfigured === false ? (
                    <span className="text-amber-700 font-bold">PRICE_NOT_CONFIGURED</span>
                  ) : (
                    c.standardPriceUsdPerM
                  )}
                </td>
                <td className="p-2 text-center">
                  <CableMasterAttachmentsButton
                    materialNumber={c.cableCode}
                    jwtToken={jwtToken}
                    canEdit={canEditAttachments}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BomGrid({
  boms,
  q,
  setQ,
  jwtToken,
}: {
  boms: CableBomRawMaterial[];
  q: string;
  setQ: (v: string) => void;
  jwtToken?: string | null;
}) {
  const rows = boms.filter((b) =>
    `${b.cableMaterialNumber} ${b.rawMaterial} ${b.customerCode} ${b.itemCode}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-bold">Cable BOM ({rows.length})</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterBar value={q} onChange={setQ} placeholder="Search cable / RM / spec" />
          <button
            type="button"
            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200"
            onClick={() => void downloadMasterExcel('cable-boms', jwtToken || '', { q })}
          >
            Export Excel
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
            <tr>
              <th className="p-2 text-left">Cable</th>
              <th className="p-2 text-left">Item</th>
              <th className="p-2 text-left">Spec</th>
              <th className="p-2 text-left">RM</th>
              <th className="p-2 text-right">Consumption</th>
              <th className="p-2 text-left">UOM</th>
              <th className="p-2 text-right">Scrap %</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 800).map((b, i) => (
              <tr key={b.id || i} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-mono">{b.cableMaterialNumber}</td>
                <td className="p-2 font-mono">{b.itemCode}</td>
                <td className="p-2">{b.customerCode}</td>
                <td className="p-2 font-mono">{b.rawMaterial}</td>
                <td className="p-2 text-right font-mono">{b.weight}</td>
                <td className="p-2">{b.unitKm}</td>
                <td className="p-2 text-right font-mono">{b.scrapPercent != null ? `${b.scrapPercent}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RawGrid({
  rms,
  q,
  setQ,
  jwtToken,
  onDeactivate,
}: {
  rms: RawMaterialMasterRecord[];
  q: string;
  setQ: (v: string) => void;
  jwtToken?: string | null;
  onDeactivate: (code: string) => void;
}) {
  const rows = rms.filter((r) =>
    `${r.rawMaterialCode} ${r.description}`.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-bold">Raw Materials ({rows.length})</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterBar value={q} onChange={setQ} placeholder="Search RM code / description" />
          <button
            type="button"
            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200"
            onClick={() => void downloadMasterExcel('raw-materials', jwtToken || '', { q })}
          >
            Export Excel
          </button>
        </div>
      </div>
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
            <tr>
              <th className="p-2 text-left">Code</th>
              <th className="p-2 text-left">Description</th>
              <th className="p-2 text-left">UOM</th>
              <th className="p-2 text-left">Currency</th>
              <th className="p-2 text-left">Price</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="p-2 font-mono font-bold">{r.rawMaterialCode}</td>
                <td className="p-2">{r.description}</td>
                <td className="p-2">{r.uom}</td>
                <td className="p-2">{r.currency || '—'}</td>
                <td className="p-2">
                  {r.priceStatus === 'PRICE_NOT_CONFIGURED' ? (
                    <span className="text-amber-700 font-bold">PRICE_NOT_CONFIGURED</span>
                  ) : (
                    r.price
                  )}
                </td>
                <td className="p-2">{r.status}</td>
                <td className="p-2">
                  {r.status === 'ACTIVE' && (
                    <button
                      className="text-[10px] font-bold text-red-600"
                      onClick={() => onDeactivate(r.rawMaterialCode)}
                    >
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

