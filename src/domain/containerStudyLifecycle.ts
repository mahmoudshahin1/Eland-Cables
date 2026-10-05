import { issue } from '../platform/errors/domainError';

/**
 * Persisted lifecycle statuses (no separate CALCULATED enum).
 * "Calculated" is represented by ContainerStudy.currentResultId pointing at an immutable result
 * while status remains DRAFT or VALIDATED. CONFIRM requires currentResultId + full allocation.
 */
export const CONTAINER_STUDY_STATUSES = ['DRAFT', 'VALIDATED', 'CONFIRMED', 'SUPERSEDED'] as const;
export type ContainerStudyLifecycleStatus = (typeof CONTAINER_STUDY_STATUSES)[number];

const ALLOWED: Record<ContainerStudyLifecycleStatus, ContainerStudyLifecycleStatus[]> = {
  DRAFT: ['DRAFT', 'VALIDATED', 'SUPERSEDED'],
  VALIDATED: ['DRAFT', 'CONFIRMED', 'SUPERSEDED'],
  CONFIRMED: ['SUPERSEDED'],
  SUPERSEDED: [],
};

export function assertContainerStudyTransition(
  from: ContainerStudyLifecycleStatus,
  to: ContainerStudyLifecycleStatus
): void {
  if (from === to && from === 'DRAFT') return;
  if (!ALLOWED[from].includes(to)) {
    throw issue(
      'VALIDATION_FAILED',
      `Invalid Container Study transition ${from} → ${to}.`,
      { from, to }
    );
  }
}

export function isConfirmedImmutable(status: ContainerStudyLifecycleStatus): boolean {
  return status === 'CONFIRMED' || status === 'SUPERSEDED';
}
