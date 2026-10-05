/**
 * Client helpers for Master Data PostgreSQL-primary authority (Task 04A).
 * Successful API responses win over stale localStorage.
 * LS getters remain as non-authoritative compatibility mirrors only.
 */

import {
  CableBomRawMaterial,
  DrumMasterRecord,
  ImportBatchRecord,
  MasterCableCatalogItem,
  RawMaterialMasterRecord,
} from '../types';
import { preferPostgresMasterData } from '../platform/masterDataSoT';
import { getStoredCableCatalog, saveCableCatalog } from './cableCatalogService';
import { getStoredCableBoms, saveCableBoms } from './cableBomService';
import { getStoredDrumMaster, saveDrumMaster } from './drumMasterService';
import { getStoredRawMaterials, saveRawMaterials } from './rawMaterialMasterService';
import { getImportBatches, saveImportBatch } from './importBatchService';

export type MasterDataQualitySnapshotPayload = {
  cables: MasterCableCatalogItem[];
  boms: CableBomRawMaterial[];
  drums: DrumMasterRecord[];
  rawMaterials: RawMaterialMasterRecord[];
};

function authHeaders(jwtToken?: string | null): HeadersInit {
  return jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {};
}

async function getJson(url: string, jwtToken?: string | null): Promise<Response> {
  return fetch(url, { headers: authHeaders(jwtToken) });
}

export type MasterListSource = 'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK';

export type ResolvedMasterList<T> = {
  data: T;
  source: MasterListSource;
  authoritative: boolean;
  error?: string;
};

export async function fetchMasterCables(
  jwtToken?: string | null
): Promise<{ ok: true; data: MasterCableCatalogItem[] } | { ok: false; error: string }> {
  try {
    const res = await getJson('/api/master/cables', jwtToken);
    if (!res.ok) return { ok: false, error: `cables ${res.status}` };
    const body = await res.json();
    return { ok: true, data: Array.isArray(body.cables) ? body.cables : [] };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'cables unavailable' };
  }
}

export async function fetchMasterBoms(
  jwtToken?: string | null
): Promise<{ ok: true; data: CableBomRawMaterial[] } | { ok: false; error: string }> {
  try {
    const res = await getJson('/api/master/boms', jwtToken);
    if (!res.ok) return { ok: false, error: `boms ${res.status}` };
    const body = await res.json();
    return { ok: true, data: Array.isArray(body.boms) ? body.boms : [] };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'boms unavailable' };
  }
}

export async function fetchMasterDrums(
  jwtToken?: string | null
): Promise<{ ok: true; data: DrumMasterRecord[] } | { ok: false; error: string }> {
  try {
    const res = await getJson('/api/master/drums', jwtToken);
    if (!res.ok) return { ok: false, error: `drums ${res.status}` };
    const body = await res.json();
    return { ok: true, data: Array.isArray(body.drums) ? body.drums : [] };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'drums unavailable' };
  }
}

export async function fetchMasterRawMaterials(
  jwtToken?: string | null
): Promise<{ ok: true; data: RawMaterialMasterRecord[] } | { ok: false; error: string }> {
  try {
    const res = await getJson('/api/master/raw-materials', jwtToken);
    if (!res.ok) return { ok: false, error: `raw-materials ${res.status}` };
    const body = await res.json();
    return { ok: true, data: Array.isArray(body.rawMaterials) ? body.rawMaterials : [] };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'raw-materials unavailable' };
  }
}

export async function fetchMasterImportHistory(
  jwtToken?: string | null
): Promise<{ ok: true; data: ImportBatchRecord[] } | { ok: false; error: string }> {
  try {
    const res = await getJson('/api/master/imports', jwtToken);
    if (!res.ok) return { ok: false, error: `imports ${res.status}` };
    const body = await res.json();
    const rows = Array.isArray(body.imports) ? body.imports : [];
    return { ok: true, data: rows as ImportBatchRecord[] };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'imports unavailable' };
  }
}

/** Resolve catalog for Hub: PG wins (including empty); LS only if PG read failed (non-authoritative). */
export function resolveMasterListPreferringPostgres<T>(
  pg: { ok: true; data: T } | { ok: false; error?: string },
  localFallback: T
): ResolvedMasterList<T> {
  const resolved = preferPostgresMasterData(pg, localFallback);
  return {
    data: resolved.data,
    source: resolved.source,
    authoritative: resolved.authoritative,
    error: pg.ok === false ? pg.error : undefined,
  };
}

