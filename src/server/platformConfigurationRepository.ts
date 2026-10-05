import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import { appendAudit, type AuditAction } from '../platform/audit/auditLogService';
import { issue } from '../platform/errors/domainError';
import { assertReportDefinitionAllowed } from '../platform/reporting/reportRuntime';
import { appendServerAudit } from './serverAudit';
import {
  assertTypedFieldMutationAllowed,
  isSystemProtectedInquiryField,
} from '../platform/metadata/metadataService';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'system';
}

/** Authoritative server audit + optional legacy telemetry mirror. */
async function recordConfigurationAudit(entry: {
  actorId?: string;
  actorName?: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  message?: string;
}) {
  await appendServerAudit(entry);
  appendAudit(entry);
}

// --- Metal rates ---

export async function listCostingMetalRates() {
  const prisma = requirePrisma();
  return prisma.costingMetalRate.findMany({ where: { isCurrent: true }, orderBy: { code: 'asc' } });
}

export async function createCostingMetalRate(
  data: {
    code: string;
    name: string;
    description?: string;
    metalType: string;
    rate?: number | null;
    currency?: string;
    unit?: string;
    rateSource?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const row = await prisma.costingMetalRate.create({
    data: {
      code: data.code.trim(),
      name: data.name.trim(),
      description: data.description,
      metalType: data.metalType.trim(),
      rate: data.rate != null ? data.rate : null,
      currency: data.currency || 'USD',
      unit: data.unit || 'per_ton',
      rateSource: (data.rateSource as never) || 'INTERNAL_GOVERNED',
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
      effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      createdBy: actorLabel(actor),
      updatedBy: actorLabel(actor),
    },
  });
  await recordConfigurationAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CostingMetalRate',
    entityId: row.code,
    action: 'CREATE',
    newValue: { code: row.code, metalType: row.metalType, rate: row.rate },
    message: `Metal rate rule created: ${row.code}`,
  });
  return row;
}

export async function updateCostingMetalRate(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    rate: number | null;
    currency: string;
    workflowStatus: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
  }>,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const existing = await prisma.costingMetalRate.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Metal rate not found.');
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }
  const updated = await prisma.costingMetalRate.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.rate !== undefined ? { rate: data.rate } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.workflowStatus !== undefined ? { workflowStatus: data.workflowStatus as never } : {}),
      ...(data.effectiveFrom !== undefined
        ? { effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null }
        : {}),
      ...(data.effectiveTo !== undefined
        ? { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }
        : {}),
      updatedBy: actorLabel(actor),
    },
  });
  await recordConfigurationAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CostingMetalRate',
    entityId: updated.code,
    action: 'UPDATE',
    oldValue: { rate: existing.rate, workflowStatus: existing.workflowStatus },
    newValue: { rate: updated.rate, workflowStatus: updated.workflowStatus },
    message: `Metal rate updated: ${updated.code}`,
  });
  return updated;
}

// --- Logistics (incoterm + destination) ---

export async function listCostingLogisticsRules() {
  const prisma = requirePrisma();
  return prisma.costingLogisticsRule.findMany({ where: { isCurrent: true }, orderBy: [{ priority: 'asc' }, { code: 'asc' }] });
}

export async function createCostingLogisticsRule(
  data: {
    code: string;
    name: string;
    description?: string;
    incoterm: string;
    destination?: string;
    cost?: number | null;
    currency?: string;
    basis?: string;
    priority?: number;
    effectiveFrom?: string;
    effectiveTo?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const row = await prisma.costingLogisticsRule.create({
    data: {
      code: data.code.trim(),
      name: data.name.trim(),
      description: data.description,
      incoterm: data.incoterm.trim().toUpperCase(),
      destination: data.destination?.trim() || null,
      cost: data.cost != null ? data.cost : null,
      currency: data.currency || null,
      basis: data.basis || null,
      priority: data.priority ?? 100,
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
      effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      createdBy: actorLabel(actor),
      updatedBy: actorLabel(actor),
    },
  });
  await recordConfigurationAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CostingLogisticsRule',
    entityId: row.code,
    action: 'CREATE',
    newValue: { incoterm: row.incoterm, destination: row.destination, cost: row.cost },
    message: `Logistics rule created: ${row.code}`,
  });
  return row;
}

