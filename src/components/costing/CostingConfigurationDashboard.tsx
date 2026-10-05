import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Cable,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  FileText,
  Globe,
  Plus,
  RefreshCw,
  Search,
  Upload,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { BomScrapPanel } from './BomScrapPanel';
import { CostingSearchSelect } from './CostingSearchSelect';
import { DrumMasterSelect, useDrumMasterList } from '../common/DrumMasterSelect';
import { DashboardStatCard } from '../common/DashboardStatCard';
import {
  isIncrementTestScrapCode,
  isSyntheticCostingConfigCode,
  isSyntheticRawMaterialCode,
} from '../../domain/costingSyntheticCodes';
import { COSTING_PRICE_CURRENCY_CODES } from '../../domain/currencyConversion';

export type CostingWorkspaceTab =
  | 'overview'
  | 'prices'
  | 'scrap'
  | 'bom_scrap'
  | 'variables'
  | 'formulas'
  | 'bom_costing'
  | 'assignment'
  | 'other_costs'
  | 'preview'
  | 'versions'
  | 'approval'
  | 'audit';

export const COSTING_WORKSPACE_TABS: Array<{ id: CostingWorkspaceTab; en: string; ar: string }> = [
  { id: 'overview', en: 'Overview', ar: 'نظرة عامة' },
  { id: 'prices', en: 'Raw Material Prices', ar: 'أسعار الخامات' },
  { id: 'scrap', en: 'Scrap Rules', ar: 'قواعد الهالك' },
  { id: 'bom_scrap', en: 'BOM Scrap', ar: 'هالك قائمة المواد' },
  { id: 'variables', en: 'Variables', ar: 'المتغيرات' },
  { id: 'formulas', en: 'Formulas', ar: 'المعادلات' },
  { id: 'bom_costing', en: 'BOM Costing', ar: 'تكلفة قائمة المواد' },
  { id: 'assignment', en: 'Cable Assignment', ar: 'تعيين الكابل' },
  { id: 'other_costs', en: 'Other Costs', ar: 'تكاليف أخرى' },
  { id: 'preview', en: 'Preview', ar: 'معاينة' },
  { id: 'versions', en: 'Versions', ar: 'الإصدارات' },
  { id: 'approval', en: 'Approval', ar: 'الموافقة' },
  { id: 'audit', en: 'Audit', ar: 'التدقيق' },
];

const ELAND_WORKSPACE_CABLES = ['10009487', '10009546', '10010347', '10010439'] as const;

const SAFE_OPERATORS = ['+', '-', '*', '/', '(', ')'] as const;
const UNSUPPORTED_FUNCTIONS = ['SUM', 'AVG', 'ROUND', 'MIN', 'MAX', 'ABS', 'IF'] as const;
const VARIABLE_KINDS = ['INPUT', 'OUTPUT', 'INTERMEDIATE', 'CONSTANT', 'REFERENCE'] as const;
const FAMILY_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#64748b', '#8b5cf6'];
const PAGE_SIZE = 10;
const STRIP_LABELS: Record<string, { en: string; ar: string }> = {
  bom: { en: 'BOM', ar: 'قائمة المواد' },
  rmPrices: { en: 'RM prices', ar: 'أسعار الخامات' },
  scrap: { en: 'Scrap', ar: 'الهالك' },
  variables: { en: 'Variables', ar: 'المتغيرات' },
  formulas: { en: 'Formulas', ar: 'المعادلات' },
  metal: { en: 'Metal', ar: 'المعدن' },
  logistics: { en: 'Logistics', ar: 'الخدمات اللوجستية' },
  packing: { en: 'Packing', ar: 'التعبئة' },
};

function authHeaders(token: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function downloadAuthenticatedFile(token: string | null, path: string, fallbackName: string) {
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const text = await res.text();
    let message = `Download failed (${res.status})`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* keep status message */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const named = /filename="?([^"]+)"?/i.exec(disposition);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = named?.[1] || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function api(token: string | null, path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { ...authHeaders(token), ...(init?.headers || {}) } });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Non-JSON from ${path}`);
    }
  }
  if (!res.ok) throw new Error(String(data.error || `Request failed (${res.status})`));
  return data;
}