/**
 * Authoritative cable catalog load. Empty PG wins over stale LS.
 * On PG failure returns LS mirror with authoritative=false.
 */
export async function loadAuthoritativeCableCatalog(
  jwtToken?: string | null
): Promise<ResolvedMasterList<MasterCableCatalogItem[]>> {
  const pg = await fetchMasterCables(jwtToken);
  const resolved = resolveMasterListPreferringPostgres(pg, getStoredCableCatalog());
  if (pg.ok) mirrorMasterDataToLocalStorage({ cables: pg.data });
  return resolved;
}

export async function loadAuthoritativeCableBoms(
  jwtToken?: string | null
): Promise<ResolvedMasterList<CableBomRawMaterial[]>> {
  const pg = await fetchMasterBoms(jwtToken);
  const resolved = resolveMasterListPreferringPostgres(pg, getStoredCableBoms());
  if (pg.ok) mirrorMasterDataToLocalStorage({ boms: pg.data });
  return resolved;
}

export async function loadAuthoritativeDrums(
  jwtToken?: string | null
): Promise<ResolvedMasterList<DrumMasterRecord[]>> {
  const pg = await fetchMasterDrums(jwtToken);
  const resolved = resolveMasterListPreferringPostgres(pg, getStoredDrumMaster());
  if (pg.ok) mirrorMasterDataToLocalStorage({ drums: pg.data });
  return resolved;
}

export async function loadAuthoritativeRawMaterials(
  jwtToken?: string | null
): Promise<ResolvedMasterList<RawMaterialMasterRecord[]>> {
  const pg = await fetchMasterRawMaterials(jwtToken);
  const resolved = resolveMasterListPreferringPostgres(pg, getStoredRawMaterials());
  if (pg.ok) mirrorMasterDataToLocalStorage({ rawMaterials: pg.data });
  return resolved;
}

/** Quality snapshot from PG-backed APIs (Task 04A). */
export async function loadAuthoritativeQualitySnapshot(
  jwtToken?: string | null
): Promise<{
  snapshot: MasterDataQualitySnapshotPayload;
  source: MasterListSource;
  authoritative: boolean;
}> {
  const [c, b, d, r] = await Promise.all([
    loadAuthoritativeCableCatalog(jwtToken),
    loadAuthoritativeCableBoms(jwtToken),
    loadAuthoritativeDrums(jwtToken),
    loadAuthoritativeRawMaterials(jwtToken),
  ]);
  const anyPg =
    c.source === 'POSTGRESQL' ||
    b.source === 'POSTGRESQL' ||
    d.source === 'POSTGRESQL' ||
    r.source === 'POSTGRESQL';
  return {
    snapshot: {
      cables: c.data,
      boms: b.data,
      drums: d.data,
      rawMaterials: r.data,
    },
    source: anyPg ? 'POSTGRESQL' : 'LOCALSTORAGE_FALLBACK',
    authoritative: c.authoritative && b.authoritative && d.authoritative && r.authoritative,
  };
}

export async function loadAuthoritativeImportHistory(
  jwtToken?: string | null
): Promise<ResolvedMasterList<ImportBatchRecord[]>> {
  const pg = await fetchMasterImportHistory(jwtToken);
  const resolved = resolveMasterListPreferringPostgres(pg, getImportBatches());
  return resolved;
}

/** Optional non-authoritative mirror after a successful PG write/import. */
export function mirrorMasterDataToLocalStorage(input: {
  cables?: MasterCableCatalogItem[];
  boms?: CableBomRawMaterial[];
  drums?: DrumMasterRecord[];
  rawMaterials?: RawMaterialMasterRecord[];
  importBatch?: ImportBatchRecord;
}): void {
  if (input.cables) saveCableCatalog(input.cables, { mirrorAfterPgSuccess: true });
  if (input.boms) saveCableBoms(input.boms, { mirrorAfterPgSuccess: true });
  if (input.drums) saveDrumMaster(input.drums, { mirrorAfterPgSuccess: true });
  if (input.rawMaterials) saveRawMaterials(input.rawMaterials);
  if (input.importBatch) saveImportBatch(input.importBatch, { mirrorAfterPgSuccess: true });
}

export function localMasterSnapshots() {
  return {
    cables: getStoredCableCatalog(),
    boms: getStoredCableBoms(),
    drums: getStoredDrumMaster(),
    rawMaterials: getStoredRawMaterials(),
    importBatches: getImportBatches(),
  };
}

