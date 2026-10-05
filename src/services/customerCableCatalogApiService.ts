import type { CustomerCatalogProduct } from '../domain/customerCableCatalog';

export type CustomerCatalogFacets = {
  productCategory: string[];
  voltageClass: string[];
  voltage: string[];
  conductor: string[];
  conductorSize: string[];
  cores: string[];
  insulation: string[];
  screen: string[];
  armour: string[];
  sheath: string[];
  standard: string[];
  sheathColour: string[];
  coreColour: string[];
  specialAdditives: string[];
  mapping?: {
    productCategoryField: boolean;
    mappedBy: string;
    familiesPresent: string[];
    categoryCounts: Record<string, number>;
    unmappedCount: number;
    note: string;
  };
  note?: string;
};

export type CustomerCatalogListResponse = {
  total: number;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDir: string;
  category: string | null;
  cables: CustomerCatalogProduct[];
  searchKind: 'CABLE_MASTER_CATALOG';
};

function authHeaders(token?: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchCustomerCableProducts(
  token: string | null | undefined,
  query: Record<string, string | number | undefined>
): Promise<CustomerCatalogListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '' || value === 'all') continue;
    params.set(key, String(value));
  }
  const res = await fetch(`/api/v2/cables/products?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Cable Products catalog is unavailable.');
  }
  return res.json();
}

export async function fetchCustomerCableProductFacets(
  token: string | null | undefined
): Promise<CustomerCatalogFacets> {
  const res = await fetch('/api/v2/cables/products/facets', { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Cable Products filters are unavailable.');
  }
  const data = await res.json();
  return data.facets as CustomerCatalogFacets;
}

export async function downloadCustomerCableProductsExcel(
  token: string | null | undefined,
  query: Record<string, string | number | undefined>
): Promise<void> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '' || value === 'all') continue;
    params.set(key, String(value));
  }
  const res = await fetch(`/api/v2/cables/products/export?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Cable Products export is unavailable.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const disposition = res.headers.get('Content-Disposition') || '';
  const named = disposition.match(/filename="([^"]+)"/);
  a.download = named?.[1] || 'Cable_Products.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
