import { ImportBatchRecord } from '../types';

/** Task 04B-3: PostgreSQL ImportBatch is sole SoT; LS is mirror only. */
export const IMPORT_BATCH_LOCAL_IS_AUTHORITATIVE = false;
export const IMPORT_BATCH_LS_CLASS = 'NON_AUTHORITATIVE_MIRROR' as const;
export const IMPORT_BATCH_STORAGE_KEY = 'energya_import_batches_v1';

const STORAGE_KEY = IMPORT_BATCH_STORAGE_KEY;

export function getImportBatches(): ImportBatchRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Mirror ImportBatch to localStorage only after a successful PostgreSQL commit.
 * Authoritative batch history must never be written LS-only.
 */
export function saveImportBatch(
  batch: ImportBatchRecord,
  options?: { mirrorAfterPgSuccess?: boolean }
): void {
  if (!options?.mirrorAfterPgSuccess) {
    throw new Error(
      'Import batch must be committed to PostgreSQL first. energya_import_batches_v1 is NON_AUTHORITATIVE_MIRROR only.'
    );
  }
  if (typeof window === 'undefined') return;
  const all = getImportBatches();
  all.unshift(batch);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 200)));
  window.dispatchEvent(new CustomEvent('importBatchesUpdated', { detail: all }));
}