export async function deactivateRawMaterialViaApi(
  code: string,
  jwtToken?: string | null
): Promise<{ ok: true; rawMaterial: RawMaterialMasterRecord } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/master/raw-materials/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `deactivate RM failed (${res.status})` };
    }
    const body = await res.json();
    return { ok: true, rawMaterial: body.rawMaterial as RawMaterialMasterRecord };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'deactivate RM unavailable' };
  }
}

async function mirrorDrumsAfterPgWrite(jwtToken?: string | null) {
  const pg = await fetchMasterDrums(jwtToken);
  if (pg.ok) mirrorMasterDataToLocalStorage({ drums: pg.data });
}

function drumApiPayload(item: Partial<DrumMasterRecord> & { drumCode: string }): Record<string, unknown> {
  return {
    drumCode: item.drumCode,
    drumType: item.drumType,
    description: item.description,
    flange: item.flange,
    barrel: item.barrel,
    innerWidth: item.innerWidth,
    outerWidth: item.outerWidth,
    capacity: item.capacity,
    clearanceMm: item.clearanceMm,
    maxWeight: item.maxWeight,
    emptyDrumNetWeightKg: item.emptyDrumNetWeightKg,
    status: item.status || 'ACTIVE',
  };
}

export async function fetchDrumViaApi(
  drumCode: string,
  jwtToken?: string | null
): Promise<{ ok: true; drum: DrumMasterRecord } | { ok: false; error: string }> {
  try {
    const res = await getJson(`/api/master/drums/${encodeURIComponent(drumCode)}`, jwtToken);
    if (!res.ok) return { ok: false, error: `drum ${res.status}` };
    const body = await res.json();
    return { ok: true, drum: body.drum as DrumMasterRecord };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'drum unavailable' };
  }
}

export type DrumPersistAction = 'CREATE' | 'UPDATE';

export type DrumPersistResult =
  | { ok: true; drum: DrumMasterRecord; action: DrumPersistAction }
  | { ok: false; error: string; drumCode?: string };

export async function createDrumViaApi(
  input: DrumMasterRecord,
  jwtToken?: string | null
): Promise<DrumPersistResult> {
  try {
    const res = await fetch('/api/master/drums', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify(drumApiPayload(input)),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `create drum failed (${res.status})`, drumCode: input.drumCode };
    }
    const body = await res.json();
    await mirrorDrumsAfterPgWrite(jwtToken);
    return { ok: true, drum: body.drum as DrumMasterRecord, action: 'CREATE' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'create drum unavailable', drumCode: input.drumCode };
  }
}

