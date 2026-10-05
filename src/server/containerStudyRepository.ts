import { Prisma } from '@prisma/client';
import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { allocateNextNumber } from './numberSequenceService';
import { issue } from '../platform/errors/domainError';
import { loadContainerStudyInquiryScoped } from './containerStudyPhysicalDrumResolver';
import {
  assertCanAccessInquiryOwnership,
} from './rbac';
import {
  assertContainerStudyTransition,
  isConfirmedImmutable,
  type ContainerStudyLifecycleStatus,
} from '../domain/containerStudyLifecycle';
import {
  evaluateConfirmReadiness,
  evaluateContainerStudyStructure,
  type SnapshotDrumInput,
} from '../domain/containerStudyValidation';
import { calculateContainerStudy as runContainerStudyEngine } from '../domain/containerStudyCalculationEngine';
import { mapSnapshotToCalculationInput } from '../domain/containerStudySnapshotMapper';
import {
  buildPinnedAlgorithmParameters,
  readPinnedConfigurationStatus,
} from '../domain/containerStudySnapshotPins';
import { getAlgorithmConfiguration } from './algorithmConfigurationRepository';
import {
  assertContainerPreferenceIsNotAuthority,
  assertShipmentGroupCreateInput,
  parseDeliveryAllocationMode,
} from '../domain/containerStudyShipmentGroupRules';
import {
  assertShipmentGroupIdentityMutable,
  assertShipmentIdentityHomogeneous,
  compatibilityInquiryLineId,
  resolveAuthoritativeMemberLineIds,
  resolveCreateMembership,
  type MemberShipmentIdentity,
} from '../domain/containerStudyShipmentGroupMembership';
import { evaluateSnapshotInputHardening, evaluateDrumPlanDrift } from '../domain/containerStudyInputHardening';
import { evaluateContainerStudyResultIntegrity } from '../domain/containerStudyResultIntegrity';
import { explainUnallocatedDrums } from '../domain/containerStudyUnallocatedExplanation';
import { parseContainerStudyLineage } from '../domain/containerStudyLineage';
import { selectEligibleConfirmedDrumPlans } from '../domain/containerStudyEntireInquiryAggregation';
import type { ContainerStudyCalculationOutput } from '../domain/containerStudyCalculationTypes';
import {
  assertShipmentGroupDeliveryComplete,
  readSavedInquiryDeliveryCombination,
  resolveShipmentGroupDeliveryIdentity,
} from '../domain/inquiryShipmentGroupDelivery';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

function snapshotDrumInputs(snapshot: {
  drums?: Array<{
    sourceLineId: string;
    quantity: number;
    packedLengthMm?: Prisma.Decimal | number | null;
    packedWidthMm?: Prisma.Decimal | number | null;
    packedHeightMm?: Prisma.Decimal | number | null;
    grossWeightKg?: Prisma.Decimal | number | null;
    packingProfileVersionId?: string | null;
  }>;
}): SnapshotDrumInput[] {
  return (snapshot.drums || []).map((d) => ({
    sourceLineId: d.sourceLineId,
    quantity: d.quantity,
    packedLengthMm: toNumber(d.packedLengthMm),
    packedWidthMm: toNumber(d.packedWidthMm),
    packedHeightMm: toNumber(d.packedHeightMm),
    grossWeightKg: toNumber(d.grossWeightKg),
    packingProfileVersionId: d.packingProfileVersionId,
  }));
}

function livePinWarning(
  pinnedStatus: string | undefined,
  liveStatus: string | undefined
): Array<{ code: string; message: string }> {
  if (!pinnedStatus || !liveStatus || pinnedStatus === liveStatus) return [];
  return [
    {
      code: 'LIVE_CONFIGURATION_STATUS_DIFFERS',
      message: `Pinned algorithm configuration status is ${pinnedStatus}; live status is ${liveStatus}. Historical snapshot pins remain authoritative.`,
    },
  ];
}

function throwIssues(message: string, issues: Array<{ code: string; field?: string; message: string }>): never {
  throw issue('VALIDATION_FAILED', message, { issues });
}

const shipmentGroupInclude = {
  memberLines: { orderBy: { createdAt: 'asc' as const } },
} as const;

const studyInclude = {
  shipmentGroup: { include: shipmentGroupInclude },
  snapshots: { include: { drums: true, containerPins: true }, orderBy: { capturedAt: 'desc' as const } },
  results: { include: { containers: true, allocations: true, unallocated: true } },
  currentSnapshot: { include: { drums: true, containerPins: true } },
  currentResult: { include: { containers: true, allocations: true, unallocated: true } },
} as const;

export async function loadAuthoritativeMemberLineIds(
  group: {
    id: string;
    inquiryId: string;
    inquiryLineId: string | null;
    deliveryAllocationMode: 'ENTIRE_INQUIRY' | 'PER_INQUIRY_LINE' | 'DESTINATION_CLUSTER';
  },
  allInquiryLineIds: string[]
): Promise<string[]> {
  const prisma = requirePrisma();
  const rows = await prisma.containerShipmentGroupLine.findMany({
    where: { shipmentGroupId: group.id },
    select: { inquiryLineId: true },
  });
  return resolveAuthoritativeMemberLineIds({
    deliveryAllocationMode: group.deliveryAllocationMode,
    groupInquiryLineId: group.inquiryLineId,
    membershipLineIds: rows.map((r) => r.inquiryLineId),
    allInquiryLineIds,
  });
}

async function assertMemberLinesUnoccupied(
  inquiryId: string,
  memberLineIds: string[],
  exceptGroupId?: string
) {
  if (memberLineIds.length === 0) return;
  const prisma = requirePrisma();
  const occupied = await prisma.containerShipmentGroupLine.findMany({
    where: {
      inquiryLineId: { in: memberLineIds },
      shipmentGroup: {
        inquiryId,
        status: { in: ['ACTIVE', 'LOCKED'] },
        ...(exceptGroupId ? { id: { not: exceptGroupId } } : {}),
      },
    },
    select: { inquiryLineId: true, shipmentGroupId: true },
  });
  const occupiedMirror = await prisma.containerShipmentGroup.findMany({
    where: {
      inquiryId,
      status: { in: ['ACTIVE', 'LOCKED'] },
      inquiryLineId: { in: memberLineIds },
      ...(exceptGroupId ? { id: { not: exceptGroupId } } : {}),
    },
    select: { inquiryLineId: true },
  });
  const occupiedIds = [
    ...new Set([
      ...occupied.map((o) => o.inquiryLineId),
      ...occupiedMirror.map((o) => o.inquiryLineId).filter((id): id is string => Boolean(id)),
    ]),
  ];
  if (occupiedIds.length > 0) {
    throw issue(
      'VALIDATION_FAILED',
      `Inquiry line(s) already belong to another ACTIVE or LOCKED shipment group: ${occupiedIds.join(', ')}.`
    );
  }
}