// --- Packing / drum ---

export async function listCostingPackingRules() {
  const prisma = requirePrisma();
  return prisma.costingPackingRule.findMany({ where: { isCurrent: true }, orderBy: { code: 'asc' } });
}

export async function createCostingPackingRule(
  data: {
    code: string;
    name: string;
    description?: string;
    drumCode?: string;
    packingCost?: number | null;
    currency?: string;
    basis?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const row = await prisma.costingPackingRule.create({
    data: {
      code: data.code.trim(),
      name: data.name.trim(),
      description: data.description,
      drumCode: data.drumCode?.trim() || null,
      packingCost: data.packingCost != null ? data.packingCost : null,
      currency: data.currency || null,
      basis: data.basis || null,
      createdBy: actorLabel(actor),
      updatedBy: actorLabel(actor),
    },
  });
  await recordConfigurationAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'CostingPackingRule',
    entityId: row.code,
    action: 'CREATE',
    newValue: { drumCode: row.drumCode, packingCost: row.packingCost },
    message: `Packing rule created: ${row.code}`,
  });
  return row;
}

// --- Field definitions ---

export async function listPlatformFieldDefinitions(entityCode?: string) {
  const prisma = requirePrisma();
  return prisma.platformFieldDefinition.findMany({
    where: {
      status: 'ACTIVE',
      ...(entityCode ? { entityCode: entityCode as never } : {}),
    },
    orderBy: [{ entityCode: 'asc' }, { displayOrder: 'asc' }],
  });
}

export async function upsertPlatformFieldDefinition(
  data: {
    entityCode: string;
    fieldCode: string;
    label: string;
    dataType: string;
    description?: string;
    section?: string;
    tab?: string;
    visible?: boolean;
    customerVisible?: boolean;
    displayOrder?: number;
    required?: boolean;
    readOnly?: boolean;
    roleVisibility?: unknown;
    fieldSecurity?: unknown;
    lookupEntity?: string;
    lookupDisplayField?: string;
    defaultValue?: string;
    helpText?: string;
    validationRules?: unknown;
    searchable?: boolean;
    filterable?: boolean;
    sortable?: boolean;
    status?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  assertTypedFieldMutationAllowed(data.entityCode, data.fieldCode);
  const protectedField = isSystemProtectedInquiryField(data.entityCode, data.fieldCode);
  if (protectedField && data.customerVisible === true) {
    throw issue(
      'VALIDATION_FAILED',
      `Field ${data.entityCode}.${data.fieldCode} is cost/isolation protected and cannot be made customer-visible.`
    );
  }
  const prisma = requirePrisma();
  const customerVisible = protectedField
    ? false
    : data.customerVisible !== undefined
      ? Boolean(data.customerVisible)
      : undefined;
  const row = await prisma.platformFieldDefinition.upsert({
    where: {
      entityCode_fieldCode: {
        entityCode: data.entityCode as never,
        fieldCode: data.fieldCode,
      },
    },
    create: {
      entityCode: data.entityCode as never,
      fieldCode: data.fieldCode,
      label: data.label,
      dataType: data.dataType,
      description: data.description,
      section: data.section,
      tab: data.tab,
      visible: data.visible ?? true,
      customerVisible: customerVisible ?? !protectedField,
      displayOrder: data.displayOrder ?? 100,
      required: data.required ?? false,
      readOnly: protectedField ? true : data.readOnly ?? false,
      defaultValue: data.defaultValue,
      helpText: data.helpText,
      validationRules: data.validationRules as Prisma.InputJsonValue,
      searchable: data.searchable ?? false,
      filterable: data.filterable ?? false,
      sortable: data.sortable ?? false,
      roleVisibility: data.roleVisibility as Prisma.InputJsonValue,
      fieldSecurity: (protectedField
        ? { hideFromCustomer: true, ...(typeof data.fieldSecurity === 'object' && data.fieldSecurity ? data.fieldSecurity : {}) }
        : data.fieldSecurity) as Prisma.InputJsonValue,
      lookupEntity: data.lookupEntity,
      lookupDisplayField: data.lookupDisplayField,
      createdBy: actorLabel(actor),
      updatedBy: actorLabel(actor),
    },
    update: {
      label: data.label,
      dataType: data.dataType,
      description: data.description,
      section: data.section,
      tab: data.tab,
      visible: data.visible,
      customerVisible,
      displayOrder: data.displayOrder,
      required: data.required,
      readOnly: protectedField ? true : data.readOnly,
      defaultValue: data.defaultValue,
      helpText: data.helpText,
      validationRules: data.validationRules as Prisma.InputJsonValue,
      searchable: data.searchable,
      filterable: data.filterable,
      sortable: data.sortable,
      roleVisibility: data.roleVisibility as Prisma.InputJsonValue,
      fieldSecurity: (protectedField
        ? { hideFromCustomer: true, ...(typeof data.fieldSecurity === 'object' && data.fieldSecurity ? data.fieldSecurity : {}) }
        : data.fieldSecurity) as Prisma.InputJsonValue,
      lookupEntity: data.lookupEntity,
      lookupDisplayField: data.lookupDisplayField,
      updatedBy: actorLabel(actor),
    },
  });
  await recordConfigurationAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'PlatformFieldDefinition',
    entityId: `${row.entityCode}.${row.fieldCode}`,
    action: 'UPDATE',
    newValue: {
      label: row.label,
      visible: row.visible,
      customerVisible: row.customerVisible,
      displayOrder: row.displayOrder,
      required: row.required,
      readOnly: row.readOnly,
    },
    message: `Field definition saved: ${row.entityCode}.${row.fieldCode}`,
  });
  return row;
}

