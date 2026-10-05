import { getPrisma } from './db';
import type { RequestActor } from './auth';
import { appendServerAudit } from './serverAudit';
import { DomainError, issue } from '../platform/errors/domainError';
import { loadContainerStudyInquiryScoped, resolveContainerStudyPhysicalDrums } from './containerStudyPhysicalDrumResolver';
import { listContainerTypes } from './containerMasterRepository';
import { listAlgorithmConfigurations } from './algorithmConfigurationRepository';
import { listIncoterms, listDestinationPorts, listCustomerDeliveryCombinations } from './shippingCostRepository';
import {
  calculateContainerStudy,
  createContainerStudy,
  createShipmentGroup,
  listContainerStudiesForInquiry,
  listShipmentGroupsForInquiry,
  loadAuthoritativeMemberLineIds,
  updateShipmentGroup,
} from './containerStudyRepository';
import { captureInputSnapshotFromConfirmedDrumPlan, captureInputSnapshotFromConfirmedVersionASchedule } from './containerStudyB1Repository';
import { formatDateOnlyUtc } from '../domain/shippingCostCanonical';
import { notConfiguredShippingFinancial, presentUnresolvedShippingAsCalculatedZero } from '../domain/customerShippingCost';
import {
  previewInquiryShippingCost,
  recordContainerStudyShippingSnapshot,
} from './customerShippingCostRepository';
import {
  applyContainerOptionSelection,
  describeInquiryShipmentDestination,
  evaluateInquiryContainerStudyReadiness,
  presentCurrentInquiryIncoterm,
  resolveInquiryCanonicalDestination,
  mapContainerOptions,
  recommendContainerTypeFromResult,
  totalNetWeightKg,
  CONTAINER_STUDY_SNAPSHOT_CONSTRUCT_FAILED_MESSAGE,
  inquiryCalculateMustAutoCaptureSnapshot,
  filterPhysicalDrumsByMemberLineIds,
  totalPhysicalCuttingLengthM,
  type ContainerTypeMasterView,
  confirmationBlockedByUnallocated,
} from '../domain/inquiryContainerStudyPresentation';
function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