async function assertNoSecondEntireInquiry(inquiryId: string, exceptGroupId?: string) {
  const prisma = requirePrisma();
  const existing = await prisma.containerShipmentGroup.findFirst({
    where: {
      inquiryId,
      deliveryAllocationMode: 'ENTIRE_INQUIRY',
      status: { in: ['ACTIVE', 'LOCKED'] },
      ...(exceptGroupId ? { id: { not: exceptGroupId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw issue(
      'VALIDATION_FAILED',
      'An inquiry may have only one ACTIVE or LOCKED ENTIRE_INQUIRY shipment group.'
    );
  }
}

export async function loadStudyScoped(id: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const study = await prisma.containerStudy.findFirst({
    where: { OR: [{ id }, { studyNumber: id }] },
    include: studyInclude,
  });
  if (!study) throw issue('NOT_FOUND', `Container Study ${id} not found.`);
  assertCanAccessInquiryOwnership(actor, study.customerId, study.customerMasterId);
  return study;
}

type ShipmentGroupWriteInput = {
  groupCode?: string;
  deliveryAllocationMode?: 'ENTIRE_INQUIRY' | 'PER_INQUIRY_LINE' | 'DESTINATION_CLUSTER';
  inquiryLineId?: string | null;
  inquiryLineIds?: string[] | null;
  memberIdentities?: MemberShipmentIdentity[] | null;
  destinationKey?: string | null;
  destinationPortCode?: string | null;
  incotermCode?: string | null;
  containerTypePreferenceCode?: string | null;
  notes?: string | null;
  customerId?: string | null;
  technicallySuitable?: unknown;
  containerSuitable?: unknown;
  suitability?: unknown;
};

export async function createShipmentGroup(inquiryId: string, input: ShipmentGroupWriteInput, actor: RequestActor) {
  const inquiry = await loadContainerStudyInquiryScoped(inquiryId, actor);
  if (input.customerId && input.customerId !== inquiry.customerId && input.customerId !== inquiry.customerMasterId) {
    throw issue('VALIDATION_FAILED', 'customerId cannot override inquiry customer scope.');
  }
  assertContainerPreferenceIsNotAuthority(input);
  const mode = parseDeliveryAllocationMode(input.deliveryAllocationMode);
  const savedDelivery = readSavedInquiryDeliveryCombination(inquiry);
  const delivery = resolveShipmentGroupDeliveryIdentity({
    saved: savedDelivery,
    clientDestinationPortCode: input.destinationPortCode,
    clientDestinationKey: input.destinationKey,
    clientIncotermCode: input.incotermCode,
  });
  const resolved = assertShipmentGroupCreateInput({
    deliveryAllocationMode: mode,
    inquiryLineId: input.inquiryLineId || input.inquiryLineIds?.[0],
    destinationPortCode: delivery.destinationPortCode,
    destinationKey: delivery.destinationPortCode,
    incotermCode: delivery.incotermCode,
  });
  const memberLineIds = resolveCreateMembership({
    deliveryAllocationMode: mode,
    inquiryLineId: input.inquiryLineId,
    inquiryLineIds: input.inquiryLineIds,
    allInquiryLineIds: inquiry.lines.map((l) => l.id),
  });
  assertShipmentIdentityHomogeneous(
    {
      destinationPortCode: resolved.destinationPortCode ?? '',
      incotermCode: resolved.incotermCode ?? '',
      containerTypePreferenceCode: input.containerTypePreferenceCode,
    },
    input.memberIdentities
  );
  if (mode === 'ENTIRE_INQUIRY') await assertNoSecondEntireInquiry(inquiry.id);
  await assertMemberLinesUnoccupied(inquiry.id, memberLineIds);
  const prisma = requirePrisma();
  const preference = input.containerTypePreferenceCode?.trim() || null;
  if (preference) {
    const type = await prisma.containerType.findUnique({ where: { code: preference } });
    if (!type || !type.active) {
      throw issue('VALIDATION_FAILED', `Unknown or inactive container type preference: ${preference}.`);
    }
  }
  const group = await prisma.containerShipmentGroup.create({
    data: {
      inquiryId: inquiry.id,
      inquiryLineId: compatibilityInquiryLineId(mode, memberLineIds),
      groupCode: (input.groupCode || 'SG-1').trim(),
      deliveryAllocationMode: mode,
      destinationKey: delivery.deliveryDestination ?? resolved.destinationPortCode,
      destinationPortCode: resolved.destinationPortCode,
      incotermCode: resolved.incotermCode,
      containerTypePreferenceCode: preference,
      status: 'ACTIVE',
      versionNo: 1,
      notes: input.notes ?? null,
      createdBy: actor.id || actor.email || null,
      memberLines: {
        create: memberLineIds.map((lineId) => ({ inquiryLineId: lineId })),
      },
    },
    include: shipmentGroupInclude,
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerShipmentGroup',
    entityId: group.id,
    action: 'SHIPMENT_GROUP_CREATED',
    newValue: {
      inquiryId: inquiry.id,
      groupCode: group.groupCode,
      deliveryAllocationMode: group.deliveryAllocationMode,
      memberLineIds,
    },
    message: `Shipment group ${group.groupCode} created`,
  });
  return group;
}

export async function listShipmentGroupsForInquiry(inquiryId: string, actor: RequestActor) {
  const inquiry = await loadContainerStudyInquiryScoped(inquiryId, actor);
  const prisma = requirePrisma();
  return prisma.containerShipmentGroup.findMany({
    where: { inquiryId: inquiry.id },
    include: shipmentGroupInclude,
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateShipmentGroup(groupId: string, input: ShipmentGroupWriteInput, actor: RequestActor) {
  const prisma = requirePrisma();
  const existing = await prisma.containerShipmentGroup.findUnique({
    where: { id: groupId },
    include: { inquiry: true, memberLines: true },
  });
  if (!existing) throw issue('NOT_FOUND', `Shipment group ${groupId} not found.`);
  assertCanAccessInquiryOwnership(actor, existing.inquiry.customerId, existing.inquiry.customerMasterId);
  try {
    assertShipmentGroupIdentityMutable(existing.status);
  } catch (err) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerShipmentGroup',
      entityId: existing.id,
      action: 'SHIPMENT_GROUP_MUTATION_REJECTED',
      newValue: { status: existing.status, attempted: 'UPDATE' },
      message: `Rejected silent mutation of ${existing.status} shipment group ${existing.groupCode}`,
    });
    throw err;
  }
  const inquiry = await loadContainerStudyInquiryScoped(existing.inquiryId, actor);
  const mode = parseDeliveryAllocationMode(input.deliveryAllocationMode ?? existing.deliveryAllocationMode);
  const savedDelivery = readSavedInquiryDeliveryCombination(inquiry);
  const delivery = resolveShipmentGroupDeliveryIdentity({
    saved: savedDelivery,
    clientDestinationPortCode: input.destinationPortCode ?? existing.destinationPortCode,
    clientDestinationKey: input.destinationKey ?? existing.destinationKey,
    clientIncotermCode: input.incotermCode ?? existing.incotermCode,
  });
  const resolved = assertShipmentGroupCreateInput({
    deliveryAllocationMode: mode,
    inquiryLineId: input.inquiryLineId || input.inquiryLineIds?.[0] || existing.inquiryLineId,
    destinationPortCode: delivery.destinationPortCode,
    destinationKey: delivery.destinationPortCode,
    incotermCode: delivery.incotermCode,
  });
  const existingMembers =
    existing.memberLines.length > 0
      ? existing.memberLines.map((m) => m.inquiryLineId)
      : existing.inquiryLineId
        ? [existing.inquiryLineId]
        : [];
  const modeChanged = mode !== existing.deliveryAllocationMode;
  const membershipRespecified = input.inquiryLineIds != null || input.inquiryLineId != null || modeChanged;
  const memberLineIds = membershipRespecified
    ? resolveCreateMembership({
        deliveryAllocationMode: mode,
        inquiryLineId: input.inquiryLineId ?? (mode === 'PER_INQUIRY_LINE' ? existing.inquiryLineId : null),
        inquiryLineIds: input.inquiryLineIds ?? (modeChanged ? undefined : existingMembers),
        allInquiryLineIds: inquiry.lines.map((l) => l.id),
      })
    : existingMembers.length > 0
      ? existingMembers
      : resolveCreateMembership({
          deliveryAllocationMode: mode,
          inquiryLineId: existing.inquiryLineId,
          allInquiryLineIds: inquiry.lines.map((l) => l.id),
        });
  assertShipmentIdentityHomogeneous(
    {
      destinationPortCode: resolved.destinationPortCode ?? '',
      incotermCode: resolved.incotermCode ?? '',
      containerTypePreferenceCode: input.containerTypePreferenceCode ?? existing.containerTypePreferenceCode,
    },
    input.memberIdentities
  );
  if (mode === 'ENTIRE_INQUIRY') await assertNoSecondEntireInquiry(inquiry.id, existing.id);
  await assertMemberLinesUnoccupied(inquiry.id, memberLineIds, existing.id);
  const preference =
    input.containerTypePreferenceCode !== undefined
      ? input.containerTypePreferenceCode?.trim() || null
      : existing.containerTypePreferenceCode;
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.containerShipmentGroupLine.deleteMany({ where: { shipmentGroupId: existing.id } });
    return tx.containerShipmentGroup.update({
      where: { id: existing.id },
      data: {
        inquiryLineId: compatibilityInquiryLineId(mode, memberLineIds),
        deliveryAllocationMode: mode,
        destinationKey: delivery.deliveryDestination ?? resolved.destinationPortCode,
        destinationPortCode: resolved.destinationPortCode,
        incotermCode: resolved.incotermCode,
        containerTypePreferenceCode: preference,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        memberLines: { create: memberLineIds.map((lineId) => ({ inquiryLineId: lineId })) },
      },
      include: shipmentGroupInclude,
    });
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerShipmentGroup',
    entityId: updated.id,
    action: 'SHIPMENT_GROUP_UPDATED',
    newValue: {
      deliveryAllocationMode: updated.deliveryAllocationMode,
      destinationPortCode: updated.destinationPortCode,
      incotermCode: updated.incotermCode,
      memberLineIds,
    },
    message: `Shipment group ${updated.groupCode} updated`,
  });
  return updated;
}

export async function validateShipmentGroup(groupId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const existing = await prisma.containerShipmentGroup.findUnique({
    where: { id: groupId },
    include: { inquiry: true, memberLines: true },
  });
  if (!existing) throw issue('NOT_FOUND', `Shipment group ${groupId} not found.`);
  assertCanAccessInquiryOwnership(actor, existing.inquiry.customerId, existing.inquiry.customerMasterId);
  if (existing.status === 'SUPERSEDED') {
    throw issue('CONFLICT', 'Cannot validate a SUPERSEDED shipment group.');
  }
  try {
    assertShipmentGroupDeliveryComplete({
      destinationPortCode: existing.destinationPortCode,
      incotermCode: existing.incotermCode,
    });
    if (!existing.deliveryAllocationMode) {
      throw issue('VALIDATION_FAILED', 'Shipment group is missing delivery allocation mode.');
    }
    if (existing.deliveryAllocationMode === 'PER_INQUIRY_LINE' && !existing.inquiryLineId) {
      throw issue('VALIDATION_FAILED', 'PER_INQUIRY_LINE shipment group requires an inquiry line.');
    }
  } catch (err) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerShipmentGroup',
      entityId: existing.id,
      action: 'SHIPMENT_GROUP_VALIDATION_FAILED',
      newValue: { status: existing.status },
      message: `Shipment group ${existing.groupCode} failed validation`,
    });
    throw err;
  }
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerShipmentGroup',
    entityId: existing.id,
    action: 'SHIPMENT_GROUP_VALIDATED',
    newValue: {
      destinationPortCode: existing.destinationPortCode,
      incotermCode: existing.incotermCode,
      deliveryAllocationMode: existing.deliveryAllocationMode,
    },
    message: `Shipment group ${existing.groupCode} validated`,
  });
  return existing;
}

