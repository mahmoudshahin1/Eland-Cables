import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { issue } from '../platform/errors/domainError';
import { assertCanAccessInquiryOwnership } from './rbac';
import {
  buildSnapshotDrumsFromDrumPlan,
  flattenLineageFromDrumPlans,
  type ContainerStudyDrumPlanPin,
  type DrumPlanLineForSnapshot,
  type ResolvedDrumMasterPin,
  type ResolvedPackingPin,
  type SnapshotDrumFromDrumPlan,
} from '../domain/containerStudyDrumPlanSnapshot';
import { captureInputSnapshot, getContainerStudy, loadAuthoritativeMemberLineIds, loadStudyScoped } from './containerStudyRepository';
import { assertContainerPreferenceIsNotAuthority } from '../domain/containerStudyShipmentGroupRules';
import { selectEligibleConfirmedDrumPlans } from '../domain/containerStudyEntireInquiryAggregation';
import { inquiryDrumScheduleHasPhysicalPopulation, inquiryDrumScheduleIsConfirmed, parseInquiryDrumSchedule } from '../domain/inquiryDrumSchedule';
import { versionAConfirmedScheduleId } from '../domain/versionADrumScheduleConfirm';
import { cableWeightKgFromCuttingLength } from '../services/drumMasterService';
import { grossLoadedDrumWeightKg } from '../domain/drumCapacityCalculator';
import {
  CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE,
  CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE,
  CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE,
} from '../domain/inquiryContainerStudyPresentation';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export async function getShipmentGroup(groupId: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const group = await prisma.containerShipmentGroup.findUnique({
    where: { id: groupId },
    include: { inquiry: true, memberLines: { orderBy: { createdAt: 'asc' } } },
  });
  if (!group) throw issue('NOT_FOUND', `Shipment group ${groupId} not found.`);
  assertCanAccessInquiryOwnership(actor, group.inquiry.customerId, group.inquiry.customerMasterId);
  return group;
}

async function resolvePackingForDrum(
  drumCode: string,
  drumMasterId: string | null
): Promise<ResolvedPackingPin | null> {
  const prisma = requirePrisma();
  const profile = await prisma.drumPackingProfile.findFirst({
    where: drumMasterId
      ? { drumMasterId }
      : { drumCode: { equals: drumCode, mode: 'insensitive' } },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
  });
  const ver = profile?.versions[0];
  if (!ver) return null;
  return {
    packingProfileVersionId: ver.id,
    packedLengthMm: ver.packedLengthMm != null ? Number(ver.packedLengthMm) : null,
    packedWidthMm: ver.packedWidthMm != null ? Number(ver.packedWidthMm) : null,
    packedHeightMm: ver.packedHeightMm != null ? Number(ver.packedHeightMm) : null,
  };
}

async function resolveMasterPin(drumMasterId: string | null, drumCode: string): Promise<ResolvedDrumMasterPin | null> {
  const prisma = requirePrisma();
  const row = drumMasterId
    ? await prisma.drumMaster.findUnique({ where: { id: drumMasterId } })
    : await prisma.drumMaster.findFirst({
        where: { drumCode: { equals: drumCode, mode: 'insensitive' } },
      });
  if (!row) return null;
  return {
    drumMasterId: row.id,
    drumCode: row.drumCode,
    flangeMm: Number(row.flange),
    barrelMm: Number(row.barrel),
    outerWidthMm: Number(row.outerWidth),
    innerWidthMm: Number(row.innerWidth),
    emptyDrumNetWeightKg: row.emptyDrumNetWeightKg != null ? Number(row.emptyDrumNetWeightKg) : null,
  };
}

