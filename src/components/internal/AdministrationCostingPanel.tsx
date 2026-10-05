import React, { useCallback, useEffect, useState } from 'react';
import {
  Variable,
  FileCode,
  Scissors,
  Eye,
  CheckCircle,
  History,
  Plus,
  RefreshCw,
  AlertTriangle,
  Coins,
  DollarSign,
  ClipboardCheck,
  Link2,
} from 'lucide-react';
import { BomScrapPanel } from '../costing/BomScrapPanel';
import { COSTING_PRICE_CURRENCY_CODES } from '../../domain/currencyConversion';

type CostingTab =
  | 'prices'
  | 'scrap'
  | 'variables'
  | 'formulas'
  | 'assignment'
  | 'other_costs'
  | 'validation'
  | 'preview'
  | 'approval'
  | 'versions'
  | 'audit';

const LABELS: Record<CostingTab, { en: string; ar: string }> = {
  prices: { en: 'Raw Material Prices', ar: 'أسعار الخامات' },
  scrap: { en: 'Scrap', ar: 'الهالك' },
  variables: { en: 'Variables', ar: 'المتغيرات' },
  formulas: { en: 'Formulas', ar: 'المعادلات' },
  assignment: { en: 'Cable Assignment', ar: 'تعيين الكابل' },
  other_costs: { en: 'Other Costs', ar: 'تكاليف أخرى' },
  validation: { en: 'Validation', ar: 'التحقق' },
  preview: { en: 'Preview', ar: 'معاينة' },
  approval: { en: 'Approval', ar: 'الموافقة' },
  versions: { en: 'Versions', ar: 'الإصدارات' },
  audit: { en: 'Audit', ar: 'التدقيق' },
};

function authHeaders(token: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function parseCostingApiBody(text: string, path: string): Record<string, unknown> {
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.trimStart().startsWith('<!')) {
      throw new Error(
        `Costing API returned HTML instead of JSON for ${path}. Restart the dev server (npm run dev) or rebuild production (npm run build).`
      );
    }
    throw new Error(`Costing API returned non-JSON for ${path}: ${text.trim().slice(0, 160)}`);
  }
}

type Props = {
  token: string | null;
  lang: 'en' | 'ar';
  onOpenCostCalculator?: () => void;
};