async function syncEntireInquiryMembership(input: {
  shipmentGroupId: string;
  deliveryAllocationMode?: string | null;
  status?: string | null;
  allInquiryLineIds: string[];
}) {
  if (input.deliveryAllocationMode !== 'ENTIRE_INQUIRY' || input.status !== 'ACTIVE') return;
  const all = [...new Set(input.allInquiryLineIds.map((id) => id.trim()).filter(Boolean))];
  if (!all.length) return;
  const prisma = requirePrisma();
  const existing = await prisma.containerShipmentGroupLine.findMany({
    where: { shipmentGroupId: input.shipmentGroupId },
    select: { inquiryLineId: true },
  });
  const have = new Set(existing.map((row) => row.inquiryLineId));
  const missing = all.filter((id) => !have.has(id));
  if (!missing.length) return;
  await prisma.containerShipmentGroupLine.createMany({
    data: missing.map((inquiryLineId) => ({ shipmentGroupId: input.shipmentGroupId, inquiryLineId })),
    skipDuplicates: true,
  });
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function parseRegion(value: unknown): 'Europe' | 'Africa' | null {
  return value === 'Europe' || value === 'Africa' ? value : null;
}

function toTypeView(type: {
  code: string;
  description: string;
  active: boolean;
  versions?: Array<{
    id: string;
    isCurrent: boolean;
    dimensionsStatus: string;
    usableLengthMm?: unknown;
    internalWidthMm?: unknown;
    payloadCapacityKg?: unknown;
  }>;
}): ContainerTypeMasterView {
  const current = (type.versions || []).find((v) => v.isCurrent) || (type.versions || [])[0];
  const num = (value: unknown) => {
    if (value == null) return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  };
  return {
    code: type.code,
    description: type.description,
    active: type.active,
    currentVersionId: current?.id ?? null,
    dimensionsStatus:
      current?.dimensionsStatus === 'APPROVED' || current?.dimensionsStatus === 'PENDING_APPROVAL'
        ? current.dimensionsStatus
        : null,
    usableLengthMm: num(current?.usableLengthMm),
    internalWidthMm: num(current?.internalWidthMm),
    payloadCapacityKg: num(current?.payloadCapacityKg),
    volumeM3: null,
    internalHeightMm: null,
  };
}

async function loadInquiry(inquiryId: string, actor: RequestActor) {
  return loadContainerStudyInquiryScoped(inquiryId, actor);
}

async function resolveShipmentIdentity(
  inquiry: {
    incoterms?: string | null;
    commercialMetadata: unknown;
    customerMasterId?: string | null;
  },
  existing?: { destinationPortCode?: string | null; incotermCode?: string | null } | null
) {
  const meta = metadataRecord(inquiry.commercialMetadata);
  const [incotermRows, destinationPortRows, combinations] = await Promise.all([
    listIncoterms(),
    listDestinationPorts(),
    listCustomerDeliveryCombinations(inquiry.customerMasterId),
  ]);
  const destinationPortMaster = destinationPortRows.map((row) => ({
    code: row.code,
    name: row.name,
    active: row.active,
  }));
  const incoterm = presentCurrentInquiryIncoterm({
    inquiryIncoterms: inquiry.incoterms,
    metadataIncoterms: asText(meta.incoterms),
    shipmentGroupIncoterm: existing?.incotermCode,
    incotermMaster: incotermRows,
  });
  const resolved = resolveInquiryCanonicalDestination({
    destinationPortCode: asText(meta.destinationPortCode),
    deliveryDestination: asText(meta.deliveryDestination),
    shipmentGroupDestinationPortCode: asText(existing?.destinationPortCode),
    customerDefaultDestinationPortCode:
      combinations.find((row) => row.isDefault)?.destinationPortCode ?? null,
    destinationPortMaster,
    deliveryCombinations: combinations,
    requestedIncoterm: incoterm.requestedIncoterm,
  });
  return {
    requestedDestination: resolved.requestedDestination,
    destinationPortCode: resolved.destinationPortCode,
    destinationPortName: resolved.displayName,
    unresolvedDestination: resolved.unmatchedRequested,
    customerMasterDestinationConfigured: Boolean(resolved.destinationPortCode),
    requestedIncoterm: incoterm.requestedIncoterm,
    incotermCode: incoterm.incotermCode,
    unresolvedIncoterm: incoterm.unmatchedRequested,
    destinationPorts: destinationPortMaster.filter((row) => row.active !== false),
    incoterms: incotermRows
      .filter((row) => row.active)
      .map((row) => ({ code: row.code, name: row.name, active: row.active })),
    combinations,
  };
}

async function loadPhysicalDrums(inquiryId: string) {
  return resolveContainerStudyPhysicalDrums(inquiryId);
}

function activeSupportedConfiguration(
  configurations: Array<{
    id: string;
    status: string;
    configurationVersion?: string;
    algorithmVersion?: { code: string; implementationStatus?: string } | null;
  }>
) {
  return (
    configurations.find(
      (c) =>
        c.status === 'ACTIVE' &&
        c.algorithmVersion?.code === 'LEGACY_FIRST_FIT_V1' &&
        c.algorithmVersion.implementationStatus !== 'BLOCKED'
    ) || configurations.find((c) => c.status === 'ACTIVE' && c.algorithmVersion?.code === 'LEGACY_FIRST_FIT_V1')
  );
}

export async function getInquiryContainerStudyWorkspace(
  inquiryId: string,
  actor: RequestActor,
  input: { region?: 'Europe' | 'Africa' | null } = {}
) {
  const inquiry = await loadInquiry(inquiryId, actor);
  const [typesRaw, configurations, groups, studies, drums] = await Promise.all([
    listContainerTypes(),
    listAlgorithmConfigurations(),
    listShipmentGroupsForInquiry(inquiry.id, actor),
    listContainerStudiesForInquiry(inquiry.id, actor),
    loadPhysicalDrums(inquiry.id),
  ]);
  const types = typesRaw.map(toTypeView);
  const approved = types.filter(
    (t) => t.active && t.dimensionsStatus === 'APPROVED' && t.usableLengthMm != null && t.internalWidthMm != null && t.payloadCapacityKg != null
  );
  const activeGroup = groups.find((g) => g.status === 'ACTIVE' || g.status === 'LOCKED') || groups[0] || null;
  const currentStudy =
    studies.find((s) => s.status === 'DRAFT' || s.status === 'VALIDATED' || s.status === 'CONFIRMED') || studies[0] || null;
  const allInquiryLineIds = ((inquiry.lines || []) as Array<{ id: string }>).map((line) => line.id);
  const memberLineIds = activeGroup
    ? await loadAuthoritativeMemberLineIds(activeGroup, allInquiryLineIds)
    : allInquiryLineIds;
  const scopedPhysical = filterPhysicalDrumsByMemberLineIds(drums.physicalDrums, memberLineIds);
  const scopedPlanIds = new Set(scopedPhysical.map((drum) => drum.drumPlanId).filter((id): id is string => Boolean(id)));
  const scopedSourceIds = new Set(scopedPhysical.map((drum) => drum.sourceLineId));
  const scopedLineIds = new Set(scopedPhysical.map((drum) => drum.inquiryLineId).filter((id): id is string => Boolean(id)));
  const scopedConfirmed = drums.confirmedDrumPlans.filter((plan) => scopedPlanIds.has(plan.id));
  const scopedSnapshot = drums.drumPlanSnapshot.filter(
    (row) => scopedSourceIds.has(row.id) || scopedLineIds.has(String(row.id).split('#')[0] || '')
  );
  const identity = await resolveShipmentIdentity(inquiry, activeGroup);
  if (
    activeGroup &&
    activeGroup.status === 'ACTIVE' &&
    !currentStudy?.currentSnapshotId &&
    identity.incotermCode &&
    activeGroup.incotermCode !== identity.incotermCode
  ) {
    await requirePrisma().containerShipmentGroup.update({
      where: { id: activeGroup.id },
      data: { incotermCode: identity.incotermCode },
    });
    activeGroup.incotermCode = identity.incotermCode;
  }
  const meta = metadataRecord(inquiry.commercialMetadata);
  const region = input.region || parseRegion(currentStudy?.region) || parseRegion(meta.containerStudyRegion);
  const configuration = activeSupportedConfiguration(configurations);
  const readiness = evaluateInquiryContainerStudyReadiness({
    inquiryId: inquiry.id,
    customerScopeValid: true,
    confirmedDrumPlans: scopedConfirmed,
    physicalDrums: scopedPhysical,
    approvedContainerTypes: approved,
    algorithmSupported: Boolean(configuration),
    configurationReady: Boolean(configuration),
    destinationPortCode: identity.destinationPortCode,
    unresolvedDestination: identity.unresolvedDestination,
    incotermCode: identity.incotermCode,
    unresolvedIncoterm: identity.unresolvedIncoterm,
    region,
    hasUnconfirmedPhysicalPopulation: drums.hasUnconfirmedPhysicalPopulation,
    hasCuttingWithoutDrums: drums.hasCuttingWithoutDrums,
    lineageUnresolved: drums.lineageUnresolved,
    hasImmutableInputSnapshot: Boolean(currentStudy?.currentSnapshotId),
  });
  const destination = describeInquiryShipmentDestination({
    requestedDestination: identity.requestedDestination,
    destinationPortCode: identity.destinationPortCode,
    destinationPortName: identity.destinationPortName,
  });
  const incoterm = presentCurrentInquiryIncoterm({
    inquiryIncoterms: identity.requestedIncoterm,
    shipmentGroupIncoterm: activeGroup?.incotermCode,
    incotermMaster: identity.incoterms,
  });

  const result = currentStudy?.currentResult || null;
  const containers = (result?.containers || []).map((c) => ({
    typeCode: c.typeCode,
    containerIndex: c.containerIndex,
    usableLengthMm: Number(c.usableLengthMm),
    payloadCapacityKg: 0,
    loadedWeightKg: Number(c.loadedWeightKg),
    utilizationWeightPct: Number(c.utilizationWeightPct),
    utilizationLengthPct: Number(c.utilizationLengthPct),
    drumCountQ3: c.drumCountQ3,
  }));
  const unallocated = (result?.unallocated || []).map((u) => ({
    physicalDrumKey: u.physicalDrumKey,
    sourceLineId: u.sourceLineId,
    instanceIndex: u.instanceIndex,
    reasonCode: u.reasonCode,
    detail: u.detail,
  }));
  const selectedTypeCode = activeGroup?.containerTypePreferenceCode || null;
  const options = mapContainerOptions({
    types,
    containers,
    unallocated,
    selectedTypeCode,
  });
  const netWeight = totalNetWeightKg(scopedPhysical);
  const recommendedTypeCode = recommendContainerTypeFromResult(containers);
  const historicalResultIds = (currentStudy?.results || []).map((r) => r.resultId);
  let shippingCostFinancial = notConfiguredShippingFinancial();
  try {
    shippingCostFinancial = presentUnresolvedShippingAsCalculatedZero(
      await previewInquiryShippingCost(inquiry.id, formatDateOnlyUtc(new Date()))
    );
  } catch {
    shippingCostFinancial = presentUnresolvedShippingAsCalculatedZero(notConfiguredShippingFinancial());
  }
  return {
    inquiryId: inquiry.id,
    inquiryNumber: inquiry.inquiryNumber,
    study: currentStudy
      ? {
          id: currentStudy.id,
          studyNumber: currentStudy.studyNumber,
          status: currentStudy.status,
          versionNo: currentStudy.versionNo,
          currentResultId: currentStudy.currentResultId,
          currentSnapshotId: currentStudy.currentSnapshotId,
        }
      : null,
    shipmentGroup: activeGroup
      ? {
          id: activeGroup.id,
          status: activeGroup.status,
          destinationPortCode: activeGroup.destinationPortCode,
          incotermCode: activeGroup.incotermCode,
          containerTypePreferenceCode: activeGroup.containerTypePreferenceCode,
        }
      : null,
    shipmentIdentity: {
      requestedDestination: identity.requestedDestination,
      destinationPortCode: destination.destinationPortCode,
      destinationPortLabel: destination.label,
      destinationConfigured: destination.configured,
      unresolvedDestination: identity.unresolvedDestination,
      destinationMessage: destination.message,
      customerMasterDestinationConfigured: identity.customerMasterDestinationConfigured,
      shippingCostBlocked: destination.shippingCostBlocked,
      requestedIncoterm: identity.requestedIncoterm,
      incotermCode: identity.incotermCode,
      incotermLabel: incoterm.label,
      incotermConfigured: incoterm.configured,
      unresolvedIncoterm: identity.unresolvedIncoterm,
      incotermMessage: incoterm.message,
    },
    shipmentMasters: {
      destinationPorts: identity.destinationPorts,
      incoterms: identity.incoterms,
      combinations: identity.combinations,
    },
    region,
    stuffingMethod: 'Rolling' as const,
    readiness,
    incompleteContainerTypes: types.filter((t) => !approved.some((a) => a.code === t.code)),
    physicalDrums: scopedPhysical,
    drumPlanSnapshot: scopedSnapshot,
    confirmedDrumPlans: scopedConfirmed,
    summary: {
      totalDrums: scopedPhysical.length,
      totalCuttingLengthM: totalPhysicalCuttingLengthM(scopedPhysical),
      totalNetWeightKg: netWeight,
      totalVolumeLabel: 'Not Available',
      estimatedContainers: containers.length || null,
      recommendedTypeCode,
    },
    options,
    unallocated,
    algorithmVersionCode: result ? (currentStudy?.currentResult as { algorithmVersionCode?: string } | null)?.algorithmVersionCode || null : configuration?.algorithmVersion?.code || null,
    configurationVersion: configuration?.configurationVersion || null,
    historicalResultIds,
    confirmationBlocked: confirmationBlockedByUnallocated(unallocated.length),
    shippingCostFinancial,
  };
}

export async function calculateInquiryContainerOptions(
  inquiryId: string,
  actor: RequestActor,
  input: { region?: 'Europe' | 'Africa' | null } = {}
) {
  const workspace = await getInquiryContainerStudyWorkspace(inquiryId, actor, input);
  if (!workspace.readiness.ok) {
    throw issue('VALIDATION_FAILED', workspace.readiness.issues[0]?.message || 'Container Study is not ready to calculate.', {
      issues: workspace.readiness.issues,
    });
  }
  const inquiry = await loadInquiry(inquiryId, actor);
  const drumsBefore = workspace.drumPlanSnapshot;
  const identity = await resolveShipmentIdentity(inquiry, workspace.shipmentGroup);
  const region = workspace.region;
  if (!region) {
    throw issue('VALIDATION_FAILED', 'Container Study region is incomplete.');
  }
  const configurations = await listAlgorithmConfigurations();
  const configuration = activeSupportedConfiguration(configurations);
  if (!configuration) {
    throw issue('VALIDATION_FAILED', 'An ACTIVE supported algorithm configuration is required.');
  }

  let groupId = workspace.shipmentGroup?.id;
  if (!groupId) {
    const group = await createShipmentGroup(
      inquiry.id,
      {
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
        destinationPortCode: identity.destinationPortCode,
        incotermCode: identity.incotermCode,
        groupCode: 'SG-INQUIRY',
      },
      actor
    );
    groupId = group.id;
  }
  const allInquiryLineIds = ((inquiry.lines || []) as Array<{ id: string }>).map((line) => line.id);
  if (groupId) {
    const groupRow = await requirePrisma().containerShipmentGroup.findUnique({
      where: { id: groupId },
      select: { deliveryAllocationMode: true, status: true },
    });
    await syncEntireInquiryMembership({
      shipmentGroupId: groupId,
      deliveryAllocationMode: groupRow?.deliveryAllocationMode,
      status: groupRow?.status,
      allInquiryLineIds,
    });
  }

  let studyId = workspace.study?.id;
  if (!studyId) {
    const study = await createContainerStudy(
      inquiry.id,
      {
        shipmentGroupId: groupId,
        stuffingMethod: 'Rolling',
        region,
        deliveryAllocationMode: 'ENTIRE_INQUIRY',
      },
      actor
    );
    studyId = study.id;
  }

  const latest = await getInquiryContainerStudyWorkspace(inquiry.id, actor, { region });
  if (inquiryCalculateMustAutoCaptureSnapshot(latest.study?.currentSnapshotId)) {
    const hasV2ConfirmedPlans = latest.confirmedDrumPlans.some(
      (plan) => !String(plan.id).startsWith('commercial-schedule:')
    );
    try {
      if (hasV2ConfirmedPlans) {
        await captureInputSnapshotFromConfirmedDrumPlan(studyId, { configurationId: configuration.id }, actor);
      } else {
        await captureInputSnapshotFromConfirmedVersionASchedule(studyId, { configurationId: configuration.id }, actor);
      }
    } catch (err) {
      if (err instanceof DomainError && err.code === 'CONFLICT') {
        // Snapshot already exists; continue to calculation.
      } else {
        const detail = err instanceof Error ? err.message : String(err);
        throw issue('VALIDATION_FAILED', CONTAINER_STUDY_SNAPSHOT_CONSTRUCT_FAILED_MESSAGE, {
          cause: detail,
          ...(err instanceof DomainError ? err.details || {} : {}),
        });
      }
    }
  } else if (!latest.study?.currentSnapshotId) {
    throw issue('VALIDATION_FAILED', CONTAINER_STUDY_SNAPSHOT_CONSTRUCT_FAILED_MESSAGE);
  }

  let calculated;
  try {
    calculated = await calculateContainerStudy(studyId, actor);
  } catch (err) {
    if (err instanceof DomainError && String(err.message).includes('Capture an input snapshot before calculation')) {
      throw issue('VALIDATION_FAILED', CONTAINER_STUDY_SNAPSHOT_CONSTRUCT_FAILED_MESSAGE, err.details);
    }
    throw err;
  }
  const after = await getInquiryContainerStudyWorkspace(inquiry.id, actor, { region });
  if (!calculationUnchanged(drumsBefore, after.drumPlanSnapshot)) {
    throw issue('VALIDATION_FAILED', 'Container Study calculation must not alter the drum plan.');
  }
  let shippingCostFinancial = presentUnresolvedShippingAsCalculatedZero(after.shippingCostFinancial);
  if (after.study?.currentResultId) {
    try {
      shippingCostFinancial = presentUnresolvedShippingAsCalculatedZero(
        await recordContainerStudyShippingSnapshot({
          containerStudyResultId: after.study.currentResultId,
          inquiryId: inquiry.id,
          effectiveDate: formatDateOnlyUtc(new Date()),
          actor,
        })
      );
    } catch {
      shippingCostFinancial = presentUnresolvedShippingAsCalculatedZero(notConfiguredShippingFinancial());
    }
  }
  return {
    ...after,
    shippingCostFinancial,
    calculation: {
      resultId: calculated.result?.resultId ?? null,
      ok: Boolean(calculated.calculation?.ok),
      algorithmVersionCode: calculated.calculation?.algorithmVersionCode ?? null,
      configurationVersion: calculated.calculation?.configurationVersion ?? null,
    },
  };
}

function calculationUnchanged(
  before: Array<{ id: string; drumCode: string; numberOfDrums: number; cuttingLengthM: number }>,
  after: Array<{ id: string; drumCode: string; numberOfDrums: number; cuttingLengthM: number }>
) {
  return JSON.stringify(before) === JSON.stringify(after);
}

export async function selectInquiryContainerOption(
  inquiryId: string,
  actor: RequestActor,
  input: { typeCode: string; region?: 'Europe' | 'Africa' | null }
) {
  const workspace = await getInquiryContainerStudyWorkspace(inquiryId, actor, { region: input.region });
  const option = workspace.options.find((row) => row.typeCode === input.typeCode);
  if (!option) {
    throw issue('VALIDATION_FAILED', `Container type ${input.typeCode} is not part of this study.`);
  }
  if (!option.selectable) {
    throw issue('VALIDATION_FAILED', `Container type ${input.typeCode} cannot be selected from the current calculation.`);
  }
  if (!workspace.shipmentGroup?.id || !workspace.study) {
    throw issue('VALIDATION_FAILED', 'Calculate container options before selecting a type.');
  }
  const drumsBefore = workspace.drumPlanSnapshot;
  const cuttingBefore = workspace.physicalDrums.map((d) => d.cuttingLengthM);
  await updateShipmentGroup(
    workspace.shipmentGroup.id,
    { containerTypePreferenceCode: input.typeCode },
    actor
  );
  await appendServerAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'ContainerStudy',
    entityId: workspace.study.id,
    action: 'CONTAINER_STUDY_OPTION_SELECTED',
    newValue: {
      typeCode: input.typeCode,
      resultId: workspace.study.currentResultId,
      inquiryId: workspace.inquiryId,
    },
    message: `Container option ${input.typeCode} selected for inquiry ${workspace.inquiryNumber}`,
  });
  const after = await getInquiryContainerStudyWorkspace(inquiryId, actor, { region: input.region });
  const selected = applyContainerOptionSelection(
    {
      drums: workspace.physicalDrums,
      cuttingLengths: cuttingBefore,
      selectedTypeCode: null as string | null,
    },
    input.typeCode
  );
  if (!calculationUnchanged(drumsBefore, after.drumPlanSnapshot)) {
    throw issue('VALIDATION_FAILED', 'Selecting a container must not alter the drum plan.');
  }
  if (JSON.stringify(selected.cuttingLengths) !== JSON.stringify(cuttingBefore)) {
    throw issue('VALIDATION_FAILED', 'Selecting a container must not alter cutting lengths.');
  }
  return after;
}
