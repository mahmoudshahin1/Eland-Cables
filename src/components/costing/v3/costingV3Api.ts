export type CostingV3Tab =
  | 'overview'
  | 'currencies'
  | 'exchange_rates'
  | 'raw_materials'
  | 'raw_material_prices'
  | 'bom'
  | 'scrap_rules'
  | 'metal_classification'
  | 'metal_cost_components'
  | 'bulk_import'
  | 'validation';

export const COSTING_V3_TABS: Array<{ id: CostingV3Tab; en: string; ar: string }> = [
  { id: 'overview', en: 'Overview', ar: 'نظرة عامة' },
  { id: 'currencies', en: 'Currencies', ar: 'العملات' },
  { id: 'exchange_rates', en: 'Exchange Rates', ar: 'أسعار الصرف' },
  { id: 'raw_materials', en: 'Raw Materials', ar: 'المواد الخام' },
  { id: 'raw_material_prices', en: 'Raw Material Prices', ar: 'أسعار المواد' },
  { id: 'bom', en: 'BOM / Cable Materials', ar: 'قائمة مواد الكابل' },
  { id: 'scrap_rules', en: 'Scrap Rules', ar: 'قواعد الهالك' },
  { id: 'metal_classification', en: 'Metal Classification', ar: 'تصنيف المعادن' },
  { id: 'metal_cost_components', en: 'Metal Cost Components', ar: 'مكونات تكلفة المعدن' },
  { id: 'bulk_import', en: 'Bulk Import / Export', ar: 'استيراد جماعي' },
  { id: 'validation', en: 'Costing Validation', ar: 'التحقق من التكلفة' },
];

export function authHeaders(token: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function costingApi(token: string | null, path: string, init?: RequestInit) {
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

export async function downloadCostingFile(token: string | null, path: string, fallbackName: string) {
  const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const named = /filename="?([^"]+)"?/i.exec(disposition);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = named?.[1] || fallbackName;
  a.click();
  URL.revokeObjectURL(url);
}