export async function updateDrumViaApi(
  drumCode: string,
  input: Partial<DrumMasterRecord> & { status?: 'ACTIVE' | 'INACTIVE' },
  jwtToken?: string | null
): Promise<DrumPersistResult> {
  try {
    const res = await fetch(`/api/master/drums/${encodeURIComponent(drumCode)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify(drumApiPayload({ ...input, drumCode })),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `update drum failed (${res.status})`, drumCode };
    }
    const body = await res.json();
    await mirrorDrumsAfterPgWrite(jwtToken);
    return { ok: true, drum: body.drum as DrumMasterRecord, action: 'UPDATE' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'update drum unavailable', drumCode };
  }
}

export type DrumExcelPreviewResponse = {
  rows: Array<{
    rowNumber: number;
    drumCode: string;
    status: 'NEW' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
    action: 'INSERT' | 'UPDATE' | 'NONE' | 'REJECT';
    existing: DrumMasterRecord | null;
    uploaded: DrumMasterRecord | null;
    changes: Array<{ field: string; existing: string | number | null; uploaded: string | number | null }>;
    errors: Array<{ field?: string; code: string; message: string }>;
  }>;
  summary: {
    totalRows: number;
    newCount: number;
    updateCount: number;
    unchangedCount: number;
    errorCount: number;
  };
  existingCount: number;
};

export async function previewDrumExcelViaApi(
  rows: Record<string, unknown>[],
  jwtToken?: string | null,
  sourceFile?: string
): Promise<{ ok: true; preview: DrumExcelPreviewResponse } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/master/drums/excel-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify({ rows, sourceFile }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body.error || `drum excel preview failed (${res.status})` };
    }
    return { ok: true, preview: body.preview as DrumExcelPreviewResponse };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'drum excel preview unavailable' };
  }
}

export async function commitDrumExcelViaApi(
  rows: Record<string, unknown>[],
  jwtToken?: string | null,
  sourceFile?: string
): Promise<
  | { ok: true; preview: DrumExcelPreviewResponse; created: DrumMasterRecord[]; updated: DrumMasterRecord[] }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/master/drums/excel-commit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify({ rows, sourceFile }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body.error || `drum excel commit failed (${res.status})` };
    }
    return {
      ok: true,
      preview: {
        rows: body.rows || [],
        summary: body.summary,
        existingCount: body.existingCount ?? 0,
      },
      created: (body.created || []) as DrumMasterRecord[],
      updated: (body.updated || []) as DrumMasterRecord[],
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'drum excel commit unavailable' };
  }
}

export async function deleteOrDeactivateDrumViaApi(
  drumCode: string,
  jwtToken?: string | null
): Promise<
  | { ok: true; action: 'DEACTIVATED' | 'DELETED'; drum: DrumMasterRecord }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(`/api/master/drums/${encodeURIComponent(drumCode)}`, {
      method: 'DELETE',
      headers: {
        ...authHeaders(jwtToken),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body.error || `delete drum failed (${res.status})` };
    }
    await mirrorDrumsAfterPgWrite(jwtToken);
    return {
      ok: true,
      action: body.action === 'DELETED' ? 'DELETED' : 'DEACTIVATED',
      drum: body.drum as DrumMasterRecord,
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'delete drum unavailable' };
  }
}

export async function deactivateDrumViaApi(
  drumCode: string,
  jwtToken?: string | null
): Promise<{ ok: true; drum: DrumMasterRecord } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/master/drums/${encodeURIComponent(drumCode)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify({ status: 'INACTIVE' }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `deactivate drum failed (${res.status})` };
    }
    const body = await res.json();
    await mirrorDrumsAfterPgWrite(jwtToken);
    return { ok: true, drum: body.drum as DrumMasterRecord };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'deactivate drum unavailable' };
  }
}

export async function setDrumStatusViaApi(
  drumCode: string,
  status: 'ACTIVE' | 'INACTIVE',
  jwtToken?: string | null
): Promise<{ ok: true; drum: DrumMasterRecord } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/master/drums/${encodeURIComponent(drumCode)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error || `drum status update failed (${res.status})` };
    }
    const body = await res.json();
    await mirrorDrumsAfterPgWrite(jwtToken);
    return { ok: true, drum: body.drum as DrumMasterRecord };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'drum status update unavailable' };
  }
}

export type CablePersistAction = 'CREATE' | 'UPDATE';

export type CablePersistResult =
  | { ok: true; cable: MasterCableCatalogItem; action: CablePersistAction }
  | { ok: false; error: string; materialNumber?: string };

function cableApiPayload(item: MasterCableCatalogItem): Record<string, unknown> {
  return {
    cableCode: item.cableCode,
    itemCode: item.itemCode,
    customerCode: item.customerCode,
    description: item.description,
    voltageClass: item.voltageClass,
    conductor: item.conductor,
    cores: item.cores,
    crossSectionMm2: item.crossSectionMm2,
    outerDiameterMm: item.outerDiameterMm,
    approxWeightKgKm: item.approxWeightKgKm,
    elandItemNumber: item.elandItemNumber,
    status: item.status || 'ACTIVE',
  };
}

export async function createCableViaApi(
  input: MasterCableCatalogItem,
  jwtToken?: string | null
): Promise<CablePersistResult> {
  try {
    const res = await fetch('/api/master/cables', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify(cableApiPayload(input)),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: body.error || `create cable failed (${res.status})`,
        materialNumber: input.cableCode,
      };
    }
    const body = await res.json();
    return { ok: true, cable: body.cable as MasterCableCatalogItem, action: 'CREATE' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'create cable unavailable', materialNumber: input.cableCode };
  }
}

export async function updateCableViaApi(
  materialNumber: string,
  input: Partial<MasterCableCatalogItem>,
  jwtToken?: string | null
): Promise<CablePersistResult> {
  try {
    const res = await fetch(`/api/master/cables/${encodeURIComponent(materialNumber)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify(cableApiPayload({ ...input, cableCode: materialNumber } as MasterCableCatalogItem)),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: body.error || `update cable failed (${res.status})`,
        materialNumber,
      };
    }
    const body = await res.json();
    return { ok: true, cable: body.cable as MasterCableCatalogItem, action: 'UPDATE' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'update cable unavailable', materialNumber };
  }
}

