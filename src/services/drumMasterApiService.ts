/**
 * PostgreSQL-backed Drum Master client (Task 04A).
 * Preserves capacity/clearance/suitability/ranking/optimization semantics —
 * this module only establishes read/write authority paths.
 */

import { DrumMasterRecord } from '../types';
import {
  deactivateDrumViaApi,
  loadAuthoritativeDrums,
  setDrumStatusViaApi,
  type ResolvedMasterList,
} from './masterDataApiService';
import { getStoredDrumMaster } from './drumMasterService';

/** List drums with PG preference; empty PG wins over stale LS. */
export async function listDrumsAuthoritative(
  jwtToken?: string | null
): Promise<ResolvedMasterList<DrumMasterRecord[]>> {
  return loadAuthoritativeDrums(jwtToken);
}

export async function listActiveDrumsAuthoritative(
  jwtToken?: string | null
): Promise<ResolvedMasterList<DrumMasterRecord[]>> {
  const resolved = await loadAuthoritativeDrums(jwtToken);
  return {
    ...resolved,
    data: resolved.data.filter((d) => d.status !== 'INACTIVE'),
  };
}

/**
 * Resolve drum list for UI selects.
 * When PG succeeds (including empty), never substitute stale LS.
 * LS only when PG failed (authoritative=false).
 */
export function resolveDrumListForSelect(
  pg: { ok: true; data: DrumMasterRecord[] } | { ok: false; error?: string }
): ResolvedMasterList<DrumMasterRecord[]> {
  if (pg.ok) {
    return {
      data: pg.data.filter((d) => d.status !== 'INACTIVE'),
      source: 'POSTGRESQL',
      authoritative: true,
    };
  }
  return {
    data: getStoredDrumMaster().filter((d) => d.status !== 'INACTIVE'),
    source: 'LOCALSTORAGE_FALLBACK',
    authoritative: false,
    error: pg.ok === false ? pg.error : undefined,
  };
}

export async function deactivateDrumAuthoritative(
  drumCode: string,
  jwtToken?: string | null
) {
  return deactivateDrumViaApi(drumCode, jwtToken);
}

export async function setDrumStatusAuthoritative(
  drumCode: string,
  status: 'ACTIVE' | 'INACTIVE',
  jwtToken?: string | null
) {
  return setDrumStatusViaApi(drumCode, status, jwtToken);
}