export async function captureInputSnapshotFromConfirmedDrumPlan(
  studyId: string,
  input: {
    inquiryLineId?: string;
    drumPlanId?: string;
    configurationId: string;
    containerTypeVersionIds?: string[];
    drums?: unknown;
    customerId?: string;
    technicallySuitable?: unknown;
    containerSuitable?: unknown;
    suitability?: unknown;
  },
  actor: RequestActor
) {
  if (input.drums != null) {
    throw issue(
      'VALIDATION_FAILED',
      'Client-supplied drum geometry is not accepted. Snapshot drums are resolved from the CONFIRMED drum plan.'
    );
  }
  if (!input.configurationId) {
    throw issue('VALIDATION_FAILED', 'configurationId is required.');
  }
  assertContainerPreferenceIsNotAuthority(input);
  const study = await loadStudyScoped(studyId, actor);
  if (study.currentSnapshotId) {
    throw issue('CONFLICT', 'Container Study already has an authoritative input snapshot.');
  }
  if (study.status !== 'DRAFT' && study.status !== 'VALIDATED') {
    throw issue('VALIDATION_FAILED', 'Input snapshot may only be captured on DRAFT or VALIDATED studies.');
  }
  const prisma = requirePrisma();
  const group = await prisma.containerShipmentGroup.findUnique({ where: { id: study.shipmentGroupId } });
  if (!group || group.inquiryId !== study.inquiryId) {
    throw issue('VALIDATION_FAILED', 'Shipment group does not belong to this inquiry.');
  }
  if (group.status === 'SUPERSEDED') {
    throw issue('CONFLICT', 'Cannot capture an input snapshot on a SUPERSEDED shipment group.');
  }
  if (input.customerId && input.customerId !== study.customerId && input.customerId !== study.customerMasterId) {
    throw issue('VALIDATION_FAILED', 'customerId cannot override inquiry customer scope.');
  }

  const inquiryLines = await prisma.commercialInquiryLine.findMany({
    where: { inquiryId: study.inquiryId },
    orderBy: { lineNumber: 'asc' },
    select: { id: true, lineNumber: true, inquiryId: true, v2CurrentDrumPlanId: true, materialNumber: true },
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
        select: { id: true, planId: true, lifecycleStatus: true },
      })
    : [];
  const statusById = new Map(currentPlans.map((p) => [p.id, p.lifecycleStatus]));
  const clientDrumPlanId = input.drumPlanId
    ? currentPlans.find((p) => p.id === input.drumPlanId || p.planId === input.drumPlanId)?.id ?? input.drumPlanId
    : null;

  const lineById = new Map(inquiryLines.map((l) => [l.id, l]));
  const memberRequirements = requirements.filter((r) => memberLineIds.includes(r.inquiryLineId));
  const readinessRows =
    memberRequirements.length > 0
      ? memberRequirements.map((r) => ({
          planId: r.currentDrumPlanId,
          status: r.currentDrumPlanId ? statusById.get(r.currentDrumPlanId) ?? null : null,
        }))
      : inquiryLines
          .filter((l) => memberLineIds.includes(l.id))
          .map((l) => ({
            planId: l.v2CurrentDrumPlanId,
            status: l.v2CurrentDrumPlanId ? statusById.get(l.v2CurrentDrumPlanId) ?? null : null,
          }));
  if (readinessRows.some((row) => !row.planId)) {
    throw issue('VALIDATION_FAILED', CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE, {
      issueCode: 'DRUM_PLAN_MISSING',
    });
  }
  if (readinessRows.some((row) => row.status !== 'CONFIRMED')) {
    throw issue('VALIDATION_FAILED', CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE, {
      issueCode: 'DRUM_PLAN_NOT_CONFIRMED',
    });
  }
  const eligible = selectEligibleConfirmedDrumPlans({
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
    clientDrumPlanId,
    clientInquiryLineId: input.inquiryLineId ?? null,
  });

  const drumPlans = await prisma.v2DrumPlan.findMany({
    where: { id: { in: eligible.currentDrumPlanIds } },
    include: {
      lines: { orderBy: { lineNo: 'asc' } },
      cuttingLengthPlan: true,
      inquiryLine: { include: { inquiry: true } },
    },
  });
  const planById = new Map(drumPlans.map((p) => [p.id, p]));
  const orderedPlans = eligible.currentDrumPlanIds.map((id) => planById.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (orderedPlans.length !== eligible.currentDrumPlanIds.length) {
    throw issue('VALIDATION_FAILED', 'One or more eligible CONFIRMED drum plans could not be loaded.');
  }

  const materialByLine = new Map(inquiryLines.map((l) => [l.id, l.materialNumber ?? null]));
  const drumPlanPins: ContainerStudyDrumPlanPin[] = [];
  const resolvedDrums: SnapshotDrumFromDrumPlan[] = [];
  const missing: string[] = [];

  for (const drumPlan of orderedPlans) {
    if (drumPlan.inquiryLine.inquiryId !== study.inquiryId) {
      throw issue('VALIDATION_FAILED', 'Drum plan does not belong to this inquiry.');
    }
    if (drumPlan.lifecycleStatus !== 'CONFIRMED') {
      throw issue('VALIDATION_FAILED', `Drum plan must be CONFIRMED (current: ${drumPlan.lifecycleStatus}).`);
    }
    const resolvedLineId = drumPlan.inquiryLineId;
    if (!drumPlan.cuttingLengthPlan) {
      throw issue('VALIDATION_FAILED', 'Drum plan is missing its cutting length plan lineage.');
    }
    if (drumPlan.cuttingLengthPlan.configurationSnapshotId !== drumPlan.configurationSnapshotId) {
      throw issue('VALIDATION_FAILED', 'Cutting plan configuration snapshot does not match drum plan lineage.');
    }
    if (drumPlan.cuttingLengthPlan.inquiryLineId !== resolvedLineId) {
      throw issue('VALIDATION_FAILED', 'Cutting plan does not belong to the drum plan inquiry line.');
    }
    const configSnapshot = await prisma.v2ConfigurationSnapshot.findUnique({
      where: { id: drumPlan.configurationSnapshotId },
    });
    if (!configSnapshot || configSnapshot.inquiryLineId !== resolvedLineId) {
      throw issue('VALIDATION_FAILED', 'Configuration snapshot does not belong to the drum plan inquiry line.');
    }

    const planLines: DrumPlanLineForSnapshot[] = drumPlan.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      drumCode: l.drumCode,
      drumMasterId: l.drumMasterId,
      numberOfDrums: l.numberOfDrums,
      cuttingLengthM: Number(l.cuttingLengthM),
      plannedCableLengthM: Number(l.plannedCableLengthM),
      grossLoadedDrumWeightKg: l.grossLoadedDrumWeightKg != null ? Number(l.grossLoadedDrumWeightKg) : null,
      engineering: l.engineering,
    }));

    const pin: ContainerStudyDrumPlanPin = {
      inquiryLineId: resolvedLineId,
      cableMaterialNumber: materialByLine.get(resolvedLineId) ?? configSnapshot.cableMaterialNumber,
      configurationSnapshotId: configSnapshot.id,
      configurationSnapshotVersionNo: configSnapshot.versionNo,
      configurationSnapshotIdString: configSnapshot.snapshotId,
      cuttingLengthRequirementId:
        drumPlan.cuttingLengthRequirementId ||
        drumPlan.cuttingLengthPlan.cuttingLengthRequirementId ||
        '',
      cuttingLengthPlanId: drumPlan.cuttingLengthPlanId,
      cuttingLengthPlanVersionNo: drumPlan.cuttingLengthPlanVersionNo,
      cuttingLengthPlanIdString: drumPlan.cuttingLengthPlanIdString,
      requestedDrumCount: drumPlan.cuttingLengthPlan.requestedDrumCount,
      physicalDrumCount: planLines.reduce((n, l) => n + l.numberOfDrums, 0),
      toleranceMode: drumPlan.cuttingLengthPlan.toleranceMode,
      tolerancePercent: Number(drumPlan.cuttingLengthPlan.tolerancePercent),
      positiveTolerancePercent: Number(drumPlan.cuttingLengthPlan.positiveTolerancePercent),
      negativeTolerancePercent: Number(drumPlan.cuttingLengthPlan.negativeTolerancePercent),
      drumPlanId: drumPlan.id,
      drumPlanVersionNo: drumPlan.versionNo,
      drumPlanIdString: drumPlan.planId,
      drumLinePins: [],
    };
    if (!pin.cuttingLengthRequirementId) {
      throw issue('VALIDATION_FAILED', 'Drum plan is missing cutting-length requirement lineage.');
    }

    for (const line of planLines) {
      const master = await resolveMasterPin(line.drumMasterId, line.drumCode);
      const packing = await resolvePackingForDrum(line.drumCode, line.drumMasterId);
      pin.drumLinePins.push({
        v2DrumPlanLineId: line.id,
        lineNo: line.lineNo,
        numberOfDrums: line.numberOfDrums,
        cuttingLengthM: line.cuttingLengthM,
        plannedCableLengthM: line.plannedCableLengthM,
        inquiryId: study.inquiryId,
        inquiryLineId: resolvedLineId,
        cuttingLengthRequirementId: pin.cuttingLengthRequirementId,
        cuttingLengthPlanId: drumPlan.cuttingLengthPlanId,
        drumPlanId: drumPlan.id,
        cableMaterialNumber: pin.cableMaterialNumber,
        drumMasterPin: master,
        packingPin: packing,
        engineering: line.engineering,
      });
      const built = buildSnapshotDrumsFromDrumPlan([line], () => ({ master, packing }));
      if (built.drums.length) {
        resolvedDrums.push(
          ...built.drums.map((d) => ({
            ...d,
            inquiryId: study.inquiryId,
            inquiryLineId: resolvedLineId,
            cuttingLengthRequirementId: pin.cuttingLengthRequirementId,
            drumPlanId: drumPlan.id,
            drumPlanLineId: line.id,
            cableLengthM: line.cuttingLengthM,
          }))
        );
      } else missing.push(...built.missing);
    }
    drumPlanPins.push(pin);
  }

  if (!resolvedDrums.length || missing.length) {
    throw issue('VALIDATION_FAILED', 'Missing drum master/packing geometry required for container study snapshot.', {
      missingDrums: missing,
    });
  }

  const lineage = flattenLineageFromDrumPlans(
    study.inquiryId,
    {
      shipmentGroupId: group.id,
      shipmentGroupVersionNo: group.versionNo,
      destinationPortCode: group.destinationPortCode,
      incotermCode: group.incotermCode,
      containerTypePreferenceCode: group.containerTypePreferenceCode,
      deliveryAllocationMode: group.deliveryAllocationMode,
    },
    drumPlanPins
  );

  const approvedTypeVersions = await prisma.containerTypeVersion.findMany({
    where: { isCurrent: true, status: 'ACTIVE', dimensionsStatus: 'APPROVED' },
    select: { id: true },
  });
  const containerTypeVersionIds =
    input.containerTypeVersionIds && input.containerTypeVersionIds.length
      ? input.containerTypeVersionIds
      : approvedTypeVersions.map((v) => v.id);
  if (!containerTypeVersionIds.length) {
    throw issue(
      'VALIDATION_FAILED',
      'No APPROVED container type dimensions are available to pin on the snapshot.',
      { code: 'INCOMPLETE_ENGINEERING_DATA' }
    );
  }

  const snapshot = await captureInputSnapshot(
    study.id,
    {
      configurationId: input.configurationId,
      drums: resolvedDrums,
      containerTypeVersionIds,
      lineageProvenanceJson: lineage,
    },
    actor
  );
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_INPUT_SNAPSHOT_CREATED',
    newValue: {
      snapshotId: snapshot.snapshotId,
      drumPlanIds: drumPlanPins.map((p) => p.drumPlanIdString),
      inquiryLineIds: drumPlanPins.map((p) => p.inquiryLineId),
      physicalDrumLines: resolvedDrums.length,
    },
    message: `Input snapshot from ${drumPlanPins.length} CONFIRMED drum plan(s)`,
  });
  return snapshot;
}