export async function upsertCableViaApi(
  item: MasterCableCatalogItem,
  jwtToken?: string | null,
  options?: { treatAsUpdate?: boolean }
): Promise<CablePersistResult> {
  if (options?.treatAsUpdate) {
    return updateCableViaApi(item.cableCode, item, jwtToken);
  }
  const created = await createCableViaApi(item, jwtToken);
  if (created.ok) return created;
  if (created.ok === false) {
    const createErr = created.error;
    if (createErr.includes('already exists') || createErr.includes('DUPLICATE')) {
      return updateCableViaApi(item.cableCode, item, jwtToken);
    }
  }
  return created;
}

export type CableBulkPersistResult = {
  ok: boolean;
  created: number;
  updated: number;
  errors: string[];
  cables: MasterCableCatalogItem[];
};

/** Persist cable rows via PostgreSQL API; mirror LS only after successful PG writes. */
export async function persistCableCatalogRowsViaApi(
  items: MasterCableCatalogItem[],
  jwtToken?: string | null,
  options?: { existingMaterialNumbers?: Set<string> }
): Promise<CableBulkPersistResult> {
  const existing = options?.existingMaterialNumbers;
  const persisted: MasterCableCatalogItem[] = [];
  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  for (const item of items) {
    const isUpdate = existing?.has(item.cableCode.trim().toLowerCase()) ?? false;
    const result = await upsertCableViaApi(item, jwtToken, { treatAsUpdate: isUpdate });
    if (result.ok === false) {
      errors.push(`${item.cableCode}: ${result.error}`);
      continue;
    }
    persisted.push(result.cable);
    if (result.action === 'CREATE') created++;
    else updated++;
  }

  if (persisted.length > 0) {
    const reload = await loadAuthoritativeCableCatalog(jwtToken);
    if (reload.authoritative) {
      return { ok: errors.length === 0, created, updated, errors, cables: reload.data };
    }
  }

  return { ok: errors.length === 0, created, updated, errors, cables: persisted };
}

export type CableBomPersistResult = {
  ok: boolean;
  upserted: number;
  skippedDuplicates: number;
  errors: string[];
  boms: CableBomRawMaterial[];
  batchRef?: string;
};

/** Persist BOM rows via PostgreSQL API; mirror LS only after successful PG commit (Task 04B-9). */
export async function persistCableBomsViaApi(
  input: {
    lines: CableBomRawMaterial[];
    replaceCableMaterialNumbers: string[];
    duplicateObservations?: Array<{
      cableMaterialNumber: string;
      rawMaterialCode: string;
      weightA: number;
      weightB: number;
      occurrenceCount: number;
      sourceWorksheet?: string;
      sourceFile?: string;
      sourceRowNumbers: number[];
      classification: string;
    }>;
    sourceFile?: string;
  },
  jwtToken?: string | null
): Promise<CableBomPersistResult> {
  try {
    const res = await fetch('/api/master/boms/excel-commit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(jwtToken),
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        upserted: 0,
        skippedDuplicates: 0,
        errors: [body.error || `BOM commit failed (${res.status})`],
        boms: [],
      };
    }
    const body = await res.json();
    const reload = await loadAuthoritativeCableBoms(jwtToken);
    return {
      ok: true,
      upserted: body.upserted ?? input.lines.length,
      skippedDuplicates: body.skippedDuplicates ?? 0,
      errors: [],
      boms: reload.authoritative ? reload.data : [],
      batchRef: body.batchRef,
    };
  } catch (e: any) {
    return {
      ok: false,
      upserted: 0,
      skippedDuplicates: 0,
      errors: [e?.message || 'BOM commit unavailable'],
      boms: [],
    };
  }
}

export async function downloadMasterExcel(
  entity: string,
  jwtToken: string,
  filter: { q?: string; status?: string; type?: string } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.status) params.set('status', filter.status);
  if (filter.type) params.set('type', filter.type);
  const qs = params.toString();
  const path =
    entity === 'customers'
      ? `/api/admin/customers/export${qs ? `?${qs}` : ''}`
      : `/api/master/export/${entity}${qs ? `?${qs}` : ''}`;
  const res = await fetch(path, { headers: authHeaders(jwtToken) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: (body as { error?: string }).error || `Export failed (${res.status})` };
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || `${entity}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}