// --- Notification rules ---

export async function listNotificationRules() {
  const prisma = requirePrisma();
  return prisma.notificationRule.findMany({ orderBy: { eventCode: 'asc' } });
}

export async function createNotificationRule(
  data: {
    code: string;
    name: string;
    eventCode: string;
    recipientType: string;
    recipientValue: string;
    subjectTemplate?: string;
    bodyTemplate?: string;
    active?: boolean;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const row = await prisma.notificationRule.create({
    data: {
      code: data.code.trim(),
      name: data.name.trim(),
      eventCode: data.eventCode.trim(),
      recipientType: data.recipientType,
      recipientValue: data.recipientValue,
      subjectTemplate: data.subjectTemplate,
      bodyTemplate: data.bodyTemplate,
      active: data.active ?? true,
      createdBy: actorLabel(actor),
      updatedBy: actorLabel(actor),
    },
  });
  await recordConfigurationAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'NotificationRule',
    entityId: row.code,
    action: 'CREATE',
    newValue: { eventCode: row.eventCode, recipientType: row.recipientType },
    message: `Notification rule created: ${row.code}`,
  });
  return row;
}

// --- Report definitions ---

export async function listReportDefinitions() {
  const prisma = requirePrisma();
  return prisma.reportDefinition.findMany({ where: { status: 'ACTIVE' }, orderBy: { code: 'asc' } });
}

export async function createReportDefinition(
  data: {
    code: string;
    name: string;
    entityCode: string;
    fieldCodes: string[];
    description?: string;
    filters?: unknown;
    roleVisibility?: unknown;
    customerVisible?: boolean;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  try {
    assertReportDefinitionAllowed({
      entityCode: data.entityCode,
      fieldCodes: data.fieldCodes,
      customerVisible: data.customerVisible,
    });
  } catch (err) {
    throw issue('VALIDATION_FAILED', (err as Error).message);
  }
  const row = await prisma.reportDefinition.create({
    data: {
      code: data.code.trim(),
      name: data.name.trim(),
      description: data.description,
      entityCode: data.entityCode,
      fieldCodes: data.fieldCodes as Prisma.InputJsonValue,
      filters: data.filters as Prisma.InputJsonValue,
      roleVisibility: data.roleVisibility as Prisma.InputJsonValue,
      customerVisible: data.customerVisible ?? false,
      createdBy: actorLabel(actor),
      updatedBy: actorLabel(actor),
    },
  });
  await recordConfigurationAudit({
    actorId: actor.id,
    actorName: actorLabel(actor),
    entity: 'ReportDefinition',
    entityId: row.code,
    action: 'CREATE',
    newValue: { entityCode: row.entityCode, fieldCount: data.fieldCodes.length },
    message: `Report definition created: ${row.code}`,
  });
  return row;
}
