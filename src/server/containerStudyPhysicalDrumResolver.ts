/**
 * Container Study physical-drum resolver.
 *
 * Hierarchy (authoritative): Inquiry → Line → Cutting requirement → Physical drum schedule → Container Study.
 *
 * Compatibility bridge (do not fabricate V2 records):
 * - V2 lines: CONFIRMED V2DrumPlan lines expand to physical drum instances.
 * - Version A / current customer workflow: CommercialInquiryLine.drumSchedule
 *   (confirmed via Confirm Drum Plan) expands the same way.
 * - Quantities expand to instances (1500×2 is two 1500 m drums, never one 3000 m drum).
 * - ENTIRE_INQUIRY membership must include every current inquiry line's drums.
 */

import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { issue } from '../platform/errors/domainError';
import { assertCanAccessInquiryOwnership } from './rbac';
import {
  expandPhysicalDrumsFromInquirySchedule,
  inquiryDrumScheduleHasPhysicalPopulation,
  inquiryDrumScheduleIsConfirmed,
  parseInquiryDrumSchedule,
} from '../domain/inquiryDrumSchedule';
import { versionAConfirmedScheduleId } from '../domain/versionADrumScheduleConfirm';
import {
  enrichPhysicalDrumsForStudy,
  expandPhysicalDrumsFromPlanLines,
  type PhysicalDrumForStudy,
} from '../domain/inquiryContainerStudyPresentation';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

const containerStudyInquiryInclude = {
  lines: {
    orderBy: { lineNumber: 'asc' as const },
    select: {
      id: true,
      lineNumber: true,
      drumSchedule: true,
      materialNumber: true,
      cuttingLengthMeters: true,
      requestedLengthMeters: true,
      v2CurrentDrumPlanId: true,
    },
  },
};

export async function loadContainerStudyInquiryScoped(id: string, actor: RequestActor) {
  const prisma = requirePrisma();
  const inquiry = await prisma.commercialInquiry.findFirst({
    where: { OR: [{ id }, { inquiryNumber: id }] },
    include: containerStudyInquiryInclude,
  });
  if (!inquiry) {
    throw issue('NOT_FOUND', `Inquiry ${id} not found.`);
  }
  assertCanAccessInquiryOwnership(actor, inquiry.customerId, inquiry.customerMasterId);
  return inquiry;
}

export type ContainerStudyPhysicalDrumResolution = {
  confirmedDrumPlans: Array<{ id: string; lifecycleStatus: string }>;
  physicalDrums: PhysicalDrumForStudy[];
  drumPlanSnapshot: Array<{
    id: string;
    drumCode: string;
    numberOfDrums: number;
    cuttingLengthM: number;
  }>;
  hasUnconfirmedPhysicalPopulation: boolean;
  hasCuttingWithoutDrums: boolean;
  lineageUnresolved: boolean;
  source: 'V2_CONFIRMED_PLAN' | 'VERSION_A_SCHEDULE' | 'MIXED' | 'NONE';
};

function hasCuttingLength(line: {
  cuttingLengthMeters?: unknown;
  requestedLengthMeters?: unknown;
}): boolean {
  const cutting = Number(line.cuttingLengthMeters);
  const requested = Number(line.requestedLengthMeters);
  return (Number.isFinite(cutting) && cutting > 0) || (Number.isFinite(requested) && requested > 0);
}

/**
 * Resolves the authoritative physical drum population for Container Study.
 * Does not create V2ConfigurationSnapshot / V2CuttingLength* / V2DrumPlan rows.
 */