export async function confirmShipmentGroup(groupId: string, actor: RequestActor) {
  const validated = await validateShipmentGroup(groupId, actor);
  if (validated.status === 'LOCKED') {
    return validated;
  }
  try {
    assertShipmentGroupIdentityMutable(validated.status);
  } catch (err) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerShipmentGroup',
      entityId: validated.id,
      action: 'SHIPMENT_GROUP_CONFIRMATION_REJECTED',
      newValue: { status: validated.status },
      message: `Rejected confirmation of shipment group ${validated.groupCode}`,
    });
    throw err;
  }
  const prisma = requirePrisma();
  const confirmed = await prisma.containerShipmentGroup.update({
    where: { id: validated.id },
    data: { status: 'LOCKED' },
    include: shipmentGroupInclude,
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerShipmentGroup',
    entityId: confirmed.id,
    action: 'SHIPMENT_GROUP_CONFIRMED',
    newValue: { status: confirmed.status, versionNo: confirmed.versionNo },
    message: `Shipment group ${confirmed.groupCode} confirmed`,
  });
  return confirmed;
}

export async function supersedeShipmentGroup(groupId: string, input: ShipmentGroupWriteInput, actor: RequestActor) {
  const prisma = requirePrisma();
  const existing = await prisma.containerShipmentGroup.findUnique({
    where: { id: groupId },
    include: { inquiry: true, memberLines: true },
  });
  if (!existing) throw issue('NOT_FOUND', `Shipment group ${groupId} not found.`);
  assertCanAccessInquiryOwnership(actor, existing.inquiry.customerId, existing.inquiry.customerMasterId);
  if (existing.status === 'SUPERSEDED') {
    throw issue('CONFLICT', 'Shipment group is already SUPERSEDED.');
  }
  await prisma.containerShipmentGroup.update({
    where: { id: existing.id },
    data: { status: 'SUPERSEDED' },
  });
  try {
    const successor = await createShipmentGroup(
      existing.inquiryId,
      {
        ...input,
        groupCode: input.groupCode || `${existing.groupCode}-v${existing.versionNo + 1}`,
        destinationPortCode: input.destinationPortCode ?? existing.destinationPortCode,
        incotermCode: input.incotermCode ?? existing.incotermCode,
        deliveryAllocationMode: input.deliveryAllocationMode ?? existing.deliveryAllocationMode,
        inquiryLineId: input.inquiryLineId ?? existing.inquiryLineId,
        inquiryLineIds: input.inquiryLineIds ?? existing.memberLines.map((m) => m.inquiryLineId),
      },
      actor
    );
    await prisma.containerShipmentGroup.update({
      where: { id: successor.id },
      data: { versionNo: existing.versionNo + 1 },
    });
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerShipmentGroup',
      entityId: existing.id,
      action: 'SHIPMENT_GROUP_SUPERSEDED',
      newValue: { successorId: successor.id, versionNo: existing.versionNo + 1 },
      message: `Shipment group ${existing.groupCode} superseded`,
    });
    return prisma.containerShipmentGroup.findUniqueOrThrow({
      where: { id: successor.id },
      include: shipmentGroupInclude,
    });
  } catch (err) {
    await prisma.containerShipmentGroup.update({
      where: { id: existing.id },
      data: { status: existing.status },
    });
    throw err;
  }
}

