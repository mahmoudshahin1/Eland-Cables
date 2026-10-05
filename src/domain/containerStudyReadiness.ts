/**
 * Container Study readiness boundary (Task 05I-C).
 *
 * VIP Calculate is NOT blocked when Container Study data is absent.
 * Missing container inputs produce optional-component warnings (CONTAINER_DATA_NOT_CONFIGURED).
 * Container Study algorithms are NOT implemented here — only readiness classification.
 */

export type ContainerStudyReadinessStatus =
  | 'CONTAINER_STUDY_REQUIRED'
  | 'CONTAINER_STUDY_NOT_READY'
  | 'CONTAINER_STUDY_READY';

const METADATA_KEY = 'containerStudyReadiness';

export function readContainerStudyReadiness(metadata: unknown): ContainerStudyReadinessStatus {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return 'CONTAINER_STUDY_REQUIRED';
  }
  const value = (metadata as Record<string, unknown>)[METADATA_KEY];
  if (
    value === 'CONTAINER_STUDY_REQUIRED' ||
    value === 'CONTAINER_STUDY_NOT_READY' ||
    value === 'CONTAINER_STUDY_READY'
  ) {
    return value;
  }
  return 'CONTAINER_STUDY_REQUIRED';
}

/** Dev-only bypass — retained for diagnostics; no longer required for calculate. */
export function isContainerStudyDevBypassEnabled(): boolean {
  return process.env.VIP_CONTAINER_STUDY_DEV_BYPASS === 'true';
}

export function evaluateContainerStudyGate(input: {
  metadata: unknown;
  devBypass?: boolean;
}): {
  status: ContainerStudyReadinessStatus;
  ready: boolean;
  blocked: boolean;
  message: string;
  warningMessage?: string;
  reasonCode: string;
  devBypassApplied: boolean;
} {
  const status = readContainerStudyReadiness(input.metadata);
  const devBypass = input.devBypass ?? isContainerStudyDevBypassEnabled();

  if (status === 'CONTAINER_STUDY_READY') {
    return {
      status,
      ready: true,
      blocked: false,
      message: 'Container study readiness satisfied.',
      reasonCode: 'CONTAINER_STUDY_READY',
      devBypassApplied: false,
    };
  }

  const warningMessages: Record<Exclude<ContainerStudyReadinessStatus, 'CONTAINER_STUDY_READY'>, string> = {
    CONTAINER_STUDY_REQUIRED:
      'Container study data is not configured — container shipment cost treated as 0 for this VIP Calculate draft.',
    CONTAINER_STUDY_NOT_READY:
      'Container study is in progress but not ready — container shipment cost treated as 0 for this VIP Calculate draft.',
  };

  const reasonCodes: Record<Exclude<ContainerStudyReadinessStatus, 'CONTAINER_STUDY_READY'>, string> = {
    CONTAINER_STUDY_REQUIRED: 'CONTAINER_DATA_NOT_CONFIGURED',
    CONTAINER_STUDY_NOT_READY: 'CONTAINER_DATA_NOT_CONFIGURED',
  };

  if (devBypass) {
    return {
      status,
      ready: true,
      blocked: false,
      message:
        'Container study gate bypassed via VIP_CONTAINER_STUDY_DEV_BYPASS=true (development only — not for production).',
      warningMessage: warningMessages[status],
      reasonCode: reasonCodes[status],
      devBypassApplied: true,
    };
  }

  return {
    status,
    ready: false,
    blocked: false,
    message: warningMessages[status],
    warningMessage: warningMessages[status],
    reasonCode: reasonCodes[status],
    devBypassApplied: false,
  };
}
