/**
 * 05I-DRUM-REMEDIATION — engineering lineage mutation policy.
 *
 * Production V2 APIs version and supersede cutting/drum records. They do not
 * expose hard-delete. Prefer status / SUPERSEDED / versionNo over DELETE.
 *
 * ON DELETE SET NULL on cuttingLengthRequirementId is a schema safety net if a
 * requirement row is removed; it is not a business delete API. Drum plan →
 * cutting plan remains ON DELETE Restrict. Downstream costing FKs remain Restrict.
 *
 * Once a record is referenced by an authoritative downstream artifact, hard
 * delete is forbidden.
 */

import { issue } from '../platform/errors/domainError';

export type V2EngineeringEntity =
  | 'V2CuttingLengthRequirement'
  | 'V2CuttingLengthPlan'
  | 'V2DrumPlan'
  | 'V2DrumPlanLine';

export function assertV2EngineeringHardDeleteForbidden(
  entity: V2EngineeringEntity,
  referencedByDownstream: boolean
): void {
  if (referencedByDownstream) {
    throw issue(
      'VALIDATION_FAILED',
      `${entity} is referenced by an authoritative downstream artifact and cannot be hard-deleted. Use supersession or a new version.`
    );
  }
  throw issue(
    'VALIDATION_FAILED',
    `${entity} must not be hard-deleted. Persist a new version or mark SUPERSEDED.`
  );
}