export async function createContainerStudy(
  inquiryId: string,
  input: {
    shipmentGroupId: string;
    stuffingMethod: 'Rolling' | 'Forklifting';
    region: 'Europe' | 'Africa';
    deliveryAllocationMode?: 'ENTIRE_INQUIRY' | 'PER_INQUIRY_LINE' | 'DESTINATION_CLUSTER';
    customerId?: string | null;
    technicallySuitable?: unknown;
    containerSuitable?: unknown;
    suitability?: unknown;
  },
  actor: RequestActor
) {
  const inquiry = await loadContainerStudyInquiryScoped(inquiryId, actor);
  if (input.customerId && input.customerId !== inquiry.customerId && input.customerId !== inquiry.customerMasterId) {
    throw issue('VALIDATION_FAILED', 'customerId cannot override inquiry customer scope.');
  }
  assertContainerPreferenceIsNotAuthority(input);
  if (!input.shipmentGroupId) {
    throw issue('VALIDATION_FAILED', 'shipmentGroupId is required.');
  }
  if (input.stuffingMethod !== 'Rolling' && input.stuffingMethod !== 'Forklifting') {
    throw issue('VALIDATION_FAILED', 'stuffingMethod must be Rolling or Forklifting.');
  }
  const prisma = requirePrisma();
  const group = await prisma.containerShipmentGroup.findUnique({ where: { id: input.shipmentGroupId } });
  if (!group || group.inquiryId !== inquiry.id) {
    throw issue('VALIDATION_FAILED', 'Shipment group does not belong to this inquiry.');
  }
  if (group.status === 'SUPERSEDED') {
    throw issue('CONFLICT', 'Cannot create a Container Study on a SUPERSEDED shipment group. Use the successor group.');
  }
  if (
    input.deliveryAllocationMode &&
    parseDeliveryAllocationMode(input.deliveryAllocationMode) !== group.deliveryAllocationMode
  ) {
    throw issue('VALIDATION_FAILED', 'deliveryAllocationMode must match the shipment group.');
  }
  let study: Awaited<ReturnType<typeof prisma.containerStudy.create>> | undefined;
  let studyNumber = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      studyNumber = (await allocateNextNumber('CONTAINER_STUDY', actor)).value;
    } catch (err) {
      throw issue(
        'CONFIGURATION_REQUIRED',
        'CONTAINER_STUDY number sequence is unavailable. Configure the CONTAINER_STUDY sequence before creating studies.',
        { cause: err instanceof Error ? err.message : String(err) }
      );
    }
    try {
      study = await prisma.containerStudy.create({
        data: {
          studyNumber,
          versionNo: 1,
          inquiryId: inquiry.id,
          shipmentGroupId: group.id,
          customerId: inquiry.customerId,
          customerMasterId: inquiry.customerMasterId,
          stuffingMethod: input.stuffingMethod,
          region: input.region,
          deliveryAllocationMode: group.deliveryAllocationMode,
          createdBy: actor.id || actor.email || null,
        },
        include: studyInclude,
      });
      break;
    } catch (err) {
      const unique = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!unique || attempt === 7) throw err;
    }
  }
  if (!study) {
    throw issue('VALIDATION_FAILED', 'Failed to allocate a unique Container Study number.');
  }
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_CREATED',
    newValue: { studyNumber, stuffingMethod: study.stuffingMethod, region: study.region },
    message: `Container Study ${studyNumber} created`,
  });
  return study;
}

export async function getContainerStudy(id: string, actor: RequestActor) {
  return loadStudyScoped(id, actor);
}

