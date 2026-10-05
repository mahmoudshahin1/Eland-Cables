/**
 * 05I-DRUM-REMEDIATION — frozen pointer semantics.
 *
 * CommercialInquiryLine.v2CurrentCuttingPlanId and v2CurrentDrumPlanId are
 * legacy convenience / last-touched pointers only.
 *
 * Once V2CuttingLengthRequirement[] exists on a line they are NOT authoritative.
 *
 * Authoritative V2 resolution:
 *   Inquiry Line → Cutting Length Requirement → current Cutting Plan → current Drum Plan
 *
 * Costing and Quotation are not changed in this increment; they may still read
 * the line pointers as a compatibility view of the last-touched requirement.
 */

import { issue } from '../platform/errors/domainError';

export type RequirementCurrentPlanRef = {
  requirementId: string;
  sequenceNo: number;
  currentCuttingPlanId: string | null;
  currentDrumPlanId: string | null;
};

export function lineLevelPointersAreAuthoritative(requirementCount: number): boolean {
  return requirementCount === 0;
}

/** Resolve current drum plans from requirements; never collapse to the line pointer. */
export function resolveAuthoritativeCurrentDrumPlanIds(input: {
  lineCurrentDrumPlanId: string | null;
  requirements: Array<{ currentDrumPlanId: string | null }>;
}): string[] {
  if (input.requirements.length === 0) {
    return input.lineCurrentDrumPlanId ? [input.lineCurrentDrumPlanId] : [];
  }
  return input.requirements
    .map((r) => r.currentDrumPlanId)
    .filter((id): id is string => Boolean(id));
}

/**
 * Guardrail: a selected set that is only the line-level last-touched pointer
 * is illegal when multiple requirements have current drum plans.
 */
export function assertLinePointerIsNotAuthoritativeMultiRequirementSource(input: {
  lineCurrentDrumPlanId: string | null;
  selectedDrumPlanIds: string[];
  requirementCurrentDrumPlanIds: Array<string | null>;
}): void {
  const requirementIds = input.requirementCurrentDrumPlanIds.filter((id): id is string => Boolean(id));
  if (requirementIds.length === 0) return;

  const selected = [...new Set(input.selectedDrumPlanIds)].sort();
  const required = [...new Set(requirementIds)].sort();
  if (selected.join('\u0000') !== required.join('\u0000')) {
    throw issue(
      'VALIDATION_FAILED',
      'Line-level v2CurrentDrumPlanId is not authoritative once cutting-length requirements exist. Select every requirement current CONFIRMED drum plan.'
    );
  }

  if (
    requirementIds.length > 1 &&
    input.lineCurrentDrumPlanId &&
    selected.length === 1 &&
    selected[0] === input.lineCurrentDrumPlanId
  ) {
    throw issue(
      'VALIDATION_FAILED',
      'Cannot treat CommercialInquiryLine.v2CurrentDrumPlanId as the sole drum-plan source for a multi-requirement line.'
    );
  }
}
