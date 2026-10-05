import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw, Search, Upload } from 'lucide-react';
import { BomScrapPanel } from '../BomScrapPanel';
import {
  COSTING_V3_TABS,
  CostingV3Tab,
  costingApi,
  downloadCostingFile,
} from './costingV3Api';
import {
  COSTING_BULK_IMPORT_OPTIONS,
  CostingBulkImportKind,
} from '../../../services/costingBulkImportService';

type Props = {
  token: string | null;
  lang?: 'en' | 'ar';
  onOpenCostCalculator?: () => void;
};

type Dashboard = {
  currencies: { active: number };
  exchangeRates: { active: number };
  rawMaterials: { total: number; copper: number; aluminium: number; standard: number };
  rawMaterialPrices: { active: number; pendingApproval: number };
  bom: { cables: number; governed: number; pendingApproval: number };
  scrapRules: { active: number; underCreation: number };
};

const ELAND_CABLE = '10009487';

export { COSTING_V3_TABS };
export type { CostingV3Tab };

export const CostingWorkspaceV3: React.FC<Props> = ({ token, lang = 'en', onOpenCostCalculator }) => {
  const rtl = lang === 'ar';
  const [tab, setTab] = useState<CostingV3Tab>('overview');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [currencies, setCurrencies] = useState<Record<string, unknown>[]>([]);
  const [exchangeRates, setExchangeRates] = useState<Record<string, unknown>[]>([]);
  const [rawMaterials, setRawMaterials] = useState<Record<string, unknown>[]>([]);
  const [rmPrices, setRmPrices] = useState<Record<string, unknown>[]>([]);
  const [boms, setBoms] = useState<Record<string, unknown>[]>([]);
  const [scrapRules, setScrapRules] = useState<Record<string, unknown>[]>([]);
  const [validationResult, setValidationResult] = useState<Record<string, unknown> | null>(null);
  const [bulkKind, setBulkKind] = useState<CostingBulkImportKind>('raw_materials');
  const [bulkPreview, setBulkPreview] = useState<Record<string, unknown> | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rmDraft, setRmDraft] = useState({
    code: '',
    description: '',
    uom: 'kg',
    pricingCategory: 'STANDARD_RAW_MATERIAL',
    metalType: 'NONE',
    category: '',
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab') as CostingV3Tab | null;
    if (t && COSTING_V3_TABS.some((x) => x.id === t)) setTab(t);
    const onTab = (e: Event) => {
      const detail = (e as CustomEvent<CostingV3Tab>).detail;
      if (detail) setTab(detail);
    };
    window.addEventListener('energya-costing-tab', onTab as EventListener);
    return () => window.removeEventListener('energya-costing-tab', onTab as EventListener);
  }, []);

  const goTab = (next: CostingV3Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url.toString());
    window.dispatchEvent(new CustomEvent<CostingV3Tab>('energya-costing-tab', { detail: next }));
  };

  const refresh = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const [dash, cur, fx, rm, prices, bom, scrap] = await Promise.all([
        costingApi(token, '/api/admin/costing/workspace/dashboard'),
        costingApi(token, '/api/admin/costing/currencies'),
        costingApi(token, '/api/admin/costing/exchange-rates'),
        costingApi(token, '/api/master/raw-materials'),
        costingApi(token, '/api/admin/costing/raw-material-prices'),
        costingApi(token, '/api/master/boms'),
        costingApi(token, '/api/admin/costing/scrap-rules'),
      ]);
      setDashboard(dash.dashboard as Dashboard);
      setCurrencies((cur.currencies as Record<string, unknown>[]) || []);
      setExchangeRates((fx.exchangeRates as Record<string, unknown>[]) || []);
      setRawMaterials((rm.rawMaterials as Record<string, unknown>[]) || []);
      setRmPrices((prices.prices as Record<string, unknown>[]) || []);
      setBoms((bom.boms as Record<string, unknown>[]) || []);
      setScrapRules((scrap.rules as Record<string, unknown>[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load costing workspace');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredRm = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawMaterials;
    return rawMaterials.filter((r) =>
      [r.rawMaterialCode, r.description, r.pricingCategory, r.metalType].some((v) =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }, [rawMaterials, search]);

  const metalRm = useMemo(
    () =>
      rawMaterials.filter(
        (r) =>
          r.pricingCategory === 'MARKET_METAL_COPPER' || r.pricingCategory === 'MARKET_METAL_ALUMINIUM'
      ),
    [rawMaterials]
  );

  const runValidation = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        materialNumber: ELAND_CABLE,
        lengthMeters: 1000,
        quantity: 1,
        currency: 'USD',
        commercialMetadata: {
          copperPriceRate: 14463.72840671087,
          copperPriceUom: 'MT',
        },
      };
      const res = await costingApi(token, '/api/admin/costing/validate', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setValidationResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setBusy(false);
    }
  };

  const createRawMaterial = async () => {
    if (!token || !rmDraft.code) return;
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, '/api/master/raw-materials', {
        method: 'POST',
        body: JSON.stringify({
          code: rmDraft.code,
          description: rmDraft.description || rmDraft.code,
          uom: rmDraft.uom,
          category: rmDraft.category || undefined,
          pricingCategory: rmDraft.pricingCategory,
          metalType: rmDraft.metalType,
        }),
      });
      setRmDraft({ code: '', description: '', uom: 'kg', pricingCategory: 'STANDARD_RAW_MATERIAL', metalType: 'NONE', category: '' });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkUpload = async (file: File) => {
    if (!token) return;
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    setBusy(true);
    setError(null);
    try {
      const res = await costingApi(token, `/api/admin/costing/bulk-import/preview`, {
        method: 'POST',
        body: JSON.stringify({ kind: bulkKind, rows, sourceFile: file.name }),
      });
      setBulkPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk preview failed');
    } finally {
      setBusy(false);
    }
  };

  const applyBulk = async () => {
    if (!token || !bulkPreview?.rows) return;
    setBusy(true);
    try {
      await costingApi(token, '/api/admin/costing/bulk-import/commit', {
        method: 'POST',
        body: JSON.stringify({
          kind: bulkKind,
          rows: bulkPreview.rows,
          sourceFile: String(bulkPreview.sourceFile || 'upload.xlsx'),
        }),
      });
      setBulkPreview(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk apply failed');
    } finally {
      setBusy(false);
    }
  };

  const t = (en: string, ar: string) => (rtl ? ar : en);

  return (
    <div className={`space-y-4 ${rtl ? 'rtl' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t('Costing Configuration', 'إعداد التكلفة')}
          </h1>
          <p className="text-sm text-slate-500">
            {t('Maintain currencies, materials, prices, BOM, and scrap for inquiry costing.', 'صيانة العملات والمواد والأسعار وقائمة المواد والهالك.')}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void refresh()} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1">
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            {t('Refresh', 'تحديث')}
          </button>
          {onOpenCostCalculator && (
            <button type="button" onClick={onOpenCostCalculator} className="px-3 py-2 bg-brand-800 text-white rounded-lg text-sm">
              {t('Calculator', 'الحاسبة')}
            </button>
          )}
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="flex flex-wrap gap-1 border-b pb-2">
        {COSTING_V3_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => goTab(item.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              tab === item.id ? 'bg-brand-800 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            {rtl ? item.ar : item.en}
          </button>
        ))}
      </div>

      {tab === 'overview' && dashboard && (
        <div className="grid md:grid-cols-3 gap-3">
          {[
            ['Currencies', dashboard.currencies.active, 'currencies'],
            ['Exchange Rates', dashboard.exchangeRates.active, 'exchange_rates'],
            ['Raw Materials', dashboard.rawMaterials.total, 'raw_materials'],
            ['Copper RMs', dashboard.rawMaterials.copper, 'metal_classification'],
            ['Aluminium RMs', dashboard.rawMaterials.aluminium, 'metal_classification'],
            ['RM Prices Active', dashboard.rawMaterialPrices.active, 'raw_material_prices'],
            ['BOM Governed Cables', dashboard.bom.governed, 'bom'],
            ['Scrap Active', dashboard.scrapRules.active, 'scrap_rules'],
          ].map(([label, count, target]) => (
            <button
              key={String(label)}
              type="button"
              onClick={() => goTab(target as CostingV3Tab)}
              className="p-4 rounded-xl border bg-white dark:bg-slate-900 text-left hover:border-brand-800"
            >
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold">{count}</p>
            </button>
          ))}
        </div>
      )}

      {tab === 'currencies' && (
        <section className="space-y-3">
          <div className="flex justify-between">
            <h2 className="font-bold">{t('Currencies', 'العملات')}</h2>
            <button type="button" onClick={() => goTab('bulk_import')} className="text-sm text-brand-800 font-semibold">
              {t('Import Excel', 'استيراد Excel')}
            </button>
          </div>
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {['Code', 'Name', 'Symbol', 'Base', 'Decimals', 'Active'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={String(c.code)} className="border-t">
                    <td className="px-3 py-2 font-mono">{String(c.code)}</td>
                    <td className="px-3 py-2">{String(c.name)}</td>
                    <td className="px-3 py-2">{String(c.symbol || '')}</td>
                    <td className="px-3 py-2">{c.isBaseCurrency ? 'Yes' : ''}</td>
                    <td className="px-3 py-2">{String(c.decimalPlaces ?? 2)}</td>
                    <td className="px-3 py-2">{String(c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'exchange_rates' && (
        <section className="space-y-3">
          <h2 className="font-bold">{t('Exchange Rates', 'أسعار الصرف')}</h2>
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {['Code', 'From', 'To', 'Rate', 'Effective From', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exchangeRates.map((r) => (
                  <tr key={String(r.id)} className="border-t">
                    <td className="px-3 py-2 font-mono">{String(r.code)}</td>
                    <td className="px-3 py-2">{String(r.fromCurrency)}</td>
                    <td className="px-3 py-2">{String(r.toCurrency)}</td>
                    <td className="px-3 py-2">{String(r.rate)}</td>
                    <td className="px-3 py-2">{r.effectiveFrom ? String(r.effectiveFrom).slice(0, 10) : '—'}</td>
                    <td className="px-3 py-2">{String(r.workflowStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'raw_materials' && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
              <input className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search materials…', 'بحث المواد…')} />
            </div>
            <button type="button" onClick={() => void downloadCostingFile(token, `/api/admin/costing/bulk-import/template/raw_materials`, 'Raw_Material_Master.xlsx')} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1">
              <Download className="h-4 w-4" /> Export template
            </button>
          </div>
          <div className="grid md:grid-cols-6 gap-2 p-3 border rounded-xl bg-slate-50 dark:bg-slate-900">
            <input className="border rounded px-2 py-1 text-sm" placeholder="Code" value={rmDraft.code} onChange={(e) => setRmDraft({ ...rmDraft, code: e.target.value })} />
            <input className="border rounded px-2 py-1 text-sm md:col-span-2" placeholder="Description" value={rmDraft.description} onChange={(e) => setRmDraft({ ...rmDraft, description: e.target.value })} />
            <select className="border rounded px-2 py-1 text-sm" value={rmDraft.pricingCategory} onChange={(e) => setRmDraft({ ...rmDraft, pricingCategory: e.target.value })}>
              <option value="STANDARD_RAW_MATERIAL">STANDARD</option>
              <option value="MARKET_METAL_COPPER">MARKET_METAL_COPPER</option>
              <option value="MARKET_METAL_ALUMINIUM">MARKET_METAL_ALUMINIUM</option>
            </select>
            <select className="border rounded px-2 py-1 text-sm" value={rmDraft.metalType} onChange={(e) => setRmDraft({ ...rmDraft, metalType: e.target.value })}>
              <option value="NONE">NONE</option>
              <option value="COPPER">COPPER</option>
              <option value="ALUMINIUM">ALUMINIUM</option>
            </select>
            <button type="button" onClick={() => void createRawMaterial()} className="px-3 py-1 bg-brand-800 text-white rounded text-sm flex items-center justify-center gap-1">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <div className="overflow-auto border rounded-xl max-h-[480px]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  {['Code', 'Description', 'UOM', 'Pricing Category', 'Metal Type', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRm.map((r) => (
                  <tr key={String(r.rawMaterialCode)} className="border-t">
                    <td className="px-3 py-2 font-mono">{String(r.rawMaterialCode)}</td>
                    <td className="px-3 py-2">{String(r.description)}</td>
                    <td className="px-3 py-2">{String(r.uom)}</td>
                    <td className="px-3 py-2">{String(r.pricingCategory || 'STANDARD_RAW_MATERIAL')}</td>
                    <td className="px-3 py-2">{String(r.metalType || 'NONE')}</td>
                    <td className="px-3 py-2">{String(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'raw_material_prices' && (
        <section className="space-y-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => void downloadCostingFile(token, '/api/master/raw-material-prices-export', 'Raw_Material_Prices.xlsx')} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1">
              <Download className="h-4 w-4" /> {t('Export', 'تصدير')}
            </button>
          </div>
          <div className="overflow-auto border rounded-xl max-h-[520px]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  {['RM Code', 'Price', 'Currency', 'UOM', 'Workflow', 'Effective From'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rmPrices.slice(0, 200).map((p) => (
                  <tr key={String(p.id)} className="border-t">
                    <td className="px-3 py-2 font-mono">{String(p.rawMaterialCode)}</td>
                    <td className="px-3 py-2">{p.price != null ? String(p.price) : '—'}</td>
                    <td className="px-3 py-2">{String(p.currency || '')}</td>
                    <td className="px-3 py-2">{String(p.uom || '')}</td>
                    <td className="px-3 py-2">{String(p.workflowStatus)}</td>
                    <td className="px-3 py-2">{p.effectiveFrom ? String(p.effectiveFrom).slice(0, 10) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'bom' && (
        <section className="space-y-3">
          <button type="button" onClick={() => void downloadCostingFile(token, '/api/admin/costing/bulk-import/template/boms', 'Cable_BOM.xlsx')} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1">
            <Download className="h-4 w-4" /> BOM template
          </button>
          <div className="overflow-auto border rounded-xl max-h-[520px]">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  {['Cable', 'RM', 'Consumption', 'UOM', 'Scrap %', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boms.slice(0, 300).map((b) => (
                  <tr key={String(b.id)} className="border-t">
                    <td className="px-3 py-2 font-mono">{String(b.cableMaterialNumber)}</td>
                    <td className="px-3 py-2 font-mono">{String(b.rawMaterial)}</td>
                    <td className="px-3 py-2">{String(b.weight)}</td>
                    <td className="px-3 py-2">{String(b.unitKm)}</td>
                    <td className="px-3 py-2">{b.scrapPercent != null ? `${b.scrapPercent}%` : '—'}</td>
                    <td className="px-3 py-2">{String(b.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'scrap_rules' && (
        <section className="space-y-4">
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {['Code', 'Scope', 'Value', 'Scrap %', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scrapRules.map((r) => (
                  <tr key={String(r.id)} className="border-t">
                    <td className="px-3 py-2 font-mono">{String(r.code)}</td>
                    <td className="px-3 py-2">{String(r.scopeType)}</td>
                    <td className="px-3 py-2">{String(r.scopeValue || '')}</td>
                    <td className="px-3 py-2">{r.scrapRate != null ? `${Number(r.scrapRate) * 100}%` : '—'}</td>
                    <td className="px-3 py-2">{String(r.workflowStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <BomScrapPanel token={token} lang={lang} />
        </section>
      )}

      {tab === 'metal_classification' && (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">
            {t('Market-metal pricing is controlled by Pricing Category + Metal Type on each Raw Material — not by RM code.', 'تسعير المعادن يتحكم به تصنيف التسعير ونوع المعدن — وليس برمز المادة.')}
          </p>
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {['Code', 'Description', 'Pricing Category', 'Metal Type', 'Inquiry Price Source'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metalRm.map((r) => (
                  <tr key={String(r.rawMaterialCode)} className="border-t">
                    <td className="px-3 py-2 font-mono">{String(r.rawMaterialCode)}</td>
                    <td className="px-3 py-2">{String(r.description)}</td>
                    <td className="px-3 py-2">{String(r.pricingCategory)}</td>
                    <td className="px-3 py-2">{String(r.metalType)}</td>
                    <td className="px-3 py-2">
                      {r.pricingCategory === 'MARKET_METAL_COPPER'
                        ? 'Inquiry Copper Price'
                        : r.pricingCategory === 'MARKET_METAL_ALUMINIUM'
                          ? 'Inquiry Aluminium Price'
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'bulk_import' && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {COSTING_BULK_IMPORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setBulkKind(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${bulkKind === opt.id ? 'bg-brand-800 text-white' : 'bg-slate-100'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void downloadCostingFile(token, `/api/admin/costing/bulk-import/template/${bulkKind}`, `${bulkKind}.xlsx`)} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1">
              <Download className="h-4 w-4" /> {t('Download Template', 'تنزيل القالب')}
            </button>
            <label className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1 cursor-pointer">
              <Upload className="h-4 w-4" /> {t('Upload', 'رفع')}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && void handleBulkUpload(e.target.files[0])} />
            </label>
            {bulkPreview && (
              <button type="button" onClick={() => void applyBulk()} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm">
                {t('Apply', 'تطبيق')}
              </button>
            )}
          </div>
          {bulkPreview?.batch && (
            <div className="p-3 border rounded-xl text-sm space-y-1">
              <p>{t('Preview', 'معاينة')}: {String((bulkPreview.batch as Record<string, unknown>).successCount)} OK / {String((bulkPreview.batch as Record<string, unknown>).errorCount)} errors</p>
              <pre className="text-xs overflow-auto max-h-40 bg-slate-50 p-2 rounded">
                {JSON.stringify((bulkPreview.batch as Record<string, unknown>).errors, null, 2)}
              </pre>
            </div>
          )}
        </section>
      )}

      {tab === 'validation' && (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">
            {t(`Validate cable ${ELAND_CABLE} at 1000 m using inquiry copper price (no Summary import).`, `التحقق من الكابل ${ELAND_CABLE} عند 1000 م.`)}
          </p>
          <button type="button" onClick={() => void runValidation()} className="px-4 py-2 bg-brand-800 text-white rounded-lg text-sm">
            {t('Run Validation', 'تشغيل التحقق')}
          </button>
          {validationResult && (
            <pre className="text-xs overflow-auto max-h-[420px] bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border">
              {JSON.stringify(validationResult, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  );
};
