import { parseInquiryDrumSchedule } from './inquiryDrumSchedule';

export type InquiryVersionLine = {
  materialNumber: string;
  description: string;
  quantity: string;
  lengthM: string;
  drums: string;
};

export type InquiryVersionSnapshot = {
  header: Record<string, string>;
  lines: InquiryVersionLine[];
  totalValue: string;
};

export type VersionChangeItem = {
  kind: 'added' | 'removed' | 'changed';
  label: string;
  from?: string;
  to?: string;
};

const HEADER_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'incoterms', label: 'Incoterm' },
  { key: 'destinationPort', label: 'Destination port' },
  { key: 'currency', label: 'Currency' },
  { key: 'paymentTerms', label: 'Payment terms' },
  { key: 'deliveryTerms', label: 'Delivery terms' },
  { key: 'lmeCopper', label: 'LME copper' },
  { key: 'lmeAluminium', label: 'LME aluminium' },
  { key: 'priceBasis', label: 'Price basis' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'container', label: 'Container' },
];

function text(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function drumsOf(schedule: unknown, drumType: unknown): string {
  const parsed = parseInquiryDrumSchedule(schedule);
  const rawRows =
    !parsed && schedule && typeof schedule === 'object' && Array.isArray((schedule as { rows?: unknown }).rows)
      ? ((schedule as { rows: Array<Record<string, unknown>> }).rows)
      : [];
  const rows = parsed?.rows.length
    ? parsed.rows
    : rawRows
        .map((row) => ({
          drumCode: text(row.drumCode),
          noOfDrums: text(row.noOfDrums),
          cuttingLengthM: text(row.cuttingLengthM),
        }))
        .filter((row) => row.drumCode && row.noOfDrums && row.cuttingLengthM);
  if (rows.length) {
    return rows.map((row) => `${row.noOfDrums} x ${row.cuttingLengthM}m (${row.drumCode})`).join(' + ');
  }
  return text(drumType);
}

export function buildInquiryVersionSnapshot(input: {
  incoterms?: unknown;
  currency?: unknown;
  paymentTerms?: unknown;
  deliveryTerms?: unknown;
  commercialMetadata?: unknown;
  totalValue?: unknown;
  lines?: Array<{
    materialNumber?: unknown;
    cableDescription?: unknown;
    requestedQuantity?: unknown;
    requestedLengthMeters?: unknown;
    drumType?: unknown;
    drumSchedule?: unknown;
  }>;
}): InquiryVersionSnapshot {
  const meta =
    input.commercialMetadata && typeof input.commercialMetadata === 'object' && !Array.isArray(input.commercialMetadata)
      ? (input.commercialMetadata as Record<string, unknown>)
      : {};
  return {
    header: {
      incoterms: text(input.incoterms),
      destinationPort: text(meta.destinationPortCode),
      currency: text(input.currency),
      paymentTerms: text(input.paymentTerms),
      deliveryTerms: text(input.deliveryTerms),
      lmeCopper: text(meta.copperPriceRate),
      lmeAluminium: text(meta.aluminiumPriceRate),
      priceBasis: text(meta.priceBasis),
      shipping: text(meta.shippingAmount ?? meta.shippingCost),
      container: text(meta.preferredContainerType),
    },
    lines: (input.lines || []).map((line) => ({
      materialNumber: text(line.materialNumber),
      description: text(line.cableDescription),
      quantity: text(line.requestedQuantity),
      lengthM: text(line.requestedLengthMeters),
      drums: drumsOf(line.drumSchedule, line.drumType),
    })),
    totalValue: text(input.totalValue),
  };
}

export function parseInquiryVersionSnapshot(value: unknown): InquiryVersionSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!record.header || typeof record.header !== 'object' || !Array.isArray(record.lines)) return null;
  const header = record.header as Record<string, unknown>;
  return {
    header: Object.fromEntries(HEADER_FIELDS.map((field) => [field.key, text(header[field.key])])),
    lines: record.lines.map((line) => {
      const row = line && typeof line === 'object' ? (line as Record<string, unknown>) : {};
      return {
        materialNumber: text(row.materialNumber),
        description: text(row.description),
        quantity: text(row.quantity),
        lengthM: text(row.lengthM),
        drums: text(row.drums),
      };
    }),
    totalValue: text(record.totalValue),
  };
}

function lineLabel(line: InquiryVersionLine, index: number): string {
  return line.materialNumber || line.description || `Line ${index + 1}`;
}