export async function listContainerStudyResults(studyId: string, actor: RequestActor) {
  const study = await loadStudyScoped(studyId, actor);
  const prisma = requirePrisma();
  const results = await prisma.containerStudyResult.findMany({
    where: { studyId: study.id },
    include: { containers: true, allocations: true, unallocated: true, inputSnapshot: { include: { drums: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return results.map((result) => ({
    ...result,
    unallocatedExplanations: explainUnallocatedDrums({
      drums: snapshotDrumInputs(result.inputSnapshot),
      lineageProvenanceJson: result.inputSnapshot.lineageProvenanceJson,
      unallocated: result.unallocated,
    }),
  }));
}

export async function getContainerStudyResult(studyId: string, resultId: string, actor: RequestActor) {
  const study = await loadStudyScoped(studyId, actor);
  const prisma = requirePrisma();
  const result = await prisma.containerStudyResult.findFirst({
    where: {
      studyId: study.id,
      OR: [{ id: resultId }, { resultId }],
    },
    include: { containers: true, allocations: true, unallocated: true, inputSnapshot: { include: { drums: true } } },
  });
  if (!result) throw issue('NOT_FOUND', `Container Study result ${resultId} not found.`);
  return {
    ...result,
    unallocatedExplanations: explainUnallocatedDrums({
      drums: snapshotDrumInputs(result.inputSnapshot),
      lineageProvenanceJson: result.inputSnapshot.lineageProvenanceJson,
      unallocated: result.unallocated,
    }),
  };
}

export async function listContainerStudiesForInquiry(inquiryId: string, actor: RequestActor) {
  const inquiry = await loadContainerStudyInquiryScoped(inquiryId, actor);
  const prisma = requirePrisma();
  return prisma.containerStudy.findMany({
    where: { inquiryId: inquiry.id },
    include: studyInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function captureInputSnapshot(
  studyId: string,
  input: {
    configurationId: string;
    drums: Array<
      SnapshotDrumInput & {
        drumCode?: string | null;
        drumMasterId?: string | null;
        packingProfileVersionId?: string | null;
      }
    >;
    containerTypeVersionIds?: string[];
    lineageProvenanceJson?: unknown;
  },
  actor: RequestActor
) {
  const study = await loadStudyScoped(studyId, actor);
  if (isConfirmedImmutable(study.status as ContainerStudyLifecycleStatus)) {
    throw issue('CONFLICT', 'Cannot modify a CONFIRMED or SUPERSEDED Container Study snapshot.');
  }
  if (study.status !== 'DRAFT' && study.status !== 'VALIDATED') {
    throw issue('VALIDATION_FAILED', 'Snapshots may only be captured on DRAFT or VALIDATED studies.');
  }
  if (study.currentSnapshotId) {
    throw issue(
      'CONFLICT',
      'Input snapshots are immutable. Population changes require SUPERSEDE and a new study version.',
      {
        issues: [
          {
            code: 'SNAPSHOT_IMMUTABLE',
            message: 'A Container Study snapshot must never be replaced in-place.',
          },
        ],
      }
    );
  }
  const hardening = evaluateSnapshotInputHardening({
    drums: input.drums,
    lineageProvenanceJson: input.lineageProvenanceJson,
    requireLineage: true,
  });
  if (!hardening.ok) {
    throwIssues('Container Study input snapshot is not valid.', hardening.issues);
  }
  const prisma = requirePrisma();
  const configuration = await getAlgorithmConfiguration(input.configurationId);
  const versionIds =
    input.containerTypeVersionIds && input.containerTypeVersionIds.length
      ? input.containerTypeVersionIds
      : (
          await prisma.containerTypeVersion.findMany({
            where: { isCurrent: true, status: 'ACTIVE' },
          })
        ).map((v) => v.id);
  const typeVersions = await prisma.containerTypeVersion.findMany({
    where: { id: { in: versionIds } },
    include: { containerType: true },
  });
  const snapshotId = `css-${study.studyNumber}-v${study.versionNo}-${Date.now()}`;
  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const snapshot = await tx.containerStudyInputSnapshot.create({
      data: {
        snapshotId,
        studyId: study.id,
        stuffingMethod: study.stuffingMethod,
        region: study.region,
        deliveryAllocationMode: study.deliveryAllocationMode,
        algorithmVersionCode: configuration.algorithmVersion.code,
        configurationId: configuration.id,
        configurationVersion: configuration.configurationVersion,
        containerMasterPinJson: typeVersions.map((v) => ({
          versionId: v.id,
          versionNo: v.versionNo,
          code: v.containerType.code,
          parityLabel: v.parityLabel,
          usableLengthMm: toNumber(v.usableLengthMm),
          internalWidthMm: toNumber(v.internalWidthMm),
          payloadCapacityKg: toNumber(v.payloadCapacityKg),
          dimensionsStatus: v.dimensionsStatus,
        })),
        packingProfilePinJson: input.drums.map((d) => ({
          sourceLineId: d.sourceLineId,
          packingProfileVersionId: d.packingProfileVersionId ?? null,
        })),
        algorithmParameterPinJson: buildPinnedAlgorithmParameters(
          configuration.parameters.map((p) => ({
            name: p.name,
            value: p.value,
            numericValue: toNumber(p.numericValue),
            unit: p.unit,
            scope: p.scope,
            ruleStatus: p.ruleStatus,
          })),
          configuration.status
        ),
        lineageProvenanceJson:
          input.lineageProvenanceJson != null
            ? (input.lineageProvenanceJson as Prisma.InputJsonValue)
            : Prisma.DbNull,
        payloadUsedKg: typeVersions.map((v) => toNumber(v.payloadCapacityKg)).find((n) => n != null) ?? null,
        containerWidthUsedMm:
          typeVersions.map((v) => toNumber(v.internalWidthMm)).find((n) => n != null) ?? null,
        capturedBy: actor.id || actor.email || null,
        drums: {
          create: input.drums.map((d) => ({
            sourceLineId: d.sourceLineId,
            quantity: d.quantity,
            drumCode: d.drumCode ?? null,
            drumMasterId: d.drumMasterId ?? null,
            packingProfileVersionId: d.packingProfileVersionId ?? null,
            packedLengthMm: d.packedLengthMm ?? null,
            packedWidthMm: d.packedWidthMm ?? null,
            packedHeightMm: d.packedHeightMm ?? null,
            grossWeightKg: d.grossWeightKg ?? null,
          })),
        },
        containerPins: {
          create: typeVersions.map((v) => ({
            containerTypeVersionId: v.id,
            code: v.containerType.code,
            parityLabel: v.parityLabel,
            usableLengthMm: v.usableLengthMm,
            internalWidthMm: v.internalWidthMm,
            payloadCapacityKg: v.payloadCapacityKg,
            dimensionsStatus: v.dimensionsStatus,
          })),
        },
      },
      include: { drums: true, containerPins: true },
    });
    await tx.containerStudy.update({
      where: { id: study.id },
      data: { currentSnapshotId: snapshot.id },
    });
    return snapshot;
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_SNAPSHOT_CAPTURED',
    newValue: {
      snapshotId: created.snapshotId,
      configurationVersion: created.configurationVersion,
      algorithmVersionCode: created.algorithmVersionCode,
    },
    message: `Container Study ${study.studyNumber} input snapshot captured`,
  });
  return created;
}

function structuralFromStudy(study: Awaited<ReturnType<typeof loadStudyScoped>>) {
  const snapshot = study.currentSnapshot;
  return {
    shipmentGroupId: study.shipmentGroupId,
    stuffingMethod: study.stuffingMethod,
    algorithmVersionCode: snapshot?.algorithmVersionCode,
    configurationVersion: snapshot?.configurationVersion,
    drums: snapshotDrumInputs(snapshot || { drums: [] }),
    pinnedContainerTypes: (snapshot?.containerPins || []).map((p) => ({
      code: p.code,
      parityLabel: p.parityLabel,
      versionId: p.containerTypeVersionId,
      versionNo: 0,
      usableLengthMm: toNumber(p.usableLengthMm),
      internalWidthMm: toNumber(p.internalWidthMm),
      payloadCapacityKg: toNumber(p.payloadCapacityKg),
      dimensionsStatus: p.dimensionsStatus,
    })),
    hasResult: Boolean(study.currentResultId),
    resultAccountsForAllDrums: accountsForAllDrums(study),
    unallocatedCount: study.currentResult?.unallocated.length ?? 0,
    virtualAllocationCount: study.currentResult?.allocations.filter((a) => a.allocationKind !== 'PHYSICAL').length ?? 0,
  };
}

function accountsForAllDrums(study: Awaited<ReturnType<typeof loadStudyScoped>>): boolean {
  const snapshot = study.currentSnapshot;
  const result = study.currentResult;
  if (!snapshot || !result) return false;
  const expanded = snapshot.drums.reduce((sum, d) => sum + d.quantity, 0);
  const accounted = result.allocations.length + result.unallocated.length;
  return expanded > 0 && accounted === expanded;
}

async function assertSnapshotDrumPlansCurrent(
  study: Awaited<ReturnType<typeof loadStudyScoped>>,
  snapshot: NonNullable<Awaited<ReturnType<typeof loadStudyScoped>>['currentSnapshot']>
) {
  const lineage = parseContainerStudyLineage(snapshot.lineageProvenanceJson);
  if (!lineage) {
    throwIssues('Container Study snapshot is missing drum-plan lineage.', [
      { code: 'MISSING_LINEAGE', message: 'Cannot confirm without authoritative drum-plan lineage.' },
    ]);
  }
  const prisma = requirePrisma();
  const group = await prisma.containerShipmentGroup.findUnique({ where: { id: study.shipmentGroupId } });
  if (!group) {
    throwIssues('Shipment group is missing.', [{ code: 'MISSING_SHIPMENT_GROUP', message: 'Shipment group not found.' }]);
  }
  const inquiryLines = await prisma.commercialInquiryLine.findMany({
    where: { inquiryId: study.inquiryId },
    orderBy: { lineNumber: 'asc' },
    select: { id: true, lineNumber: true, inquiryId: true, v2CurrentDrumPlanId: true },
  });
  const memberLineIds = await loadAuthoritativeMemberLineIds(group, inquiryLines.map((l) => l.id));
  const requirements = await prisma.v2CuttingLengthRequirement.findMany({
    where: { inquiryLineId: { in: inquiryLines.map((l) => l.id) } },
    orderBy: [{ sequenceNo: 'asc' }],
  });
  const requirementPlanIds = requirements.map((r) => r.currentDrumPlanId).filter((id): id is string => Boolean(id));
  const linePlanIds = inquiryLines.map((l) => l.v2CurrentDrumPlanId).filter((id): id is string => Boolean(id));
  const currentIds = [...new Set(requirements.length ? requirementPlanIds : linePlanIds)];
  const currentPlans = currentIds.length
    ? await prisma.v2DrumPlan.findMany({
        where: { id: { in: currentIds } },
        select: { id: true, versionNo: true, lifecycleStatus: true },
      })
    : [];
  const statusById = new Map(currentPlans.map((p) => [p.id, p.lifecycleStatus]));
  const lineById = new Map(inquiryLines.map((l) => [l.id, l]));
  let eligible;
  try {
    eligible = selectEligibleConfirmedDrumPlans({
      deliveryAllocationMode: group.deliveryAllocationMode,
      inquiryId: study.inquiryId,
      shipmentGroupInquiryLineId: group.inquiryLineId,
      memberLineIds,
      lines: inquiryLines.map((l) => ({
        lineId: l.id,
        lineNumber: l.lineNumber,
        inquiryId: l.inquiryId,
        currentDrumPlanId: l.v2CurrentDrumPlanId,
        currentDrumPlanStatus: l.v2CurrentDrumPlanId ? statusById.get(l.v2CurrentDrumPlanId) ?? null : null,
      })),
      requirements: requirements.map((r) => {
        const line = lineById.get(r.inquiryLineId)!;
        return {
          lineId: r.inquiryLineId,
          lineNumber: line.lineNumber,
          inquiryId: line.inquiryId,
          requirementId: r.id,
          sequenceNo: r.sequenceNo,
          currentDrumPlanId: r.currentDrumPlanId,
          currentDrumPlanStatus: r.currentDrumPlanId ? statusById.get(r.currentDrumPlanId) ?? null : null,
        };
      }),
    });
  } catch (err) {
    throwIssues('Current CONFIRMED drum plans no longer match the snapshot lineage.', [
      {
        code: 'STALE_DRUM_PLAN',
        message: err instanceof Error ? err.message : 'Eligible CONFIRMED drum plans changed after snapshot capture.',
      },
    ]);
  }
  const livePlans = await prisma.v2DrumPlan.findMany({
    where: { id: { in: eligible.currentDrumPlanIds } },
    select: { id: true, versionNo: true },
  });
  const drift = evaluateDrumPlanDrift({
    snapshotAuthoritativeDrumPlanIds: lineage.authoritativeDrumPlanIds,
    snapshotDrumPlanVersions: lineage.drumPlanVersions,
    liveEligibleDrumPlanIds: eligible.currentDrumPlanIds,
    liveDrumPlanVersions: livePlans.map((p) => ({ drumPlanId: p.id, versionNo: p.versionNo })),
  });
  if (drift.stale) {
    throwIssues('Current CONFIRMED drum plans no longer match the snapshot lineage.', drift.issues);
  }
}

export async function validateContainerStudy(studyId: string, actor: RequestActor) {
  const study = await loadStudyScoped(studyId, actor);
  if (isConfirmedImmutable(study.status as ContainerStudyLifecycleStatus) && study.status === 'CONFIRMED') {
    throw issue('CONFLICT', 'CONFIRMED studies are immutable.');
  }
  const prisma = requirePrisma();
  const snapshot = study.currentSnapshot;
  if (!snapshot) {
    throw issue('VALIDATION_FAILED', 'Capture an input snapshot before VALIDATED.', {
      issues: [{ code: 'MISSING_SNAPSHOT', message: 'No current snapshot.' }],
    });
  }
  const pinnedConfigurationStatus = readPinnedConfigurationStatus(snapshot.algorithmParameterPinJson);
  if (!pinnedConfigurationStatus) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerStudy',
      entityId: study.id,
      action: 'CONTAINER_STUDY_VALIDATION_FAILED',
      newValue: { snapshotId: snapshot.snapshotId, integrityStatus: 'FAIL', issueCodes: ['CONFIGURATION_ERROR'] },
      message: `Container Study ${study.studyNumber} validation failed: missing pinned configuration status`,
    });
    throw issue('VALIDATION_FAILED', 'Snapshot is missing pinned configuration status.', {
      issues: [{ code: 'CONFIGURATION_ERROR', message: 'Re-capture snapshot before VALIDATED.' }],
    });
  }
  const liveConfiguration = await getAlgorithmConfiguration(snapshot.configurationId);
  const structural = evaluateContainerStudyStructure({
    ...structuralFromStudy(study),
    configurationStatus: pinnedConfigurationStatus,
  });
  const hardening = evaluateSnapshotInputHardening({
    drums: snapshotDrumInputs(snapshot),
    lineageProvenanceJson: snapshot.lineageProvenanceJson,
    requireLineage: true,
  });
  const issues = [...structural.issues, ...hardening.issues];
  if (issues.length > 0) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerStudy',
      entityId: study.id,
      action: 'CONTAINER_STUDY_VALIDATION_FAILED',
      newValue: {
        snapshotId: snapshot.snapshotId,
        configurationId: snapshot.configurationId,
        configurationVersion: snapshot.configurationVersion,
        integrityStatus: 'FAIL',
        issueCodes: issues.map((i) => i.code),
      },
      message: `Container Study ${study.studyNumber} validation failed`,
    });
    throwIssues('Container Study is not ready for VALIDATED.', issues);
  }
  assertContainerStudyTransition(study.status as ContainerStudyLifecycleStatus, 'VALIDATED');
  const updated = await prisma.containerStudy.update({
    where: { id: study.id },
    data: { status: 'VALIDATED' },
    include: studyInclude,
  });
  const warnings = livePinWarning(pinnedConfigurationStatus, liveConfiguration.status);
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_VALIDATED',
    newValue: {
      snapshotId: snapshot.snapshotId,
      configurationId: snapshot.configurationId,
      configurationVersion: snapshot.configurationVersion,
      algorithmVersionCode: snapshot.algorithmVersionCode,
      pinnedConfigurationStatus,
      liveConfigurationStatus: liveConfiguration.status,
      integrityStatus: 'PASS',
      warnings,
    },
    message: `Container Study ${study.studyNumber} validated`,
  });
  return { ...updated, warnings };
}