export async function captureInputSnapshotFromConfirmedVersionASchedule(
  studyId: string,
  input: { configurationId: string; containerTypeVersionIds?: string[] },
  actor: RequestActor
) {
  if (!input.configurationId) {
    throw issue('VALIDATION_FAILED', 'configurationId is required.');
  }
  const study = await loadStudyScoped(studyId, actor);
  if (study.currentSnapshotId) {
    throw issue('CONFLICT', 'Container Study already has an authoritative input snapshot.');
  }
  if (study.status !== 'DRAFT' && study.status !== 'VALIDATED') {
    throw issue('VALIDATION_FAILED', 'Input snapshot may only be captured on DRAFT or VALIDATED studies.');
  }
  const prisma = requirePrisma();
  const group = await prisma.containerShipmentGroup.findUnique({ where: { id: study.shipmentGroupId } });
  if (!group || group.inquiryId !== study.inquiryId) {
    throw issue('VALIDATION_FAILED', 'Shipment group does not belong to this inquiry.');
  }
  if (group.status === 'SUPERSEDED') {
    throw issue('CONFLICT', 'Cannot capture an input snapshot on a SUPERSEDED shipment group.');
  }

  const inquiryLines = await prisma.commercialInquiryLine.findMany({
    where: { inquiryId: study.inquiryId },
    orderBy: { lineNumber: 'asc' },
    select: { id: true, lineNumber: true, drumSchedule: true, materialNumber: true, v2CurrentDrumPlanId: true, cuttingLengthMeters: true, requestedLengthMeters: true },
  });
  const memberLineIds = await loadAuthoritativeMemberLineIds(
    group,
    inquiryLines.map((line) => line.id)
  );
  const memberSet = new Set(memberLineIds);
  const v2LineIds = new Set(inquiryLines.filter((l) => l.v2CurrentDrumPlanId).map((l) => l.id));
  const drumPlanPins: ContainerStudyDrumPlanPin[] = [];
  const resolvedDrums: SnapshotDrumFromDrumPlan[] = [];
  const missing: string[] = [];
  let hadUnconfirmedPhysical = false;
  let hadPhysical = false;
  let hadCuttingWithoutDrums = false;

  for (const line of inquiryLines) {
    if (!memberSet.has(line.id)) continue;
    if (v2LineIds.has(line.id)) continue;
    const schedule = parseInquiryDrumSchedule(line.drumSchedule);
    if (!inquiryDrumScheduleHasPhysicalPopulation(schedule) || !schedule) {
      const cutting = Number(line.cuttingLengthMeters);
      const requested = Number(line.requestedLengthMeters);
      if ((Number.isFinite(cutting) && cutting > 0) || (Number.isFinite(requested) && requested > 0)) {
        hadCuttingWithoutDrums = true;
      }
      continue;
    }
    hadPhysical = true;
    if (!inquiryDrumScheduleIsConfirmed(schedule)) {
      hadUnconfirmedPhysical = true;
      continue;
    }
    if (!schedule.rows.length) continue;
    const scheduleId = versionAConfirmedScheduleId(line.id, schedule.versionNo);
    const cable = line.materialNumber
      ? await prisma.cableMaster.findUnique({
          where: { materialNumber: line.materialNumber },
          select: { weight: true },
        })
      : null;
    const weightKgKm = cable?.weight != null ? Number(cable.weight) : null;
    const pin: ContainerStudyDrumPlanPin = {
      inquiryLineId: line.id,
      cableMaterialNumber: line.materialNumber,
      configurationSnapshotId: scheduleId,
      configurationSnapshotVersionNo: schedule.versionNo || 1,
      configurationSnapshotIdString: scheduleId,
      cuttingLengthRequirementId: `${line.id}#schedule`,
      cuttingLengthPlanId: scheduleId,
      cuttingLengthPlanVersionNo: schedule.versionNo || 1,
      cuttingLengthPlanIdString: scheduleId,
      requestedDrumCount: schedule.rows.reduce((n, r) => n + r.noOfDrums, 0),
      physicalDrumCount: schedule.rows.reduce((n, r) => n + r.noOfDrums, 0),
      toleranceMode: 'PERCENT',
      tolerancePercent: schedule.cableTolerancePercent,
      positiveTolerancePercent: schedule.cableTolerancePercent,
      negativeTolerancePercent: schedule.cableTolerancePercent,
      drumPlanId: scheduleId,
      drumPlanVersionNo: schedule.versionNo || 1,
      drumPlanIdString: scheduleId,
      drumLinePins: [],
    };

    for (const [index, row] of schedule.rows.entries()) {
      const sourceLineId = `${line.id}#${index + 1}`;
      const master = await resolveMasterPin(null, row.drumCode);
      const packing = await resolvePackingForDrum(row.drumCode, master?.drumMasterId || null);
      if (weightKgKm == null || !(weightKgKm > 0)) {
        missing.push(`${row.drumCode}:cableWeight`);
        continue;
      }
      const cableKg = cableWeightKgFromCuttingLength(row.cuttingLengthM, weightKgKm);
      const grossWithEmpty = grossLoadedDrumWeightKg(cableKg, master?.emptyDrumNetWeightKg ?? null);
      const gross =
        grossWithEmpty != null && grossWithEmpty > 0
          ? grossWithEmpty
          : cableKg > 0
            ? cableKg
            : null;
      const snapshotLine: DrumPlanLineForSnapshot = {
        id: sourceLineId,
        lineNo: index + 1,
        drumCode: row.drumCode,
        drumMasterId: master?.drumMasterId || null,
        numberOfDrums: row.noOfDrums,
        cuttingLengthM: row.cuttingLengthM,
        plannedCableLengthM: row.cuttingLengthM,
        grossLoadedDrumWeightKg: gross,
        engineering: null,
      };
      pin.drumLinePins.push({
        v2DrumPlanLineId: sourceLineId,
        lineNo: index + 1,
        numberOfDrums: row.noOfDrums,
        cuttingLengthM: row.cuttingLengthM,
        plannedCableLengthM: row.cuttingLengthM,
        inquiryId: study.inquiryId,
        inquiryLineId: line.id,
        cuttingLengthRequirementId: pin.cuttingLengthRequirementId,
        cuttingLengthPlanId: scheduleId,
        drumPlanId: scheduleId,
        cableMaterialNumber: pin.cableMaterialNumber,
        drumMasterPin: master,
        packingPin: packing,
        engineering: null,
      });
      const built = buildSnapshotDrumsFromDrumPlan([snapshotLine], () => ({ master, packing }));
      if (built.drums.length) {
        resolvedDrums.push(
          ...built.drums.map((d) => ({
            ...d,
            inquiryId: study.inquiryId,
            inquiryLineId: line.id,
            cuttingLengthRequirementId: pin.cuttingLengthRequirementId,
            drumPlanId: scheduleId,
            drumPlanLineId: sourceLineId,
            cableLengthM: row.cuttingLengthM,
          }))
        );
      } else missing.push(...built.missing);
    }
    if (pin.drumLinePins.length) drumPlanPins.push(pin);
  }

  if (!drumPlanPins.length) {
    if (hadUnconfirmedPhysical) {
      throw issue('VALIDATION_FAILED', CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE);
    }
    if (hadCuttingWithoutDrums && !hadPhysical) {
      throw issue('VALIDATION_FAILED', CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE);
    }
    throw issue('VALIDATION_FAILED', CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE);
  }

  if (!resolvedDrums.length || missing.length) {
    throw issue('VALIDATION_FAILED', 'Missing drum master/packing geometry required for container study snapshot.', {
      missingDrums: missing,
    });
  }

  const lineage = flattenLineageFromDrumPlans(
    study.inquiryId,
    {
      shipmentGroupId: group.id,
      shipmentGroupVersionNo: group.versionNo,
      destinationPortCode: group.destinationPortCode,
      incotermCode: group.incotermCode,
      containerTypePreferenceCode: group.containerTypePreferenceCode,
      deliveryAllocationMode: group.deliveryAllocationMode,
    },
    drumPlanPins
  );

  const approvedTypeVersions = await prisma.containerTypeVersion.findMany({
    where: { isCurrent: true, status: 'ACTIVE', dimensionsStatus: 'APPROVED' },
    select: { id: true },
  });
  const containerTypeVersionIds =
    input.containerTypeVersionIds && input.containerTypeVersionIds.length
      ? input.containerTypeVersionIds
      : approvedTypeVersions.map((v) => v.id);
  if (!containerTypeVersionIds.length) {
    throw issue(
      'VALIDATION_FAILED',
      'No APPROVED container type dimensions are available to pin on the snapshot.',
      { code: 'INCOMPLETE_ENGINEERING_DATA' }
    );
  }

  const snapshot = await captureInputSnapshot(
    study.id,
    {
      configurationId: input.configurationId,
      drums: resolvedDrums,
      containerTypeVersionIds,
      lineageProvenanceJson: lineage,
    },
    actor
  );
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: study.id,
    action: 'CONTAINER_STUDY_INPUT_SNAPSHOT_CREATED',
    newValue: {
      snapshotId: snapshot.snapshotId,
      drumPlanIds: drumPlanPins.map((p) => p.drumPlanIdString),
      inquiryLineIds: drumPlanPins.map((p) => p.inquiryLineId),
      physicalDrumLines: resolvedDrums.length,
      source: 'VERSION_A_CONFIRMED_SCHEDULE',
    },
    message: `Input snapshot from ${drumPlanPins.length} CONFIRMED Version A drum schedule(s)`,
  });
  return snapshot;
}

export async function getContainerStudyInputSnapshot(studyId: string, actor: RequestActor) {
  const study = await getContainerStudy(studyId, actor);
  if (!study.currentSnapshot) {
    throw issue('NOT_FOUND', 'No input snapshot exists for this Container Study.');
  }
  return study.currentSnapshot;
}

export async function createContainerStudyInputSnapshot(
  studyId: string,
  input: {
    inquiryLineId?: string;
    drumPlanId?: string;
    configurationId: string;
    containerTypeVersionIds?: string[];
    drums?: unknown;
    customerId?: string;
    technicallySuitable?: unknown;
    containerSuitable?: unknown;
    suitability?: unknown;
  },
  actor: RequestActor
) {
  return captureInputSnapshotFromConfirmedDrumPlan(studyId, input, actor);
}
