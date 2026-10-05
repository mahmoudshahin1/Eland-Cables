/**
 * Business Decision 5 sign-off (Option B / LME-base only).
 * Unsigned is the default. A recorded audit event is the only approval.
 * Signing does not change costing formulas and does not activate Option A.
 */

import type { RequestActor } from './auth';
import { getPrisma } from './db';
import { DECISION5_OPTION_B_LABEL, unsignedDecision5, type Decision5State } from './productionReadiness';
import { assertCanApprovePricingRules } from './rbac';
import { appendServerAudit } from './serverAudit';

export const DECISION5_SIGNED_ACTION = 'DECISION_5_SIGNED';
const DECISION5_SIGNED_ACTIONS = ['DECISION_5_SIGNED', 'DECISION5_SIGNED'];
export const DECISION5_ENTITY = 'Decision5';
export const DECISION5_ENTITY_ID = 'OPTION_B_LME_BASE';

export async function loadDecision5SignOff(): Promise<Decision5State> {
  const unsigned = unsignedDecision5();
  const prisma = getPrisma();
  if (!prisma) return unsigned;
  const signed = await prisma.auditEvent.findFirst({
    where: { action: { in: DECISION5_SIGNED_ACTIONS } },
    orderBy: { at: 'desc' },
  });
  if (!signed) return unsigned;
  return {
    signed: true,
    status: 'SIGNED',
    option: 'B',
    optionLabel: unsigned.optionLabel,
    signedAt: signed.at.toISOString(),
    signedBy: signed.actorName || signed.actorId || null,
    source: 'auditEvent',
  };
}

/** Records who signed Decision 5 Option B / LME-base, and when. Idempotent once signed. */
export async function signDecision5OptionB(actor: RequestActor): Promise<Decision5State> {
  assertCanApprovePricingRules(actor);
  const existing = await loadDecision5SignOff();
  if (existing.signed) return existing;

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: DECISION5_ENTITY,
    entityId: DECISION5_ENTITY_ID,
    action: DECISION5_SIGNED_ACTION,
    oldValue: {
      status: 'UNSIGNED',
      option: 'B',
      optionLabel: DECISION5_OPTION_B_LABEL,
    },
    newValue: {
      status: 'SIGNED',
      option: 'B',
      optionLabel: DECISION5_OPTION_B_LABEL,
      scope: 'Decision 5 Option B / LME-base only',
      activatesOptionA: false,
    },
    message: 'Decision 5 signed: Option B / LME-base only. Option A is not activated.',
  });

  const recorded = await loadDecision5SignOff();
  if (!recorded.signed) {
    throw new Error('Decision 5 sign-off was not recorded.');
  }
  return recorded;
}