export const AdministrationCostingPanel: React.FC<Props> = ({ token, lang, onOpenCostCalculator }) => {
  const rtl = lang === 'ar';
  const t = (key: CostingTab) => LABELS[key][lang];

  const [tab, setTab] = useState<CostingTab>('prices');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [methods, setMethods] = useState<any[]>([]);
  const [variables, setVariables] = useState<any[]>([]);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [scrapRules, setScrapRules] = useState<any[]>([]);
  const [exchangeRates, setExchangeRates] = useState<any[]>([]);
  const [metalRates, setMetalRates] = useState<any[]>([]);
  const [logisticsRules, setLogisticsRules] = useState<any[]>([]);
  const [packingRules, setPackingRules] = useState<any[]>([]);
  const [layers, setLayers] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<any>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [prices, setPrices] = useState<any[]>([]);
  const [readinessRows, setReadinessRows] = useState<any[]>([]);
  const [validateResult, setValidateResult] = useState<any>(null);

  const [configVersionId, setConfigVersionId] = useState('');
  const [previewForm, setPreviewForm] = useState({
    materialNumber: '10009487',
    quantity: '1',
    lengthMeters: '1000',
    currency: 'USD',
    exWorkRate: '',
    incoterms: '',
    destination: '',
    drumType: '',
  });

  const [formulaDraft, setFormulaDraft] = useState({
    code: '',
    name: '',
    outputVariableCode: 'EX_WORK_COST',
    expression: '',
    assignmentScope: 'GLOBAL',
    assignmentValue: '',
  });

  const [priceDraft, setPriceDraft] = useState({
    rawMaterialCode: '',
    price: '',
    currency: 'USD',
    uom: 'kg',
    priceBasis: 'PER_KG',
    supplier: '',
    effectiveFrom: '',
    effectiveTo: '',
    comment: '',
  });

  const [variableDraft, setVariableDraft] = useState({
    code: '',
    name: '',
    kind: 'INPUT',
    unit: '',
    description: '',
  });

  const [scrapDraft, setScrapDraft] = useState({
    code: '',
    name: '',
    scopeType: 'GLOBAL',
    scopeValue: '',
    scrapRate: '',
    sourceReference: 'GovernedBomLine / business approval required',
  });

  const [fxDraft, setFxDraft] = useState({
    code: '',
    name: '',
    fromCurrency: 'LE',
    toCurrency: 'USD',
    rate: '',
    effectiveFrom: '',
    effectiveTo: '',
    sourceReference: 'Central bank / treasury',
  });

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, { ...init, headers: { ...authHeaders(token), ...(init?.headers || {}) } });
      const text = await res.text();
      const data = parseCostingApiBody(text, path);
      if (!res.ok) {
        const hint = typeof data.hint === 'string' ? ` ${data.hint}` : '';
        throw new Error(`${String(data.error || `Request failed (${res.status})`)}${hint}`);
      }
      return data;
    },
    [token]
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [m, v, f, s, x, mr, lr, pr, l, a, q, p] = await Promise.all([
        api('/api/admin/costing/methods'),
        api('/api/admin/costing/variables'),
        api('/api/admin/costing/formulas'),
        api('/api/admin/costing/scrap-rules'),
        api('/api/admin/costing/exchange-rates'),
        api('/api/admin/platform/costing/metal-rates').catch(() => ({ metalRates: [] })),
        api('/api/admin/platform/costing/logistics-rules').catch(() => ({ logisticsRules: [] })),
        api('/api/admin/platform/costing/packing-rules').catch(() => ({ packingRules: [] })),
        api('/api/admin/costing/layers'),
        api('/api/admin/costing/audit?limit=50'),
        api('/api/admin/costing/approval-queue'),
        api('/api/admin/costing/raw-material-prices').catch(() => ({ prices: [] })),
      ]);
      setMethods(m.methods || m.configurations || []);
      setVariables(v.variables || []);
      setFormulas(f.formulas || []);
      setScrapRules(s.scrapRules || []);
      setExchangeRates(x.exchangeRates || []);
      setMetalRates(mr.metalRates || []);
      setLogisticsRules(lr.logisticsRules || []);
      setPackingRules(pr.packingRules || []);
      setLayers(l.layers || l.components || []);
      setAuditEvents(a.events || []);
      setApprovalQueue(q);
      setPrices(p.prices || []);
      if (!configVersionId && m.methods?.[0]?.versions?.[0]?.id) {
        setConfigVersionId(m.methods[0].versions[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [api, configVersionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/admin/costing/preview', {
        method: 'POST',
        body: JSON.stringify({
          materialNumber: previewForm.materialNumber,
          quantity: Number(previewForm.quantity),
          lengthMeters: Number(previewForm.lengthMeters),
          currency: previewForm.currency,
          configurationVersionId: configVersionId || undefined,
          layerInputs: previewForm.exWorkRate ? { EX_WORK_RATE: previewForm.exWorkRate } : undefined,
          incoterms: previewForm.incoterms || undefined,
          destination: previewForm.destination || undefined,
          drumType: previewForm.drumType || undefined,
        }),
      });
      setPreviewResult(data.preview);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createScrapRule = async () => {
    setBusy(true);
    try {
      await api('/api/admin/costing/scrap-rules', {
        method: 'POST',
        body: JSON.stringify({
          ...scrapDraft,
          scrapRate: scrapDraft.scrapRate ? Number(scrapDraft.scrapRate) : null,
        }),
      });
      setScrapDraft({ code: '', name: '', scopeType: 'GLOBAL', scopeValue: '', scrapRate: '', sourceReference: scrapDraft.sourceReference });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createExchangeRate = async () => {
    setBusy(true);
    try {
      await api('/api/admin/costing/exchange-rates', {
        method: 'POST',
        body: JSON.stringify({
          name: fxDraft.name || undefined,
          fromCurrency: fxDraft.fromCurrency,
          toCurrency: fxDraft.toCurrency,
          rate: fxDraft.rate ? Number(fxDraft.rate) : null,
          effectiveFrom: fxDraft.effectiveFrom || undefined,
          effectiveTo: fxDraft.effectiveTo || undefined,
          sourceReference: fxDraft.sourceReference || undefined,
        }),
      });
      setFxDraft({
        code: '',
        name: '',
        fromCurrency: 'LE',
        toCurrency: 'USD',
        rate: '',
        effectiveFrom: '',
        effectiveTo: '',
        sourceReference: fxDraft.sourceReference,
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fxWorkflow = async (id: string, action: 'submit' | 'approve') => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/costing/exchange-rates/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createFormula = async () => {
    if (!configVersionId) {
      setError(lang === 'en' ? 'Select a configuration version first.' : 'اختر إصدار التكوين أولاً.');
      return;
    }
    setBusy(true);
    try {
      await api('/api/admin/costing/formulas', {
        method: 'POST',
        body: JSON.stringify({ ...formulaDraft, configurationVersionId: configVersionId }),
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createPriceDraft = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/costing/raw-material-prices', {
        method: 'POST',
        body: JSON.stringify({
          ...priceDraft,
          price: priceDraft.price === '' ? null : Number(priceDraft.price),
        }),
      });
      setPriceDraft({
        rawMaterialCode: '',
        price: '',
        currency: 'USD',
        uom: 'kg',
        priceBasis: 'PER_KG',
        supplier: '',
        effectiveFrom: '',
        effectiveTo: '',
        comment: '',
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createVariable = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/costing/variables', {
        method: 'POST',
        body: JSON.stringify(variableDraft),
      });
      setVariableDraft({ code: '', name: '', kind: 'INPUT', unit: '', description: '' });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadReadiness = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/admin/costing/readiness');
      setReadinessRows(data.cables || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const runValidate = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/admin/costing/validate', {
        method: 'POST',
        body: JSON.stringify({
          materialNumber: previewForm.materialNumber,
          quantity: Number(previewForm.quantity),
          lengthMeters: Number(previewForm.lengthMeters),
          currency: previewForm.currency,
          configurationVersionId: configVersionId || undefined,
        }),
      });
      setValidateResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveAssignment = async (formulaId: string, assignmentScope: string, assignmentValue: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/costing/formulas/${formulaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ assignmentScope, assignmentValue }),
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const appendFormulaToken = (token: string) => {
    setFormulaDraft((f) => ({
      ...f,
      expression: `${f.expression}${f.expression && !f.expression.endsWith(' ') ? ' ' : ''}${token}`,
    }));
  };

  const tabs: { id: CostingTab; icon: React.ElementType }[] = [
    { id: 'prices', icon: DollarSign },
    { id: 'scrap', icon: Scissors },
    { id: 'variables', icon: Variable },
    { id: 'formulas', icon: FileCode },
    { id: 'assignment', icon: Link2 },
    { id: 'other_costs', icon: Coins },
    { id: 'validation', icon: ClipboardCheck },
    { id: 'preview', icon: Eye },
    { id: 'versions', icon: History },
    { id: 'approval', icon: CheckCircle },
    { id: 'audit', icon: History },
  ];

  return (
    <div className="space-y-4" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-slate-700 dark:text-slate-300">
          {lang === 'en'
            ? 'For quick quotes use Quick Cost Quote in the sidebar — no technical setup needed.'
            : 'للعروض السريعة استخدم "عرض التكلفة السريع" من القائمة الجانبية.'}
        </p>
        {onOpenCostCalculator && (
          <button
            type="button"
            onClick={onOpenCostCalculator}
            className="shrink-0 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
          >
            {lang === 'en' ? 'Open Quick Cost Quote' : 'فتح عرض التكلفة السريع'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">{lang === 'en' ? 'Costing Configuration' : 'تكوين التكلفة'}</h2>
          <p className="text-xs text-slate-500">
            {lang === 'en'
              ? 'Governed costing methods, formulas, scrap rules, and diagnostic preview. Cost ≠ commercial price.'
              : 'طرق التكلفة والمعادلات وقواعد الهالك والمعاينة التشخيصية. التكلفة ≠ السعر التجاري.'}
          </p>
        </div>
        <button
          onClick={() => refresh()}
          className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          {lang === 'en' ? 'Refresh' : 'تحديث'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm font-semibold flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-2 ${
              tab === id ? 'bg-red-600 text-white shadow' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(id)}
          </button>
        ))}
      </div>

      {tab === 'prices' && (
        <div className="space-y-4">
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Prices are drafted here and must be approved through existing Raw Material Price governance. Blank official list prices stay PRICE_NOT_CONFIGURED — do not invent amounts.
          </p>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 grid sm:grid-cols-3 gap-2 text-xs">
            <input className="border rounded-lg px-2 py-1.5" placeholder="Material code" value={priceDraft.rawMaterialCode} onChange={(e) => setPriceDraft({ ...priceDraft, rawMaterialCode: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Price (leave blank if not configured)" value={priceDraft.price} onChange={(e) => setPriceDraft({ ...priceDraft, price: e.target.value })} />
            <select className="border rounded-lg px-2 py-1.5" value={priceDraft.currency} onChange={(e) => setPriceDraft({ ...priceDraft, currency: e.target.value })}>
              {COSTING_PRICE_CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>{c}{c === 'EGP' ? ' (= LE)' : ''}</option>
              ))}
            </select>
            <input className="border rounded-lg px-2 py-1.5" placeholder="UOM" value={priceDraft.uom} onChange={(e) => setPriceDraft({ ...priceDraft, uom: e.target.value })} />
            <select className="border rounded-lg px-2 py-1.5" value={priceDraft.priceBasis} onChange={(e) => setPriceDraft({ ...priceDraft, priceBasis: e.target.value })}>
              {['PER_KG', 'PER_TON', 'PER_METER', 'PER_PCS', 'PER_M2'].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <input className="border rounded-lg px-2 py-1.5" placeholder="Supplier (optional)" value={priceDraft.supplier} onChange={(e) => setPriceDraft({ ...priceDraft, supplier: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" type="date" value={priceDraft.effectiveFrom} onChange={(e) => setPriceDraft({ ...priceDraft, effectiveFrom: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" type="date" value={priceDraft.effectiveTo} onChange={(e) => setPriceDraft({ ...priceDraft, effectiveTo: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5 sm:col-span-3" placeholder="Notes" value={priceDraft.comment} onChange={(e) => setPriceDraft({ ...priceDraft, comment: e.target.value })} />
            <button type="button" onClick={() => void createPriceDraft()} className="bg-red-600 text-white rounded-xl py-2 font-extrabold flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> Save as DRAFT
            </button>
            <button
              type="button"
              className="border rounded-xl py-2 font-bold text-center"
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const res = await fetch('/api/master/raw-material-prices-export?purpose=template', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(String(data.error || `Download failed (${res.status})`));
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'Raw_Material_Prices_Template.xlsx';
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err: any) {
                  setError(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Download template
            </button>
          </div>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto max-h-96">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">Code</th>
                  <th>Price</th>
                  <th>Currency</th>
                  <th>UOM</th>
                  <th>Basis</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {prices.slice(0, 200).map((row: any) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="p-3 font-mono font-bold">{row.rawMaterialCode}</td>
                    <td>{row.price != null ? row.price : 'PRICE_NOT_CONFIGURED'}</td>
                    <td>{row.currency || '—'}</td>
                    <td>{row.uom || '—'}</td>
                    <td>{row.priceBasis}</td>
                    <td>{row.workflowStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'variables' && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 grid sm:grid-cols-2 gap-2 text-xs">
            <input className="border rounded-lg px-2 py-1.5" placeholder="Code" value={variableDraft.code} onChange={(e) => setVariableDraft({ ...variableDraft, code: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Name" value={variableDraft.name} onChange={(e) => setVariableDraft({ ...variableDraft, name: e.target.value })} />
            <select className="border rounded-lg px-2 py-1.5" value={variableDraft.kind} onChange={(e) => setVariableDraft({ ...variableDraft, kind: e.target.value })}>
              {['INPUT', 'OUTPUT', 'INTERMEDIATE', 'CONSTANT', 'REFERENCE'].map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <input className="border rounded-lg px-2 py-1.5" placeholder="Unit" value={variableDraft.unit} onChange={(e) => setVariableDraft({ ...variableDraft, unit: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5 sm:col-span-2" placeholder="Description" value={variableDraft.description} onChange={(e) => setVariableDraft({ ...variableDraft, description: e.target.value })} />
            <button type="button" onClick={() => void createVariable()} className="bg-red-600 text-white rounded-xl py-2 font-extrabold">Create variable</button>
          </div>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">Code</th>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((v) => (
                  <tr key={v.id} className="border-b border-slate-100">
                    <td className="p-3 font-mono font-bold">{v.code}</td>
                    <td>{v.name}</td>
                    <td>{v.kind}</td>
                    <td>{v.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'formulas' && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 grid sm:grid-cols-2 gap-2 text-xs">
            <input className="border rounded-lg px-2 py-1.5" placeholder="Code" value={formulaDraft.code} onChange={(e) => setFormulaDraft({ ...formulaDraft, code: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Name" value={formulaDraft.name} onChange={(e) => setFormulaDraft({ ...formulaDraft, name: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Output variable" value={formulaDraft.outputVariableCode} onChange={(e) => setFormulaDraft({ ...formulaDraft, outputVariableCode: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5 font-mono col-span-2" placeholder="Expression (safe: + - * / variables)" value={formulaDraft.expression} onChange={(e) => setFormulaDraft({ ...formulaDraft, expression: e.target.value })} />
            <div className="col-span-2 flex flex-wrap gap-1">
              {variables.slice(0, 16).map((v) => (
                <button key={v.id} type="button" className="px-2 py-1 rounded border font-mono" onClick={() => appendFormulaToken(v.code)}>
                  {v.code}
                </button>
              ))}
              {['+', '-', '*', '/', '(', ')'].map((op) => (
                <button key={op} type="button" className="px-2 py-1 rounded bg-slate-800 text-white font-mono" onClick={() => appendFormulaToken(op)}>
                  {op}
                </button>
              ))}
            </div>
            <select className="border rounded-lg px-2 py-1.5" value={formulaDraft.assignmentScope} onChange={(e) => setFormulaDraft({ ...formulaDraft, assignmentScope: e.target.value })}>
              <option value="GLOBAL">All cables</option>
              <option value="FAMILY">Cable family</option>
              <option value="CABLE">Specific cable</option>
            </select>
            <input className="border rounded-lg px-2 py-1.5" placeholder="Family or material number" value={formulaDraft.assignmentValue} onChange={(e) => setFormulaDraft({ ...formulaDraft, assignmentValue: e.target.value })} />
            <button onClick={createFormula} className="bg-red-600 text-white rounded-xl py-2 font-extrabold flex items-center justify-center gap-2">
              <Plus className="h-4 w-4" /> {lang === 'en' ? 'Create formula' : 'إنشاء معادلة'}
            </button>
          </div>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">Code</th>
                  <th>Output</th>
                  <th>Status</th>
                  <th>Expression</th>
                </tr>
              </thead>
              <tbody>
                {formulas.map((f) => (
                  <tr key={f.id} className="border-b border-slate-100">
                    <td className="p-3 font-mono font-bold">{f.code}</td>
                    <td>{f.outputVariableCode}</td>
                    <td>{f.status}</td>
                    <td className="font-mono">{f.versions?.[0]?.expression}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'scrap' && (
        <div className="space-y-4">
          <BomScrapPanel token={token} lang={lang} />
          <div className="rounded-2xl border bg-amber-50 border-amber-200 p-3 text-xs text-amber-900">
            {lang === 'en'
              ? 'Scrap rates are not invented. Leave rate empty until business approves governed data from BOM or ELAND rules.'
              : 'لا يتم اختراع نسب الهالك. اترك النسبة فارغة حتى يوافق العمل على البيانات المعتمدة.'}
          </div>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 grid sm:grid-cols-2 gap-2 text-xs">
            <input className="border rounded-lg px-2 py-1.5" placeholder="Code" value={scrapDraft.code} onChange={(e) => setScrapDraft({ ...scrapDraft, code: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Name" value={scrapDraft.name} onChange={(e) => setScrapDraft({ ...scrapDraft, name: e.target.value })} />
            <select className="border rounded-lg px-2 py-1.5" value={scrapDraft.scopeType} onChange={(e) => setScrapDraft({ ...scrapDraft, scopeType: e.target.value })}>
              {['GLOBAL', 'FAMILY', 'MATERIAL_CLASS', 'CABLE', 'BOM_LINE'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <input className="border rounded-lg px-2 py-1.5" placeholder="Scope value" value={scrapDraft.scopeValue} onChange={(e) => setScrapDraft({ ...scrapDraft, scopeValue: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Scrap rate (optional)" value={scrapDraft.scrapRate} onChange={(e) => setScrapDraft({ ...scrapDraft, scrapRate: e.target.value })} />
            <button onClick={createScrapRule} className="bg-red-600 text-white rounded-xl py-2 font-extrabold">{lang === 'en' ? 'Create scrap rule' : 'إنشاء قاعدة هالك'}</button>
          </div>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">Code</th>
                  <th>Scope</th>
                  <th>Rate</th>
                  <th>Workflow</th>
                </tr>
              </thead>
              <tbody>
                {scrapRules.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="p-3 font-mono font-bold">{r.code}</td>
                    <td>{r.scopeType}{r.scopeValue ? ` / ${r.scopeValue}` : ''}</td>
                    <td>{r.scrapRate != null ? r.scrapRate : '—'}</td>
                    <td>{r.workflowStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'other_costs' && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-blue-50 border-blue-200 p-3 text-xs text-blue-900">
            {lang === 'en'
              ? 'Company base currency: LE (EGP). Inquiry header exchangeRate / rawMaterialExchangeRate override governed rates when set. Incoterm charges remain NOT_CONFIGURED until A6 matrix exists.'
              : 'العملة الأساسية: LE. أسعار الصرف في رأس الاستفسار تتجاوز الجدول المعتمد عند تعيينها.'}
          </div>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 grid sm:grid-cols-2 gap-2 text-xs">
            <input className="border rounded-lg px-2 py-1.5 bg-slate-50 font-mono" value={fxDraft.code || 'Auto FXYY-#####'} disabled />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Name (optional)" value={fxDraft.name} onChange={(e) => setFxDraft({ ...fxDraft, name: e.target.value })} />
            <select className="border rounded-lg px-2 py-1.5" value={fxDraft.fromCurrency} onChange={(e) => setFxDraft({ ...fxDraft, fromCurrency: e.target.value })}>
              {COSTING_PRICE_CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>{c}{c === 'EGP' ? ' (= LE)' : ''}</option>
              ))}
            </select>
            <select className="border rounded-lg px-2 py-1.5" value={fxDraft.toCurrency} onChange={(e) => setFxDraft({ ...fxDraft, toCurrency: e.target.value })}>
              {COSTING_PRICE_CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>{c}{c === 'EGP' ? ' (= LE)' : ''}</option>
              ))}
            </select>
            <input className="border rounded-lg px-2 py-1.5" placeholder="Rate (required — enter the real rate)" value={fxDraft.rate} onChange={(e) => setFxDraft({ ...fxDraft, rate: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" type="date" placeholder="Effective from" value={fxDraft.effectiveFrom} onChange={(e) => setFxDraft({ ...fxDraft, effectiveFrom: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" type="date" placeholder="Effective to" value={fxDraft.effectiveTo} onChange={(e) => setFxDraft({ ...fxDraft, effectiveTo: e.target.value })} />
            <button onClick={createExchangeRate} className="bg-red-600 text-white rounded-xl py-2 font-extrabold">{lang === 'en' ? 'Create FX draft' : 'إنشاء مسودة صرف'}</button>
          </div>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">Code</th>
                  <th>Pair</th>
                  <th>Rate</th>
                  <th>Effective</th>
                  <th>Workflow</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {exchangeRates.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="p-3 font-mono font-bold">{r.code}</td>
                    <td>{r.fromCurrency} → {r.toCurrency}</td>
                    <td>{r.rate}</td>
                    <td>{r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString() : '—'} – {r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString() : 'open'}</td>
                    <td>{r.workflowStatus}</td>
                    <td className="p-3 whitespace-nowrap">
                      {r.workflowStatus === 'DRAFT' && (
                        <button type="button" className="text-amber-700 font-bold mr-2" onClick={() => void fxWorkflow(r.id, 'submit')}>
                          {lang === 'en' ? 'Submit' : 'تقديم'}
                        </button>
                      )}
                      {r.workflowStatus === 'SUBMITTED' && (
                        <button type="button" className="text-emerald-700 font-bold" onClick={() => void fxWorkflow(r.id, 'approve')}>
                          {lang === 'en' ? 'Approve' : 'اعتماد'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'assignment' && (
        <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto">
          <p className="text-xs text-slate-500 p-3">
            Specific cable assignment overrides family and global formulas that share the same output variable. Leave GLOBAL to keep Increment 13 behaviour.
          </p>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-3">Formula</th>
                <th>Output</th>
                <th>Applies to</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {formulas.map((f) => (
                <tr key={f.id} className="border-b border-slate-100">
                  <td className="p-3 font-mono font-bold">{f.code}</td>
                  <td>{f.outputVariableCode}</td>
                  <td>
                    <select
                      className="border rounded px-1 py-1"
                      defaultValue={f.assignmentScope || 'GLOBAL'}
                      onChange={(e) => {
                        f._scope = e.target.value;
                      }}
                    >
                      <option value="GLOBAL">All cables</option>
                      <option value="FAMILY">Family</option>
                      <option value="CABLE">Cable</option>
                    </select>
                  </td>
                  <td>
                    <input
                      className="border rounded px-1 py-1"
                      defaultValue={f.assignmentValue || ''}
                      placeholder="Family or material"
                      onChange={(e) => {
                        f._value = e.target.value;
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-red-600 font-bold"
                      onClick={() => void saveAssignment(f.id, f._scope || f.assignmentScope || 'GLOBAL', f._value ?? f.assignmentValue ?? '')}
                    >
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'validation' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadReadiness()} className="px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-bold">
              Cable costing readiness
            </button>
            <button type="button" onClick={() => void runValidate()} className="px-3 py-2 rounded-xl border text-xs font-bold">
              Validate selected cable
            </button>
          </div>
          <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="p-3">Cable</th>
                  <th>BOM</th>
                  <th>RM</th>
                  <th>Prices</th>
                  <th>Scrap</th>
                  <th>Formula</th>
                  <th>Logistics</th>
                  <th>Packing</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {readinessRows.map((row) => (
                  <tr key={row.materialNumber} className="border-b border-slate-100">
                    <td className="p-3 font-mono font-bold">{row.materialNumber}</td>
                    <td>{row.bom ? '✓' : '✗'}</td>
                    <td>{row.rawMaterials ? '✓' : '✗'}</td>
                    <td>{row.prices ? '✓' : '✗'}</td>
                    <td>{row.scrap ? '✓' : '✗'}</td>
                    <td>{row.formula ? '✓' : '✗'}</td>
                    <td>{row.logistics ? '✓' : '✗'}</td>
                    <td>{row.packing ? '✓' : '✗'}</td>
                    <td className="font-bold">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {readinessRows[0]?.missing?.length > 0 && (
            <ul className="text-xs text-amber-800 list-disc pl-5">
              {readinessRows.flatMap((row) =>
                (row.missing || []).slice(0, 8).map((m: string, i: number) => (
                  <li key={`${row.materialNumber}-${i}`}>
                    {row.materialNumber}: {m}
                  </li>
                ))
              )}
            </ul>
          )}
          {validateResult && (
            <div className="rounded-xl border p-3 text-xs">
              <p className="font-extrabold">{validateResult.status} — {validateResult.errorCode || validateResult.costingStatus}</p>
              <ul className="list-disc pl-5 mt-1">
                {(validateResult.blockingReasons || []).map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'preview' && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 grid sm:grid-cols-2 gap-2 text-xs">
            <input className="border rounded-lg px-2 py-1.5" placeholder="Material number" value={previewForm.materialNumber} onChange={(e) => setPreviewForm({ ...previewForm, materialNumber: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Quantity" value={previewForm.quantity} onChange={(e) => setPreviewForm({ ...previewForm, quantity: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Length (m)" value={previewForm.lengthMeters} onChange={(e) => setPreviewForm({ ...previewForm, lengthMeters: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Currency" value={previewForm.currency} onChange={(e) => setPreviewForm({ ...previewForm, currency: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Incoterm" value={previewForm.incoterms} onChange={(e) => setPreviewForm({ ...previewForm, incoterms: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Destination" value={previewForm.destination} onChange={(e) => setPreviewForm({ ...previewForm, destination: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="Drum code" value={previewForm.drumType} onChange={(e) => setPreviewForm({ ...previewForm, drumType: e.target.value })} />
            <input className="border rounded-lg px-2 py-1.5" placeholder="EX_WORK_RATE (optional)" value={previewForm.exWorkRate} onChange={(e) => setPreviewForm({ ...previewForm, exWorkRate: e.target.value })} />
            <button onClick={runPreview} className="bg-red-600 text-white rounded-xl py-2 font-extrabold">{lang === 'en' ? 'Run preview' : 'تشغيل المعاينة'}</button>
          </div>
          {previewResult && (
            <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 text-xs space-y-3">
              <div className={`font-extrabold ${previewResult.status === 'READY' ? 'text-green-700' : 'text-amber-700'}`}>
                {previewResult.status} — {previewResult.costingStatus}
              </div>
              {previewResult.blockingReasons?.length > 0 && (
                <ul className="list-disc pl-5 text-amber-800">
                  {previewResult.blockingReasons.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
              <div>Material: {previewResult.totals?.materialCost} {previewResult.currency} | Scrap adj: {previewResult.totals?.scrapAdjustmentCost}</div>
              {previewResult.layers?.length > 0 && (
                <div>
                  <div className="font-bold mb-1">Layers</div>
                  {previewResult.layers.map((l: any, i: number) => (
                    <div key={i}>{l.componentCode}: {l.value ?? l.status}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'approval' && approvalQueue && (
        <div className="space-y-3 text-xs">
          <Section title="Configuration versions" items={approvalQueue.configVersions} render={(v: any) => `${v.configuration?.code} v${v.versionNo}`} />
          <Section title="Formulas" items={approvalQueue.formulas} render={(f: any) => f.code} />
          <Section title="Scrap rules" items={approvalQueue.scrapRules} render={(r: any) => r.code} />
          <Section title="Exchange rates" items={approvalQueue.exchangeRates} render={(r: any) => r.code} />
        </div>
      )}

      {tab === 'versions' && (
        <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="p-3">Method</th>
                <th>Version</th>
                <th>Status</th>
                <th>Effective From</th>
                <th>Effective To</th>
                <th>Approval</th>
              </tr>
            </thead>
            <tbody>
              {methods.flatMap((m: any) =>
                (m.versions || [{ versionNo: m.versionNo || 1, workflowStatus: m.workflowStatus, effectiveFrom: m.effectiveFrom, effectiveTo: m.effectiveTo }]).map(
                  (v: any, i: number) => (
                    <tr key={`${m.id}-${i}`} className="border-b border-slate-100">
                      <td className="p-3 font-bold">{m.code}</td>
                      <td className="p-3">v{v.versionNo ?? 1}</td>
                      <td className="p-3">{v.workflowStatus || m.status}</td>
                      <td className="p-3">{v.effectiveFrom ? new Date(v.effectiveFrom).toLocaleDateString() : '—'}</td>
                      <td className="p-3">{v.effectiveTo ? new Date(v.effectiveTo).toLocaleDateString() : '—'}</td>
                      <td className="p-3">{v.workflowStatus || '—'}</td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'other_costs' && (
        <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 text-xs space-y-2">
          <p className="text-slate-500">
            Governed metal rates (LME / commercial / internal). Leave rate empty until business supplies values.
          </p>
          {metalRates.length === 0 && <p className="text-amber-600 font-bold">CONFIGURATION_REQUIRED — no metal rates defined.</p>}
          <ul className="space-y-1 font-mono">
            {metalRates.map((r) => (
              <li key={r.id}>
                {r.code} · {r.metalType} · {r.rate != null ? `${r.rate} ${r.currency}` : 'NOT_CONFIGURED'} · {r.workflowStatus}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'other_costs' && (
        <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 text-xs space-y-2">
          <p className="text-slate-500">Incoterm + destination logistics costs. Do not invent shipping amounts.</p>
          {logisticsRules.length === 0 && (
            <p className="text-amber-600 font-bold">CONFIGURATION_REQUIRED — no logistics rules defined.</p>
          )}
          <ul className="space-y-1 font-mono">
            {logisticsRules.map((r) => (
              <li key={r.id}>
                {r.code} · {r.incoterm} {r.destination || '*'} ·{' '}
                {r.cost != null ? `${r.cost} ${r.currency}` : 'NOT_CONFIGURED'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'other_costs' && (
        <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4 text-xs space-y-2">
          <p className="text-slate-500">Drum/packing cost rules linked to governed drum master.</p>
          {packingRules.length === 0 && (
            <p className="text-amber-600 font-bold">CONFIGURATION_REQUIRED — no packing rules defined.</p>
          )}
          <ul className="space-y-1 font-mono">
            {packingRules.map((r) => (
              <li key={r.id}>
                {r.code} · drum {r.drumCode || 'ANY'} ·{' '}
                {r.packingCost != null ? `${r.packingCost} ${r.currency}` : 'NOT_CONFIGURED'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'audit' && (
        <div className="rounded-2xl border bg-white dark:bg-slate-900 overflow-x-auto max-h-96">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b sticky top-0 bg-white">
                <th className="p-3">When</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Actor</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="p-3">{new Date(e.at).toLocaleString()}</td>
                  <td>{e.entity}</td>
                  <td className="font-mono">{e.action}</td>
                  <td>{e.actorName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

function Section({ title, items, render }: { title: string; items: any[]; render: (item: any) => string }) {
  return (
    <div className="rounded-2xl border bg-white dark:bg-slate-900 p-4">
      <h3 className="font-extrabold mb-2">{title}</h3>
      {(!items || items.length === 0) && <p className="text-slate-500">None pending.</p>}
      <ul className="space-y-1">
        {(items || []).map((item) => (
          <li key={item.id} className="font-mono">{render(item)} — {item.workflowStatus || item.status}</li>
        ))}
      </ul>
    </div>
  );
}