export async function confirmContainerStudy(studyId: string, actor: RequestActor) {
  const study = await loadStudyScoped(studyId, actor);
  if (study.status === 'CONFIRMED') return study;
  const fail = async (message: string, issues: Array<{ code: string; field?: string; message: string }>) => {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerStudy',
      entityId: study.id,
      action: 'CONTAINER_STUDY_CONFIRM_FAILED',
      newValue: {
        snapshotId: study.currentSnapshot?.snapshotId,
        resultId: study.currentResult?.resultId,
        integrityStatus: 'FAIL',
        issueCodes: issues.map((i) => i.code),
      },
      message: `Container Study ${study.studyNumber} confirm failed`,
    });
    throwIssues(message, issues);
  };
  assertContainerStudyTransition(study.status as ContainerStudyLifecycleStatus, 'CONFIRMED');
  const snapshot = study.currentSnapshot;
  if (!snapshot) {
    await fail('Cannot CONFIRM without an input snapshot.', [
      { code: 'MISSING_SNAPSHOT', message: 'No current snapshot.' },
    ]);
    return study;
  }
  const result = study.currentResult;
  if (!result || !study.currentResultId) {
    await fail('Cannot CONFIRM without an immutable calculation result.', [
      { code: 'CALCULATION_RESULT_REQUIRED', field: 'currentResultId', message: 'CONFIRMED requires an immutable calculation result for the current input snapshot.' },
    ]);
    return study;
  }
  if (result.inputSnapshotId !== snapshot.id) {
    await fail('Cannot CONFIRM a result that does not belong to the current snapshot.', [
      { code: 'RESULT_SNAPSHOT_MISMATCH', field: 'inputSnapshotId', message: 'Calculation result does not belong to the current input snapshot.' },
    ]);
  }
  const pinnedConfigurationStatus = readPinnedConfigurationStatus(snapshot.algorithmParameterPinJson);
  if (!pinnedConfigurationStatus) {
    await fail('Snapshot is missing pinned configuration status.', [
      { code: 'CONFIGURATION_ERROR', message: 'Re-capture snapshot before CONFIRM.' },
    ]);
    return study;
  }
  const liveConfiguration = await getAlgorithmConfiguration(snapshot.configurationId);
  const readiness = evaluateConfirmReadiness({
    ...structuralFromStudy(study),
    configurationStatus: pinnedConfigurationStatus,
  });
  const hardening = evaluateSnapshotInputHardening({
    drums: snapshotDrumInputs(snapshot),
    lineageProvenanceJson: snapshot.lineageProvenanceJson,
    requireLineage: true,
  });
  const integrity = evaluateContainerStudyResultIntegrity({
    snapshotRecordId: snapshot.id,
    drums: snapshotDrumInputs(snapshot),
    lineageProvenanceJson: snapshot.lineageProvenanceJson,
    result: {
      inputSnapshotId: result.inputSnapshotId,
      allocations: result.allocations,
      unallocated: result.unallocated,
    },
  });
  const issues = [...readiness.issues, ...hardening.issues, ...integrity.issues];
  if (issues.length > 0) {
    await fail('Container Study cannot be CONFIRMED.', issues);
  }
  try {
    await assertSnapshotDrumPlansCurrent(study, snapshot);
  } catch (err) {
    if (err && typeof err === 'object' && 'details' in err) {
      const details = (err as { details?: { issues?: Array<{ code: string; message: string }> } }).details;
      await fail(
        err instanceof Error ? err.message : 'Current CONFIRMED drum plans no longer match the snapshot lineage.',
        details?.issues || [{ code: 'STALE_DRUM_PLAN', message: 'Current CONFIRMED drum plans no longer match the snapshot lineage.' }]
      );
    }
    throw err;
  }
  const prisma = requirePrisma();
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.containerShipmentGroup.update({
      where: { id: study.shipmentGroupId },
      data: { status: 'LOCKED' },
    });
    return tx.containerStudy.update({
      where: { id: study.id },
      data: { status: 'CONFIRMED' },
      include: studyInclude,
    });
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_CONFIRMED',
    newValue: {
      snapshotId: snapshot.snapshotId,
      resultId: result.resultId,
      allocatedCount: result.allocations.length,
      unallocatedCount: result.unallocated.length,
      containerCount: result.containers.length,
      algorithmVersionCode: result.algorithmVersionCode,
      configurationId: snapshot.configurationId,
      configurationVersion: snapshot.configurationVersion,
      integrityStatus: 'PASS',
      liveConfigurationStatus: liveConfiguration.status,
      pinnedConfigurationStatus,
    },
    message: `Container Study ${study.studyNumber} confirmed`,
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerShipmentGroup',
    entityId: study.shipmentGroupId,
    action: 'SHIPMENT_GROUP_LOCKED',
    newValue: { studyId: study.id, resultId: result.resultId },
    message: `Shipment group locked after Container Study ${study.studyNumber} confirmation`,
  });
  return updated;
}