function statusBadge(status: string | undefined) {
  const s = (status || '').toUpperCase();
  if (s.includes('ACTIVE') || s.includes('APPROVED') || s.includes('PUBLISH') || s === 'READY' || s === 'READY_FOR_COSTING') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (s.includes('DRAFT') || s.includes('SUBMIT') || s.includes('UNDER') || s.includes('PENDING')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (s.includes('NOT') || s.includes('EXPIRED') || s.includes('REJECT') || s.includes('MISSING')) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (s.includes('WARNING')) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function missingLabel(reasons: string[]): string {
  const labels = new Set<string>();
  for (const reason of reasons) {
    if (/price|PRICE/i.test(reason)) labels.add('Raw Material Price');
    if (/formula|Gate 5/i.test(reason)) labels.add('Formula');
    if (/BOM|conflict/i.test(reason)) labels.add('BOM');
    if (/scrap/i.test(reason)) labels.add('Scrap');
    if (/FX_|exchange rate/i.test(reason)) labels.add('FX rate');
    if (/mapping|engineering/i.test(reason)) labels.add('Engineering Mapping');
  }
  return [...labels].join(', ') || reasons[0] || 'CONFIGURATION_REQUIRED';
}

function fmtDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

const EMPTY_FX_DRAFT = {
  id: '',
  code: '',
  name: '',
  fromCurrency: 'LE',
  toCurrency: 'USD',
  rate: '',
  effectiveFrom: '',
  effectiveTo: '',
  sourceReference: '',
};

const EMPTY_METAL_DRAFT = {
  code: '',
  name: '',
  metalType: 'COPPER',
  rate: '',
  currency: 'USD',
  unit: 'per_ton',
  rateSource: 'LME',
};

const EMPTY_LOGISTICS_DRAFT = {
  code: '',
  name: '',
  incoterm: 'FOB',
  destination: '',
  cost: '',
  currency: 'USD',
};

const EMPTY_PACKING_DRAFT = {
  code: '',
  name: '',
  drumCode: '',
  packingCost: '',
  currency: 'USD',
};

const EMPTY_SCRAP_DRAFT = {
  id: '',
  code: '',
  name: '',
  family: 'GLOBAL',
  cable: '',
  materialClass: '',
  scrapRate: '',
  priority: '100',
  effectiveFrom: '',
  effectiveTo: '',
  sourceReference: '',
};

type CableRow = {
  materialNumber: string;
  cableDescription?: string;
  family?: string | null;
  overallStatus?: string;
  blockingReasons?: string[];
  bomStatus?: string;
  rmPriceStatus?: string;
};

type ConfigStrip = {
  key: string;
  status: string;
  ready: number;
  warning: number;
  missing: number;
  pendingApproval: number;
};

type Props = {
  token: string | null;
  lang?: 'en' | 'ar';
  onOpenCostCalculator?: () => void;
};

type KpiFilter = 'all' | 'ready' | 'not_ready' | 'draft' | 'pending' | 'expired';

export const CostingConfigurationDashboard: React.FC<Props> = ({ token, lang: langProp, onOpenCostCalculator }) => {
  const { currentUser, hasPermission } = useAuth();
  const [lang, setLang] = useState<'en' | 'ar'>(langProp || 'en');
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const canApprove = hasPermission('costingPricing');
  const canManage = canApprove;

  const [tab, setTab] = useState<CostingWorkspaceTab>('overview');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [page, setPage] = useState(1);
  const [priceStatusFilter, setPriceStatusFilter] = useState('');
  const [priceCurrencyFilter, setPriceCurrencyFilter] = useState('');
  const [historyCode, setHistoryCode] = useState<string | null>(null);
  const [scrapOverlapNote, setScrapOverlapNote] = useState<string | null>(null);
  const [scrapPreview, setScrapPreview] = useState<any>(null);

  const [readiness, setReadiness] = useState<{
    summary?: Record<string, unknown>;
    cables?: CableRow[];
    configuration?: ConfigStrip[];
  } | null>(null);
  const [prices, setPrices] = useState<any[]>([]);
  const [scrapRules, setScrapRules] = useState<any[]>([]);
  const [variables, setVariables] = useState<any[]>([]);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [methods, setMethods] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<any>(null);
  const [metalRates, setMetalRates] = useState<any[]>([]);
  const [logisticsRules, setLogisticsRules] = useState<any[]>([]);
  const [packingRules, setPackingRules] = useState<any[]>([]);
  const [exchangeRates, setExchangeRates] = useState<any[]>([]);
  const [configVersionId, setConfigVersionId] = useState('');
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [formulaValidate, setFormulaValidate] = useState<string | null>(null);
  const [bomCostingCable, setBomCostingCable] = useState('10009487');
  const [bomCostingDesc, setBomCostingDesc] = useState<string | null>(null);
  const [bomCostingLines, setBomCostingLines] = useState<any[]>([]);
  const [bomEnginePreview, setBomEnginePreview] = useState<any>(null);

  const [priceDraft, setPriceDraft] = useState({
    rawMaterialCode: '',
    price: '',
    currency: 'USD',
    uom: 'kg',
    priceBasis: 'PER_KG',
    effectiveFrom: '',
    effectiveTo: '',
    supplier: '',
    comment: '',
  });
  const [scrapDraft, setScrapDraft] = useState(EMPTY_SCRAP_DRAFT);
  const [fxDraft, setFxDraft] = useState(EMPTY_FX_DRAFT);
  const [metalDraft, setMetalDraft] = useState(EMPTY_METAL_DRAFT);
  const [logisticsDraft, setLogisticsDraft] = useState(EMPTY_LOGISTICS_DRAFT);
  const [packingDraft, setPackingDraft] = useState(EMPTY_PACKING_DRAFT);
  const [otherCostsPanel, setOtherCostsPanel] = useState<
    'metal' | 'additives' | 'incoterms' | 'destination' | 'logistics' | 'drums' | 'packing'
  >('metal');
  const drums = useDrumMasterList(true);
  const [lookups, setLookups] = useState<{
    families: string[];
    cables: Array<{ materialNumber: string; description: string; family: string | null }>;
    rawMaterials: Array<{ code: string; description: string; category?: string | null; uom?: string | null }>;
    incoterms: string[];
    destinations: string[];
    currencies: string[];
    drums: Array<{ drumCode: string; drumType: string | null }>;
  }>({ families: [], cables: [], rawMaterials: [], incoterms: [], destinations: [], currencies: [...COSTING_PRICE_CURRENCY_CODES], drums: [] });
  const [variableDraft, setVariableDraft] = useState({
    id: '',
    code: '',
    name: '',
    description: '',
    kind: 'INPUT',
    unit: '',
  });
  const [formulaDraft, setFormulaDraft] = useState({
    id: '',
    code: '',
    name: '',
    outputVariableCode: 'EX_WORK_COST',
    expression: '',
    assignmentScope: 'FAMILY',
    assignmentValue: '',
    description: '',
    status: '',
  });
  const [assignmentEdits, setAssignmentEdits] = useState<Record<string, { scope: string; value: string }>>({});
  const [previewForm, setPreviewForm] = useState({
    materialNumber: '',
    lengthMeters: '1000',
    quantity: '1',
    currency: 'USD',
    incoterms: '',
    destination: '',
    drumType: '',
    copperPriceRate: '',
    aluminiumPriceRate: '',
  });

  useEffect(() => {
    if (langProp) setLang(langProp);
  }, [langProp]);

  useEffect(() => {
    const onTab = (event: Event) => {
      const next = (event as CustomEvent<CostingWorkspaceTab>).detail;
      if (next) setTab(next);
    };
    window.addEventListener('energya-costing-tab', onTab as EventListener);
    return () => window.removeEventListener('energya-costing-tab', onTab as EventListener);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && COSTING_WORKSPACE_TABS.some((item) => item.id === tabParam)) {
      setTab(tabParam as CostingWorkspaceTab);
    }
  }, []);

  const goToWorkspaceTab = (next: CostingWorkspaceTab) => {
    setTab(next);
    window.dispatchEvent(new CustomEvent<CostingWorkspaceTab>('energya-costing-tab', { detail: next }));
  };

  const refresh = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const [ready, p, s, v, f, m, a, q, mr, lr, pr, x, lu] = await Promise.all([
        api(token, '/api/master/costing-readiness').catch(() => ({ summary: {}, cables: [], configuration: [] })),
        api(token, '/api/admin/costing/raw-material-prices').catch(() => ({ prices: [] })),
        api(token, '/api/admin/costing/scrap-rules').catch(() => ({ scrapRules: [] })),
        api(token, '/api/admin/costing/variables').catch(() => ({ variables: [] })),
        api(token, '/api/admin/costing/formulas').catch(() => ({ formulas: [] })),
        api(token, '/api/admin/costing/methods').catch(() => ({ methods: [] })),
        api(token, '/api/admin/costing/audit?limit=12').catch(() => ({ events: [] })),
        api(token, '/api/admin/costing/approval-queue').catch(() => ({})),
        api(token, '/api/admin/platform/costing/metal-rates').catch(() => ({ metalRates: [] })),
        api(token, '/api/admin/platform/costing/logistics-rules').catch(() => ({ logisticsRules: [] })),
        api(token, '/api/admin/platform/costing/packing-rules').catch(() => ({ packingRules: [] })),
        api(token, '/api/admin/costing/exchange-rates').catch(() => ({ exchangeRates: [] })),
        api(token, '/api/admin/costing/lookups').catch(() => ({
          families: [],
          cables: [],
          rawMaterials: [],
          incoterms: [],
          destinations: [],
          currencies: [...COSTING_PRICE_CURRENCY_CODES],
          drums: [],
        })),
      ]);
      setReadiness({
        summary: ready.summary as Record<string, unknown>,
        cables: (ready.cables as CableRow[]) || [],
        configuration: (ready.configuration as ConfigStrip[]) || [],
      });
      setPrices((p.prices as any[]) || []);
      setScrapRules((s.scrapRules as any[]) || []);
      setScrapOverlapNote(
        typeof (s as any).overlapPolicyNote === 'string'
          ? (s as any).overlapPolicyNote
          : typeof (s as any).overlapPolicyNote === 'string'
            ? (s as any).overlapPolicyNote
            : null
      );
      setVariables((v.variables as any[]) || []);
      setFormulas((f.formulas as any[]) || []);
      setMethods((m.methods as any[]) || ((m as any).configurations as any[]) || []);
      setAuditEvents((a.events as any[]) || []);
      setApprovalQueue(q);
      setMetalRates((mr.metalRates as any[]) || []);
      setLogisticsRules((lr.logisticsRules as any[]) || []);
      setPackingRules((pr.packingRules as any[]) || []);
      setExchangeRates((x.exchangeRates as any[]) || []);
      setLookups({
        families: Array.isArray((lu as any).families) ? ((lu as any).families as string[]) : [],
        cables: Array.isArray((lu as any).cables) ? ((lu as any).cables as any[]) : [],
        rawMaterials: Array.isArray((lu as any).rawMaterials) ? ((lu as any).rawMaterials as any[]) : [],
        incoterms: Array.isArray((lu as any).incoterms) ? ((lu as any).incoterms as string[]) : [],
        destinations: Array.isArray((lu as any).destinations) ? ((lu as any).destinations as string[]) : [],
        currencies: Array.isArray((lu as any).currencies) && (lu as any).currencies.length
          ? ((lu as any).currencies as string[])
          : [...COSTING_PRICE_CURRENCY_CODES],
        drums: Array.isArray((lu as any).drums) ? ((lu as any).drums as any[]) : [],
      });
      const firstVersion = ((m.methods as any[]) || [])[0]?.versions?.[0]?.id;
      if (firstVersion) setConfigVersionId((prev) => prev || firstVersion);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const q = search.trim().toLowerCase();
  const summary = readiness?.summary || {};
  const total = Number(summary.totalCables || 0);
  const ready = Number(summary.readyForCosting || 0);
  const notReady = Number(summary.notReady || 0) + Number(summary.dataIssue || 0);
  const draft = Number(summary.underReview || 0);
  const pendingApproval = Number(summary.pendingApproval || 0);
  const expiredPrices = Number(summary.expiredPrices || 0);
  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : '—');

  const filteredPrices = useMemo(() => {
    return prices.filter((row) => {
      const code = String(row.rawMaterialCode || '');
      if (isSyntheticRawMaterialCode(code)) return false;
      if (priceStatusFilter && String(row.workflowStatus || '') !== priceStatusFilter) return false;
      if (priceCurrencyFilter && String(row.currency || '').toUpperCase() !== priceCurrencyFilter.toUpperCase()) return false;
      if (kpiFilter === 'expired') {
        const expired =
          String(row.workflowStatus || '') === 'EXPIRED' || (row.effectiveTo && new Date(row.effectiveTo) < new Date());
        if (!expired) return false;
      }
      if (!q) return true;
      return (
        code.toLowerCase().includes(q) ||
        String(row.rawMaterial?.description || row.rawMaterialDesc || '')
          .toLowerCase()
          .includes(q)
      );
    });
  }, [prices, q, priceStatusFilter, priceCurrencyFilter, kpiFilter]);

  const filteredFormulas = useMemo(
    () =>
      formulas.filter(
        (row) =>
          !isSyntheticCostingConfigCode(String(row.code || '')) &&
          (!q || String(row.code || '').toLowerCase().includes(q) || String(row.name || '').toLowerCase().includes(q))
      ),
    [formulas, q]
  );

  const filteredScrapRules = useMemo(
    () =>
      scrapRules.filter(
        (row) =>
          !isIncrementTestScrapCode(String(row.code || '')) &&
          (!q ||
            String(row.code || '').toLowerCase().includes(q) ||
            String(row.name || '').toLowerCase().includes(q) ||
            String(row.scopeValue || '').toLowerCase().includes(q))
      ),
    [scrapRules, q]
  );

  const filteredVariables = useMemo(
    () =>
      variables.filter(
        (row) =>
          !isSyntheticCostingConfigCode(String(row.code || '')) &&
          (!q || String(row.code || '').toLowerCase().includes(q) || String(row.name || '').toLowerCase().includes(q))
      ),
    [variables, q]
  );

  const officialMaterials = useMemo(
    () => lookups.rawMaterials.filter((r) => !isSyntheticRawMaterialCode(r.code)),
    [lookups.rawMaterials]
  );

  const officialMaterialCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const row of officialMaterials) {
      const category = (row.category || '').trim();
      if (category) cats.add(category);
    }
    return [...cats].sort((a, b) => a.localeCompare(b));
  }, [officialMaterials]);

  const scrapCables = useMemo(() => {
    const family = scrapDraft.family;
    return lookups.cables.filter((c) => family === 'GLOBAL' || !family || (c.family || '').toUpperCase() === family.toUpperCase());
  }, [lookups.cables, scrapDraft.family]);

  const formulaCables = useMemo(() => {
    if (formulaDraft.assignmentScope !== 'CABLE') return lookups.cables;
    const familyHint = formulaDraft.assignmentScope === 'FAMILY' ? formulaDraft.assignmentValue : '';
    return lookups.cables.filter((c) => !familyHint || (c.family || '').toUpperCase() === familyHint.toUpperCase());
  }, [lookups.cables, formulaDraft.assignmentScope, formulaDraft.assignmentValue]);

  const familyChart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cable of readiness?.cables || []) {
      const family = (cable.family || '').trim() || 'UNMAPPED';
      counts.set(family, (counts.get(family) || 0) + 1);
    }
    return [...counts.entries()].map(([name, value], i) => ({
      name,
      value,
      color: FAMILY_COLORS[i % FAMILY_COLORS.length],
    }));
  }, [readiness]);

  const filteredCables = useMemo(() => {
    let rows = readiness?.cables || [];
    if (kpiFilter === 'ready') rows = rows.filter((c) => c.overallStatus === 'READY_FOR_COSTING');
    else if (kpiFilter === 'not_ready') rows = rows.filter((c) => c.overallStatus === 'NOT_READY' || c.overallStatus === 'DATA_ISSUE');
    else if (kpiFilter === 'draft') rows = rows.filter((c) => c.overallStatus === 'UNDER_REVIEW');
    if (q) {
      rows = rows.filter(
        (c) =>
          c.materialNumber.toLowerCase().includes(q) ||
          String(c.cableDescription || '')
            .toLowerCase()
            .includes(q) ||
          String(c.family || '')
            .toLowerCase()
            .includes(q)
      );
    }
    return rows;
  }, [readiness, kpiFilter, q]);

  const pagedCables = filteredCables.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filteredCables.length / PAGE_SIZE));
  const notReadyCables = filteredCables.filter((c) => c.overallStatus !== 'READY_FOR_COSTING').slice(0, 8);

  const appendToken = (tokenText: string) => {
    setFormulaDraft((f) => ({
      ...f,
      expression: `${f.expression}${f.expression && !f.expression.endsWith(' ') ? ' ' : ''}${tokenText}`,
    }));
  };

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createPrice = () =>
    runAction(async () => {
      await api(token, '/api/admin/costing/raw-material-prices', {
        method: 'POST',
        body: JSON.stringify({
          ...priceDraft,
          price: priceDraft.price === '' ? null : Number(priceDraft.price),
        }),
      });
    });

  const priceAction = (id: string, action: string) =>
    runAction(async () => {
      await api(token, `/api/admin/costing/raw-material-prices/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    });

  const createOrUpdateScrap = () =>
    runAction(async () => {
      const family = scrapDraft.family || 'GLOBAL';
      const cable = scrapDraft.cable.trim();
      const materialClass = scrapDraft.materialClass.trim();
      const scopeType = cable
        ? 'CABLE'
        : family !== 'GLOBAL'
          ? 'FAMILY'
          : materialClass
            ? 'MATERIAL_CLASS'
            : 'GLOBAL';
      const scopeValue = cable || (family !== 'GLOBAL' ? family : materialClass || null);
      const name =
        scrapDraft.name.trim() ||
        `Scrap ${scopeType === 'CABLE' ? cable : scopeType === 'MATERIAL_CLASS' ? materialClass : family}`;
      const payload = {
        name,
        scopeType,
        scopeValue,
        scrapRate: scrapDraft.scrapRate === '' ? null : Number(scrapDraft.scrapRate),
        priority: Number(scrapDraft.priority) || 100,
        materialClass: scrapDraft.materialClass || null,
        effectiveFrom: scrapDraft.effectiveFrom || null,
        effectiveTo: scrapDraft.effectiveTo || null,
        sourceReference: scrapDraft.sourceReference || undefined,
      };
      if (scrapDraft.id) {
        await api(token, `/api/admin/costing/scrap-rules/${scrapDraft.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api(token, '/api/admin/costing/scrap-rules', { method: 'POST', body: JSON.stringify(payload) });
        setScrapDraft(EMPTY_SCRAP_DRAFT);
      }
    });

  const saveFxRate = () =>
    runAction(async () => {
      if (!fxDraft.rate.trim()) throw new Error(t('Enter the real FX rate. The platform does not invent rates.', 'أدخل سعر الصرف الفعلي. المنصة لا تخترع السعر.'));
      const payload = {
        name: fxDraft.name.trim() || `${fxDraft.fromCurrency} → ${fxDraft.toCurrency}`,
        fromCurrency: fxDraft.fromCurrency,
        toCurrency: fxDraft.toCurrency,
        rate: Number(fxDraft.rate),
        effectiveFrom: fxDraft.effectiveFrom || null,
        effectiveTo: fxDraft.effectiveTo || null,
        sourceReference: fxDraft.sourceReference || undefined,
      };
      if (fxDraft.id) {
        await api(token, `/api/admin/costing/exchange-rates/${fxDraft.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await api(token, '/api/admin/costing/exchange-rates', { method: 'POST', body: JSON.stringify(payload) });
        setFxDraft(EMPTY_FX_DRAFT);
      }
    });

  const saveMetalRate = () =>
    runAction(async () => {
      if (!metalDraft.code.trim() || !metalDraft.metalType.trim()) {
        throw new Error(t('Code and metal type are required. Leave rate blank if not configured.', 'الكود ونوع المعدن مطلوبان. اترك السعر فارغاً إن لم يُهيأ.'));
      }
      await api(token, '/api/admin/platform/costing/metal-rates', {
        method: 'POST',
        body: JSON.stringify({
          code: metalDraft.code.trim(),
          name: metalDraft.name.trim() || metalDraft.code.trim(),
          metalType: metalDraft.metalType.trim(),
          rate: metalDraft.rate.trim() ? Number(metalDraft.rate) : null,
          currency: metalDraft.currency,
          unit: metalDraft.unit,
          rateSource: metalDraft.rateSource,
        }),
      });
      setMetalDraft(EMPTY_METAL_DRAFT);
    });

  const saveLogisticsRule = () =>
    runAction(async () => {
      if (!logisticsDraft.code.trim() || !logisticsDraft.incoterm.trim()) {
        throw new Error(t('Code and incoterm are required. Leave cost blank if not configured.', 'الكود والإنكوترمز مطلوبان. اترك التكلفة فارغة إن لم تُهيأ.'));
      }
      await api(token, '/api/admin/platform/costing/logistics-rules', {
        method: 'POST',
        body: JSON.stringify({
          code: logisticsDraft.code.trim(),
          name: logisticsDraft.name.trim() || logisticsDraft.code.trim(),
          incoterm: logisticsDraft.incoterm.trim(),
          destination: logisticsDraft.destination.trim() || null,
          cost: logisticsDraft.cost.trim() ? Number(logisticsDraft.cost) : null,
          currency: logisticsDraft.currency,
        }),
      });
      setLogisticsDraft(EMPTY_LOGISTICS_DRAFT);
    });

  const savePackingRule = () =>
    runAction(async () => {
      if (!packingDraft.code.trim()) {
        throw new Error(t('Code is required. Leave packing cost blank if not configured.', 'الكود مطلوب. اترك تكلفة التعبئة فارغة إن لم تُهيأ.'));
      }
      await api(token, '/api/admin/platform/costing/packing-rules', {
        method: 'POST',
        body: JSON.stringify({
          code: packingDraft.code.trim(),
          name: packingDraft.name.trim() || packingDraft.code.trim(),
          drumCode: packingDraft.drumCode.trim() || null,
          packingCost: packingDraft.packingCost.trim() ? Number(packingDraft.packingCost) : null,
          currency: packingDraft.currency,
        }),
      });
      setPackingDraft(EMPTY_PACKING_DRAFT);
    });

  const saveVariable = () =>
    runAction(async () => {
      if (variableDraft.id) {
        await api(token, `/api/admin/costing/variables/${variableDraft.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: variableDraft.name, description: variableDraft.description }),
        });
      } else {
        await api(token, '/api/admin/costing/variables', {
          method: 'POST',
          body: JSON.stringify(variableDraft),
        });
      }
    });

  const deactivateVariable = (row: any) =>
    runAction(async () => {
      if ((row.usedBy || []).length > 0) {
        await api(token, `/api/admin/costing/variables/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'INACTIVE' }),
        });
        return;
      }
      await api(token, `/api/admin/costing/variables/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'INACTIVE' }),
      });
    });

  const validateFormula = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api(token, '/api/admin/costing/formulas/validate', {
        method: 'POST',
        body: JSON.stringify({
          expression: formulaDraft.expression,
          outputVariable: formulaDraft.outputVariableCode,
        }),
      });
      const errors = Array.isArray(data.errors) ? (data.errors as Array<{ message?: string }>).map((e) => e.message).filter(Boolean) : [];
      setFormulaValidate(data.valid === false ? errors.join('; ') || String(data.error || 'Invalid formula') : t('Formula is valid.', 'المعادلة صحيحة.'));
    } catch (err: any) {
      setFormulaValidate(err.message);
    } finally {
      setBusy(false);
    }
  };

  const createFormula = () =>
    runAction(async () => {
      if (!configVersionId) throw new Error(t('Select or activate a configuration version first.', 'اختر أو فعّل إصدار تكوين أولاً.'));
      await api(token, '/api/admin/costing/formulas', {
        method: 'POST',
        body: JSON.stringify({ ...formulaDraft, configurationVersionId: configVersionId }),
      });
    });

  const formulaWorkflow = (id: string, action: 'submit' | 'approve') =>
    runAction(async () => {
      await api(token, `/api/admin/costing/formulas/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
    });

  const approveQueued = (path: string, body?: Record<string, unknown>) =>
    runAction(async () => {
      await api(token, path, { method: 'POST', body: JSON.stringify(body || {}) });
    });

  const saveAssignment = (id: string) =>
    runAction(async () => {
      const edit = assignmentEdits[id];
      const row = formulas.find((f) => f.id === id);
      await api(token, `/api/admin/costing/formulas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          assignmentScope: edit?.scope || row?.assignmentScope || 'GLOBAL',
          assignmentValue: edit?.value ?? row?.assignmentValue ?? '',
        }),
      });
    });

  const loadBomCosting = async (materialNumber?: string) => {
    const cable = (materialNumber || bomCostingCable).trim();
    if (!cable) {
      setError(t('Enter a cable material number.', 'أدخل رقم مادة الكابل.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setBomCostingCable(cable);
      const bom = await api(token, `/api/admin/costing/bom-scrap?cable=${encodeURIComponent(cable)}`);
      setBomCostingDesc(typeof bom.cableDescription === 'string' ? bom.cableDescription : null);
      setBomCostingLines((bom.lines as any[]) || []);
      const validated = await api(token, '/api/admin/costing/validate', {
        method: 'POST',
        body: JSON.stringify({ materialNumber: cable, quantity: 1, lengthMeters: 1000, currency: 'USD' }),
      }).catch((err: Error) => ({ preview: null, status: 'NOT_READY', blockingReasons: [err.message], persisted: false }));
      setBomEnginePreview(validated.preview || validated);
    } catch (err: any) {
      setError(err.message);
      setBomCostingLines([]);
      setBomEnginePreview(null);
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api(token, '/api/admin/costing/preview', {
        method: 'POST',
        body: JSON.stringify({
          materialNumber: previewForm.materialNumber,
          quantity: Number(previewForm.quantity),
          lengthMeters: Number(previewForm.lengthMeters),
          currency: previewForm.currency,
          configurationVersionId: configVersionId || undefined,
          incoterms: previewForm.incoterms || undefined,
          destination: previewForm.destination || undefined,
          drumType: previewForm.drumType || undefined,
          copperPriceRate: previewForm.copperPriceRate === '' ? undefined : Number(previewForm.copperPriceRate),
          aluminiumPriceRate: previewForm.aluminiumPriceRate === '' ? undefined : Number(previewForm.aluminiumPriceRate),
        }),
      });
      setPreviewResult(data.preview);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const previewScrapQty = async () => {
    const cable = scrapDraft.cable || previewForm.materialNumber;
    if (!cable) {
      setError(t('Select a cable (scope CABLE or Preview material number) to preview qty with scrap.', 'اختر كابلاً لمعاينة الكمية مع الهالك.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api(token, '/api/admin/costing/preview', {
        method: 'POST',
        body: JSON.stringify({ materialNumber: cable, quantity: 1, lengthMeters: 1000, currency: 'USD' }),
      });
      setScrapPreview(data.preview);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadAuthenticatedFile(token, '/api/master/raw-material-prices-export?purpose=template', 'Raw_Material_Prices_Template.xlsx');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadPrices = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]] || {});
      const preview = await api(token, '/api/master/raw-material-prices/import/preview', {
        method: 'POST',
        body: JSON.stringify({ rows, sourceFile: file.name }),
      });
      const previewBlock = (preview.preview || preview) as { canSubmit?: boolean; rows?: any[] };
      if (!previewBlock.canSubmit) {
        throw new Error(t('Import validation failed. Fix unknown materials, invalid prices, or overlapping dates. Import stays DRAFT.', 'فشل التحقق من الاستيراد. يبقى الاستيراد كمسودة.'));
      }
      await api(token, '/api/master/raw-material-prices/import/commit', {
        method: 'POST',
        body: JSON.stringify({ rows: previewBlock.rows || rows, sourceFile: file.name }),
      });
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const clickKpi = (next: KpiFilter) => {
    setKpiFilter(next);
    setPage(1);
    if (next === 'pending') setTab('approval');
    else if (next === 'expired') {
      setTab('prices');
      setPriceStatusFilter('EXPIRED');
    } else setTab('overview');
  };

  const goPreview = (materialNumber: string) => {
    setPreviewForm((f) => ({ ...f, materialNumber }));
    setTab('preview');
  };

  const historyRows = historyCode ? prices.filter((p) => p.rawMaterialCode === historyCode) : [];

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-2 bg-[#F4F7FB] min-h-[calc(100vh-4rem)] text-slate-800" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Energya Cables</p>
          <h1 className="text-xl font-black text-brand-800">{t('Costing Configuration', 'تكوين التكاليف')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-1 justify-end min-w-[240px]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={t('Search cable, material, formula...', 'بحث عن كابل أو مادة أو معادلة...')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm bg-slate-50"
            />
          </div>
          <button type="button" className="p-2 rounded-lg border border-slate-200 text-slate-500" title={t('Notifications', 'إشعارات')}>
            <Bell className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-1"
          >
            <Globe className="h-3.5 w-3.5" /> {lang === 'en' ? 'EN' : 'AR'}
          </button>
          <div className="text-right">
            <p className="text-xs font-bold text-brand-800">{currentUser?.fullName || t('Costing Manager', 'مدير التكاليف')}</p>
            <p className="text-[10px] text-slate-500">{currentUser?.role || t('Costing Team', 'فريق التكاليف')}</p>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap gap-1 border-b border-slate-200 bg-white">
        {COSTING_WORKSPACE_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              window.dispatchEvent(new CustomEvent<CostingWorkspaceTab>('energya-costing-tab', { detail: item.id }));
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold ${tab === item.id ? 'bg-[#1D4ED8] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {lang === 'ar' ? item.ar : item.en}
          </button>
        ))}
        <button type="button" onClick={() => void refresh()} className="ml-auto px-3 py-1.5 rounded-md border text-xs font-bold flex items-center gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> {t('Refresh', 'تحديث')}
        </button>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-4 space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm font-semibold flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {tab === 'overview' && (
          <section className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 items-stretch auto-rows-fr">
              {[
                { id: 'all' as KpiFilter, label: t('Total active cables', 'إجمالي الكابلات النشطة'), value: total, sub: t('Cable Master ACTIVE', 'الكابلات النشطة'), icon: Cable },
                { id: 'ready' as KpiFilter, label: t('Ready', 'جاهز'), value: ready, sub: pct(ready), icon: CheckCircle2 },
                { id: 'not_ready' as KpiFilter, label: t('Not Ready', 'غير جاهز'), value: notReady, sub: pct(notReady), icon: XCircle },
                { id: 'draft' as KpiFilter, label: t('Draft', 'مسودة'), value: draft, sub: pct(draft), icon: FileText },
                { id: 'pending' as KpiFilter, label: t('Pending Approval', 'بانتظار الموافقة'), value: pendingApproval, sub: t('Submitted prices / formulas / scrap', 'أسعار ومعادلات وهالك مقدّمة'), icon: Clock },
                { id: 'expired' as KpiFilter, label: t('Expired', 'منتهية'), value: expiredPrices, sub: t('Expired RM prices', 'أسعار خامات منتهية'), icon: AlertTriangle },
              ].map((card) => (
                <DashboardStatCard
                  key={card.id}
                  size="compact"
                  icon={card.icon}
                  label={card.label}
                  value={card.value}
                  subtitle={card.sub}
                  selected={kpiFilter === card.id}
                  onViewAll={() => clickKpi(card.id)}
                />
              ))}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-brand-800 mb-2">{t('Configuration readiness', 'جاهزية التكوين')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
                {(readiness?.configuration || []).map((item) => (
                  <div key={item.key} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                    <p className="text-[10px] font-bold text-slate-500">{STRIP_LABELS[item.key]?.[lang] || item.key}</p>
                    <p className={`text-[11px] font-black mt-1 ${statusBadge(item.status).split(' ')[1]}`}>{item.status}</p>
                    <p className="text-[10px] text-slate-400">{item.ready}/{item.warning}/{item.missing}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <h3 className="text-sm font-bold text-brand-800 mb-2">{t('Costing readiness by cable family', 'الجاهزية حسب عائلة الكابل')}</h3>
                <p className="text-[10px] text-slate-400 mb-2">{t('Family from Cable Master / engineering mapping. UNMAPPED if missing.', 'العائلة من بيانات الكابل أو الربط الهندسي.')}</p>
                {familyChart.length === 0 ? (
                  <p className="text-xs text-slate-500">{t('No cable master rows loaded.', 'لا توجد كابلات.')}</p>
                ) : (
                  <div className="h-44">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={familyChart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2}>
                          {familyChart.map((row) => (
                            <Cell key={row.name} fill={row.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <ul className="text-[11px] space-y-1">
                  {familyChart.map((row) => (
                    <li key={row.name} className="flex justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
                        {row.name}
                      </span>
                      <span className="font-bold">{row.value}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm lg:col-span-2">
                <h3 className="text-sm font-bold text-brand-800 mb-2">{t('Top cables not ready', 'أعلى الكابلات غير الجاهزة')}</h3>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="pb-1">{t('Cable', 'الكابل')}</th>
                      <th>{t('Blocking', 'المانع')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {notReadyCables.map((cable) => (
                      <tr key={cable.materialNumber} className="border-t border-slate-100">
                        <td className="py-1.5 font-mono font-bold">{cable.materialNumber}</td>
                        <td className="text-slate-500">{missingLabel(cable.blockingReasons || [])}</td>
                        <td className="whitespace-nowrap">
                          {canManage && (
                            <button type="button" className="text-[#1D4ED8] font-bold mr-2" onClick={() => setTab(/price/i.test(missingLabel(cable.blockingReasons || [])) ? 'prices' : 'formulas')}>
                              {t('Configure', 'تهيئة')}
                            </button>
                          )}
                          <button type="button" className="text-slate-600 font-bold mr-2" onClick={() => goPreview(cable.materialNumber)}>
                            {t('View', 'عرض')}
                          </button>
                          {canApprove && (
                            <button type="button" className="text-amber-700 font-bold mr-2" onClick={() => setTab('approval')}>
                              {t('Review Approval', 'مراجعة الموافقة')}
                            </button>
                          )}
                          <button type="button" className="text-brand-800 font-bold" onClick={() => goPreview(cable.materialNumber)}>
                            {t('Preview', 'معاينة')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 font-bold text-brand-800 flex justify-between">
                <span>{t('Cables', 'الكابلات')}</span>
                <span className="text-xs font-semibold text-slate-400">
                  {filteredCables.length} · {t('page', 'صفحة')} {page}/{pageCount}
                </span>
              </div>
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2 text-left">{t('Material', 'المادة')}</th>
                    <th className="p-2 text-left">{t('Family', 'العائلة')}</th>
                    <th className="p-2 text-left">{t('Status', 'الحالة')}</th>
                    <th className="p-2 text-left">{t('Blocking', 'المانع')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCables.map((cable) => (
                    <tr key={cable.materialNumber} className="border-t even:bg-slate-50/60">
                      <td className="p-2 font-mono font-bold">{cable.materialNumber}</td>
                      <td className="p-2">{cable.family || 'UNMAPPED'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge(cable.overallStatus)}`}>{cable.overallStatus}</span>
                      </td>
                      <td className="p-2 text-slate-500">{missingLabel(cable.blockingReasons || [])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 border rounded text-xs font-bold disabled:opacity-40">
                  {t('Previous', 'السابق')}
                </button>
                <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 border rounded text-xs font-bold disabled:opacity-40">
                  {t('Next', 'التالي')}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-brand-800 mb-2">{t('Recent costing audit', 'أحداث التدقيق الأخيرة')}</h3>
              <ul className="space-y-2 text-[11px]">
                {auditEvents.length === 0 && <li className="text-slate-500">{t('No costing audit events yet.', 'لا توجد أحداث تدقيق بعد.')}</li>}
                {auditEvents.slice(0, 8).map((event) => (
                  <li key={event.id} className="border-l-2 border-blue-200 pl-2">
                    <p className="font-bold text-slate-700">{event.action}</p>
                    <p className="text-slate-400">
                      {event.entity} · {event.actorName || '—'} · {event.at ? new Date(event.at).toLocaleString() : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {tab === 'prices' && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b">
              <h3 className="font-bold text-brand-800">{t('Raw Material Prices', 'أسعار الخامات')}</h3>
              <div className="flex gap-2">
                <label className="px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> {t('Upload Excel', 'رفع Excel')}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadPrices(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button type="button" onClick={() => void downloadTemplate()} className="px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> {t('Template', 'قالب')}
                </button>
              </div>
            </div>
            <p className="px-4 pt-2 text-[11px] text-amber-700">{t('Blank price ≠ 0. Official list blanks stay PRICE_NOT_CONFIGURED. Excel import creates DRAFT only.', 'السعر الفارغ ليس صفراً. الاستيراد يبقى مسودة.')}</p>
            <div className="p-3 grid sm:grid-cols-8 gap-2 text-xs border-b bg-slate-50">
              <CostingSearchSelect
                value={priceDraft.rawMaterialCode}
                onChange={(rawMaterialCode) => setPriceDraft({ ...priceDraft, rawMaterialCode })}
                options={officialMaterials.map((r) => ({ value: r.code, label: r.description }))}
                placeholder={t('Official RM code', 'كود الخامة الرسمي')}
                emptyLabel={t('Select material', 'اختر المادة')}
              />
              <input className="border rounded-lg px-2 py-1.5" placeholder={t('Price (blank = not configured)', 'السعر (فارغ = غير مهيأ)')} value={priceDraft.price} onChange={(e) => setPriceDraft({ ...priceDraft, price: e.target.value })} />
              <select className="border rounded-lg px-2 py-1.5" value={priceDraft.currency} onChange={(e) => setPriceDraft({ ...priceDraft, currency: e.target.value })}>
                {(lookups.currencies.length ? lookups.currencies : COSTING_PRICE_CURRENCY_CODES).map((c) => (
                  <option key={c} value={c}>{c}{c === 'EGP' ? ' (= LE)' : ''}</option>
                ))}
              </select>
              <input className="border rounded-lg px-2 py-1.5" placeholder="UOM" value={priceDraft.uom} onChange={(e) => setPriceDraft({ ...priceDraft, uom: e.target.value })} />
              <select className="border rounded-lg px-2 py-1.5" value={priceDraft.priceBasis} onChange={(e) => setPriceDraft({ ...priceDraft, priceBasis: e.target.value })}>
                {['PER_KG', 'PER_TON', 'PER_METER', 'PER_PCS', 'PER_M2'].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
              <input className="border rounded-lg px-2 py-1.5" type="date" value={priceDraft.effectiveFrom} onChange={(e) => setPriceDraft({ ...priceDraft, effectiveFrom: e.target.value })} />
              <input className="border rounded-lg px-2 py-1.5" type="date" value={priceDraft.effectiveTo} onChange={(e) => setPriceDraft({ ...priceDraft, effectiveTo: e.target.value })} />
              {canManage && (
                <button type="button" onClick={() => void createPrice()} className="bg-[#1D4ED8] text-white rounded-lg font-bold flex items-center justify-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> {t('Add / Edit draft', 'إضافة / تعديل مسودة')}
                </button>
              )}
            </div>
            <div className="px-3 py-2 flex flex-wrap gap-2 text-xs border-b">
              <select className="border rounded-lg px-2 py-1" value={priceStatusFilter} onChange={(e) => setPriceStatusFilter(e.target.value)}>
                <option value="">{t('All statuses', 'كل الحالات')}</option>
                {['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input className="border rounded-lg px-2 py-1 w-24" placeholder={t('Currency', 'العملة')} value={priceCurrencyFilter} onChange={(e) => setPriceCurrencyFilter(e.target.value)} />
            </div>
            <div className="overflow-x-auto max-h-[28rem]">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2 text-left">{t('Code', 'الكود')}</th>
                    <th className="p-2 text-left">{t('Material', 'المادة')}</th>
                    <th className="p-2 text-right">{t('Price', 'السعر')}</th>
                    <th className="p-2 text-left">{t('Currency', 'العملة')}</th>
                    <th className="p-2 text-left">UOM</th>
                    <th className="p-2 text-left">{t('Basis', 'الأساس')}</th>
                    <th className="p-2 text-left">{t('From', 'من')}</th>
                    <th className="p-2 text-left">{t('To', 'إلى')}</th>
                    <th className="p-2 text-left">{t('Supplier', 'المورد')}</th>
                    <th className="p-2 text-left">{t('Source', 'المصدر')}</th>
                    <th className="p-2 text-left">{t('Rev', 'الإصدار')}</th>
                    <th className="p-2 text-left">{t('Status', 'الحالة')}</th>
                    <th className="p-2 text-left">{t('Approved by', 'اعتمدها')}</th>
                    <th className="p-2 text-left">{t('Actions', 'إجراءات')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrices.slice(0, 200).map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 even:bg-slate-50/60">
                      <td className="p-2 font-mono font-bold">{row.rawMaterialCode}</td>
                      <td className="p-2">{row.rawMaterial?.description || row.rawMaterialDesc || '—'}</td>
                      <td className="p-2 text-right font-mono">{row.price != null ? row.price : 'PRICE_NOT_CONFIGURED'}</td>
                      <td className="p-2">{row.currency || '—'}</td>
                      <td className="p-2">{row.uom || '—'}</td>
                      <td className="p-2">{row.priceBasis}</td>
                      <td className="p-2">{fmtDate(row.effectiveFrom)}</td>
                      <td className="p-2">{fmtDate(row.effectiveTo)}</td>
                      <td className="p-2">{row.supplier || '—'}</td>
                      <td className="p-2">{row.source || '—'}</td>
                      <td className="p-2">{row.revision}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge(row.workflowStatus)}`}>{row.workflowStatus}</span>
                      </td>
                      <td className="p-2">{row.approvedBy || '—'}</td>
                      <td className="p-2 whitespace-nowrap">
                        {canManage && ['DRAFT', 'REJECTED'].includes(row.workflowStatus) && (
                          <button type="button" className="text-[#1D4ED8] font-bold mr-1" onClick={() => void priceAction(row.id, 'SUBMIT')}>
                            {t('Submit', 'تقديم')}
                          </button>
                        )}
                        {canApprove && ['SUBMITTED', 'UNDER_REVIEW'].includes(row.workflowStatus) && (
                          <>
                            <button type="button" className="text-emerald-700 font-bold mr-1" onClick={() => void priceAction(row.id, 'APPROVE')}>
                              {t('Approve', 'اعتماد')}
                            </button>
                            <button type="button" className="text-rose-700 font-bold mr-1" onClick={() => void priceAction(row.id, 'REJECT')}>
                              {t('Reject', 'رفض')}
                            </button>
                          </>
                        )}
                        {canManage && row.workflowStatus === 'APPROVED' && (
                          <button type="button" className="text-slate-600 font-bold mr-1" onClick={() => void priceAction(row.id, 'EXPIRE')}>
                            {t('Deactivate', 'إيقاف')}
                          </button>
                        )}
                        <button type="button" className="text-slate-500 font-bold" onClick={() => setHistoryCode(row.rawMaterialCode)}>
                          {t('History', 'السجل')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {historyCode && (
              <div className="p-4 border-t bg-slate-50 text-xs">
                <div className="flex justify-between mb-2">
                  <p className="font-bold text-brand-800">
                    {t('History', 'السجل')} · {historyCode}
                  </p>
                  <button type="button" className="font-bold" onClick={() => setHistoryCode(null)}>
                    {t('Close', 'إغلاق')}
                  </button>
                </div>
                {historyRows.map((row) => (
                  <p key={row.id} className="font-mono">
                    r{row.revision} · {row.workflowStatus} · {row.price != null ? row.price : 'PRICE_NOT_CONFIGURED'} · {fmtDate(row.createdAt)}
                  </p>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'scrap' && (
          <div className="space-y-4">
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {scrapOverlapNote ||
                t(
                  'Overlap at the same specificity and priority is BUSINESS_RULE_REQUIRED. Engine: BOM line scrap % first, then ACTIVE rule by specificity (BOM_LINE > CABLE > FAMILY > MATERIAL_CLASS > GLOBAL), then lowest priority.',
                  'تعارض التداخل غير معرّف. المحرك يستخدم هالك بند قائمة المواد أولاً ثم القاعدة النشطة ذات الأولوية الأدنى.'
                )}
            </p>
            <div className="grid lg:grid-cols-3 gap-3">
              <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b font-bold text-brand-800">{t('Scrap Rules', 'قواعد الهالك')}</div>
                <div className="overflow-x-auto max-h-72">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="p-2 text-left">{t('Code', 'الكود')}</th>
                        <th className="p-2 text-left">{t('Scope', 'النطاق')}</th>
                        <th className="p-2 text-right">{t('Scrap', 'الهالك')}</th>
                        <th className="p-2 text-left">{t('Priority', 'الأولوية')}</th>
                        <th className="p-2 text-left">{t('Status', 'الحالة')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredScrapRules.map((row) => (
                        <tr key={row.id} className="border-t even:bg-slate-50/60">
                          <td className="p-2 font-mono font-bold">{row.code}</td>
                          <td className="p-2">
                            {row.scopeType}
                            {row.scopeValue ? ` / ${row.scopeValue}` : ''}
                            {row.materialClass ? ` · ${row.materialClass}` : ''}
                          </td>
                          <td className="p-2 text-right">{row.scrapRate != null ? row.scrapRate : '—'}</td>
                          <td className="p-2">{row.priority}</td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge(row.workflowStatus)}`}>{row.workflowStatus}</span>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {canManage && (
                              <button
                                type="button"
                                className="text-[#1D4ED8] font-bold mr-1"
                                onClick={() =>
                                  setScrapDraft({
                                    id: row.id,
                                    code: row.code,
                                    name: row.name,
                                    family:
                                      row.scopeType === 'FAMILY'
                                        ? row.scopeValue || 'GLOBAL'
                                        : row.scopeType === 'GLOBAL' || row.scopeType === 'MATERIAL_CLASS'
                                          ? 'GLOBAL'
                                          : lookups.cables.find((c) => c.materialNumber === row.scopeValue)?.family || 'GLOBAL',
                                    cable: row.scopeType === 'CABLE' ? row.scopeValue || '' : '',
                                    materialClass:
                                      row.scopeType === 'MATERIAL_CLASS'
                                        ? row.scopeValue || row.materialClass || ''
                                        : row.materialClass || '',
                                    scrapRate: row.scrapRate != null ? String(row.scrapRate) : '',
                                    priority: String(row.priority ?? 100),
                                    effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : '',
                                    effectiveTo: row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : '',
                                    sourceReference: row.sourceReference || '',
                                  })
                                }
                              >
                                {t('Edit', 'تعديل')}
                              </button>
                            )}
                            {canManage && row.workflowStatus === 'DRAFT' && (
                              <button type="button" className="text-amber-700 font-bold mr-1" onClick={() => void approveQueued(`/api/admin/costing/scrap-rules/${row.id}/submit`)}>
                                {t('Submit', 'تقديم')}
                              </button>
                            )}
                            {canApprove && row.workflowStatus === 'SUBMITTED' && (
                              <button type="button" className="text-emerald-700 font-bold" onClick={() => void approveQueued(`/api/admin/costing/scrap-rules/${row.id}/approve`)}>
                                {t('Approve', 'اعتماد')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2 text-xs">
                <h3 className="font-bold text-brand-800">{scrapDraft.id ? t('Edit scrap rule', 'تعديل قاعدة الهالك') : t('Add scrap rule', 'إضافة قاعدة هالك')}</h3>
                <p className="text-amber-700">{t('Leave scrap % blank until governed. Decimal 0.02 = 2%. Code is assigned as SC26-00001.', 'اترك النسبة فارغة حتى الاعتماد. الكود يُعيَّن تلقائياً SC26-00001.')}</p>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Code', 'الكود')}</label>
                <input className="w-full border rounded-lg px-2 py-1.5 bg-slate-50 font-mono" value={scrapDraft.code || t('Auto SCYY-#####', 'تلقائي SCYY-#####')} disabled />
                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Name', 'الاسم')}</label>
                <input className="w-full border rounded-lg px-2 py-1.5" placeholder={t('Name (optional)', 'الاسم (اختياري)')} value={scrapDraft.name} onChange={(e) => setScrapDraft({ ...scrapDraft, name: e.target.value })} />
                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Cable family', 'عائلة الكابل')}</label>
                <select
                  className="w-full border rounded-lg px-2 py-1.5"
                  value={scrapDraft.family}
                  onChange={(e) => setScrapDraft({ ...scrapDraft, family: e.target.value, cable: '' })}
                >
                  <option value="GLOBAL">{t('All / GLOBAL', 'الكل / عام')}</option>
                  {lookups.families.map((family) => (
                    <option key={family} value={family}>
                      {family}
                    </option>
                  ))}
                </select>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Cable (optional)', 'الكابل (اختياري)')}</label>
                <CostingSearchSelect
                  value={scrapDraft.cable}
                  onChange={(cable) => setScrapDraft({ ...scrapDraft, cable })}
                  options={scrapCables.map((c) => ({ value: c.materialNumber, label: c.description }))}
                  placeholder={t('All cables', 'كل الكابلات')}
                  emptyLabel={t('All cables', 'كل الكابلات')}
                />
                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Material class', 'فئة الخامة')}</label>
                <CostingSearchSelect
                  value={scrapDraft.materialClass}
                  onChange={(materialClass) => setScrapDraft({ ...scrapDraft, materialClass })}
                  options={officialMaterialCategories.map((category) => ({ value: category, label: category }))}
                  placeholder={t('Official RM category (optional)', 'فئة خامة رسمية (اختياري)')}
                  emptyLabel={t('No material class', 'بدون فئة مادة')}
                />
                <p className="text-slate-600">{t('MATERIAL_CLASS matches RawMaterial.category from the official RM master (I4-RM-* excluded). With family/cable empty, this saves as MATERIAL_CLASS. Code stays SC26-00001.', 'MATERIAL_CLASS تطابق فئة الخامة الرسمية. بدون عائلة/كابل تُحفظ كـ MATERIAL_CLASS. الكود يبقى SC26-00001.')}</p>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Scrap %', 'نسبة الهالك')}</label>
                <input className="w-full border rounded-lg px-2 py-1.5" placeholder={t('Scrap rate decimal (optional)', 'معدل الهالك (اختياري)')} value={scrapDraft.scrapRate} onChange={(e) => setScrapDraft({ ...scrapDraft, scrapRate: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Effective from', 'ساري من')}</label>
                    <input className="w-full border rounded-lg px-2 py-1.5" type="date" value={scrapDraft.effectiveFrom} onChange={(e) => setScrapDraft({ ...scrapDraft, effectiveFrom: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Effective to', 'ساري إلى')}</label>
                    <input className="w-full border rounded-lg px-2 py-1.5" type="date" value={scrapDraft.effectiveTo} onChange={(e) => setScrapDraft({ ...scrapDraft, effectiveTo: e.target.value })} />
                  </div>
                </div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Priority', 'الأولوية')}</label>
                <input className="w-full border rounded-lg px-2 py-1.5" placeholder={t('Priority (lower wins)', 'الأولوية (الأقل تفوز)')} value={scrapDraft.priority} onChange={(e) => setScrapDraft({ ...scrapDraft, priority: e.target.value })} />
                <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Status', 'الحالة')}</label>
                <input className="w-full border rounded-lg px-2 py-1.5 bg-slate-50" value={scrapDraft.id ? scrapRules.find((r) => r.id === scrapDraft.id)?.workflowStatus || 'DRAFT' : 'DRAFT'} disabled />
                <input className="w-full border rounded-lg px-2 py-1.5" placeholder={t('Notes', 'ملاحظات')} value={scrapDraft.sourceReference} onChange={(e) => setScrapDraft({ ...scrapDraft, sourceReference: e.target.value })} />
                {canManage && (
                  <button type="button" onClick={() => void createOrUpdateScrap()} className="w-full bg-[#1D4ED8] text-white rounded-lg py-2 font-bold">
                    {scrapDraft.id ? t('Save scrap rule', 'حفظ قاعدة الهالك') : t('Add scrap rule', 'إضافة قاعدة هالك')}
                  </button>
                )}
                {scrapDraft.id && (
                  <button type="button" onClick={() => setScrapDraft(EMPTY_SCRAP_DRAFT)} className="w-full border rounded-lg py-2 font-bold">
                    {t('New rule', 'قاعدة جديدة')}
                  </button>
                )}
                <button type="button" onClick={() => void previewScrapQty()} className="w-full border rounded-lg py-2 font-bold">
                  {t('Preview qty including scrap', 'معاينة الكمية مع الهالك')}
                </button>
                {scrapPreview && (
                  <div className="border rounded-lg p-2 bg-slate-50 max-h-40 overflow-auto">
                    <p className="font-bold">
                      {t('Engine', 'المحرك')}: {scrapPreview.status} {scrapPreview.errorCode ? `· ${scrapPreview.errorCode}` : ''}
                    </p>
                    {(scrapPreview.materialBreakdown || []).slice(0, 8).map((line: any) => (
                      <p key={line.rawMaterialCode} className="font-mono">
                        {line.rawMaterialCode}: {line.baseConsumptionPerKm} → {line.adjustedConsumptionPerKm} ({line.scrapSource}
                        {line.scrapRate != null ? ` ${line.scrapRate}` : ''})
                      </p>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2">
              <span>
                {t(
                  'Set standard scrap % per cable BOM line, or use the Excel template for bulk upload by Metal and Family.',
                  'عيّن نسبة الهالك لكل مادة في قائمة المواد، أو استخدم قالب Excel للرفع الجماعي حسب المعدن والعائلة.'
                )}
              </span>
              <button
                type="button"
                onClick={() => goToWorkspaceTab('bom_scrap')}
                className="px-3 py-1.5 rounded-lg bg-[#1D4ED8] text-white font-bold whitespace-nowrap"
              >
                {t('Open BOM Scrap upload', 'فتح رفع هالك قائمة المواد')}
              </button>
            </div>
          </div>
        )}

        {tab === 'bom_scrap' && <BomScrapPanel token={token} lang={lang} />}

        {tab === 'variables' && (
          <div className="grid lg:grid-cols-3 gap-3">
            <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 font-bold text-brand-800">{t('Variables', 'المتغيرات')}</div>
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2 text-left">{t('Code', 'الكود')}</th>
                    <th className="p-2 text-left">{t('Name', 'الاسم')}</th>
                    <th className="p-2 text-left">{t('Kind', 'النوع')}</th>
                    <th className="p-2 text-left">{t('Used by', 'مستخدم في')}</th>
                    <th className="p-2 text-left">{t('Status', 'الحالة')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredVariables.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2 font-mono font-bold">{row.code}</td>
                      <td className="p-2">{row.name}</td>
                      <td className="p-2">{row.kind}</td>
                      <td className="p-2">{(row.usedBy || []).join(', ') || '—'}</td>
                      <td className="p-2">{row.status}</td>
                      <td className="p-2 whitespace-nowrap">
                        {canManage && (
                          <button
                            type="button"
                            className="text-[#1D4ED8] font-bold mr-2"
                            onClick={() =>
                              setVariableDraft({
                                id: row.id,
                                code: row.code,
                                name: row.name,
                                description: row.description || '',
                                kind: row.kind,
                                unit: row.unit || '',
                              })
                            }
                          >
                            {t('Edit', 'تعديل')}
                          </button>
                        )}
                        {canManage && row.status === 'ACTIVE' && (
                          <button type="button" className="text-slate-600 font-bold" onClick={() => void deactivateVariable(row)}>
                            {t('Deactivate', 'إيقاف')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="bg-white rounded-xl border p-4 space-y-2 text-xs">
              <h3 className="font-bold text-brand-800">{variableDraft.id ? t('Edit metadata', 'تعديل البيانات') : t('Add variable', 'إضافة متغير')}</h3>
              <p className="text-slate-500">{t('Metadata only — no SQL or JavaScript. Kind is limited to the schema enum.', 'بيانات وصفية فقط. النوع من التعداد المعتمد.')}</p>
              <input className="w-full border rounded-lg px-2 py-1.5" placeholder={t('Code', 'الكود')} value={variableDraft.code} disabled={Boolean(variableDraft.id)} onChange={(e) => setVariableDraft({ ...variableDraft, code: e.target.value })} />
              <input className="w-full border rounded-lg px-2 py-1.5" placeholder={t('Name', 'الاسم')} value={variableDraft.name} onChange={(e) => setVariableDraft({ ...variableDraft, name: e.target.value })} />
              <select className="w-full border rounded-lg px-2 py-1.5" value={variableDraft.kind} disabled={Boolean(variableDraft.id)} onChange={(e) => setVariableDraft({ ...variableDraft, kind: e.target.value })}>
                {VARIABLE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <input className="w-full border rounded-lg px-2 py-1.5" placeholder={t('Unit', 'الوحدة')} value={variableDraft.unit} onChange={(e) => setVariableDraft({ ...variableDraft, unit: e.target.value })} />
              <textarea className="w-full border rounded-lg px-2 py-1.5" placeholder={t('Description', 'الوصف')} value={variableDraft.description} onChange={(e) => setVariableDraft({ ...variableDraft, description: e.target.value })} />
              {canManage && (
                <button type="button" onClick={() => void saveVariable()} className="w-full bg-[#1D4ED8] text-white rounded-lg py-2 font-bold">
                  {t('Save', 'حفظ')}
                </button>
              )}
            </section>
          </div>
        )}

        {tab === 'formulas' && (
          <div className="grid xl:grid-cols-2 gap-3">
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b font-bold text-brand-800">{t('Formulas', 'المعادلات')}</div>
              <div className="overflow-x-auto max-h-64">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-2 text-left">{t('Code', 'الكود')}</th>
                      <th className="p-2 text-left">{t('Name', 'الاسم')}</th>
                      <th className="p-2 text-left">{t('Applies', 'ينطبق')}</th>
                      <th className="p-2 text-left">{t('Version', 'الإصدار')}</th>
                      <th className="p-2 text-left">{t('Status', 'الحالة')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFormulas.map((row) => (
                      <tr key={row.id} className="border-t even:bg-slate-50/60">
                        <td className="p-2 font-mono font-bold">{row.code}</td>
                        <td className="p-2">{row.name}</td>
                        <td className="p-2">
                          {row.assignmentScope || 'GLOBAL'}
                          {row.assignmentValue ? ` / ${row.assignmentValue}` : ''}
                        </td>
                        <td className="p-2">v{row.versions?.[0]?.versionNo || 1}</td>
                        <td className="p-2">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge(row.status)}`}>{row.status}</span>
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <button
                            type="button"
                            className="text-[#1D4ED8] font-bold mr-1"
                            onClick={() =>
                              setFormulaDraft({
                                id: row.id,
                                code: row.code,
                                name: row.name,
                                outputVariableCode: row.outputVariableCode,
                                expression: row.versions?.[0]?.expression || '',
                                assignmentScope: row.assignmentScope || 'GLOBAL',
                                assignmentValue: row.assignmentValue || '',
                                description: row.description || '',
                                status: row.status,
                              })
                            }
                          >
                            {t('Open', 'فتح')}
                          </button>
                          {canManage && row.status === 'DRAFT' && (
                            <button type="button" className="text-amber-700 font-bold mr-1" onClick={() => void formulaWorkflow(row.id, 'submit')}>
                              {t('Submit', 'تقديم')}
                            </button>
                          )}
                          {canApprove && row.status === 'SUBMITTED' && (
                            <button type="button" className="text-emerald-700 font-bold" onClick={() => void formulaWorkflow(row.id, 'approve')}>
                              {t('Approve', 'اعتماد')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
              <h3 className="font-bold text-brand-800">{t('Formula Builder', 'منشئ المعادلات')}</h3>
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                <input className="border rounded-lg px-2 py-1.5" placeholder={t('Formula code (blank = FM26-00001)', 'كود المعادلة (فارغ = FM26-00001)')} value={formulaDraft.code} onChange={(e) => setFormulaDraft({ ...formulaDraft, code: e.target.value })} />
                <input className="border rounded-lg px-2 py-1.5" placeholder={t('Name', 'الاسم')} value={formulaDraft.name} onChange={(e) => setFormulaDraft({ ...formulaDraft, name: e.target.value })} />
                <select
                  className="border rounded-lg px-2 py-1.5"
                  value={formulaDraft.assignmentScope}
                  onChange={(e) => setFormulaDraft({ ...formulaDraft, assignmentScope: e.target.value, assignmentValue: '' })}
                >
                  <option value="GLOBAL">{t('All cables', 'كل الكابلات')}</option>
                  <option value="FAMILY">{t('Cable family', 'عائلة الكابل')}</option>
                  <option value="CABLE">{t('Specific cable', 'كابل محدد')}</option>
                </select>
                {formulaDraft.assignmentScope === 'FAMILY' ? (
                  <select className="border rounded-lg px-2 py-1.5" value={formulaDraft.assignmentValue} onChange={(e) => setFormulaDraft({ ...formulaDraft, assignmentValue: e.target.value })}>
                    <option value="">{t('Select family', 'اختر العائلة')}</option>
                    {lookups.families.map((family) => (
                      <option key={family} value={family}>
                        {family}
                      </option>
                    ))}
                  </select>
                ) : formulaDraft.assignmentScope === 'CABLE' ? (
                  <CostingSearchSelect
                    value={formulaDraft.assignmentValue}
                    onChange={(assignmentValue) => setFormulaDraft({ ...formulaDraft, assignmentValue })}
                    options={formulaCables.map((c) => ({ value: c.materialNumber, label: c.description }))}
                    placeholder={t('Select cable', 'اختر الكابل')}
                    emptyLabel={t('Select cable', 'اختر الكابل')}
                  />
                ) : (
                  <input className="border rounded-lg px-2 py-1.5 bg-slate-50" value={t('All cables', 'كل الكابلات')} disabled />
                )}
                <input className="border rounded-lg px-2 py-1.5 sm:col-span-2" placeholder={t('Output variable', 'متغير الناتج')} value={formulaDraft.outputVariableCode} onChange={(e) => setFormulaDraft({ ...formulaDraft, outputVariableCode: e.target.value })} />
              </div>
              <div className="grid sm:grid-cols-[160px_1fr] gap-3">
                <div className="border rounded-lg p-2 max-h-40 overflow-auto">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">{t('AVAILABLE VARIABLES', 'المتغيرات المتاحة')}</p>
                  {filteredVariables.map((variable) => (
                    <button key={variable.id} type="button" onClick={() => appendToken(variable.code)} className="block w-full text-left text-[11px] font-mono text-[#1D4ED8] hover:bg-blue-50 rounded px-1 py-0.5">
                      {variable.code}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="min-h-[88px] border rounded-lg p-2 bg-slate-50 font-mono text-xs break-all">
                    {formulaDraft.expression || <span className="text-slate-400">{t('Click variables and operators…', 'اضغط المتغيرات والعوامل…')}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {SAFE_OPERATORS.map((op) => (
                      <button key={op} type="button" onClick={() => appendToken(op)} className="px-2 py-1 rounded bg-brand-800 text-white text-xs font-bold">
                        {op}
                      </button>
                    ))}
                    {UNSUPPORTED_FUNCTIONS.map((fn) => (
                      <button key={fn} type="button" disabled title={t('Not supported by the formula engine', 'غير مدعوم في محرك المعادلات')} className="px-2 py-1 rounded bg-slate-200 text-slate-400 text-[10px] font-bold cursor-not-allowed">
                        {fn}
                      </button>
                    ))}
                  </div>
                  <textarea className="w-full border rounded-lg px-2 py-1.5 font-mono text-xs" rows={2} value={formulaDraft.expression} onChange={(e) => setFormulaDraft({ ...formulaDraft, expression: e.target.value })} />
                </div>
              </div>
              {formulaValidate && <p className="text-xs font-semibold text-slate-600">{formulaValidate}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void validateFormula()} className="px-3 py-1.5 rounded-lg border text-xs font-bold">
                  {t('Validate Formula', 'التحقق من المعادلة')}
                </button>
                {canManage && (
                  <button type="button" onClick={() => void createFormula()} className="px-3 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-bold">
                    {t('Save Draft', 'حفظ مسودة')}
                  </button>
                )}
                {canManage && formulaDraft.id && formulaDraft.status === 'DRAFT' && (
                  <button type="button" onClick={() => void formulaWorkflow(formulaDraft.id, 'submit')} className="px-3 py-1.5 rounded-lg border text-xs font-bold">
                    {t('Submit', 'تقديم')}
                  </button>
                )}
                {canApprove && formulaDraft.id && formulaDraft.status === 'SUBMITTED' && (
                  <button type="button" onClick={() => void formulaWorkflow(formulaDraft.id, 'approve')} className="px-3 py-1.5 rounded-lg border text-xs font-bold">
                    {t('Approve', 'اعتماد')}
                  </button>
                )}
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold"
                  onClick={() => {
                    if (formulaDraft.assignmentValue && formulaDraft.assignmentScope === 'CABLE') {
                      setPreviewForm((f) => ({ ...f, materialNumber: formulaDraft.assignmentValue }));
                    }
                    setTab('preview');
                  }}
                >
                  {t('Preview test (engine)', 'اختبار المعاينة (المحرك)')}
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === 'bom_costing' && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-brand-800">{t('BOM Costing', 'تكلفة قائمة المواد')}</h3>
                <p className="text-[11px] text-slate-500">
                  {t(
                    'Governed BOM plus engine prices (executeCostingForInquiryLine, persist:false). Not a second calculator. Blank official prices stay PRICE_NOT_CONFIGURED.',
                    'قائمة المواد المعتمدة مع أسعار المحرك دون حفظ. السعر الفارغ يبقى غير مهيأ.'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {ELAND_WORKSPACE_CABLES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={`px-2 py-1 rounded border text-[11px] font-mono font-bold ${bomCostingCable === code ? 'border-[#1D4ED8] text-[#1D4ED8]' : 'border-slate-200'}`}
                    onClick={() => void loadBomCosting(code)}
                  >
                    {code}
                  </button>
                ))}
                <input
                  className="border rounded-lg px-2 py-1.5 text-xs font-mono w-36"
                  value={bomCostingCable}
                  onChange={(e) => setBomCostingCable(e.target.value)}
                  placeholder={t('Material number', 'رقم المادة')}
                />
                <button type="button" onClick={() => void loadBomCosting()} className="px-3 py-1.5 rounded-lg bg-[#1D4ED8] text-white text-xs font-bold">
                  {t('Load BOM + engine', 'تحميل القائمة والمحرك')}
                </button>
              </div>
            </div>
            {bomCostingDesc && <p className="px-4 pt-2 text-xs text-slate-600">{bomCostingDesc}</p>}
            {bomEnginePreview && (
              <p className="px-4 pt-1 text-[11px] font-semibold text-amber-800">
                {bomEnginePreview.status || bomEnginePreview.costingStatus || '—'}
                {bomEnginePreview.errorCode ? ` · ${bomEnginePreview.errorCode}` : ''}
                {bomEnginePreview.persisted === true ? ' · unexpected persist' : ' · not persisted'}
              </p>
            )}
            <table className="min-w-full text-xs mt-2">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-2 text-left">{t('Raw material', 'الخامة')}</th>
                  <th className="p-2 text-left">{t('Source', 'المصدر')}</th>
                  <th className="p-2 text-right">{t('Qty / km', 'كمية / كم')}</th>
                  <th className="p-2 text-right">{t('Scrap', 'الهالك')}</th>
                  <th className="p-2 text-left">{t('Engine price', 'سعر المحرك')}</th>
                  <th className="p-2 text-right">{t('Line cost', 'تكلفة البند')}</th>
                </tr>
              </thead>
              <tbody>
                {bomCostingLines.length === 0 && (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={6}>
                      {t('Load a cable to show governed BOM. Engine prices are not invented.', 'حمّل كابلاً لعرض قائمة المواد. الأسعار لا تُختلق.')}
                    </td>
                  </tr>
                )}
                {bomCostingLines.map((line) => {
                  const engineLine = (bomEnginePreview?.materialBreakdown || []).find(
                    (row: any) => String(row.rawMaterialCode) === String(line.rawMaterialCode)
                  );
                  const priced = engineLine?.unitPrice != null && engineLine?.priceId;
                  return (
                    <tr key={line.id} className="border-t even:bg-slate-50/60">
                      <td className="p-2">
                        <span className="font-mono font-bold">{line.rawMaterialCode}</span>
                        <span className="block text-slate-400">{line.rawMaterialDescription}</span>
                      </td>
                      <td className="p-2">{line.source}</td>
                      <td className="p-2 text-right font-mono">
                        {line.consumptionPerKm} {line.uom}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {line.scrapPercent != null ? `${line.scrapPercent}%` : engineLine?.scrapRate != null ? `${Number(engineLine.scrapRate) * 100}%` : '—'}
                      </td>
                      <td className="p-2 font-mono">
                        {priced ? `${engineLine.unitPrice} ${engineLine.priceCurrency || ''}` : 'PRICE_NOT_CONFIGURED'}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {bomEnginePreview?.status === 'READY' && priced ? engineLine.lineCost : 'CONFIGURATION_REQUIRED'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(bomEnginePreview?.blockingReasons || []).length > 0 && (
              <ul className="px-4 py-3 list-disc pl-8 text-[11px] text-amber-800">
                {(bomEnginePreview.blockingReasons as string[]).slice(0, 10).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'assignment' && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 font-bold text-brand-800">{t('Cable Assignment', 'تعيين الكابل')}</div>
            <p className="px-4 text-xs text-slate-500">{t('Specific cable overrides family and global for the same output variable.', 'تعيين الكابل يتجاوز العائلة والعام لنفس متغير الناتج.')}</p>
            <table className="min-w-full text-xs mt-2">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-2 text-left">{t('Formula', 'المعادلة')}</th>
                  <th className="p-2 text-left">{t('Applies to', 'ينطبق على')}</th>
                  <th className="p-2 text-left">{t('Value', 'القيمة')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredFormulas.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2 font-mono font-bold">{row.code}</td>
                    <td className="p-2">
                      <select
                        className="border rounded px-1 py-1"
                        value={assignmentEdits[row.id]?.scope ?? row.assignmentScope ?? 'GLOBAL'}
                        onChange={(e) => setAssignmentEdits((prev) => ({ ...prev, [row.id]: { scope: e.target.value, value: prev[row.id]?.value ?? row.assignmentValue ?? '' } }))}
                      >
                        <option value="GLOBAL">{t('All cables', 'كل الكابلات')}</option>
                        <option value="FAMILY">{t('Family', 'العائلة')}</option>
                        <option value="CABLE">{t('Cable', 'كابل')}</option>
                      </select>
                    </td>
                    <td className="p-2">
                      {(assignmentEdits[row.id]?.scope ?? row.assignmentScope ?? 'GLOBAL') === 'FAMILY' ? (
                        <select
                          className="border rounded px-1 py-1 w-full"
                          value={assignmentEdits[row.id]?.value ?? row.assignmentValue ?? ''}
                          onChange={(e) =>
                            setAssignmentEdits((prev) => ({
                              ...prev,
                              [row.id]: { scope: prev[row.id]?.scope ?? row.assignmentScope ?? 'GLOBAL', value: e.target.value },
                            }))
                          }
                        >
                          <option value="">{t('Select family', 'اختر العائلة')}</option>
                          {lookups.families.map((family) => (
                            <option key={family} value={family}>
                              {family}
                            </option>
                          ))}
                        </select>
                      ) : (assignmentEdits[row.id]?.scope ?? row.assignmentScope ?? 'GLOBAL') === 'CABLE' ? (
                        <CostingSearchSelect
                          value={assignmentEdits[row.id]?.value ?? row.assignmentValue ?? ''}
                          onChange={(value) =>
                            setAssignmentEdits((prev) => ({
                              ...prev,
                              [row.id]: { scope: prev[row.id]?.scope ?? row.assignmentScope ?? 'GLOBAL', value },
                            }))
                          }
                          options={lookups.cables.map((c) => ({ value: c.materialNumber, label: c.description }))}
                          placeholder={t('Select cable', 'اختر الكابل')}
                          emptyLabel={t('Select cable', 'اختر الكابل')}
                        />
                      ) : (
                        <input className="border rounded px-1 py-1 w-full bg-slate-50" value={t('All cables', 'كل الكابلات')} disabled />
                      )}
                    </td>
                    <td className="p-2">
                      {canManage && (
                        <button type="button" className="text-[#1D4ED8] font-bold" onClick={() => void saveAssignment(row.id)}>
                          {t('Save', 'حفظ')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'other_costs' && (
          <div className="space-y-3">
          <div className="flex flex-wrap gap-1 text-[10px] font-bold">
            {(['metal', 'additives', 'incoterms', 'destination', 'logistics', 'drums', 'packing'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setOtherCostsPanel(id)}
                className={`px-2 py-1 rounded-lg border ${otherCostsPanel === id ? 'bg-brand-800 text-white border-brand-800' : 'bg-white text-slate-600'}`}
              >
                {id === 'metal' ? t('Metal / LME', 'معدن / بورصة') : id === 'additives' ? t('Additives', 'إضافات') : id === 'incoterms' ? 'Incoterms' : id === 'destination' ? t('Destination', 'الوجهة') : id === 'logistics' ? t('Logistics', 'لوجستيات') : id === 'drums' ? t('Drums', 'بكرات') : t('Packing', 'تعبئة')}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            {t('Costing Team enters governed amounts. Blank amount stays NOT_CONFIGURED. Technical Office cannot approve these rules.', 'فريق التكاليف يدخل المبالغ المعتمدة. المبلغ الفارغ يبقى غير مهيأ. المكتب الفني لا يعتمد هذه القواعد.')}
          </p>
          {canManage && (otherCostsPanel === 'metal' || otherCostsPanel === 'additives') && (
            <div className="grid sm:grid-cols-6 gap-2 text-xs bg-white border rounded-xl p-3">
              <input className="border rounded px-2 py-1" placeholder="Code" value={metalDraft.code} onChange={(e) => setMetalDraft({ ...metalDraft, code: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder="Name" value={metalDraft.name} onChange={(e) => setMetalDraft({ ...metalDraft, name: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder="COPPER / ALUMINIUM" value={metalDraft.metalType} onChange={(e) => setMetalDraft({ ...metalDraft, metalType: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder={t('Rate (optional)', 'السعر (اختياري)')} value={metalDraft.rate} onChange={(e) => setMetalDraft({ ...metalDraft, rate: e.target.value })} />
              <select className="border rounded px-2 py-1" value={metalDraft.rateSource} onChange={(e) => setMetalDraft({ ...metalDraft, rateSource: e.target.value })}>
                <option value="LME">LME</option>
                <option value="CUSTOMER_COMMERCIAL">CUSTOMER_COMMERCIAL</option>
                <option value="INTERNAL_GOVERNED">INTERNAL_GOVERNED</option>
                <option value="MANUAL">MANUAL</option>
              </select>
              <button type="button" className="bg-[#1D4ED8] text-white rounded font-bold" onClick={() => void saveMetalRate()}>{t('Create metal rule', 'إنشاء قاعدة معدن')}</button>
            </div>
          )}
          {canManage && (otherCostsPanel === 'incoterms' || otherCostsPanel === 'destination' || otherCostsPanel === 'logistics') && (
            <div className="grid sm:grid-cols-6 gap-2 text-xs bg-white border rounded-xl p-3">
              <input className="border rounded px-2 py-1" placeholder="Code" value={logisticsDraft.code} onChange={(e) => setLogisticsDraft({ ...logisticsDraft, code: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder="Incoterm" value={logisticsDraft.incoterm} onChange={(e) => setLogisticsDraft({ ...logisticsDraft, incoterm: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder={t('Destination (optional)', 'الوجهة (اختياري)')} value={logisticsDraft.destination} onChange={(e) => setLogisticsDraft({ ...logisticsDraft, destination: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder={t('Cost (optional)', 'التكلفة (اختياري)')} value={logisticsDraft.cost} onChange={(e) => setLogisticsDraft({ ...logisticsDraft, cost: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder="USD" value={logisticsDraft.currency} onChange={(e) => setLogisticsDraft({ ...logisticsDraft, currency: e.target.value })} />
              <button type="button" className="bg-[#1D4ED8] text-white rounded font-bold" onClick={() => void saveLogisticsRule()}>{t('Create logistics rule', 'إنشاء قاعدة لوجستية')}</button>
            </div>
          )}
          {canManage && (otherCostsPanel === 'drums' || otherCostsPanel === 'packing') && (
            <div className="grid sm:grid-cols-6 gap-2 text-xs bg-white border rounded-xl p-3">
              <input className="border rounded px-2 py-1" placeholder="Code" value={packingDraft.code} onChange={(e) => setPackingDraft({ ...packingDraft, code: e.target.value })} />
              <DrumMasterSelect drums={drums} value={packingDraft.drumCode} onChange={(drumCode) => setPackingDraft({ ...packingDraft, drumCode })} emptyLabel={t('Drum (optional)', 'بكرة (اختياري)')} showSpecification={false} />
              <input className="border rounded px-2 py-1" placeholder={t('Packing cost (optional)', 'تكلفة التعبئة (اختياري)')} value={packingDraft.packingCost} onChange={(e) => setPackingDraft({ ...packingDraft, packingCost: e.target.value })} />
              <input className="border rounded px-2 py-1" placeholder="USD" value={packingDraft.currency} onChange={(e) => setPackingDraft({ ...packingDraft, currency: e.target.value })} />
              <button type="button" className="bg-[#1D4ED8] text-white rounded font-bold" onClick={() => void savePackingRule()}>{t('Create packing rule', 'إنشاء قاعدة تعبئة')}</button>
            </div>
          )}
          {otherCostsPanel === 'drums' && (
            <p className="text-[11px] text-amber-700 font-bold">
              {drums.length ? t('Drum Master rows are identities only — packing cost is CostingPackingRule.', 'صفوف البكرات هوية فقط — تكلفة التعبئة من قاعدة التعبئة.') : 'DRUM_CONFIGURATION_REQUIRED — import Drum Master'}
            </p>
          )}
          <div className="grid md:grid-cols-3 gap-3 text-xs">
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-brand-800 mb-2">{t('Metal rates', 'أسعار المعادن')}</h3>
              {metalRates.length === 0 && <p className="text-amber-700 font-bold">CONFIGURATION_REQUIRED</p>}
              {metalRates.map((row) => (
                <p key={row.id} className="font-mono">
                  {row.code} · {row.rate != null ? `${row.rate} ${row.currency}` : 'NOT_CONFIGURED'}
                </p>
              ))}
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-brand-800 mb-2">{t('Incoterm / destination', 'الإنكوترمز / الوجهة')}</h3>
              {logisticsRules.length === 0 && <p className="text-amber-700 font-bold">CONFIGURATION_REQUIRED</p>}
              {logisticsRules.map((row) => (
                <p key={row.id} className="font-mono">
                  {row.incoterm} {row.destination || '*'} · {row.cost != null ? `${row.cost} ${row.currency}` : 'NOT_CONFIGURED'}
                </p>
              ))}
            </div>
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-bold text-brand-800 mb-2">{t('Packing / drum', 'التعبئة / البكرة')}</h3>
              {packingRules.length === 0 && <p className="text-amber-700 font-bold">CONFIGURATION_REQUIRED</p>}
              {packingRules.map((row) => (
                <p key={row.id} className="font-mono">
                  {row.drumCode || 'ANY'} · {row.packingCost != null ? `${row.packingCost} ${row.currency}` : 'NOT_CONFIGURED'}
                </p>
              ))}
            </div>
          </div>
          <section className="mt-3 bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-xs space-y-3">
            <div>
              <h3 className="font-bold text-brand-800 text-sm">{t('Exchange rates (LE = EGP)', 'أسعار الصرف (LE = الجنيه)')}</h3>
              <p className="text-slate-500 mt-1">
                {t(
                  'Create LE→USD (or EGP→USD — stored as LE). Enter the real rate. Draft is ignored in costing until Costing Manager approves. Code is assigned as FXYY-#####.',
                  'أنشئ LE→USD (أو EGP→USD ويُحفظ كـ LE). أدخل السعر الفعلي. المسودة لا تُستخدم حتى اعتماد مدير التكاليف.'
                )}
              </p>
            </div>
            <div className="grid sm:grid-cols-8 gap-2">
              <input className="border rounded-lg px-2 py-1.5 bg-slate-50 font-mono" value={fxDraft.code || t('Auto FXYY-#####', 'تلقائي FXYY-#####')} disabled />
              <input className="border rounded-lg px-2 py-1.5" placeholder={t('Name (optional)', 'الاسم (اختياري)')} value={fxDraft.name} onChange={(e) => setFxDraft({ ...fxDraft, name: e.target.value })} />
              <select className="border rounded-lg px-2 py-1.5" value={fxDraft.fromCurrency} onChange={(e) => setFxDraft({ ...fxDraft, fromCurrency: e.target.value })}>
                {(lookups.currencies.length ? lookups.currencies : COSTING_PRICE_CURRENCY_CODES).map((c) => (
                  <option key={c} value={c}>{c}{c === 'EGP' ? ' (= LE)' : ''}</option>
                ))}
              </select>
              <select className="border rounded-lg px-2 py-1.5" value={fxDraft.toCurrency} onChange={(e) => setFxDraft({ ...fxDraft, toCurrency: e.target.value })}>
                {(lookups.currencies.length ? lookups.currencies : COSTING_PRICE_CURRENCY_CODES).map((c) => (
                  <option key={c} value={c}>{c}{c === 'EGP' ? ' (= LE)' : ''}</option>
                ))}
              </select>
              <input className="border rounded-lg px-2 py-1.5" placeholder={t('Rate (required)', 'السعر (مطلوب)')} value={fxDraft.rate} onChange={(e) => setFxDraft({ ...fxDraft, rate: e.target.value })} />
              <input className="border rounded-lg px-2 py-1.5" type="date" value={fxDraft.effectiveFrom} onChange={(e) => setFxDraft({ ...fxDraft, effectiveFrom: e.target.value })} />
              <input className="border rounded-lg px-2 py-1.5" type="date" value={fxDraft.effectiveTo} onChange={(e) => setFxDraft({ ...fxDraft, effectiveTo: e.target.value })} />
              {canManage && (
                <button type="button" onClick={() => void saveFxRate()} className="bg-[#1D4ED8] text-white rounded-lg font-bold">
                  {fxDraft.id ? t('Save draft', 'حفظ المسودة') : t('Create FX draft', 'إنشاء مسودة صرف')}
                </button>
              )}
            </div>
            {exchangeRates.length === 0 && <p className="text-amber-700 font-bold">CONFIGURATION_REQUIRED — {t('No governed FX pair. Add LE→USD and submit for approval.', 'لا يوجد زوج صرف معتمد. أضف LE→USD وقدّمه للاعتماد.')}</p>}
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-2 text-left">{t('Code', 'الكود')}</th>
                    <th className="p-2 text-left">{t('Pair', 'الزوج')}</th>
                    <th className="p-2 text-left">{t('Rate', 'السعر')}</th>
                    <th className="p-2 text-left">{t('Effective', 'السريان')}</th>
                    <th className="p-2 text-left">{t('Status', 'الحالة')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {exchangeRates.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-2 font-mono font-bold">{row.code}</td>
                      <td className="p-2">{row.fromCurrency} → {row.toCurrency}</td>
                      <td className="p-2">{row.rate}</td>
                      <td className="p-2">{fmtDate(row.effectiveFrom)} – {row.effectiveTo ? fmtDate(row.effectiveTo) : t('open', 'مفتوح')}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadge(row.workflowStatus)}`}>{row.workflowStatus}</span>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {canManage && ['DRAFT', 'REJECTED'].includes(row.workflowStatus) && (
                          <button
                            type="button"
                            className="text-[#1D4ED8] font-bold mr-1"
                            onClick={() =>
                              setFxDraft({
                                id: row.id,
                                code: row.code,
                                name: row.name || '',
                                fromCurrency: row.fromCurrency,
                                toCurrency: row.toCurrency,
                                rate: row.rate != null ? String(row.rate) : '',
                                effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : '',
                                effectiveTo: row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : '',
                                sourceReference: row.sourceReference || '',
                              })
                            }
                          >
                            {t('Edit', 'تعديل')}
                          </button>
                        )}
                        {canManage && row.workflowStatus === 'DRAFT' && (
                          <button type="button" className="text-amber-700 font-bold mr-1" onClick={() => void approveQueued(`/api/admin/costing/exchange-rates/${row.id}/submit`)}>
                            {t('Submit', 'تقديم')}
                          </button>
                        )}
                        {canApprove && row.workflowStatus === 'SUBMITTED' && (
                          <button type="button" className="text-emerald-700 font-bold" onClick={() => void approveQueued(`/api/admin/costing/exchange-rates/${row.id}/approve`)}>
                            {t('Approve', 'اعتماد')}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </div>
        )}

        {tab === 'preview' && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid lg:grid-cols-2 gap-4">
            <div className="space-y-2 text-xs">
              <h3 className="font-bold text-brand-800 text-sm">{t('Calculation Preview', 'معاينة الحساب')}</h3>
              <p className="text-slate-500">{t('Runs executeCostingForInquiryLine with persist:false. Copper/aluminium rates are metadata only — they do not invent LME additives.', 'يشغّل محرك التكاليف دون حفظ. أسعار النحاس/الألمونيوم بيانات وصفية فقط.')}</p>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">{t('Cable', 'الكابل')}</label>
              <CostingSearchSelect
                value={previewForm.materialNumber}
                onChange={(materialNumber) => setPreviewForm({ ...previewForm, materialNumber })}
                options={lookups.cables.map((c) => ({ value: c.materialNumber, label: c.description }))}
                placeholder={t('Search ACTIVE cable (code + description)', 'بحث كابل نشط')}
                emptyLabel={t('Select cable', 'اختر الكابل')}
              />
              <div className="grid grid-cols-2 gap-2">
                <input className="border rounded-lg px-2 py-1.5" placeholder={t('Length (m)', 'الطول (م)')} value={previewForm.lengthMeters} onChange={(e) => setPreviewForm({ ...previewForm, lengthMeters: e.target.value })} />
                <input className="border rounded-lg px-2 py-1.5" placeholder={t('Quantity', 'الكمية')} value={previewForm.quantity} onChange={(e) => setPreviewForm({ ...previewForm, quantity: e.target.value })} />
                <input className="border rounded-lg px-2 py-1.5" placeholder={t('Copper rate (optional)', 'سعر النحاس (اختياري)')} value={previewForm.copperPriceRate} onChange={(e) => setPreviewForm({ ...previewForm, copperPriceRate: e.target.value })} />
                <input className="border rounded-lg px-2 py-1.5" placeholder={t('Aluminium rate (optional)', 'سعر الألمونيوم (اختياري)')} value={previewForm.aluminiumPriceRate} onChange={(e) => setPreviewForm({ ...previewForm, aluminiumPriceRate: e.target.value })} />
                <input className="border rounded-lg px-2 py-1.5" placeholder={t('Currency', 'العملة')} value={previewForm.currency} onChange={(e) => setPreviewForm({ ...previewForm, currency: e.target.value })} />
                <select className="border rounded-lg px-2 py-1.5" value={previewForm.incoterms} onChange={(e) => setPreviewForm({ ...previewForm, incoterms: e.target.value })}>
                  <option value="">{lookups.incoterms.length ? t('Incoterm', 'إنكوترمز') : t('No incoterm rules', 'لا قواعد إنكوترمز')}</option>
                  {lookups.incoterms.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <select className="border rounded-lg px-2 py-1.5" value={previewForm.destination} onChange={(e) => setPreviewForm({ ...previewForm, destination: e.target.value })}>
                  <option value="">{lookups.destinations.length ? t('Destination', 'الوجهة') : t('No destinations configured', 'لا وجهات مهيأة')}</option>
                  {lookups.destinations.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
                <DrumMasterSelect drums={drums} value={previewForm.drumType} onChange={(drumType) => setPreviewForm({ ...previewForm, drumType })} emptyLabel={t('Drum (optional)', 'بكرة (اختياري)')} showSpecification={false} />
              </div>
              <button type="button" onClick={() => void runPreview()} className="bg-[#1D4ED8] text-white rounded-lg px-4 py-2 font-bold">
                {t('Preview Calculation', 'معاينة الحساب')}
              </button>
              {onOpenCostCalculator && (
                <button type="button" onClick={onOpenCostCalculator} className="ml-2 text-[#1D4ED8] font-bold">
                  {t('Open Quick Cost Quote', 'فتح عرض التكلفة السريع')}
                </button>
              )}
            </div>
            <div className="rounded-xl bg-brand-50 border border-blue-100 p-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">{t('Formula used', 'المعادلة المستخدمة')}</span>
                <span className="font-mono font-bold">{previewResult?.layers?.[0]?.componentCode || (previewResult ? 'MATERIAL_COST (no formula required)' : '—')}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-slate-500">{t('Status', 'الحالة')}</span>
                <span className={`font-black ${previewResult?.status === 'READY' ? 'text-emerald-600' : 'text-amber-700'}`}>{previewResult?.status || '—'}</span>
              </div>
              {previewResult?.errorCode && (
                <div className="flex justify-between mt-1">
                  <span className="text-slate-500">{t('Error code', 'رمز الخطأ')}</span>
                  <span className="font-mono font-bold text-rose-700">{previewResult.errorCode}</span>
                </div>
              )}
              <div className="mt-3 space-y-1 text-slate-600">
                {previewResult?.configurationVersionId && <p>config version: {previewResult.configurationVersionId}</p>}
                {previewResult?.bomVersion != null && <p>BOM version: {previewResult.bomVersion}</p>}
                {previewResult?.engineeringRevision != null && <p>engineering revision: {previewResult.engineeringRevision}</p>}
                {(previewResult?.layers || []).map((layer: any) => (
                  <p key={layer.componentCode}>
                    {layer.componentCode} · {layer.status}
                    {layer.expression ? ` · ${layer.expression}` : ''}
                  </p>
                ))}
                {(previewResult?.materialBreakdown || []).slice(0, 4).map((line: any) => (
                  <p key={line.rawMaterialCode}>
                    {line.rawMaterialCode} price {line.priceId || '—'} scrap {line.scrapSource}
                    {line.scrapRate != null ? ` ${line.scrapRate}` : ''}
                  </p>
                ))}
              </div>
              <div className="mt-3 space-y-1">
                <div className="flex justify-between">
                  <span>{t('Raw material cost', 'تكلفة الخامات')}</span>
                  <span className="font-mono">{previewResult?.status === 'READY' ? previewResult?.totals?.materialCost ?? '—' : 'CONFIGURATION_REQUIRED'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('Manufacturing / formula', 'التصنيع / المعادلة')}</span>
                  <span className="font-mono">{previewResult?.status === 'READY' ? previewResult?.totals?.manufacturingTotal ?? '—' : 'CONFIGURATION_REQUIRED'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('Packing / drum', 'التعبئة / البكرة')}</span>
                  <span className="font-mono">{previewResult?.extensionLayers?.packing?.status === 'CONFIGURED' ? previewResult.extensionLayers.packing.amount : 'NOT_CONFIGURED'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('Logistics', 'الخدمات اللوجستية')}</span>
                  <span className="font-mono">{previewResult?.extensionLayers?.logistics?.status === 'CONFIGURED' ? previewResult.extensionLayers.logistics.amount : 'NOT_CONFIGURED'}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('Copper / Al (metadata)', 'نحاس / ألمونيوم (وصفي)')}</span>
                  <span className="font-mono">
                    {previewResult?.extensionLayers?.copper?.status || '—'} / {previewResult?.extensionLayers?.aluminium?.status || '—'}
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-blue-200 flex justify-between items-end">
                <span className="font-bold text-brand-800">{t('TOTAL COST', 'التكلفة الإجمالية')}</span>
                <span className="text-2xl font-black text-[#1D4ED8]">
                  {previewResult?.status === 'READY' ? `${previewResult.totals?.lineTotal || previewResult.totals?.materialCost} ${previewResult.currency || ''}` : 'CONFIGURATION_REQUIRED'}
                </span>
              </div>
              {previewResult?.blockingReasons?.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-amber-800">
                  {previewResult.blockingReasons.slice(0, 8).map((reason: string, i: number) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {tab === 'versions' && (
          <section className="bg-white rounded-xl border p-4 text-xs">
            <h3 className="font-bold text-brand-800 mb-2">{t('Versions', 'الإصدارات')}</h3>
            {methods.map((method) => (
              <div key={method.id} className="border-b py-2">
                <p className="font-bold">
                  {method.code} · {method.name}
                </p>
                {(method.versions || []).map((version: any) => (
                  <button
                    key={version.id}
                    type="button"
                    className={`mr-2 underline ${configVersionId === version.id ? 'text-[#1D4ED8]' : ''}`}
                    onClick={() => setConfigVersionId(version.id)}
                  >
                    v{version.versionNo} ({version.workflowStatus || version.status})
                  </button>
                ))}
              </div>
            ))}
          </section>
        )}

        {tab === 'approval' && (
          <section className="bg-white rounded-xl border p-4 text-xs space-y-4">
            <div>
              <h3 className="font-bold text-brand-800 text-sm">{t('Costing Team approval', 'اعتماد فريق التكاليف')}</h3>
              <p className="text-slate-500 mt-1">{t('Price, formula, scrap, FX, and configuration approval is Costing Manager work. Technical Office does not approve costing.', 'الاعتماد لفريق التكاليف وليس المكتب الفني.')}</p>
            </div>
            {[
              { key: 'rawMaterialPrices', label: t('Raw material prices', 'أسعار الخامات') },
              { key: 'formulas', label: t('Formulas', 'المعادلات') },
              { key: 'scrapRules', label: t('Scrap rules', 'قواعد الهالك') },
              { key: 'exchangeRates', label: t('Exchange rates', 'أسعار الصرف') },
              { key: 'configVersions', label: t('Configuration versions', 'إصدارات التكوين') },
            ].map(({ key, label }) => (
              <div key={key} className="border rounded-lg p-3">
                <p className="font-bold text-brand-800 mb-2">{label}</p>
                {((approvalQueue?.[key] as any[]) || []).length === 0 && <p className="text-slate-400">{t('None pending.', 'لا يوجد معلق.')}</p>}
                {((approvalQueue?.[key] as any[]) || []).map((item) => (
                  <div key={item.id} className="flex justify-between items-center gap-2 py-1 border-t border-slate-100">
                    <span className="font-mono truncate">
                      {item.rawMaterialCode || item.code || item.configuration?.code || item.id}
                      {item.workflowStatus || item.status ? ` · ${item.workflowStatus || item.status}` : ''}
                    </span>
                    {canApprove && (
                      <button
                        type="button"
                        className="text-[#1D4ED8] font-bold shrink-0"
                        onClick={() => {
                          if (key === 'rawMaterialPrices') void approveQueued(`/api/admin/costing/raw-material-prices/${item.id}/actions`, { action: 'APPROVE' });
                          else if (key === 'formulas') void approveQueued(`/api/admin/costing/formulas/${item.id}/approve`);
                          else if (key === 'scrapRules') void approveQueued(`/api/admin/costing/scrap-rules/${item.id}/approve`);
                          else if (key === 'exchangeRates') void approveQueued(`/api/admin/costing/exchange-rates/${item.id}/approve`);
                          else if (key === 'configVersions') {
                            const configId = item.configurationId || item.configuration?.id;
                            if (configId) void approveQueued(`/api/admin/costing/configurations/${configId}/versions/${item.id}/approve`);
                          }
                        }}
                      >
                        {t('Approve', 'اعتماد')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </section>
        )}

        {tab === 'audit' && (
          <section className="bg-white rounded-xl border overflow-hidden">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-2 text-left">{t('When', 'متى')}</th>
                  <th className="p-2 text-left">{t('Entity', 'الكيان')}</th>
                  <th className="p-2 text-left">{t('Action', 'الإجراء')}</th>
                  <th className="p-2 text-left">{t('Actor', 'المنفذ')}</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((event) => (
                  <tr key={event.id} className="border-t">
                    <td className="p-2">{event.at ? new Date(event.at).toLocaleString() : '—'}</td>
                    <td className="p-2">{event.entity}</td>
                    <td className="p-2 font-mono">{event.action}</td>
                    <td className="p-2">{event.actorName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
};
