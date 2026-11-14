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

const DAY_MS = 24 * 60 * 60 * 1000;

/** One setting for the VIP revision window. A missing or invalid value stays at 7 days. */
export function inquiryRevisionWindowDays(): number {
  const raw = process.env.INQUIRY_REVISION_WINDOW_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : 7;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

export function inquiryRevisionWindowMs(): number {
  return inquiryRevisionWindowDays() * DAY_MS;
}

export function revisionDeadlineAtFrom(acceptedAtIso: string, days = inquiryRevisionWindowDays()): string {
  return new Date(new Date(acceptedAtIso).getTime() + days * DAY_MS).toISOString();
}

/** Inclusive deadline. Stored revisionDeadlineAt wins over a later change of the setting. */
export function portalRevisionWindowOpen(input: {
  commercialMetadata?: unknown;
  now?: number;
}): boolean {
  const meta = metadataRecord(input.commercialMetadata);
  const stored = typeof meta.revisionDeadlineAt === 'string' ? new Date(meta.revisionDeadlineAt).getTime() : NaN;
  const acceptedAt = typeof meta.acceptedAt === 'string' ? new Date(meta.acceptedAt).getTime() : NaN;
  const end = Number.isFinite(stored) ? stored : Number.isFinite(acceptedAt) ? acceptedAt + inquiryRevisionWindowMs() : NaN;
  if (!Number.isFinite(end)) return false;
  return (input.now ?? Date.now()) <= end;
}

export function portalCanCreateRevision(input: {
  status?: string | null;
  commercialMetadata?: unknown;
  isCurrent?: boolean | null;
  now?: number;
  vip?: boolean;
  salesOrderSent?: boolean;
  agreementReleased?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (input.vip === false) return { ok: false, reason: 'Revision is available for VIP inquiries only.' };
  if (input.isCurrent === false) return { ok: false, reason: 'Only the current inquiry revision can be revised.' };
  if (portalLifecycleFromInquiry(input) !== 'ACCEPTED') {
    return { ok: false, reason: 'Create a revision from an approved inquiry.' };
  }
  const meta = metadataRecord(input.commercialMetadata);
  const released =
    input.agreementReleased === true ||
    Boolean(meta.releasedAgreementId) ||
    meta.productionStatus === 'RELEASED_TO_PRODUCTION';
  if (released) return { ok: false, reason: 'This inquiry was released and can only be copied.' };
  if (input.salesOrderSent) return { ok: false, reason: 'The sales order was already sent.' };
  if (!portalRevisionWindowOpen(input)) return { ok: false, reason: 'The revision window is closed.' };
  return { ok: true };
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
  if (lifecycle === 'CANCELED' || lifecycle === 'ACCEPTED') return false;
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

const COPY_METADATA_DENY = new Set([
  'acceptedAt',
  'revisionDeadlineAt',
  'revisionReason',
  'revisionOpenedAt',
  'revisionOpenedBy',
  'revisionBaseSalesOrderId',
  'revisionOfInquiryId',
  'supersededByVersion',
  'supersededByInquiryId',
  'supersededAt',
  'supersededChangeSummary',
  'cancelReason',
  'canceledAt',
  'canceledBy',
  'calculatedSnapshot',
  'calculatedLineFingerprint',
  'calculatedAt',
  'versionChangeSummary',
  'sourceQuotationId',
  'sourceQuotationNumber',
  'sourceQuotationVersion',
  'releasedSalesOrderId',
  'releasedAgreementId',
  'requestedFulfillmentType',
  'productionStatus',
  'releasedToProductionAt',
  'portalSnapshot',
]);

/** Keeps customer, project and manual price overrides. Drops approval, snapshots and market prices. */
export function commercialMetadataForCopy(metadata: unknown): Record<string, unknown> {
  const source = metadataRecord(metadata);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (COPY_METADATA_DENY.has(key)) continue;
    if (key.startsWith('revision') || key.startsWith('superseded') || key.startsWith('calculated')) continue;
    next[key] = value;
  }
  for (const metal of ['copper', 'aluminium'] as const) {
    const sourceKey = metal === 'copper' ? 'copperPriceSource' : 'aluminiumPriceSource';
    const rateKey = metal === 'copper' ? 'copperPriceRate' : 'aluminiumPriceRate';
    const marketIdKey = metal === 'copper' ? 'copperMarketPriceId' : 'aluminiumMarketPriceId';
    const quoteDateKey = metal === 'copper' ? 'copperMarketQuoteDate' : 'aluminiumMarketQuoteDate';
    if (String(next[sourceKey] || '').toUpperCase() !== 'INQUIRY_OVERRIDE') {
      delete next[rateKey];
      delete next[sourceKey];
      delete next[marketIdKey];
      delete next[quoteDateKey];
    }
  }
  delete next.metalPriceDate;
  return next;
}

function metadataRecord(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  return { ...(metadata as Record<string, unknown>) };
}
