import { parseInquiryDrumSchedule } from './inquiryDrumSchedule';

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

type FingerprintLine = {
  materialNumber?: string | null;
  requestedQuantity?: unknown;
  requestedLengthMeters?: unknown;
  cuttingLengthMeters?: unknown;
  drumType?: string | null;
  drumSchedule?: unknown;
};

function scheduleFingerprint(value: unknown): string {
  const parsed = parseInquiryDrumSchedule(value);
  if (!parsed?.rows.length) return '';
  return parsed.rows
    .map((row) =>
      [
        row.drumCode,
        row.noOfDrums,
        row.cuttingLengthM,
        row.drumTolerancePositivePercent ?? row.drumTolerancePercent,
        row.drumToleranceNegativePercent ?? row.drumTolerancePercent,
      ].join(':')
    )
    .join(',');
}

export function inquiryLineFingerprint(lines: FingerprintLine[]): string {
  return lines
    .map((line) =>
      [
        line.materialNumber || '',
        String(line.requestedQuantity ?? ''),
        String(line.requestedLengthMeters ?? ''),
        String(line.cuttingLengthMeters ?? ''),
        line.drumType || '',
        scheduleFingerprint(line.drumSchedule),
      ].join('|')
    )
    .join('||');
}

/** Previous stored fingerprints hashed the whole drum-schedule JSON, including confirm timestamps. */
export function legacyInquiryLineFingerprint(lines: FingerprintLine[]): string {
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

export function inquiryCalculationFingerprint(input: {
  lines: FingerprintLine[];
  incoterms?: string | null;
  currency?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  commercialMetadata?: unknown;
}): string {
  const meta = metadataRecord(input.commercialMetadata);
  const header = [
    input.incoterms || '',
    String(meta.destinationPortCode || ''),
    input.currency || '',
    input.paymentTerms || '',
    input.deliveryTerms || '',
    String(meta.copperPriceRate || ''),
    String(meta.aluminiumPriceRate || ''),
    String(meta.priceBasis || ''),
    String(meta.shippingAmount ?? meta.shippingCost ?? ''),
    String(meta.preferredContainerType || ''),
  ].join('|');
  return `${header}::${inquiryLineFingerprint(input.lines)}`;
}

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A calculated inquiry is forked only when the lines changed after the last successful calculation. */
export function shouldForkCalculatedInquiry(input: {
  status?: string | null;
  commercialMetadata?: unknown;
  lineFingerprint: string;
  /** Older hashes of the same lines. A match means the data did not change. */
  legacyLineFingerprint?: string | null;
}): boolean {
  const lifecycle = portalLifecycleFromInquiry(input);
  if (lifecycle !== 'NOT_SUBMITTED' && lifecycle !== 'ACCEPTED') return false;
  const previous = metadataRecord(input.commercialMetadata).calculatedLineFingerprint;
  if (typeof previous !== 'string' || !previous) return false;
  if (previous === input.lineFingerprint) return false;
  if (input.legacyLineFingerprint && previous === input.legacyLineFingerprint) return false;
  return true;
}

export function portalCanceledSubtitle(metadata: unknown): string | null {
  const meta = metadataRecord(metadata);
  if (meta.cancelReason === 'SUPERSEDED') {
    const version = Number(meta.supersededByVersion);
    return Number.isFinite(version) && version > 0 ? `Superseded by V${version}` : 'Superseded';
  }
  if (meta.cancelReason === 'USER') return 'By User';
  return null;
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
