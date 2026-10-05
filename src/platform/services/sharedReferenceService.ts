/**
 * Shared reference / cross-module read helpers.
 * Reads only via published ownership matrix — no write ownership invented here.
 */

import { DATA_OWNERSHIP_MATRIX, ownershipForEntity } from '../dataOwnershipMatrix';
import { getModuleById } from '../moduleRegistry';

export const SHARED_REFERENCE_BOUNDARY = {
  moduleId: 'PLATFORM' as const,
  role: 'SHARED_READ' as const,
  notes: 'Consumers read masters through owning module APIs; platform does not own business meaning.',
} as const;

export function listReadableEntitiesForModule(readerModuleId: string) {
  return DATA_OWNERSHIP_MATRIX.filter((row) => row.readModules.includes(readerModuleId));
}

export function describeEntityAccess(entity: string) {
  const row = ownershipForEntity(entity);
  if (!row) return null;
  const owner = getModuleById(row.ownerModuleId);
  return {
    entity: row.entity,
    ownerModuleId: row.ownerModuleId,
    ownerDisplayName: owner?.displayName || row.ownerModuleId,
    writeApiPrefixes: row.writeApiPrefixes,
    readModules: row.readModules,
    frozen: Boolean(row.frozen),
    notes: row.notes,
  };
}
