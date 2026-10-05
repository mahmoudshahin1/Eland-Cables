/**
 * Idempotent load of the official ICC Incoterms 2020 catalog into the existing
 * global Incoterm table. Upserts by `code`. Never deletes. Never recreates CIF/DAP.
 */
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { getPrisma } from './db';
import {
  ICC_INCOTERM_LOAD_DESCRIPTION,
  ICC_INCOTERMS_2020,
} from '../domain/globalIncotermMaster';
import { createIncoterm } from './shippingCostRepository';

export const ICC_INCOTERM_LOAD_ACTOR: RequestActor = {
  id: 'icc-incoterms-2020-load',
  name: 'ICC Incoterms 2020 load',
  email: 'icc-incoterms-2020-load@energya.local',
  userType: 'internal',
};

export type IccIncotermLoadRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IccIncotermLoadResult = {
  inserted: IccIncotermLoadRow[];
  updated: IccIncotermLoadRow[];
  unchanged: IccIncotermLoadRow[];
};

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export async function ensureIccIncoterms2020Master(): Promise<IccIncotermLoadResult> {
  const prisma = requirePrisma();
  const inserted: IccIncotermLoadRow[] = [];
  const updated: IccIncotermLoadRow[] = [];
  const unchanged: IccIncotermLoadRow[] = [];

  for (const spec of ICC_INCOTERMS_2020) {
    const existing = await prisma.incoterm.findUnique({ where: { code: spec.code } });
    if (!existing) {
      const created = await createIncoterm(
        {
          code: spec.code,
          name: spec.name,
          description: ICC_INCOTERM_LOAD_DESCRIPTION,
          active: true,
        },
        ICC_INCOTERM_LOAD_ACTOR
      );
      inserted.push(created);
      continue;
    }

    const needsName = existing.name !== spec.name;
    const needsActive = existing.active !== true;
    const needsDescription = existing.description !== ICC_INCOTERM_LOAD_DESCRIPTION;
    if (!needsName && !needsActive && !needsDescription) {
      unchanged.push(existing);
      continue;
    }

    const next = await prisma.incoterm.update({
      where: { id: existing.id },
      data: {
        name: spec.name,
        description: ICC_INCOTERM_LOAD_DESCRIPTION,
        active: true,
      },
    });
    await appendServerAudit({
      actorId: ICC_INCOTERM_LOAD_ACTOR.id,
      actorName: ICC_INCOTERM_LOAD_ACTOR.name || ICC_INCOTERM_LOAD_ACTOR.email,
      entity: 'Incoterm',
      entityId: next.id,
      action: 'INCOTERM_UPDATED',
      oldValue: existing,
      newValue: next,
      message: `Incoterm ${next.code} updated in place for ICC Incoterms 2020`,
    });
    updated.push(next);
  }

  return { inserted, updated, unchanged };
}
