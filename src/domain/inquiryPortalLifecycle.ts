/**
 * Customer-facing inquiry lifecycle. The Prisma InquiryStatus enum stays in place.
 * Open / Not Submitted / Canceled / Accepted are stored on commercialMetadata.portalLifecycle
 * and mapped from the existing status when that field is absent.
 * Customer labels are Draft, Submitted, Canceled and Approved. The stored codes do not change.
 */

export type PortalLifecycleStatus = 'OPEN' | 'NOT_SUBMITTED' | 'CANCELED' | 'ACCEPTED';

const PORTAL_STATUSES = new Set<PortalLifecycleStatus>(['OPEN', 'NOT_SUBMITTED', 'CANCELED', 'ACCEPTED']);

export function portalLifecycleFromInquiry(input: {
  status?: string | null;
  commercialMetadata?: unknown;
}): PortalLifecycleStatus {
  const meta = metadataRecord(input.commercialMetadata);
  const explicit = meta.portalLifecycle;
  if (typeof explicit === 'string' && PORTAL_STATUSES.has(explicit as PortalLifecycleStatus)) {
    return explicit as PortalLifecycleStatus;
  }
  const status = String(input.status || '').toUpperCase();
  if (status === 'CANCELLED' || status === 'CANCELED') return 'CANCELED';
  if (status === 'CLOSED') return 'ACCEPTED';
  if (
    status === 'QUOTED' ||
    status === 'SUBMITTED' ||
    status === 'UNDER_REVIEW' ||
    status === 'ENGINEERING_REVIEW' ||
    status === 'ENGINEERING_BLOCKED' ||
    status === 'READY_FOR_COMMERCIAL'
  ) {
    return 'NOT_SUBMITTED';
  }
  return 'OPEN';
}

export function portalLifecycleLabel(status: PortalLifecycleStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Draft';
    case 'NOT_SUBMITTED':
      return 'Submitted';
    case 'CANCELED':
      return 'Canceled';
    case 'ACCEPTED':
      return 'Approved';
  }
}

export function withPortalLifecycle(
  metadata: unknown,
  lifecycle: PortalLifecycleStatus,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return { ...metadataRecord(metadata), portalLifecycle: lifecycle, ...(extra || {}) };
}

export function inquiryLineFingerprint(
  lines: Array<{
    materialNumber?: string | null;
    requestedQuantity?: unknown;
    requestedLengthMeters?: unknown;
    cuttingLengthMeters?: unknown;
    drumType?: string | null;
    drumSchedule?: unknown;
  }>
): string {
  return lines
    .map((line) =>
      [
        line.materialNumber || '',
        String(line.requestedQuantity ?? ''),
        String(line.requestedLengthMeters ?? ''),
        String(line.cuttingLengthMeters ?? ''),
        line.drumType || '',
        JSON.stringify(line.drumSchedule ?? null),
      ].join('|')
    )
    .join('||');
}

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A calculated inquiry is forked only when the lines changed after the last successful calculation. */
export function shouldForkCalculatedInquiry(input: {
  status?: string | null;
  commercialMetadata?: unknown;
  lineFingerprint: string;
}): boolean {
  const lifecycle = portalLifecycleFromInquiry(input);
  if (lifecycle !== 'NOT_SUBMITTED' && lifecycle !== 'ACCEPTED') return false;
  const previous = metadataRecord(input.commercialMetadata).calculatedLineFingerprint;
  if (typeof previous !== 'string' || !previous) return false;
  return previous !== input.lineFingerprint;
}

export function portalInquiryEditable(input: {
  status?: string | null;
  commercialMetadata?: unknown;
  now?: number;
}): boolean {
  const lifecycle = portalLifecycleFromInquiry(input);
  if (lifecycle === 'CANCELED') return false;
  if (lifecycle === 'ACCEPTED') {
    const acceptedAt = metadataRecord(input.commercialMetadata).acceptedAt;
    if (typeof acceptedAt !== 'string') return false;
    const at = new Date(acceptedAt).getTime();
    if (!Number.isFinite(at)) return false;
    return (input.now ?? Date.now()) - at <= EDIT_WINDOW_MS;
  }
  const status = String(input.status || '').toUpperCase();
  return status === 'DRAFT' || status === 'UNDER_REVIEW' || lifecycle === 'OPEN' || lifecycle === 'NOT_SUBMITTED';
}

export function portalCanApprove(input: {
  status?: string | null;
  commercialMetadata?: unknown;
  hasQuotation?: boolean;
  total?: number | null;
}): boolean {
  if (portalLifecycleFromInquiry(input) !== 'NOT_SUBMITTED') return false;
  if (input.hasQuotation !== true) return false;
  return typeof input.total === 'number' && Number.isFinite(input.total) && input.total > 0;
}

export function displayInquiryNumber(input: {
  inquiryNumber?: string | null;
  commercialMetadata?: unknown;
}): string {
  const meta = metadataRecord(input.commercialMetadata);
  const stored = typeof meta.displayInquiryNumber === 'string' ? meta.displayInquiryNumber.trim() : '';
  return stored || String(input.inquiryNumber || '').trim();
}

export function portalVersionLabel(versionNo?: number | null): string {
  const version = versionNo && versionNo > 0 ? versionNo : 1;
  return `V${version}`;
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return { ...(metadata as Record<string, unknown>) };
}
