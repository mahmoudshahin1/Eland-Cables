import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import {
  allocateNextCostingDocumentCode,
  COSTING_FORMULA_SEQUENCE_PREFIX,
  COSTING_FX_SEQUENCE_PREFIX,
  COSTING_SCRAP_SEQUENCE_PREFIX,
} from './costingDocumentSequence';
import { appendServerAudit } from './serverAudit';
import type { RequestActor } from './auth';

export const COSTING_WRAPPED_PREFIXES = new Set([
  COSTING_SCRAP_SEQUENCE_PREFIX,
  COSTING_FORMULA_SEQUENCE_PREFIX,
  COSTING_FX_SEQUENCE_PREFIX,
]);

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export function formatSequenceValue(
  format: string,
  prefix: string,
  serial: number,
  now = new Date()
): string {
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(-2);
  return format
    .replace(/\{PREFIX\}/gi, prefix)
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yy)
    .replace(/\{(#+)\}/g, (_m, hashes: string) => String(serial).padStart(hashes.length, '0'));
}

export async function listNumberSequences(filter?: { moduleId?: string; active?: boolean }) {
  const prisma = requirePrisma();
  return prisma.numberSequence.findMany({
    where: {
      ...(filter?.moduleId ? { moduleId: filter.moduleId } : {}),
      ...(filter?.active != null ? { active: filter.active } : {}),
    },
    orderBy: [{ moduleId: 'asc' }, { code: 'asc' }],
  });
}

export async function upsertNumberSequence(
  input: {
    code: string;
    name: string;
    prefix: string;
    format?: string;
    nextSerial?: number;
    active?: boolean;
    scopeType?: string;
    scopeValue?: string | null;
    moduleId?: string | null;
    description?: string | null;
  },
  actor?: RequestActor
) {
  const prisma = requirePrisma();
  const code = input.code.trim().toUpperCase();
  const prefix = input.prefix.trim().toUpperCase();
  if (COSTING_WRAPPED_PREFIXES.has(prefix)) {
    throw new Error(
      `Prefix ${prefix} is owned by CostingDocumentSequence. Use allocate with costing codes SC/FM/FX wrappers.`
    );
  }
  const row = await prisma.numberSequence.upsert({
    where: { code },
    create: {
      code,
      name: input.name.trim(),
      prefix,
      format: input.format || '{PREFIX}{YY}-{#####}',
      nextSerial: input.nextSerial ?? 1,
      active: input.active ?? true,
      scopeType: input.scopeType || 'GLOBAL',
      scopeValue: input.scopeValue ?? null,
      moduleId: input.moduleId ?? null,
      description: input.description ?? null,
      createdBy: actor?.id || actor?.email || null,
      updatedBy: actor?.id || actor?.email || null,
    },
    update: {
      name: input.name.trim(),
      prefix,
      format: input.format || '{PREFIX}{YY}-{#####}',
      ...(input.nextSerial != null ? { nextSerial: input.nextSerial } : {}),
      ...(input.active != null ? { active: input.active } : {}),
      scopeType: input.scopeType || 'GLOBAL',
      scopeValue: input.scopeValue ?? null,
      moduleId: input.moduleId ?? null,
      description: input.description ?? null,
      updatedBy: actor?.id || actor?.email || null,
    },
  });
  await appendServerAudit({
    actorId: actor?.id,
    actorName: actor?.name || actor?.email,
    entity: 'NumberSequence',
    entityId: row.code,
    action: 'UPSERT',
    newValue: { code: row.code, prefix: row.prefix, nextSerial: row.nextSerial, active: row.active },
    message: `Number sequence ${row.code} upserted`,
  });
  return row;
}

/**
 * Concurrency-safe allocate.
 * - Costing SC/FM/FX: delegates to CostingDocumentSequence (no dual cursor).
 * - Other codes: transactional increment on NumberSequence.
 */
export async function allocateNextNumber(
  codeOrPrefix: string,
  actor?: RequestActor,
  now = new Date()
): Promise<{ value: string; code: string; serial: number; source: 'PLATFORM' | 'COSTING' }> {
  const key = codeOrPrefix.trim().toUpperCase();

  if (COSTING_WRAPPED_PREFIXES.has(key)) {
    const value = await allocateNextCostingDocumentCode(key, now);
    await appendServerAudit({
      actorId: actor?.id,
      actorName: actor?.name || actor?.email,
      entity: 'NumberSequence',
      entityId: `COSTING:${key}`,
      action: 'ALLOCATE',
      newValue: { value, source: 'COSTING' },
      message: `Allocated costing sequence ${value}`,
    });
    const serial = Number(value.split('-').pop() || 0);
    return { value, code: `COSTING_${key}`, serial, source: 'COSTING' };
  }

  const prisma = requirePrisma();
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const seq = await tx.numberSequence.findUnique({ where: { code: key } });
    if (!seq) {
      throw new Error(`Number sequence '${key}' not found.`);
    }
    if (!seq.active) {
      throw new Error(`Number sequence '${key}' is inactive.`);
    }
    const serial = seq.nextSerial;
    const value = formatSequenceValue(seq.format, seq.prefix, serial, now);
    await tx.numberSequence.update({
      where: { code: key },
      data: { nextSerial: serial + 1 },
    });
    return { value, code: seq.code, serial, source: 'PLATFORM' as const };
  });

  await appendServerAudit({
    actorId: actor?.id,
    actorName: actor?.name || actor?.email,
    entity: 'NumberSequence',
    entityId: result.code,
    action: 'ALLOCATE',
    newValue: { value: result.value, serial: result.serial, source: 'PLATFORM' },
    message: `Allocated ${result.value}`,
  });

  return result;
}
