import { RawMaterialMasterRecord } from '../types';

/**
 * Compatibility mirror only (Task 04A / 04B-2).
 * PostgreSQL RawMaterial is POSTGRESQL_SOT — never treat this key as Hub/Costing authority.
 */
export const RAW_MATERIAL_STORAGE_KEY = 'energya_raw_material_master_v1';
const STORAGE_KEY = RAW_MATERIAL_STORAGE_KEY;
export const RAW_MATERIAL_LOCAL_IS_AUTHORITATIVE = false;
/** Explicit classification for cutover docs / gates. */
export const RAW_MATERIAL_LS_CLASS = 'NON_AUTHORITATIVE_MIRROR' as const;

/** Sync LS reader — NOT Hub/Costing SoT. Prefer loadAuthoritativeRawMaterials. */
export function getStoredRawMaterials(): RawMaterialMasterRecord[] {
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

/** Non-authoritative mirror write after a successful PostgreSQL operation only. */
export function saveRawMaterials(records: RawMaterialMasterRecord[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent('rawMaterialsUpdated', { detail: records }));
}

/**
 * LS-only deactivate is forbidden after 04B-2 Raw Material SoT.
 * Use deactivateRawMaterialViaApi → PUT /api/master/raw-materials/:code.
 */
export function deactivateRawMaterial(_code: string): never {
  throw new Error(
    'Raw Material deactivate must use PostgreSQL (deactivateRawMaterialViaApi). localStorage energya_raw_material_master_v1 is NON_AUTHORITATIVE_MIRROR only.'
  );
}