export function diffInquiryVersions(
  before: InquiryVersionSnapshot | null,
  after: InquiryVersionSnapshot
): VersionChangeItem[] {
  if (!before) {
    return [
      {
        kind: 'changed',
        label: 'Inquiry',
        from: 'Previous calculation',
        to: 'Recalculated with edited data',
      },
    ];
  }
  const items: VersionChangeItem[] = [];
  for (const field of HEADER_FIELDS) {
    const from = before.header[field.key] || '';
    const to = after.header[field.key] || '';
    if (from !== to) {
      items.push({ kind: 'changed', label: field.label, from: from || '—', to: to || '—' });
    }
  }
  const count = Math.max(before.lines.length, after.lines.length);
  for (let index = 0; index < count; index += 1) {
    const left = before.lines[index];
    const right = after.lines[index];
    if (left && !right) {
      items.push({ kind: 'removed', label: `Cable line ${index + 1}`, from: lineLabel(left, index) });
      continue;
    }
    if (!left && right) {
      items.push({
        kind: 'added',
        label: `Cable line ${index + 1}`,
        to: `${lineLabel(right, index)} · ${right.lengthM || '—'} m`,
      });
      continue;
    }
    if (!left || !right) continue;
    if (left.materialNumber !== right.materialNumber || left.description !== right.description) {
      items.push({
        kind: 'changed',
        label: `Cable line ${index + 1}`,
        from: lineLabel(left, index),
        to: lineLabel(right, index),
      });
    }
    if (left.lengthM !== right.lengthM) {
      items.push({
        kind: 'changed',
        label: `Line ${index + 1} total length`,
        from: `${left.lengthM || '—'} m`,
        to: `${right.lengthM || '—'} m`,
      });
    }
    if (left.quantity !== right.quantity) {
      items.push({
        kind: 'changed',
        label: `Line ${index + 1} quantity`,
        from: left.quantity || '—',
        to: right.quantity || '—',
      });
    }
    if (left.drums !== right.drums) {
      items.push({
        kind: 'changed',
        label: `Line ${index + 1} drum schedule`,
        from: left.drums || '—',
        to: right.drums || '—',
      });
    }
  }
  if ((before.totalValue || after.totalValue) && before.totalValue !== after.totalValue) {
    items.push({
      kind: 'changed',
      label: 'Total value',
      from: before.totalValue || '—',
      to: after.totalValue || '—',
    });
  }
  return items;
}

export function formatVersionChangeLines(items: VersionChangeItem[]): string[] {
  return items.map((item) => {
    if (item.kind === 'added') return `Added ${item.label}: ${item.to || '—'}`;
    if (item.kind === 'removed') return `Removed ${item.label}: ${item.from || '—'}`;
    return `${item.label}: ${item.from || '—'} → ${item.to || '—'}`;
  });
}

export type InquiryTimelineRow = {
  id: string;
  versionNo?: number | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  status?: string | null;
  commercialMetadata?: unknown;
};

export type InquiryTimelineEvent = {
  id: string;
  at: string;
  action: string;
  entity: string;
  entityId: string;
  message: string;
};

function metaOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function at(value: unknown, fallback: string): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

export function buildInquiryVersionTimeline(rows: InquiryTimelineRow[]): InquiryTimelineEvent[] {
  const ordered = [...rows].sort((left, right) => (left.versionNo || 1) - (right.versionNo || 1));
  const events: InquiryTimelineEvent[] = [];
  for (const row of ordered) {
    const version = row.versionNo && row.versionNo > 0 ? row.versionNo : 1;
    const meta = metaOf(row.commercialMetadata);
    const created = at(row.createdAt, new Date(0).toISOString());
    const lifecycle = typeof meta.portalLifecycle === 'string' ? meta.portalLifecycle : '';
    events.push({
      id: `version-${row.id}-created`,
      at: created,
      action: 'VERSION_CREATED',
      entity: 'CommercialInquiry',
      entityId: row.id,
      message: `Created V${version} (Draft)`,
    });
    const wasCalculated =
      lifecycle === 'NOT_SUBMITTED' ||
      lifecycle === 'ACCEPTED' ||
      typeof meta.calculatedLineFingerprint === 'string' ||
      typeof meta.calculatedAt === 'string' ||
      meta.cancelReason === 'SUPERSEDED';
    if (wasCalculated) {
      events.push({
        id: `version-${row.id}-calculated`,
        at: at(meta.calculatedAt, at(row.updatedAt, created)),
        action: 'STATUS_CHANGE',
        entity: 'CommercialInquiry',
        entityId: row.id,
        message: `Calculated V${version} (Submitted)`,
      });
    }
    if (meta.cancelReason === 'SUPERSEDED') {
      const summary = Array.isArray(meta.supersededChangeSummary) ? meta.supersededChangeSummary : [];
      const lines = formatVersionChangeLines(summary as VersionChangeItem[]);
      const by = meta.supersededByVersion ? `V${meta.supersededByVersion}` : 'the next version';
      events.push({
        id: `version-${row.id}-superseded`,
        at: at(meta.supersededAt, at(row.updatedAt, created)),
        action: 'VERSION_SUPERSEDED',
        entity: 'CommercialInquiry',
        entityId: row.id,
        message: [`V${version} canceled: Superseded by ${by}`, ...lines.map((line) => `• ${line}`)].join('\n'),
      });
    } else if (lifecycle === 'CANCELED' && meta.cancelReason !== 'ABANDONED') {
      events.push({
        id: `version-${row.id}-canceled`,
        at: at(meta.canceledAt, at(row.updatedAt, created)),
        action: 'CANCELED',
        entity: 'CommercialInquiry',
        entityId: row.id,
        message: `Canceled V${version} by user`,
      });
    }
    if (lifecycle === 'ACCEPTED') {
      events.push({
        id: `version-${row.id}-approved`,
        at: at(meta.acceptedAt, at(row.updatedAt, created)),
        action: 'STATUS_CHANGE',
        entity: 'CommercialInquiry',
        entityId: row.id,
        message: `Approved V${version} (Converted to Order)`,
      });
    }
  }
  return events.sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
}