export async function supersedeContainerStudy(studyId: string, actor: RequestActor) {
  const study = await loadStudyScoped(studyId, actor);
  assertContainerStudyTransition(study.status as ContainerStudyLifecycleStatus, 'SUPERSEDED');
  const prisma = requirePrisma();
  const successor = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.containerStudy.update({
      where: { id: study.id },
      data: { status: 'SUPERSEDED' },
    });
    return tx.containerStudy.create({
      data: {
        studyNumber: study.studyNumber,
        versionNo: study.versionNo + 1,
        inquiryId: study.inquiryId,
        shipmentGroupId: study.shipmentGroupId,
        customerId: study.customerId,
        customerMasterId: study.customerMasterId,
        stuffingMethod: study.stuffingMethod,
        region: study.region,
        deliveryAllocationMode: study.deliveryAllocationMode,
        supersedesStudyId: study.id,
        createdBy: actor.id || actor.email || null,
      },
      include: studyInclude,
    });
  });
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_SUPERSEDED',
    newValue: { successorId: successor.id, versionNo: successor.versionNo },
    message: `Container Study ${study.studyNumber} superseded by v${successor.versionNo}`,
  });
  return successor;
}

export async function calculateContainerStudy(studyId: string, actor: RequestActor) {
  const study = await loadStudyScoped(studyId, actor);
  if (isConfirmedImmutable(study.status as ContainerStudyLifecycleStatus)) {
    throw issue('CONFLICT', 'Cannot recalculate a CONFIRMED or SUPERSEDED Container Study.');
  }
  const snapshot = study.currentSnapshot;
  if (!snapshot) {
    throw issue('VALIDATION_FAILED', 'Capture an input snapshot before calculation.', {
      issues: [{ code: 'MISSING_SNAPSHOT', message: 'No current snapshot.' }],
    });
  }
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_CALCULATION_REQUESTED',
    newValue: {
      snapshotId: snapshot.snapshotId,
      stuffingMethod: snapshot.stuffingMethod,
      algorithmVersionCode: snapshot.algorithmVersionCode,
    },
    message: `Container Study ${study.studyNumber} calculation requested`,
  });
  const pinnedConfigurationStatus = readPinnedConfigurationStatus(snapshot.algorithmParameterPinJson);
  if (!pinnedConfigurationStatus) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerStudy',
      entityId: study.id,
      action: 'CONTAINER_STUDY_CALCULATION_FAILED',
      newValue: { code: 'CONFIGURATION_ERROR', snapshotId: snapshot.snapshotId },
      message: `Container Study ${study.studyNumber} calculation failed: missing pinned configuration status`,
    });
    throw issue('VALIDATION_FAILED', 'Snapshot is missing pinned configuration status.', {
      issues: [{ code: 'CONFIGURATION_ERROR', message: 'Re-capture snapshot before calculation.' }],
    });
  }
  const liveConfiguration = await getAlgorithmConfiguration(snapshot.configurationId);
  const warnings = livePinWarning(pinnedConfigurationStatus, liveConfiguration.status);
  const structural = evaluateContainerStudyStructure({
    ...structuralFromStudy(study),
    configurationStatus: pinnedConfigurationStatus,
    hasResult: false,
  });
  const hardening = evaluateSnapshotInputHardening({
    drums: snapshotDrumInputs(snapshot),
    lineageProvenanceJson: snapshot.lineageProvenanceJson,
    requireLineage: true,
  });
  const eligibilityIssues = [...structural.issues, ...hardening.issues];
  if (eligibilityIssues.length > 0) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerStudy',
      entityId: study.id,
      action: 'CONTAINER_STUDY_CALCULATION_FAILED',
      newValue: {
        issues: eligibilityIssues.map((i) => i.code),
        snapshotId: snapshot.snapshotId,
        integrityStatus: 'FAIL',
        configurationId: snapshot.configurationId,
        configurationVersion: snapshot.configurationVersion,
      },
      message: `Container Study ${study.studyNumber} calculation failed eligibility`,
    });
    throw issue('VALIDATION_FAILED', 'Container Study is not eligible for calculation.', {
      issues: eligibilityIssues,
    });
  }

  const engineInput = mapSnapshotToCalculationInput({
    snapshotId: snapshot.snapshotId,
    stuffingMethod: snapshot.stuffingMethod as 'Rolling' | 'Forklifting',
    region: snapshot.region as 'Europe' | 'Africa',
    algorithmVersionCode: snapshot.algorithmVersionCode,
    configurationVersion: snapshot.configurationVersion,
    containerMasterPinJson: snapshot.containerMasterPinJson,
    algorithmParameterPinJson: snapshot.algorithmParameterPinJson,
    packingProfilePinJson: snapshot.packingProfilePinJson,
    drums: snapshot.drums.map((d) => ({
      sourceLineId: d.sourceLineId,
      quantity: d.quantity,
      packedLengthMm: toNumber(d.packedLengthMm),
      packedWidthMm: toNumber(d.packedWidthMm),
      grossWeightKg: toNumber(d.grossWeightKg),
    })),
    containerPins: snapshot.containerPins.map((p) => ({
      containerTypeVersionId: p.containerTypeVersionId,
      code: p.code,
      parityLabel: p.parityLabel,
      usableLengthMm: p.usableLengthMm,
      internalWidthMm: p.internalWidthMm,
      payloadCapacityKg: p.payloadCapacityKg,
      dimensionsStatus: p.dimensionsStatus,
    })),
  });

  const output = runContainerStudyEngine(engineInput);
  if (!output.ok) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerStudy',
      entityId: study.id,
      action: 'CONTAINER_STUDY_CALCULATION_FAILED',
      newValue: {
        snapshotId: snapshot.snapshotId,
        errors: output.errors,
      },
      message: `Container Study ${study.studyNumber} calculation failed`,
    });
    throw issue('VALIDATION_FAILED', output.errors[0]?.message ?? 'Calculation failed.', {
      issues: output.errors.map((e) => ({ code: e.code, message: e.message })),
    });
  }

  const integrity = evaluateContainerStudyResultIntegrity({
    snapshotRecordId: snapshot.id,
    drums: snapshotDrumInputs(snapshot),
    lineageProvenanceJson: snapshot.lineageProvenanceJson,
    result: {
      inputSnapshotId: snapshot.id,
      allocations: output.allocations,
      unallocated: output.unallocated,
    },
  });
  if (!integrity.ok) {
    await appendServerAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'ContainerStudy',
      entityId: study.id,
      action: 'CONTAINER_STUDY_CALCULATION_FAILED',
      newValue: {
        snapshotId: snapshot.snapshotId,
        integrityStatus: 'FAIL',
        issueCodes: integrity.issues.map((i) => i.code),
        allocatedCount: output.summary.allocatedCount,
        unallocatedCount: output.summary.unallocatedCount,
      },
      message: `Container Study ${study.studyNumber} calculation failed integrity`,
    });
    throwIssues('Container Study calculation result failed integrity checks.', integrity.issues);
  }

  const unallocatedExplanations = explainUnallocatedDrums({
    drums: snapshotDrumInputs(snapshot),
    lineageProvenanceJson: snapshot.lineageProvenanceJson,
    unallocated: output.unallocated,
  });

  const preferenceCode = study.shipmentGroup.containerTypePreferenceCode ?? null;
  const summaryWithPreference = {
    ...output.summary,
    decisionTrace: output.decisionTrace,
    containerTypePreference: {
      requestedCode: preferenceCode,
      treatedAsTechnicalAuthority: false,
      selectedParityLabels: output.containers.map((c) => c.parityLabel),
      selectedTypeCodes: output.containers.map((c) => c.typeCode),
    },
  };

  const prisma = requirePrisma();
  const priorResultCount = await prisma.containerStudyResult.count({ where: { studyId: study.id } });
  const resultId = `csr-${study.studyNumber}-v${study.versionNo}-r${priorResultCount + 1}`;
  const persisted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.containerStudyResult.create({
      data: {
        resultId,
        studyId: study.id,
        studyVersionNo: study.versionNo,
        inputSnapshotId: snapshot.id,
        algorithmVersionCode: output.algorithmVersionCode,
        configurationVersion: output.configurationVersion,
        containerMasterPinJson: output.containerMasterPinJson as Prisma.InputJsonValue,
        packingProfilePinJson: output.packingProfilePinJson as Prisma.InputJsonValue,
        summaryJson: summaryWithPreference as Prisma.InputJsonValue,
        warningsJson: output.warnings as Prisma.InputJsonValue,
        errorsJson: output.errors as Prisma.InputJsonValue,
        containers: {
          create: output.containers.map((c) => ({
            containerIndex: c.containerIndex,
            typeCode: c.typeCode,
            parityLabel: c.parityLabel,
            usableLengthMm: c.usableLengthMm,
            loadedWeightKg: c.loadedWeightKg,
            remainingWeightKg: c.remainingWeightKg,
            remainingLengthMm: c.remainingLengthMm,
            utilizationWeightPct: c.utilizationWeightPct,
            utilizationLengthPct: c.utilizationLengthPct,
            utilizationWidthPct: c.utilizationWidthPct,
            drumCountQ3: c.drumCountQ3,
            secondLayerEnabled: c.secondLayerEnabled,
          })),
        },
      },
      include: { containers: true },
    });

    const containerIdByIndex = new Map(result.containers.map((c) => [c.containerIndex, c.id]));

    await tx.containerStudyResultAllocation.createMany({
      data: output.allocations.map((a) => ({
        resultId: result.id,
        containerId: containerIdByIndex.get(a.containerIndex)!,
        physicalDrumKey: a.physicalDrumKey,
        sourceLineId: a.sourceLineId,
        instanceIndex: a.instanceIndex,
        allocationKind: a.allocationKind,
        acceptReason: a.acceptReason,
      })),
    });

    await tx.containerStudyResultUnallocated.createMany({
      data: output.unallocated.map((u) => ({
        resultId: result.id,
        physicalDrumKey: u.physicalDrumKey,
        sourceLineId: u.sourceLineId,
        instanceIndex: u.instanceIndex,
        reasonCode: u.reasonCode,
        detail: u.detail,
        traceRef: u.traceRef,
      })),
    });

    await tx.containerStudy.update({
      where: { id: study.id },
      data: { currentResultId: result.id },
    });

    return tx.containerStudyResult.findUnique({
      where: { id: result.id },
      include: { containers: true, allocations: true, unallocated: true },
    });
  });

  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_CALCULATED',
    newValue: {
      resultId: persisted?.resultId,
      snapshotId: snapshot.snapshotId,
      algorithmVersionCode: output.algorithmVersionCode,
      configurationId: snapshot.configurationId,
      configurationVersion: snapshot.configurationVersion,
      containerCount: output.summary.containerCount,
      allocatedCount: output.summary.allocatedCount,
      unallocatedCount: output.summary.unallocatedCount,
      integrityStatus: 'PASS',
      decisionTraceCount: output.decisionTrace.length,
    },
    message: `Container Study ${study.studyNumber} result ${persisted?.resultId} created`,
  });

  const updated = await prisma.containerStudy.findUnique({
    where: { id: study.id },
    include: studyInclude,
  });
  return {
    study: updated,
    result: persisted,
    calculation: output,
    unallocatedExplanations,
    warnings,
    integrity: { status: 'PASS' as const, issues: [] as typeof integrity.issues },
  };
}

