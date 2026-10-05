import { issue } from '../platform/errors/domainError';

export const PHYSICAL_DRUM_KEY_SEPARATOR = ':';

/** Deterministic engine identity. Quantity N expands later to instanceIndex 0..N-1. */
export function physicalDrumKey(sourceLineId: string, instanceIndex: number): string {
  const line = String(sourceLineId || '').trim();
  if (!line) {
    throw issue('VALIDATION_FAILED', 'sourceLineId is required for physical drum identity.');
  }
  if (!Number.isInteger(instanceIndex) || instanceIndex < 0) {
    throw issue('VALIDATION_FAILED', 'instanceIndex must be a non-negative integer.');
  }
  return `${line}${PHYSICAL_DRUM_KEY_SEPARATOR}${instanceIndex}`;
}

export function parsePhysicalDrumKey(key: string): { sourceLineId: string; instanceIndex: number } {
  const raw = String(key || '');
  const idx = raw.lastIndexOf(PHYSICAL_DRUM_KEY_SEPARATOR);
  if (idx <= 0 || idx === raw.length - 1) {
    throw issue('VALIDATION_FAILED', `Invalid physicalDrumKey: ${key}`);
  }
  const sourceLineId = raw.slice(0, idx);
  const instanceIndex = Number(raw.slice(idx + 1));
  if (!Number.isInteger(instanceIndex) || instanceIndex < 0) {
    throw issue('VALIDATION_FAILED', `Invalid physicalDrumKey instanceIndex: ${key}`);
  }
  return { sourceLineId, instanceIndex };
}

export function plannedPhysicalDrumKeys(sourceLineId: string, quantity: number): string[] {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw issue('VALIDATION_FAILED', 'quantity must be an integer >= 1.');
  }
  const keys: string[] = [];
  for (let i = 0; i < quantity; i += 1) {
    keys.push(physicalDrumKey(sourceLineId, i));
  }
  return keys;
}
