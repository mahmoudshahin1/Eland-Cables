import type { V2AdvancedCableSearchQuery, V2CableSearchHit } from '../domain/v2AdvancedCableSearch';

export interface V2AdvancedCableSearchResponse {
  total: number;
  page: number;
  pageSize: number;
  matchMode: string;
  sortBy: string;
  sortDir: string;
  cables: V2CableSearchHit[];
  searchKind: 'CABLE_MASTER_DISCOVERY';
  compatibilityInferred: false;
  actorKind?: 'customer' | 'internal';
}

export interface V2CableSearchFacets {
  family: string[];
  voltage: string[];
  standard: string[];
  conductor: string[];
  cores: string[];
  insulation: string[];
  screen: string[];
  armour: string[];
  sheath: string[];
  note?: string;
}

function authHeaders(token?: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAdvancedCableSearch(
  token: string | null | undefined,
  query: Partial<V2AdvancedCableSearchQuery> & Record<string, string | number | undefined>
): Promise<V2AdvancedCableSearchResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '' || value === 'all') continue;
    params.set(key, String(value));
  }
  const res = await fetch(`/api/v2/cables/search?${params.toString()}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Advanced Cable Search is unavailable.');
  }
  return res.json();
}

export async function fetchCableSearchFacets(token: string | null | undefined): Promise<V2CableSearchFacets> {
  const res = await fetch('/api/v2/cables/search/facets', { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Cable search facets are unavailable.');
  }
  const data = await res.json();
  return data.facets as V2CableSearchFacets;
}

export async function submitCableNotFoundTechnicalOfficeRequest(
  token: string | null | undefined,
  input: { filters: Record<string, string>; customer?: string }
): Promise<{ requestNumber: string }> {
  const res = await fetch('/api/technical-office/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({
      reason: 'Required cable was not found in the existing Cable Master.',
      configuration: {
        kind: 'ADVANCED_CABLE_SEARCH_NO_MATCH',
        filters: input.filters,
      },
      customer: input.customer,
      status: 'Submitted',
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to submit Technical Office request.');
  }
  const data = await res.json();
  return { requestNumber: data.request?.requestNumber || '' };
}