export async function persistContainerStudyEngineOutputIfIntegrityPasses(
  studyId: string,
  actor: RequestActor,
  output: ContainerStudyCalculationOutput
) {
  const study = await loadStudyScoped(studyId, actor);
  if (isConfirmedImmutable(study.status as ContainerStudyLifecycleStatus)) {
    throw issue('CONFLICT', 'Cannot persist a result on a CONFIRMED or SUPERSEDED Container Study.');
  }
  const snapshot = study.currentSnapshot;
  if (!snapshot) {
    throw issue('VALIDATION_FAILED', 'Capture an input snapshot before calculation.', {
      issues: [{ code: 'MISSING_SNAPSHOT', message: 'No current snapshot.' }],
    });
  }
  const priorResultId = study.currentResultId;
  const integrity = evaluateContainerStudyResultIntegrity({
    snapshotRecordId: snapshot.id,
    drums: snapshotDrumInputs(snapshot),
    lineageProvenanceJson: snapshot.lineageProvenanceJson,
    result: {
      inputSnapshotId: snapshot.id,
      allocations: output.allocations,
      unallocated: output.unallocated,
    },
  });
  if (!integrity.ok) {
    throwIssues('Container Study calculation result failed integrity checks.', integrity.issues);
  }
  const prisma = requirePrisma();
  const priorResultCount = await prisma.containerStudyResult.count({ where: { studyId: study.id } });
  const resultId = `csr-${study.studyNumber}-v${study.versionNo}-r${priorResultCount + 1}`;
  const persisted = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.containerStudyResult.create({
      data: {
        resultId,
        studyId: study.id,
        studyVersionNo: study.versionNo,
        inputSnapshotId: snapshot.id,
        algorithmVersionCode: output.algorithmVersionCode,
        configurationVersion: output.configurationVersion,
        containerMasterPinJson: output.containerMasterPinJson as Prisma.InputJsonValue,
        packingProfilePinJson: output.packingProfilePinJson as Prisma.InputJsonValue,
        summaryJson: output.summary as Prisma.InputJsonValue,
        warningsJson: output.warnings as Prisma.InputJsonValue,
        errorsJson: output.errors as Prisma.InputJsonValue,
        containers: {
          create: output.containers.map((c) => ({
            containerIndex: c.containerIndex,
            typeCode: c.typeCode,
            parityLabel: c.parityLabel,
            usableLengthMm: c.usableLengthMm,
            loadedWeightKg: c.loadedWeightKg,
            remainingWeightKg: c.remainingWeightKg,
            remainingLengthMm: c.remainingLengthMm,
            utilizationWeightPct: c.utilizationWeightPct,
            utilizationLengthPct: c.utilizationLengthPct,
            utilizationWidthPct: c.utilizationWidthPct,
            drumCountQ3: c.drumCountQ3,
            secondLayerEnabled: c.secondLayerEnabled,
          })),
        },
      },
      include: { containers: true },
    });
    const containerIdByIndex = new Map(result.containers.map((c) => [c.containerIndex, c.id]));
    await tx.containerStudyResultAllocation.createMany({
      data: output.allocations.map((a) => ({
        resultId: result.id,
        containerId: containerIdByIndex.get(a.containerIndex)!,
        physicalDrumKey: a.physicalDrumKey,
        sourceLineId: a.sourceLineId,
        instanceIndex: a.instanceIndex,
        allocationKind: a.allocationKind,
        acceptReason: a.acceptReason,
      })),
    });
    await tx.containerStudyResultUnallocated.createMany({
      data: output.unallocated.map((u) => ({
        resultId: result.id,
        physicalDrumKey: u.physicalDrumKey,
        sourceLineId: u.sourceLineId,
        instanceIndex: u.instanceIndex,
        reasonCode: u.reasonCode,
        detail: u.detail,
        traceRef: u.traceRef,
      })),
    });
    await tx.containerStudy.update({
      where: { id: study.id },
      data: { currentResultId: result.id },
    });
    return tx.containerStudyResult.findUnique({
      where: { id: result.id },
      include: { containers: true, allocations: true, unallocated: true },
    });
  });
  return { persisted, priorResultId, snapshotId: snapshot.id };
}

export async function mutateConfirmedSnapshot(studyId: string, actor: RequestActor): Promise<never> {
  const study = await loadStudyScoped(studyId, actor);
  if (isConfirmedImmutable(study.status as ContainerStudyLifecycleStatus)) {
    throw issue('CONFLICT', 'Cannot modify a CONFIRMED or SUPERSEDED Container Study snapshot.');
  }
  throw issue('VALIDATION_FAILED', 'No mutable snapshot operation requested.');
}