export async function resolveContainerStudyPhysicalDrums(
  inquiryId: string
): Promise<ContainerStudyPhysicalDrumResolution> {
  const prisma = requirePrisma();
  const requirements = await prisma.v2CuttingLengthRequirement.findMany({
    where: { inquiryLine: { inquiryId } },
    orderBy: [{ sequenceNo: 'asc' }],
    select: { id: true, currentDrumPlanId: true, inquiryLineId: true },
  });
  const planIds = [...new Set(requirements.map((r) => r.currentDrumPlanId).filter((id): id is string => Boolean(id)))];
  const plans = planIds.length
    ? await prisma.v2DrumPlan.findMany({
        where: { id: { in: planIds } },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
      })
    : [];
  const loadedPlanIds = new Set(plans.map((p) => p.id));
  const confirmed = plans.filter((p) => p.lifecycleStatus === 'CONFIRMED');
  const v2LineIds = new Set(confirmed.map((plan) => plan.inquiryLineId));
  const lines = confirmed.flatMap((plan) =>
    plan.lines.map((line) => ({
      id: line.id,
      drumPlanId: plan.id,
      inquiryLineId: plan.inquiryLineId,
      requirementId: line.cuttingLengthRequirementId,
      drumCode: line.drumCode,
      numberOfDrums: line.numberOfDrums,
      cuttingLengthM: Number(line.cuttingLengthM),
      emptyDrumNetWeightKg: line.emptyDrumNetWeightKg != null ? Number(line.emptyDrumNetWeightKg) : null,
      grossLoadedDrumWeightKg: line.grossLoadedDrumWeightKg != null ? Number(line.grossLoadedDrumWeightKg) : null,
    }))
  );
  const v2Physical = expandPhysicalDrumsFromPlanLines(lines).map((drum) => {
    const planLine = lines.find((line) => line.id === drum.sourceLineId);
    const plan = confirmed.find((p) => p.id === drum.drumPlanId);
    return {
      ...drum,
      inquiryId,
      inquiryLineId: planLine?.inquiryLineId || drum.inquiryLineId,
      cuttingRequirementId: planLine?.requirementId || drum.requirementId,
      cuttingPlanId: drum.drumPlanId,
      drumPlanVersion: plan?.versionNo,
      drumPlanLineId: drum.sourceLineId,
    };
  });
  const commercialLines = await prisma.commercialInquiryLine.findMany({
    where: { inquiryId },
    orderBy: { lineNumber: 'asc' },
    select: {
      id: true,
      lineNumber: true,
      drumSchedule: true,
      materialNumber: true,
      cuttingLengthMeters: true,
      requestedLengthMeters: true,
      v2CurrentDrumPlanId: true,
    },
  });
  const versionAPhysical: PhysicalDrumForStudy[] = [];
  const versionAPlans: Array<{ id: string; lifecycleStatus: string }> = [];
  const versionASnapshot: Array<{ id: string; drumCode: string; numberOfDrums: number; cuttingLengthM: number }> = [];
  let hasUnconfirmedPhysicalPopulation = false;
  let hasCuttingWithoutDrums = false;
  let lineageUnresolved = false;
  const pointedPlanIds = [
    ...new Set(commercialLines.map((line) => line.v2CurrentDrumPlanId).filter((id): id is string => Boolean(id))),
  ];
  const pointedPlans = pointedPlanIds.length
    ? await prisma.v2DrumPlan.findMany({
        where: { id: { in: pointedPlanIds } },
        select: { id: true },
      })
    : [];
  const pointedLoaded = new Set(pointedPlans.map((row) => row.id));

  for (const req of requirements) {
    if (req.currentDrumPlanId && !loadedPlanIds.has(req.currentDrumPlanId)) {
      const line = commercialLines.find((row) => row.id === req.inquiryLineId);
      const schedule = parseInquiryDrumSchedule(line?.drumSchedule);
      if (!inquiryDrumScheduleHasPhysicalPopulation(schedule)) {
        lineageUnresolved = true;
      }
    }
  }

  for (const line of commercialLines) {
    if (line.v2CurrentDrumPlanId && !pointedLoaded.has(line.v2CurrentDrumPlanId)) {
      const schedule = parseInquiryDrumSchedule(line.drumSchedule);
      if (!inquiryDrumScheduleHasPhysicalPopulation(schedule)) {
        lineageUnresolved = true;
      }
    }
    if (v2LineIds.has(line.id)) continue;
    const schedule = parseInquiryDrumSchedule(line.drumSchedule);
    if (!inquiryDrumScheduleHasPhysicalPopulation(schedule) || !schedule) {
      if (hasCuttingLength(line)) hasCuttingWithoutDrums = true;
      continue;
    }
    const physical = expandPhysicalDrumsFromInquirySchedule(schedule, line.id);
    if (!physical.length) {
      if (hasCuttingLength(line)) hasCuttingWithoutDrums = true;
      continue;
    }
    const scheduleId = versionAConfirmedScheduleId(line.id, schedule.versionNo);
    if (inquiryDrumScheduleIsConfirmed(schedule)) {
      versionAPlans.push({
        id: scheduleId,
        lifecycleStatus: 'CONFIRMED',
      });
    } else {
      hasUnconfirmedPhysicalPopulation = true;
    }
    versionAPhysical.push(
      ...physical.map((drum) => ({
        ...drum,
        inquiryId,
        inquiryLineId: line.id,
        inquiryLineNumber: line.lineNumber,
        cuttingRequirementId: `${line.id}#schedule`,
        cuttingPlanId: scheduleId,
        requirementId: `${line.id}#schedule`,
        drumPlanId: scheduleId,
        drumPlanVersion: schedule.versionNo || 1,
        drumPlanLineId: drum.physicalDrumKey,
      }))
    );
    schedule.rows.forEach((row, index) => {
      versionASnapshot.push({
        id: `${line.id}#${index + 1}`,
        drumCode: row.drumCode,
        numberOfDrums: row.noOfDrums,
        cuttingLengthM: row.cuttingLengthM,
      });
    });
  }

  const physicalDrums = [...v2Physical, ...versionAPhysical];
  const drumCodes = [...new Set(physicalDrums.map((drum) => drum.drumCode).filter(Boolean))];
  const masters = drumCodes.length
    ? await prisma.drumMaster.findMany({
        where: {
          OR: drumCodes.map((drumCode) => ({
            drumCode: { equals: drumCode, mode: 'insensitive' as const },
          })),
        },
        select: {
          drumCode: true,
          description: true,
          drumType: true,
          emptyDrumNetWeightKg: true,
        },
      })
    : [];
  const lineIds = new Set(physicalDrums.map((drum) => drum.inquiryLineId || drum.sourceLineId).filter(Boolean));
  const materialNumbers = [
    ...new Set(
      commercialLines
        .filter((line) => lineIds.has(line.id) && line.materialNumber)
        .map((line) => line.materialNumber as string)
    ),
  ];
  const cables = materialNumbers.length
    ? await prisma.cableMaster.findMany({
        where: { materialNumber: { in: materialNumbers } },
        select: { materialNumber: true, weight: true },
      })
    : [];
  const weightByMaterial = new Map(
    cables.map((cable) => {
      const kgKm = cable.weight != null ? Number(cable.weight) : null;
      return [cable.materialNumber, kgKm != null && Number.isFinite(kgKm) && kgKm > 0 ? kgKm : null] as const;
    })
  );
  const cableWeightKgPerKmByLine: Record<string, number | null> = {};
  for (const line of commercialLines) {
    if (!lineIds.has(line.id) || !line.materialNumber) continue;
    cableWeightKgPerKmByLine[line.id] = weightByMaterial.get(line.materialNumber) ?? null;
  }
  const hasV2 = confirmed.length > 0;
  const hasVersionA = versionAPhysical.length > 0 || versionAPlans.length > 0;
  const source: ContainerStudyPhysicalDrumResolution['source'] =
    hasV2 && hasVersionA ? 'MIXED' : hasV2 ? 'V2_CONFIRMED_PLAN' : hasVersionA ? 'VERSION_A_SCHEDULE' : 'NONE';
  return {
    confirmedDrumPlans: [
      ...confirmed.map((p) => ({ id: p.id, lifecycleStatus: p.lifecycleStatus })),
      ...versionAPlans,
    ],
    physicalDrums: enrichPhysicalDrumsForStudy(
      physicalDrums,
      masters.map((master) => ({
        drumCode: master.drumCode,
        description: master.description,
        drumType: master.drumType,
        emptyDrumNetWeightKg:
          master.emptyDrumNetWeightKg != null ? Number(master.emptyDrumNetWeightKg) : null,
      })),
      cableWeightKgPerKmByLine
    ),
    drumPlanSnapshot: [
      ...lines.map((line) => ({
        id: line.id,
        drumCode: line.drumCode,
        numberOfDrums: line.numberOfDrums,
        cuttingLengthM: line.cuttingLengthM,
      })),
      ...versionASnapshot,
    ],
    hasUnconfirmedPhysicalPopulation,
    hasCuttingWithoutDrums: hasCuttingWithoutDrums && !physicalDrums.length,
    lineageUnresolved: lineageUnresolved && !physicalDrums.length && !hasUnconfirmedPhysicalPopulation,
    source,
  };
}
