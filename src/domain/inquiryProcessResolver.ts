import { InquiryProcessCode, InquiryProcessSource } from '@prisma/client';
import { getPrisma } from '../server/db';

export const INQUIRY_PROCESS_METADATA_KEYS = [
  'inquiryProcessCode',
  'inquiryProcessSource',
  'inquiryProcessAssignedAt',
] as const;

export interface ResolvedInquiryProcess {
  processCode: InquiryProcessCode;
  source: InquiryProcessSource;
}

export interface CustomerProcessRecord {
  id?: string;
  defaultInquiryProcessCode?: InquiryProcessCode | null;
  customerGroup?: {
    defaultInquiryProcessCode?: InquiryProcessCode | null;
  } | null;
  classification?: {
    defaultInquiryProcessCode?: InquiryProcessCode | null;
  } | null;
  segment?: {
    defaultInquiryProcessCode?: InquiryProcessCode | null;
  } | null;
}

export const SYSTEM_DEFAULT_INQUIRY_PROCESS: ResolvedInquiryProcess = {
  processCode: 'STANDARD_WORKFLOW',
  source: 'SYSTEM_DEFAULT',
};

export function resolveInquiryProcessFromCustomer(
  customer: CustomerProcessRecord | null | undefined
): ResolvedInquiryProcess {
  if (!customer) return SYSTEM_DEFAULT_INQUIRY_PROCESS;

  if (customer.defaultInquiryProcessCode) {
    return {
      processCode: customer.defaultInquiryProcessCode,
      source: 'CUSTOMER_OVERRIDE',
    };
  }

  const classificationCode = customer.classification?.defaultInquiryProcessCode;
  if (classificationCode) {
    return {
      processCode: classificationCode,
      source: 'CUSTOMER_CLASSIFICATION',
    };
  }

  const segmentCode = customer.segment?.defaultInquiryProcessCode;
  if (segmentCode) {
    return {
      processCode: segmentCode,
      source: 'CUSTOMER_SEGMENT',
    };
  }

  const groupCode = customer.customerGroup?.defaultInquiryProcessCode;
  if (groupCode) {
    return {
      processCode: groupCode,
      source: 'CUSTOMER_GROUP',
    };
  }

  return SYSTEM_DEFAULT_INQUIRY_PROCESS;
}

export async function resolveInquiryProcess(
  customerMasterId: string | null | undefined
): Promise<ResolvedInquiryProcess> {
  if (!customerMasterId) return SYSTEM_DEFAULT_INQUIRY_PROCESS;

  const prisma = getPrisma();
  if (!prisma) return SYSTEM_DEFAULT_INQUIRY_PROCESS;

  const customer = await prisma.customer.findUnique({
    where: { id: customerMasterId },
    select: {
      id: true,
      defaultInquiryProcessCode: true,
      customerGroup: {
        select: { defaultInquiryProcessCode: true },
      },
      classification: {
        select: { defaultInquiryProcessCode: true },
      },
      segment: {
        select: { defaultInquiryProcessCode: true },
      },
    },
  });

  return resolveInquiryProcessFromCustomer(customer);
}

export function commercialMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function stripClientInquiryProcessOverrides(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...metadata };
  for (const key of INQUIRY_PROCESS_METADATA_KEYS) {
    delete next[key];
  }
  return next;
}

export function applyInquiryProcessToMetadata(
  metadata: Record<string, unknown>,
  resolved: ResolvedInquiryProcess,
  assignedAt: Date = new Date()
): Record<string, unknown> {
  return {
    ...metadata,
    inquiryProcessCode: resolved.processCode,
    inquiryProcessSource: resolved.source,
    inquiryProcessAssignedAt: assignedAt.toISOString(),
  };
}

export function preserveImmutableInquiryProcess(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const stripped = stripClientInquiryProcessOverrides(incoming);
  const merged = { ...existing, ...stripped };
  if (existing.inquiryProcessCode) {
    merged.inquiryProcessCode = existing.inquiryProcessCode;
    merged.inquiryProcessSource = existing.inquiryProcessSource;
    if (existing.inquiryProcessAssignedAt) {
      merged.inquiryProcessAssignedAt = existing.inquiryProcessAssignedAt;
    }
  }
  return merged;
}

export function readInquiryProcessFromMetadata(
  metadata: unknown
): ResolvedInquiryProcess | null {
  const meta = commercialMetadataRecord(metadata);
  const code = meta.inquiryProcessCode;
  const source = meta.inquiryProcessSource;
  if (code !== 'VIP_FAST_TRACK' && code !== 'STANDARD_WORKFLOW') return null;
  if (
    source !== 'CUSTOMER_OVERRIDE' &&
    source !== 'CUSTOMER_GROUP' &&
    source !== 'CUSTOMER_CLASSIFICATION' &&
    source !== 'CUSTOMER_SEGMENT' &&
    source !== 'SYSTEM_DEFAULT'
  ) {
    return { processCode: code, source: 'SYSTEM_DEFAULT' };
  }
  return { processCode: code, source };
}

export function formatInquiryProcessLabel(code: InquiryProcessCode): string {
  if (code === 'VIP_FAST_TRACK') return 'VIP Fast Track';
  return 'Standard Workflow';
}

export function formatInquiryProcessSourceLabel(source: InquiryProcessSource): string {
  if (source === 'CUSTOMER_OVERRIDE') return 'Customer override';
  if (source === 'CUSTOMER_GROUP') return 'Customer group';
  if (source === 'CUSTOMER_CLASSIFICATION') return 'Customer classification';
  if (source === 'CUSTOMER_SEGMENT') return 'Customer segment';
  return 'System default';
}
