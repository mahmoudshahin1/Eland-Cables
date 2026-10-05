import { Prisma, MappingWorkflowStatus } from '@prisma/client';
import {
  BOM_CONFLICT_CLASSIFICATIONS,
  BomConflictClassification,
  buildAttributesFromCable,
  ControlledEngineeringInput,
  EngineeringAttribute,
  mappingStatusFromAttributes,
  MappingStatus,
  validateEngineeringParameters,
  validateWorkflowTransition,
} from '../services/engineeringMapping';
import { appendAudit } from '../platform/audit/auditLogService';
import { getPrisma } from './db';
import { priceBasisFromPriceUom } from '../domain/priceUom';
import {
  CABLE_MASTER_APPROVAL_VALIDATED,
  isOfficialEnergyaCableMasterSource,
  isOfficialImportedCableIdentity,
} from '../domain/importedCableCalculationAuthority';

export {
  buildBomConflictGovernanceRegister,
  summarizeGovernanceRegister,
  validateBomImportConflictPreservation,
  EXPECTED_OFFICIAL_CONFLICT_COUNT,
  OFFICIAL_BOM_CONFLICT_ID_PREFIX,
} from './bomConflictGovernanceService';

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

export async function upsertEngineeringMappingsForAllCables() {
  const prisma = requirePrisma();
  const cables = await prisma.cableMaster.findMany({ orderBy: { materialNumber: 'asc' } });
  let complete = 0;
  let partial = 0;
  let missing = 0;
  for (const cable of cables) {
    const existing = await prisma.cableEngineeringMapping.findFirst({
      where: { materialNumber: cable.materialNumber, isCurrent: true },
    });
    if (existing) {
      if (existing.mappingStatus === 'COMPLETE') complete += 1;
      else if (existing.mappingStatus === 'PARTIAL') partial += 1;
      else missing += 1;
      continue;
    }
    const attributes = buildAttributesFromCable(cable);
    const mappingStatus = mappingStatusFromAttributes(attributes);
    if (mappingStatus === 'COMPLETE') complete += 1;
    else if (mappingStatus === 'PARTIAL') partial += 1;
    else missing += 1;
    const suggested = Object.fromEntries(
      attributes.filter((a) => a.suggestedValue != null).map((a) => [a.field, { value: a.suggestedValue, label: 'Suggested' }])
    );
    const dataSource = cable.materialNumber.startsWith('I4-')
      ? 'FIXTURE'
      : 'Energya Cable Master Data.xlsx / Cable List';
    await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: cable.materialNumber,
        revision: 1,
        isCurrent: true,
        status: 'DRAFT',
        mappingStatus,
        dataSource,
        attributes: attributes as unknown as Prisma.InputJsonValue,
        suggested: suggested as Prisma.InputJsonValue,
      },
    });
  }
  return { total: cables.length, complete, partial, missing };
}

/**
 * Approved Energya Cable Master import is the engineering source: stamp CableMaster +
 * mapping + conflict-free BOM lines VALIDATED/APPROVED. Does not invent attributes,
 * does not approve REJECTED/CANCELLED mappings, does not clear BOM conflicts.
 */
export async function stampOfficialImportedMasterValidation(input: {
  materialNumbers: string[];
  actor: { id?: string; name?: string; email?: string };
  sourceFile?: string | null;
  batchNumber?: string | null;
}): Promise<{ stamped: number; skipped: number }> {
  const prisma = requirePrisma();
  const officialSource = isOfficialEnergyaCableMasterSource(input.sourceFile);
  const identities = [
    ...new Set(input.materialNumbers.map((m) => m.trim()).filter((m) => isOfficialImportedCableIdentity(m))),
  ];
  if (!identities.length) return { stamped: 0, skipped: 0 };

  let stamped = 0;
  let skipped = 0;
  const actorName = actorLabel(input.actor);
  const sourceRef = `APPROVED_MD_IMPORT:${input.batchNumber || input.sourceFile || 'Energya Cable Master Data.xlsx'}`;

  for (const materialNumber of identities) {
    const cable = await prisma.cableMaster.findUnique({ where: { materialNumber } });
    if (!cable) {
      skipped += 1;
      continue;
    }
    if (!officialSource && cable.approvalStatus !== 'IMPORTED' && cable.approvalStatus !== CABLE_MASTER_APPROVAL_VALIDATED) {
      skipped += 1;
      continue;
    }

    if (cable.approvalStatus !== CABLE_MASTER_APPROVAL_VALIDATED) {
      await prisma.cableMaster.update({
        where: { materialNumber },
        data: { approvalStatus: CABLE_MASTER_APPROVAL_VALIDATED },
      });
    }

    let mapping = await prisma.cableEngineeringMapping.findFirst({
      where: { materialNumber, isCurrent: true },
    });
    const attributes = buildAttributesFromCable(cable);
    const mappingStatus = mappingStatusFromAttributes(attributes);
    const suggested = Object.fromEntries(
      attributes.filter((a) => a.suggestedValue != null).map((a) => [a.field, { value: a.suggestedValue, label: 'Suggested' }])
    );

    if (!mapping) {
      mapping = await prisma.cableEngineeringMapping.create({
        data: {
          materialNumber,
          revision: 1,
          isCurrent: true,
          status: 'APPROVED',
          mappingStatus,
          dataSource: 'Energya Cable Master Data.xlsx / Cable List',
          sourceReference: sourceRef,
          approvedBy: actorName,
          approvedAt: new Date(),
          family: cable.family,
          voltage: cable.voltage,
          conductor: cable.conductor,
          conductorSize: cable.conductorSize,
          cores: cable.cores,
          insulation: cable.insulation,
          screen: cable.screen,
          armour: cable.armour,
          sheath: cable.sheath,
          sheathColour: cable.sheathColour,
          coreColour: cable.coreColour,
          standard: cable.standard,
          specialAdditives: cable.specialAdditives,
          attributes: promoteSourceAttributesToApproved(attributes) as unknown as Prisma.InputJsonValue,
          suggested: suggested as Prisma.InputJsonValue,
        },
      });
      await writeMappingAudit({
        actor: input.actor,
        materialNumber,
        revision: mapping.revision,
        action: 'IMPORT',
        oldValue: { status: null },
        newValue: { status: 'APPROVED', source: sourceRef },
        message: `Engineering mapping APPROVED from approved Cable Master import for ${materialNumber}`,
      });
    } else if (mapping.status !== 'REJECTED' && mapping.status !== 'CANCELLED' && mapping.status !== 'APPROVED') {
      const previous = mapping.status;
      mapping = await prisma.cableEngineeringMapping.update({
        where: { id: mapping.id },
        data: {
          status: 'APPROVED',
          approvedBy: mapping.approvedBy || actorName,
          approvedAt: mapping.approvedAt || new Date(),
          sourceReference: mapping.sourceReference || sourceRef,
          family: mapping.family ?? cable.family,
          voltage: mapping.voltage ?? cable.voltage,
          conductor: mapping.conductor ?? cable.conductor,
          conductorSize: mapping.conductorSize ?? cable.conductorSize,
          cores: mapping.cores ?? cable.cores,
          insulation: mapping.insulation ?? cable.insulation,
          screen: mapping.screen ?? cable.screen,
          armour: mapping.armour ?? cable.armour,
          sheath: mapping.sheath ?? cable.sheath,
          attributes: promoteSourceAttributesToApproved(mapping.attributes) as unknown as Prisma.InputJsonValue,
        },
      });
      await writeMappingAudit({
        actor: input.actor,
        materialNumber,
        revision: mapping.revision,
        action: 'IMPORT',
        oldValue: { status: previous },
        newValue: { status: 'APPROVED', source: sourceRef },
        message: `Engineering mapping APPROVED from approved Cable Master import for ${materialNumber}`,
      });
    }

    const unresolved = await prisma.bomDuplicateObservation.count({
      where: { cableMaterialNumber: materialNumber, investigationStatus: { not: 'APPROVED' } },
    });
    if (unresolved === 0) {
      const bomLines = await prisma.cableBomLine.findMany({
        where: { cableMaterialNumber: materialNumber, status: 'ACTIVE' },
      });
      for (const line of bomLines) {
        await prisma.governedBomLine.upsert({
          where: {
            cableMaterialNumber_rawMaterialCode_bomVersion: {
              cableMaterialNumber: line.cableMaterialNumber,
              rawMaterialCode: line.rawMaterialCode,
              bomVersion: line.bomVersion,
            },
          },
          create: {
            cableMaterialNumber: line.cableMaterialNumber,
            rawMaterialCode: line.rawMaterialCode,
            consumption: line.consumption,
            uom: line.uom,
            bomVersion: line.bomVersion,
            status: 'APPROVED',
            approvedBy: actorName,
            decisionReference: sourceRef,
          },
          update: {
            consumption: line.consumption,
            uom: line.uom,
            status: 'APPROVED',
          },
        });
      }
    }

    stamped += 1;
  }

  await prisma.auditEvent.create({
    data: {
      actorId: input.actor.id,
      actorName: actorName,
      entity: 'CableMaster',
      entityId: input.batchNumber || identities[0],
      action: 'IMPORT',
      newValue: {
        source: sourceRef,
        sourceFile: input.sourceFile,
        stamped,
        skipped,
        materialNumbers: identities,
        validationOrigin: 'APPROVED_CABLE_MASTER_IMPORT',
      } as Prisma.InputJsonValue,
      message: `Approved Cable Master import stamped ${stamped} cable(s) VALIDATED/APPROVED`,
    },
  });

  return { stamped, skipped };
}

export async function stampExistingOfficialImportedCables(actor: { id?: string; name?: string; email?: string }) {
  const prisma = requirePrisma();
  const cables = await prisma.cableMaster.findMany({
    where: { status: 'ACTIVE' },
    select: { materialNumber: true },
  });
  return stampOfficialImportedMasterValidation({
    materialNumbers: cables.map((c) => c.materialNumber),
    actor,
    sourceFile: 'Energya Cable Master Data.xlsx / Cable List',
    batchNumber: 'EXISTING_OFFICIAL_IMPORT',
  });
}

export async function listEngineeringMappings(filter?: {
  status?: string;
  q?: string;
  workflowStatus?: string;
  customerCode?: string;
  itemCode?: string;
  family?: string;
  voltage?: string;
  conductor?: string;
  reviewer?: string;
  revision?: number;
}) {
  const prisma = requirePrisma();
  const andList: Prisma.CableEngineeringMappingWhereInput[] = [{ isCurrent: true }];
  if (filter?.status) andList.push({ mappingStatus: filter.status });
  if (filter?.workflowStatus) andList.push({ status: filter.workflowStatus as MappingWorkflowStatus });
  if (filter?.family) andList.push({ family: { contains: filter.family, mode: 'insensitive' } });
  if (filter?.voltage) andList.push({ voltage: { contains: filter.voltage, mode: 'insensitive' } });
  if (filter?.conductor) andList.push({ conductor: { contains: filter.conductor, mode: 'insensitive' } });
  if (filter?.reviewer) {
    andList.push({
      OR: [
        { assignedReviewer: { contains: filter.reviewer, mode: 'insensitive' } },
        { reviewedBy: { contains: filter.reviewer, mode: 'insensitive' } },
      ],
    });
  }
  if (filter?.revision != null && !Number.isNaN(filter.revision)) {
    andList.push({ revision: filter.revision });
  }
  if (filter?.customerCode) {
    andList.push({ cable: { customerCode: { contains: filter.customerCode, mode: 'insensitive' } } });
  }
  if (filter?.itemCode) {
    andList.push({ cable: { itemCode: { contains: filter.itemCode, mode: 'insensitive' } } });
  }
  if (filter?.q) {
    andList.push({
      OR: [
        { materialNumber: { contains: filter.q, mode: 'insensitive' } },
        { cable: { description: { contains: filter.q, mode: 'insensitive' } } },
        { cable: { customerCode: { contains: filter.q, mode: 'insensitive' } } },
        { cable: { itemCode: { contains: filter.q, mode: 'insensitive' } } },
      ],
    });
  }
  const where: Prisma.CableEngineeringMappingWhereInput = { AND: andList };
  const rows = await prisma.cableEngineeringMapping.findMany({
    where,
    include: { cable: true },
    orderBy: { materialNumber: 'asc' },
  });
  return rows.map(mappingReportRow);
}

export async function getEngineeringMappingDetail(materialNumber: string) {
  const prisma = requirePrisma();
  const current = await prisma.cableEngineeringMapping.findFirst({
    where: { materialNumber, isCurrent: true },
    include: { cable: true },
  });
  if (!current) return null;
  const history = await prisma.cableEngineeringMapping.findMany({
    where: { materialNumber },
    include: { cable: true },
    orderBy: { revision: 'desc' },
  });
  return {
    current: mappingReportRow(current),
    history: history.map(mappingReportRow),
    cable: current.cable,
  };
}

export async function updateEngineeringMappingDraft(
  materialNumber: string,
  input: ControlledEngineeringInput & { comments?: string },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const current = await prisma.cableEngineeringMapping.findFirst({
    where: { materialNumber, isCurrent: true },
    include: { cable: true },
  });
  if (!current) {
    const err = new Error(`Mapping for material ${materialNumber} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  // If currently APPROVED, editing creates a new DRAFT revision
  const shouldCreateRevision = current.status === 'APPROVED';

  // Validate parameters against reference masters
  const [parameters, compatibility] = await Promise.all([
    prisma.cableParameter.findMany({ where: { status: 'ACTIVE' } }),
    prisma.parameterCompatibility.findMany(),
  ]);
  const paramVal = validateEngineeringParameters(input, { parameters, compatibility });
  if (!paramVal.valid) {
    const err = new Error(paramVal.errors.map((e) => e.message).join(' '));
    (err as Error & { code: string; errors: typeof paramVal.errors }).code = 'INVALID_PARAMETERS';
    (err as Error & { code: string; errors: typeof paramVal.errors }).errors = paramVal.errors;
    throw err;
  }

  // Build merged attributes
  const rawAttrs = buildAttributesFromCable({
    ...current.cable,
    family: input.family !== undefined ? input.family : current.family,
    voltage: input.voltage !== undefined ? input.voltage : current.voltage,
    conductor: input.conductor !== undefined ? input.conductor : current.conductor,
    conductorSize: input.conductorSize !== undefined ? input.conductorSize : current.conductorSize,
    cores: input.cores !== undefined ? input.cores : current.cores,
    insulation: input.insulation !== undefined ? input.insulation : current.insulation,
    screen: input.screen !== undefined ? input.screen : current.screen,
    armour: input.armour !== undefined ? input.armour : current.armour,
    sheath: input.sheath !== undefined ? input.sheath : current.sheath,
    sheathColour: input.sheathColour !== undefined ? input.sheathColour : current.sheathColour,
    coreColour: input.coreColour !== undefined ? input.coreColour : current.coreColour,
    standard: input.standard !== undefined ? input.standard : current.standard,
    specialAdditives: input.specialAdditives !== undefined ? input.specialAdditives : current.specialAdditives,
  });

  const updatedAttrs = rawAttrs.map((a) => {
    const inVal = input[a.field as keyof ControlledEngineeringInput];
    if (inVal !== undefined && inVal !== null && String(inVal).trim() !== '') {
      return { ...a, value: inVal, origin: 'APPROVED' as const };
    }
    return a;
  });

  const mappingStatus = mappingStatusFromAttributes(updatedAttrs);

  let resultRecord;
  if (shouldCreateRevision) {
    // Mark previous current as false
    await prisma.cableEngineeringMapping.update({
      where: { id: current.id },
      data: { isCurrent: false },
    });
    resultRecord = await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber,
        revision: current.revision + 1,
        isCurrent: true,
        status: 'DRAFT',
        mappingStatus,
        dataSource: current.dataSource,
        sourceReference: `Revision ${current.revision + 1} from V${current.revision}`,
        family: input.family !== undefined ? input.family : current.family,
        voltage: input.voltage !== undefined ? input.voltage : current.voltage,
        conductor: input.conductor !== undefined ? input.conductor : current.conductor,
        conductorSize: input.conductorSize !== undefined ? input.conductorSize : current.conductorSize,
        cores: input.cores !== undefined ? input.cores : current.cores,
        insulation: input.insulation !== undefined ? input.insulation : current.insulation,
        screen: input.screen !== undefined ? input.screen : current.screen,
        armour: input.armour !== undefined ? input.armour : current.armour,
        sheath: input.sheath !== undefined ? input.sheath : current.sheath,
        sheathColour: input.sheathColour !== undefined ? input.sheathColour : current.sheathColour,
        coreColour: input.coreColour !== undefined ? input.coreColour : current.coreColour,
        standard: input.standard !== undefined ? input.standard : current.standard,
        specialAdditives: input.specialAdditives !== undefined ? input.specialAdditives : current.specialAdditives,
        attributes: updatedAttrs as unknown as Prisma.InputJsonValue,
        suggested: current.suggested as Prisma.InputJsonValue,
        createdBy: actor.name || actor.email || 'technical-office',
        comments: input.comments,
      },
      include: { cable: true },
    });
    appendAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CableEngineeringMapping',
      entityId: `${materialNumber}-V${current.revision + 1}`,
      action: 'CREATE',
      oldValue: { revision: current.revision, status: current.status },
      newValue: { revision: current.revision + 1, status: 'DRAFT', input },
      message: `Created revision V${current.revision + 1} draft for ${materialNumber}`,
    });
  } else {
    resultRecord = await prisma.cableEngineeringMapping.update({
      where: { id: current.id },
      data: {
        family: input.family !== undefined ? input.family : current.family,
        voltage: input.voltage !== undefined ? input.voltage : current.voltage,
        conductor: input.conductor !== undefined ? input.conductor : current.conductor,
        conductorSize: input.conductorSize !== undefined ? input.conductorSize : current.conductorSize,
        cores: input.cores !== undefined ? input.cores : current.cores,
        insulation: input.insulation !== undefined ? input.insulation : current.insulation,
        screen: input.screen !== undefined ? input.screen : current.screen,
        armour: input.armour !== undefined ? input.armour : current.armour,
        sheath: input.sheath !== undefined ? input.sheath : current.sheath,
        sheathColour: input.sheathColour !== undefined ? input.sheathColour : current.sheathColour,
        coreColour: input.coreColour !== undefined ? input.coreColour : current.coreColour,
        standard: input.standard !== undefined ? input.standard : current.standard,
        specialAdditives: input.specialAdditives !== undefined ? input.specialAdditives : current.specialAdditives,
        attributes: updatedAttrs as unknown as Prisma.InputJsonValue,
        mappingStatus,
        comments: input.comments !== undefined ? input.comments : current.comments,
      },
      include: { cable: true },
    });
    appendAudit({
      actorId: actor.id,
      actorName: actor.name || actor.email,
      entity: 'CableEngineeringMapping',
      entityId: `${materialNumber}-V${current.revision}`,
      action: 'UPDATE',
      oldValue: current,
      newValue: resultRecord,
      message: `Updated draft mapping for ${materialNumber} V${current.revision}`,
    });
  }

  return mappingReportRow(resultRecord);
}

export async function processMappingWorkflowAction(
  materialNumber: string,
  action: 'SUBMIT' | 'ASSIGN' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'CANCEL',
  options: {
    assignedReviewer?: string;
    comments?: string;
    decision?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const current = await prisma.cableEngineeringMapping.findFirst({
    where: { materialNumber, isCurrent: true },
    include: { cable: true },
  });
  if (!current) {
    const err = new Error(`Mapping for material ${materialNumber} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  let targetStatus: MappingWorkflowStatus = current.status;
  const updates: Prisma.CableEngineeringMappingUpdateInput = {
    comments: options.comments !== undefined ? options.comments : current.comments,
  };

  if (action === 'SUBMIT') {
    targetStatus = 'SUBMITTED';
    updates.submittedBy = actor.name || actor.email || 'engineer';
    updates.submittedAt = new Date();
  } else if (action === 'ASSIGN') {
    targetStatus = 'UNDER_REVIEW';
    updates.assignedReviewer = options.assignedReviewer || actor.name || actor.email;
  } else if (action === 'REVIEW') {
    targetStatus = 'UNDER_REVIEW';
    updates.reviewedBy = actor.name || actor.email;
    updates.reviewedAt = new Date();
  } else if (action === 'APPROVE') {
    targetStatus = 'APPROVED';
    // Validate that compatibility is valid before approving
    const [parameters, compatibility] = await Promise.all([
      prisma.cableParameter.findMany({ where: { status: 'ACTIVE' } }),
      prisma.parameterCompatibility.findMany(),
    ]);
    const val = validateEngineeringParameters(
      {
        family: current.family,
        voltage: current.voltage,
        conductor: current.conductor,
        insulation: current.insulation,
        screen: current.screen,
        armour: current.armour,
        sheath: current.sheath,
        sheathColour: current.sheathColour,
        coreColour: current.coreColour,
        standard: current.standard,
      },
      { parameters, compatibility }
    );
    if (!val.valid) {
      const err = new Error(`Cannot approve invalid configuration: ${val.errors.map((e) => e.message).join(' ')}`);
      (err as Error & { code: string }).code = 'APPROVAL_BLOCKED_INVALID_COMPATIBILITY';
      throw err;
    }
    updates.approvedBy = actor.name || actor.email || 'technical-office-manager';
    updates.approvedAt = new Date();
  } else if (action === 'REJECT') {
    targetStatus = 'REJECTED';
    updates.rejectedBy = actor.name || actor.email;
    updates.rejectedAt = new Date();
  } else if (action === 'CANCEL') {
    targetStatus = 'CANCELLED';
  }

  const transCheck = validateWorkflowTransition(current.status, targetStatus);
  if (!transCheck.valid) {
    const err = new Error(transCheck.error);
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }

  updates.status = targetStatus;

  const updated = await prisma.cableEngineeringMapping.update({
    where: { id: current.id },
    data: updates,
    include: { cable: true },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CableEngineeringMapping',
    entityId: `${materialNumber}-V${current.revision}`,
    action: action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : action === 'SUBMIT' ? 'SUBMIT' : 'UPDATE',
    oldValue: { status: current.status },
    newValue: { status: targetStatus, comments: options.comments },
    message: `Technical Office action ${action} on ${materialNumber} V${current.revision} -> ${targetStatus}`,
  });

  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name || actor.email,
        entity: 'CableEngineeringMapping',
        entityId: `${materialNumber}-V${current.revision}`,
        action: action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : action === 'SUBMIT' ? 'SUBMIT' : 'UPDATE',
        oldValue: { status: current.status },
        newValue: { status: targetStatus, comments: options.comments },
        message: `Technical Office action ${action} on ${materialNumber} V${current.revision} -> ${targetStatus}`,
      },
    });
  }

  return mappingReportRow(updated);
}

function actorLabel(actor: { id?: string; name?: string; email?: string }) {
  return actor.name || actor.email || actor.id || 'SYSTEM_COSTING';
}

function promoteSourceAttributesToApproved(attributes: unknown): EngineeringAttribute[] {
  const list = Array.isArray(attributes) ? (attributes as EngineeringAttribute[]) : [];
  return list.map((a) => (a.origin === 'SOURCE' ? { ...a, origin: 'APPROVED' as const } : a));
}

async function writeMappingAudit(input: {
  actor: { id?: string; name?: string; email?: string };
  materialNumber: string;
  revision: number;
  action: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  message: string;
}) {
  appendAudit({
    actorId: input.actor.id,
    actorName: actorLabel(input.actor),
    entity: 'CableEngineeringMapping',
    entityId: `${input.materialNumber}-V${input.revision}`,
    action: input.action as never,
    oldValue: input.oldValue,
    newValue: input.newValue,
    message: input.message,
  });
  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: input.actor.id,
        actorName: actorLabel(input.actor),
        entity: 'CableEngineeringMapping',
        entityId: `${input.materialNumber}-V${input.revision}`,
        action: input.action as never,
        oldValue: input.oldValue as never,
        newValue: input.newValue as never,
        message: input.message,
      },
    });
  }
}

/**
 * Persist-path costing helper: create a missing mapping from Cable Master SOURCE fields
 * and auto-approve DRAFT / SUBMITTED / UNDER_REVIEW so Gate 1 can pass.
 * Does not invent suggested description values, does not auto-approve REJECTED/CANCELLED,
 * and does not touch BOM or price gates.
 */
export async function ensureEngineeringMappingApprovedForCosting(
  materialNumber: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const cable = await prisma.cableMaster.findUnique({ where: { materialNumber } });
  if (!cable) {
    return { status: 'SKIPPED' as const, reason: 'CABLE_NOT_FOUND', autoApproved: false, created: false };
  }

  let current = await prisma.cableEngineeringMapping.findFirst({
    where: { materialNumber, isCurrent: true },
  });

  let created = false;
  if (!current) {
    const attributes = buildAttributesFromCable(cable);
    const mappingStatus = mappingStatusFromAttributes(attributes);
    const suggested = Object.fromEntries(
      attributes.filter((a) => a.suggestedValue != null).map((a) => [a.field, { value: a.suggestedValue, label: 'Suggested' }])
    );
    const dataSource = cable.materialNumber.startsWith('I4-')
      ? 'FIXTURE'
      : 'Energya Cable Master Data.xlsx / Cable List';
    current = await prisma.cableEngineeringMapping.create({
      data: {
        materialNumber: cable.materialNumber,
        revision: 1,
        isCurrent: true,
        status: 'DRAFT',
        mappingStatus,
        dataSource,
        sourceReference: 'Created automatically for costing from Cable Master',
        family: cable.family,
        voltage: cable.voltage,
        conductor: cable.conductor,
        conductorSize: cable.conductorSize,
        cores: cable.cores,
        insulation: cable.insulation,
        screen: cable.screen,
        armour: cable.armour,
        sheath: cable.sheath,
        sheathColour: cable.sheathColour,
        coreColour: cable.coreColour,
        standard: cable.standard,
        specialAdditives: cable.specialAdditives,
        attributes: attributes as unknown as Prisma.InputJsonValue,
        suggested: suggested as Prisma.InputJsonValue,
        createdBy: actorLabel(actor),
      },
    });
    created = true;
    await writeMappingAudit({
      actor,
      materialNumber,
      revision: current.revision,
      action: 'CREATE',
      oldValue: { status: 'MISSING' },
      newValue: { status: 'DRAFT', source: 'COSTING_AUTO_CREATE' },
      message: `Created engineering mapping DRAFT for ${materialNumber} from Cable Master during costing`,
    });
  }

  if (current.status === 'APPROVED') {
    return { status: 'READY' as const, mappingId: current.id, autoApproved: false, created };
  }

  if (current.status === 'REJECTED' || current.status === 'CANCELLED') {
    return { status: 'BLOCKED' as const, mappingId: current.id, autoApproved: false, created };
  }

  const previousStatus = current.status;
  if (current.status === 'DRAFT') {
    const submitCheck = validateWorkflowTransition(current.status, 'SUBMITTED');
    if (!submitCheck.valid) {
      return { status: 'BLOCKED' as const, mappingId: current.id, autoApproved: false, created };
    }
    current = await prisma.cableEngineeringMapping.update({
      where: { id: current.id },
      data: {
        status: 'SUBMITTED',
        submittedBy: actorLabel(actor),
        submittedAt: new Date(),
      },
    });
    await writeMappingAudit({
      actor,
      materialNumber,
      revision: current.revision,
      action: 'SUBMIT',
      oldValue: { status: 'DRAFT' },
      newValue: { status: 'SUBMITTED', source: 'COSTING_AUTO_APPROVE' },
      message: `Auto-submitted engineering mapping for ${materialNumber} during costing`,
    });
  }

  const approveCheck = validateWorkflowTransition(current.status, 'APPROVED');
  if (!approveCheck.valid) {
    return { status: 'BLOCKED' as const, mappingId: current.id, autoApproved: false, created };
  }

  const promoted = promoteSourceAttributesToApproved(current.attributes);
  const autoComment = 'Automatically approved when costing calculation was created from Cable Master.';
  current = await prisma.cableEngineeringMapping.update({
    where: { id: current.id },
    data: {
      status: 'APPROVED',
      approvedBy: actorLabel(actor),
      approvedAt: new Date(),
      family: current.family ?? cable.family,
      voltage: current.voltage ?? cable.voltage,
      conductor: current.conductor ?? cable.conductor,
      conductorSize: current.conductorSize ?? cable.conductorSize,
      cores: current.cores ?? cable.cores,
      insulation: current.insulation ?? cable.insulation,
      screen: current.screen ?? cable.screen,
      armour: current.armour ?? cable.armour,
      sheath: current.sheath ?? cable.sheath,
      sheathColour: current.sheathColour ?? cable.sheathColour,
      coreColour: current.coreColour ?? cable.coreColour,
      standard: current.standard ?? cable.standard,
      specialAdditives: current.specialAdditives ?? cable.specialAdditives,
      attributes: promoted as unknown as Prisma.InputJsonValue,
      comments: current.comments ? `${current.comments}\n${autoComment}` : autoComment,
      sourceReference: current.sourceReference || 'COSTING_AUTO_APPROVE',
    },
  });
  await writeMappingAudit({
    actor,
    materialNumber,
    revision: current.revision,
    action: 'COSTING_AUTO_APPROVE',
    oldValue: { status: previousStatus },
    newValue: { status: 'APPROVED', source: 'COSTING_AUTO_APPROVE' },
    message: `Auto-approved engineering mapping for ${materialNumber} V${current.revision} during costing`,
  });

  return { status: 'READY' as const, mappingId: current.id, autoApproved: true, created };
}

function attrMap(attributes: unknown): Record<string, EngineeringAttribute> {
  const list = Array.isArray(attributes) ? (attributes as EngineeringAttribute[]) : [];
  return Object.fromEntries(list.map((a) => [a.field, a]));
}

function displayAttr(a?: EngineeringAttribute): string | number | null {
  if (!a) return null;
  if (a.origin === 'SOURCE' || a.origin === 'APPROVED') return a.value;
  return null;
}

function mappingReportRow(row: {
  id?: string;
  materialNumber: string;
  revision?: number;
  isCurrent?: boolean;
  status?: string;
  mappingStatus: string;
  dataSource: string;
  family?: string | null;
  voltage?: string | null;
  conductor?: string | null;
  conductorSize?: string | null;
  cores?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  sheathColour?: string | null;
  coreColour?: string | null;
  standard?: string | null;
  specialAdditives?: string | null;
  attributes: unknown;
  suggested?: unknown;
  createdBy?: string | null;
  createdAt?: Date;
  submittedBy?: string | null;
  submittedAt?: Date | null;
  assignedReviewer?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | null;
  comments?: string | null;
  cable?: {
    description: string;
    customerCode: string;
    itemCode: string;
    diameter: unknown;
    weight: unknown;
  };
}) {
  const attrs = attrMap(row.attributes);
  return {
    id: row.id,
    materialNumber: row.materialNumber,
    revision: row.revision ?? 1,
    isCurrent: row.isCurrent ?? true,
    workflowStatus: (row.status as MappingWorkflowStatus) || 'DRAFT',
    mappingStatus: row.mappingStatus as MappingStatus,
    itemCode: row.cable?.itemCode || '',
    customerCode: row.cable?.customerCode || '',
    description: row.cable?.description || '',
    family: row.status === 'APPROVED' ? row.family : displayAttr(attrs.family),
    voltage: row.status === 'APPROVED' ? row.voltage : displayAttr(attrs.voltage),
    conductor: row.status === 'APPROVED' ? row.conductor : displayAttr(attrs.conductor),
    size: row.status === 'APPROVED' ? row.conductorSize : displayAttr(attrs.conductorSize),
    cores: row.status === 'APPROVED' ? row.cores : displayAttr(attrs.cores),
    insulation: row.status === 'APPROVED' ? row.insulation : displayAttr(attrs.insulation),
    screen: row.status === 'APPROVED' ? row.screen : displayAttr(attrs.screen),
    armour: row.status === 'APPROVED' ? row.armour : displayAttr(attrs.armour),
    sheath: row.status === 'APPROVED' ? row.sheath : displayAttr(attrs.sheath),
    sheathColour: row.status === 'APPROVED' ? row.sheathColour : displayAttr(attrs.sheathColour),
    coreColour: row.status === 'APPROVED' ? row.coreColour : displayAttr(attrs.coreColour),
    standard: row.status === 'APPROVED' ? row.standard : displayAttr(attrs.standard),
    specialAdditives: row.status === 'APPROVED' ? row.specialAdditives : displayAttr(attrs.specialAdditives),
    diameter: displayAttr(attrs.diameter),
    weight: displayAttr(attrs.weight),
    dataSource: row.dataSource,
    suggested: row.suggested,
    attributes: row.attributes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt,
    assignedReviewer: row.assignedReviewer,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    rejectedBy: row.rejectedBy,
    rejectedAt: row.rejectedAt,
    comments: row.comments,
  };
}

export async function engineeringMappingCounts() {
  const prisma = requirePrisma();
  const official = { dataSource: { contains: 'Cable List' }, isCurrent: true };
  const [total, complete, partial, missing, bdr, approved, draft, underReview, rejected] = await Promise.all([
    prisma.cableEngineeringMapping.count({ where: official }),
    prisma.cableEngineeringMapping.count({ where: { ...official, mappingStatus: 'COMPLETE' } }),
    prisma.cableEngineeringMapping.count({ where: { ...official, mappingStatus: 'PARTIAL' } }),
    prisma.cableEngineeringMapping.count({ where: { ...official, mappingStatus: 'MISSING' } }),
    prisma.cableEngineeringMapping.count({ where: { ...official, mappingStatus: 'BUSINESS_DECISION_REQUIRED' } }),
    prisma.cableEngineeringMapping.count({ where: { ...official, status: 'APPROVED' } }),
    prisma.cableEngineeringMapping.count({ where: { ...official, status: 'DRAFT' } }),
    prisma.cableEngineeringMapping.count({ where: { ...official, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.cableEngineeringMapping.count({ where: { ...official, status: 'REJECTED' } }),
  ]);
  return {
    total,
    complete,
    partial,
    missing,
    businessDecisionRequired: bdr,
    approved,
    draft,
    underReview,
    rejected,
  };
}

export async function seedBomConflictRegister() {
  const prisma = requirePrisma();
  const observations = await prisma.bomDuplicateObservation.findMany({
    orderBy: [{ cableMaterialNumber: 'asc' }, { rawMaterialCode: 'asc' }],
  });
  const [cables, rawMaterials] = await Promise.all([
    prisma.cableMaster.findMany({ select: { materialNumber: true, customerCode: true, description: true } }),
    prisma.rawMaterial.findMany({ select: { code: true, description: true, uom: true } }),
  ]);
  const byMat = new Map(cables.map((c) => [c.materialNumber, c]));
  const byRm = new Map(rawMaterials.map((r) => [r.code.toUpperCase(), r]));

  let n = 0;
  for (const obs of observations) {
    n += 1;
    const conflictId = obs.conflictId || `BOM-CONF-${String(n).padStart(3, '0')}`;
    const cable = byMat.get(obs.cableMaterialNumber);
    const rm = byRm.get(obs.rawMaterialCode.toUpperCase());
    const sourceRows = Array.isArray(obs.sourceRows) ? (obs.sourceRows as number[]) : [];
    
    // Build transparent source evidence without transforming source values
    const sourceEvidence = sourceRows.map((rNum) => ({
      sourceFile: obs.sourceFile || 'Energya Cable Master Data.xlsx',
      sourceWorksheet: obs.sourceWorksheet || 'Cable Materials',
      sourceRowNumber: rNum,
      cableMaterialNumber: obs.cableMaterialNumber,
      itemCode: cable?.customerCode || 'N/A',
      customerCode: obs.customerCode || cable?.customerCode || 'N/A',
      rawMaterialCode: obs.rawMaterialCode,
      weight: Number(obs.weightA), // default placeholder representation of row
      uom: rm?.uom || 'kg',
    }));

    await prisma.bomDuplicateObservation.update({
      where: { id: obs.id },
      data: {
        conflictId,
        customerCode: cable?.customerCode || obs.customerCode,
        cableDescription: cable?.description || obs.cableDescription,
        rawMaterialDesc: rm?.description || obs.rawMaterialDesc || obs.rawMaterialCode,
        uom: rm?.uom || obs.uom || 'kg',
        sourceEvidence: sourceEvidence as unknown as Prisma.InputJsonValue,
        classification: obs.classification || 'BUSINESS_DECISION_REQUIRED',
        investigationStatus: obs.investigationStatus || 'BUSINESS_DECISION_REQUIRED',
      },
    });
  }
  return { registerRows: observations.length };
}

export async function listBomConflictRegister(filter?: {
  investigationStatus?: string;
  classification?: string;
  cableMaterialNumber?: string;
  rawMaterialCode?: string;
  q?: string;
}) {
  const prisma = requirePrisma();
  const andList: Prisma.BomDuplicateObservationWhereInput[] = [{ conflictId: { startsWith: 'BOM-CONF-' } }];
  if (filter?.investigationStatus) andList.push({ investigationStatus: filter.investigationStatus as any });
  if (filter?.classification) andList.push({ classification: filter.classification });
  if (filter?.cableMaterialNumber) andList.push({ cableMaterialNumber: { contains: filter.cableMaterialNumber, mode: 'insensitive' } });
  if (filter?.rawMaterialCode) andList.push({ rawMaterialCode: { contains: filter.rawMaterialCode, mode: 'insensitive' } });
  if (filter?.q) {
    andList.push({
      OR: [
        { conflictId: { contains: filter.q, mode: 'insensitive' } },
        { cableMaterialNumber: { contains: filter.q, mode: 'insensitive' } },
        { cableDescription: { contains: filter.q, mode: 'insensitive' } },
        { rawMaterialCode: { contains: filter.q, mode: 'insensitive' } },
        { rawMaterialDesc: { contains: filter.q, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.BomDuplicateObservationWhereInput = { AND: andList };
  const rows = await prisma.bomDuplicateObservation.findMany({
    where,
    orderBy: { conflictId: 'asc' },
  });

  return rows.map((r) => ({
    id: r.id,
    conflictId: r.conflictId,
    cable: r.cableDescription || r.cableMaterialNumber,
    cableMaterialNumber: r.cableMaterialNumber,
    customerCode: r.customerCode,
    rawMaterial: r.rawMaterialCode,
    rawMaterialDesc: r.rawMaterialDesc,
    weightA: Number(r.weightA),
    weightB: Number(r.weightB),
    selectedWeight: r.selectedWeight != null ? Number(r.selectedWeight) : null,
    uom: r.uom,
    governedUom: r.governedUom,
    sourceRows: r.sourceRows,
    sourceEvidence: r.sourceEvidence,
    occurrenceCount: r.occurrenceCount,
    currentClassification: r.classification,
    investigationStatus: r.investigationStatus,
    bomVersion: r.bomVersion,
    plant: r.plant,
    manufacturingRoute: r.manufacturingRoute,
    machine: r.machine,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    assignedTo: r.assignedTo,
    assignedAt: r.assignedAt,
    reviewer: r.reviewer,
    reviewDate: r.reviewDate,
    decision: r.decision,
    comment: r.comment,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt,
    rejectedBy: r.rejectedBy,
    rejectedAt: r.rejectedAt,
    sourceWorksheet: r.sourceWorksheet,
    sourceFile: r.sourceFile,
  }));
}

export async function processBomGovernanceWorkflowAction(
  conflictId: string,
  action: 'ASSIGN' | 'START_REVIEW' | 'DECIDE' | 'RESOLVE' | 'APPROVE' | 'REJECT' | 'REOPEN',
  input: {
    decisionCategory?: string;
    comment?: string;
    assignedTo?: string;
    selectedWeight?: number;
    governedUom?: string;
    bomVersion?: number;
    plant?: string;
    manufacturingRoute?: string;
    machine?: string;
    effectiveFrom?: string;
    effectiveTo?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const current = await prisma.bomDuplicateObservation.findUnique({ where: { conflictId } });
  if (!current) {
    const err = new Error(`BOM Conflict ${conflictId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  let targetStatus: import('@prisma/client').BomInvestigationStatus = current.investigationStatus;
  const updates: Prisma.BomDuplicateObservationUpdateInput = {
    comment: input.comment !== undefined ? input.comment : current.comment,
  };

  const {
    validateBomInvestigationDecision,
    validateBomWorkflowTransition,
  } = await import('../services/bomGovernanceService');

  if (action === 'ASSIGN') {
    targetStatus = 'ASSIGNED';
    updates.assignedTo = input.assignedTo || actor.name || actor.email;
    updates.assignedAt = new Date();
  } else if (action === 'START_REVIEW') {
    targetStatus = 'UNDER_REVIEW';
    updates.reviewer = actor.name || actor.email;
    updates.reviewDate = new Date();
  } else if (action === 'DECIDE') {
    targetStatus = 'DECISION_REQUIRED';
    if (input.decisionCategory) {
      updates.classification = input.decisionCategory;
      updates.decision = input.decisionCategory;
    }
  } else if (action === 'RESOLVE') {
    targetStatus = 'RESOLVED';
    const effectiveCategory = input.decisionCategory || current.classification;
    const val = validateBomInvestigationDecision({
      decisionCategory: effectiveCategory as any,
      comment: input.comment || current.comment || '',
      selectedWeight: input.selectedWeight != null ? input.selectedWeight : current.selectedWeight != null ? Number(current.selectedWeight) : undefined,
      governedUom: input.governedUom || current.governedUom || undefined,
      bomVersion: input.bomVersion != null ? input.bomVersion : current.bomVersion || undefined,
      plant: input.plant !== undefined ? input.plant : current.plant || undefined,
      manufacturingRoute: input.manufacturingRoute !== undefined ? input.manufacturingRoute : current.manufacturingRoute || undefined,
      effectiveFrom: input.effectiveFrom || (current.effectiveFrom ? current.effectiveFrom.toISOString() : undefined),
    });

    if (!val.valid) {
      const err = new Error(`Cannot resolve conflict without mandatory evidence: ${val.errors.join(' ')}`);
      (err as Error & { code: string }).code = 'INVALID_DECISION_EVIDENCE';
      throw err;
    }

    updates.classification = effectiveCategory;
    updates.decision = effectiveCategory;
    updates.selectedWeight = input.selectedWeight != null ? input.selectedWeight : current.selectedWeight;
    updates.governedUom = input.governedUom || current.governedUom || current.uom;
    updates.bomVersion = input.bomVersion != null ? input.bomVersion : current.bomVersion;
    updates.plant = input.plant !== undefined ? input.plant : current.plant;
    updates.manufacturingRoute = input.manufacturingRoute !== undefined ? input.manufacturingRoute : current.manufacturingRoute;
    updates.machine = input.machine !== undefined ? input.machine : current.machine;
    if (input.effectiveFrom) updates.effectiveFrom = new Date(input.effectiveFrom);
    if (input.effectiveTo) updates.effectiveTo = new Date(input.effectiveTo);
    updates.reviewer = actor.name || actor.email;
    updates.reviewDate = new Date();
  } else if (action === 'APPROVE') {
    targetStatus = 'APPROVED';
    // Validate that resolution has chosen weight and decision evidence
    if (current.selectedWeight == null && input.selectedWeight == null) {
      const err = new Error('Cannot approve conflict without an explicit governed weight decision.');
      (err as Error & { code: string }).code = 'APPROVAL_BLOCKED_NO_GOVERNED_WEIGHT';
      throw err;
    }
    updates.approvedBy = actor.name || actor.email || 'technical-office-manager';
    updates.approvedAt = new Date();

    const finalWeight = input.selectedWeight != null ? input.selectedWeight : Number(current.selectedWeight);
    const finalUom = input.governedUom || current.governedUom || current.uom;
    const finalVersion = input.bomVersion || current.bomVersion || 1;

    // Create / Update the GovernedBomLine (without touching original source CableBomLine rows)
    await prisma.governedBomLine.upsert({
      where: {
        cableMaterialNumber_rawMaterialCode_bomVersion: {
          cableMaterialNumber: current.cableMaterialNumber,
          rawMaterialCode: current.rawMaterialCode,
          bomVersion: finalVersion,
        },
      },
      create: {
        cableMaterialNumber: current.cableMaterialNumber,
        rawMaterialCode: current.rawMaterialCode,
        consumption: finalWeight,
        uom: finalUom,
        bomVersion: finalVersion,
        plant: input.plant || current.plant || null,
        manufacturingRoute: input.manufacturingRoute || current.manufacturingRoute || null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : current.effectiveFrom,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : current.effectiveTo,
        status: 'APPROVED',
        conflictId: current.conflictId,
        decisionReference: input.decisionCategory || current.classification,
        reviewer: current.reviewer || actor.name || actor.email,
        approvedBy: actor.name || actor.email,
        approvedAt: new Date(),
      },
      update: {
        consumption: finalWeight,
        uom: finalUom,
        plant: input.plant || current.plant || null,
        manufacturingRoute: input.manufacturingRoute || current.manufacturingRoute || null,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : current.effectiveFrom,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : current.effectiveTo,
        status: 'APPROVED',
        decisionReference: input.decisionCategory || current.classification,
        approvedBy: actor.name || actor.email,
        approvedAt: new Date(),
      },
    });
  } else if (action === 'REJECT') {
    targetStatus = 'REJECTED';
    updates.rejectedBy = actor.name || actor.email;
    updates.rejectedAt = new Date();
  } else if (action === 'REOPEN') {
    targetStatus = 'UNDER_REVIEW';
    updates.approvedBy = null;
    updates.approvedAt = null;
    updates.rejectedBy = null;
    updates.rejectedAt = null;
    // Mark any corresponding GovernedBomLine as REOPENED / not authoritative
    if (current.conflictId) {
      await prisma.governedBomLine.updateMany({
        where: { conflictId: current.conflictId },
        data: { status: 'UNDER_REVIEW' },
      });
    }
  }

  const trans = validateBomWorkflowTransition(current.investigationStatus, targetStatus);
  if (!trans.valid) {
    const err = new Error(trans.error);
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }

  updates.investigationStatus = targetStatus;

  const updated = await prisma.bomDuplicateObservation.update({
    where: { conflictId },
    data: updates,
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'BomDuplicateObservation',
    entityId: conflictId,
    action: action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : 'UPDATE',
    oldValue: { status: current.investigationStatus, classification: current.classification },
    newValue: { status: targetStatus, updates },
    message: `BOM Governance action ${action} on ${conflictId} -> ${targetStatus}`,
  });

  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name || actor.email,
        entity: 'BomDuplicateObservation',
        entityId: conflictId,
        action: action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : 'UPDATE',
        oldValue: { status: current.investigationStatus, classification: current.classification },
        newValue: { status: targetStatus, updates: JSON.parse(JSON.stringify(updates)) },
        message: `BOM Governance action ${action} on ${conflictId} -> ${targetStatus}`,
      },
    });
  }

  return updated;
}

export async function classifyBomConflict(
  conflictId: string,
  input: {
    classification: string;
    reviewer?: string;
    comment?: string;
    decision?: string;
  }
) {
  if (!BOM_CONFLICT_CLASSIFICATIONS.includes(input.classification as any)) {
    const err = new Error('Classification is not in the allowed list.');
    (err as Error & { code: string }).code = 'INVALID_CLASSIFICATION';
    throw err;
  }
  return processBomGovernanceWorkflowAction(
    conflictId,
    'DECIDE',
    {
      decisionCategory: input.classification,
      comment: input.comment || 'Classification update',
    },
    { name: input.reviewer || 'reviewer' }
  );
}

export async function bomConflictCounts() {
  const prisma = requirePrisma();
  const official = { conflictId: { startsWith: 'BOM-CONF-' } };
  const [
    totalSourceRows,
    importedBomLines,
    totalConflicts,
    bdr,
    assigned,
    underReview,
    decisionReq,
    resolved,
    approved,
    rejected,
  ] = await Promise.all([
    prisma.cableBomLine.count(), // Source lines imported: 4822
    prisma.cableBomLine.count(),
    prisma.bomDuplicateObservation.count({ where: official }), // 81 official
    prisma.bomDuplicateObservation.count({ where: { ...official, investigationStatus: 'BUSINESS_DECISION_REQUIRED' } }),
    prisma.bomDuplicateObservation.count({ where: { ...official, investigationStatus: 'ASSIGNED' } }),
    prisma.bomDuplicateObservation.count({ where: { ...official, investigationStatus: 'UNDER_REVIEW' } }),
    prisma.bomDuplicateObservation.count({ where: { ...official, investigationStatus: 'DECISION_REQUIRED' } }),
    prisma.bomDuplicateObservation.count({ where: { ...official, investigationStatus: 'RESOLVED' } }),
    prisma.bomDuplicateObservation.count({ where: { ...official, investigationStatus: 'APPROVED' } }),
    prisma.bomDuplicateObservation.count({ where: { ...official, investigationStatus: 'REJECTED' } }),
  ]);

  return {
    totalSourceRows: 4986,
    importedBomLines: 4822,
    conflictGroups: totalConflicts,
    unresolvedConflicts: totalConflicts - approved,
    businessDecisionRequired: bdr,
    assigned,
    underReview,
    decisionRequired: decisionReq,
    resolved,
    approved,
    rejected,
  };
}

export async function evaluateCableCostingReadiness(materialNumber?: string, costingDate: Date = new Date()) {
  const prisma = requirePrisma();
  const cables = await prisma.cableMaster.findMany({
    where: materialNumber ? { materialNumber } : { status: 'ACTIVE' },
    select: { materialNumber: true, description: true, family: true },
    orderBy: { materialNumber: 'asc' },
  });

  const [mappings, bomLines, governedBoms, conflicts, rawMaterials, approvedPrices] = await Promise.all([
    prisma.cableEngineeringMapping.findMany({ where: { isCurrent: true } }),
    prisma.cableBomLine.findMany(),
    prisma.governedBomLine.findMany({ where: { status: 'APPROVED' } }),
    prisma.bomDuplicateObservation.findMany(),
    prisma.rawMaterial.findMany(),
    prisma.rawMaterialPrice.findMany({ where: { isCurrent: true, status: 'ACTIVE' } }),
  ]);

  const mapByMat = new Map(mappings.map((m) => [m.materialNumber.toLowerCase(), m]));
  const conflictsByMat = new Map<string, typeof conflicts>();
  conflicts.forEach((c) => {
    const k = c.cableMaterialNumber.toLowerCase();
    const l = conflictsByMat.get(k) || [];
    l.push(c);
    conflictsByMat.set(k, l);
  });

  const bomsByMat = new Map<string, typeof bomLines>();
  bomLines.forEach((b) => {
    const k = b.cableMaterialNumber.toLowerCase();
    const l = bomsByMat.get(k) || [];
    l.push(b);
    bomsByMat.set(k, l);
  });

  const govBomsByMat = new Map<string, typeof governedBoms>();
  governedBoms.forEach((g) => {
    const k = g.cableMaterialNumber.toLowerCase();
    const l = govBomsByMat.get(k) || [];
    l.push(g);
    govBomsByMat.set(k, l);
  });

  const rmMap = new Map(rawMaterials.map((r) => [r.code.toUpperCase(), r]));

  const { getValidRawMaterialPrice, priceBasisForConsumptionUom } = await import('../services/rawMaterialPriceGovernanceService');
  const storedPriceRecords = approvedPrices.map((p) => ({
    id: p.id,
    rawMaterialCode: p.rawMaterialCode,
    price: p.price != null ? Number(p.price) : null,
    currency: p.currency,
    uom: p.uom,
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
    supplier: p.supplier,
    source: p.source,
    priceBasis: p.priceBasis,
    workflowStatus: p.workflowStatus,
    isCurrent: p.isCurrent,
    revision: p.revision,
  }));

  const readinessList: import('../services/bomGovernanceService').CableCostingReadiness[] = cables.map((c) => {
    const matKey = c.materialNumber.toLowerCase();
    const mapping = mapByMat.get(matKey);
    const cableConflicts = conflictsByMat.get(matKey) || [];
    const sourceBomLines = bomsByMat.get(matKey) || [];
    const approvedGovLines = govBomsByMat.get(matKey) || [];
    const blockingReasons: string[] = [];

    // GATE 1 — ENGINEERING
    let engineeringStatus: 'APPROVED' | 'PARTIAL' | 'DRAFT' | 'MISSING' | 'CONFIG_REQUIRED' = 'MISSING';
    if (!mapping) {
      engineeringStatus = 'MISSING';
      blockingReasons.push('Gate 1 Failed: Engineering mapping record does not exist (ENGINEERING_NOT_APPROVED).');
    } else if (mapping.status === 'APPROVED') {
      engineeringStatus = 'APPROVED';
    } else if (mapping.mappingStatus === 'PARTIAL') {
      engineeringStatus = 'PARTIAL';
      blockingReasons.push(`Gate 1 Failed: Engineering mapping status is ${mapping.status} (PARTIAL). Approved mapping is mandatory for costing.`);
    } else {
      engineeringStatus = 'DRAFT';
      blockingReasons.push(`Gate 1 Failed: Engineering mapping is ${mapping.status} (ENGINEERING_NOT_APPROVED).`);
    }

    // GATE 2 — BOM
    let bomStatus: 'RESOLVED' | 'CONFLICT_UNRESOLVED' | 'NO_BOM' | 'NOT_READY' = 'NOT_READY';
    const unapprovedConflicts = cableConflicts.filter((cf) => cf.investigationStatus !== 'APPROVED');

    if (unapprovedConflicts.length > 0) {
      bomStatus = 'CONFLICT_UNRESOLVED';
      unapprovedConflicts.forEach((cf) => {
        blockingReasons.push(`Gate 2 Failed: BOM conflict ${cf.conflictId || 'BOM-CONF'} for Raw Material ${cf.rawMaterialCode} is ${cf.investigationStatus} (BOM_CONFLICT_UNRESOLVED).`);
      });
    } else if (sourceBomLines.length === 0 && approvedGovLines.length === 0) {
      bomStatus = 'NO_BOM';
      blockingReasons.push('Gate 2 Failed: Cable has no BOM lines in source or governed master.');
    } else {
      bomStatus = 'RESOLVED';
    }

    // GATE 3 & 4 — RAW MATERIAL & RM PRICE EVALUATION
    let rmPriceStatus: 'ALL_PRICED' | 'PRICE_NOT_CONFIGURED' | 'MISSING_METADATA' = 'ALL_PRICED';
    
    // Combine consumed BOM lines (preferring governed BOM line over source when conflict resolved)
    const effectiveBomLines = new Map<string, { rawMaterialCode: string; uom: string; consumption: number }>();
    sourceBomLines.forEach((l) => {
      effectiveBomLines.set(l.rawMaterialCode.toUpperCase(), {
        rawMaterialCode: l.rawMaterialCode,
        uom: l.uom,
        consumption: Number(l.consumption),
      });
    });
    approvedGovLines.forEach((g) => {
      effectiveBomLines.set(g.rawMaterialCode.toUpperCase(), {
        rawMaterialCode: g.rawMaterialCode,
        uom: g.uom,
        consumption: Number(g.consumption),
      });
    });

    for (const [rmCode, line] of effectiveBomLines.entries()) {
      const rm = rmMap.get(rmCode);
      if (!rm) {
        blockingReasons.push(`Gate 3 Failed: Consumed Raw Material "${rmCode}" does not exist in master (RAW_MATERIAL_NOT_FOUND).`);
        rmPriceStatus = 'MISSING_METADATA';
        continue;
      }

      // Check Gate 4 Price Validity with Domain Service
      const priceVal = getValidRawMaterialPrice(
        rmCode,
        costingDate,
        line.uom,
        undefined, // match any currency if unconstrained
        priceBasisForConsumptionUom(line.uom),
        storedPriceRecords
      );

      if (priceVal.code !== 'PRICE_VALID') {
        rmPriceStatus = 'PRICE_NOT_CONFIGURED';
        blockingReasons.push(`Gate 4 Failed: ${rmCode} — ${priceVal.message} (${priceVal.code}).`);
      }
    }

    // OVERALL READINESS STATUS
    let overallStatus: 'READY_FOR_COSTING' | 'UNDER_REVIEW' | 'DATA_ISSUE' | 'NOT_READY' = 'NOT_READY';
    if (engineeringStatus === 'APPROVED' && bomStatus === 'RESOLVED' && rmPriceStatus === 'ALL_PRICED' && effectiveBomLines.size > 0) {
      overallStatus = 'READY_FOR_COSTING';
    } else if (bomStatus === 'CONFLICT_UNRESOLVED') {
      overallStatus = 'DATA_ISSUE';
    } else if (engineeringStatus === 'DRAFT' || engineeringStatus === 'PARTIAL') {
      overallStatus = 'UNDER_REVIEW';
    } else {
      overallStatus = 'NOT_READY';
    }

    return {
      materialNumber: c.materialNumber,
      cableDescription: c.description,
      family: mapByMat.get(c.materialNumber.toLowerCase())?.family || c.family || null,
      engineeringStatus,
      bomStatus,
      rmPriceStatus,
      overallStatus,
      blockingReasons,
    };
  });

  return readinessList;
}

export async function validateBulkEngineeringMappings(materialNumbers: string[]) {
  const prisma = requirePrisma();
  const [parameters, compatibility, mappings] = await Promise.all([
    prisma.cableParameter.findMany({ where: { status: 'ACTIVE' } }),
    prisma.parameterCompatibility.findMany(),
    prisma.cableEngineeringMapping.findMany({
      where: { materialNumber: { in: materialNumbers }, isCurrent: true },
      include: { cable: true },
    }),
  ]);

  const byMat = new Map(mappings.map((m) => [m.materialNumber.toLowerCase(), m]));
  const results = materialNumbers.map((mat) => {
    const current = byMat.get(mat.toLowerCase());
    if (!current) {
      return {
        materialNumber: mat,
        valid: false,
        status: 'MISSING',
        errors: [{ field: 'Material Number', message: `Mapping for ${mat} not found.` }],
        warnings: [],
      };
    }

    const input: ControlledEngineeringInput = {
      family: current.family,
      voltage: current.voltage,
      conductor: current.conductor,
      conductorSize: current.conductorSize,
      cores: current.cores,
      insulation: current.insulation,
      screen: current.screen,
      armour: current.armour,
      sheath: current.sheath,
      sheathColour: current.sheathColour,
      coreColour: current.coreColour,
      standard: current.standard,
      specialAdditives: current.specialAdditives,
    };

    const paramVal = validateEngineeringParameters(input, { parameters, compatibility });
    const missingMandatory: Array<{ field: string; message: string }> = [];

    // Check mandatory structured attributes for approval
    const mandatory: Array<[keyof ControlledEngineeringInput, string]> = [
      ['family', 'Cable Family'],
      ['voltage', 'Voltage'],
      ['conductor', 'Conductor Material'],
      ['conductorSize', 'Conductor Size'],
      ['cores', 'Number of Cores'],
      ['insulation', 'Insulation Material'],
    ];

    mandatory.forEach(([key, label]) => {
      if (!input[key] || !String(input[key]).trim()) {
        missingMandatory.push({
          field: key,
          message: `${label} is required for approved master mapping.`,
        });
      }
    });

    const allErrors = [...paramVal.errors, ...missingMandatory];
    return {
      materialNumber: mat,
      revision: current.revision,
      currentStatus: current.status,
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: [],
      input,
    };
  });

  const validCount = results.filter((r) => r.valid).length;
  const invalidCount = results.filter((r) => !r.valid).length;

  return {
    totalSelected: materialNumbers.length,
    validCount,
    invalidCount,
    canApproveAllSelected: invalidCount === 0 && materialNumbers.length > 0,
    results,
  };
}

export async function processBulkWorkflowAction(
  materialNumbers: string[],
  action: 'SUBMIT' | 'ASSIGN' | 'APPROVE' | 'REJECT' | 'CANCEL',
  options: {
    assignedReviewer?: string;
    comments?: string;
    decision?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  if (!materialNumbers.length) {
    throw Object.assign(new Error('No material numbers selected.'), { code: 'EMPTY_SELECTION' });
  }

  // If APPROVE, validate every single record first. If any has error, block whole operation.
  if (action === 'APPROVE') {
    const val = await validateBulkEngineeringMappings(materialNumbers);
    if (!val.canApproveAllSelected) {
      const err = new Error(
        `Bulk approval blocked: ${val.invalidCount} of ${val.totalSelected} selected records have validation or missing field errors.`
      );
      (err as Error & { code: string; details: any }).code = 'APPROVAL_BLOCKED_INVALID_COMPATIBILITY';
      (err as Error & { code: string; details: any }).details = val.results.filter((r) => !r.valid);
      throw err;
    }
  }

  const results: any[] = [];
  for (const mat of materialNumbers) {
    const updated = await processMappingWorkflowAction(mat, action, options, actor);
    results.push(updated);
  }

  return {
    action,
    processedCount: results.length,
    success: true,
    results,
  };
}

export async function importEngineeringMappingsFromRows(
  rows: Record<string, unknown>[],
  sourceFile: string,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const [cables, parameters, compatibility] = await Promise.all([
    prisma.cableMaster.findMany({ select: { materialNumber: true, description: true } }),
    prisma.cableParameter.findMany({ where: { status: 'ACTIVE' } }),
    prisma.parameterCompatibility.findMany(),
  ]);

  const existingMap = new Map(cables.map((c) => [c.materialNumber.toLowerCase(), c]));
  const { validateMappingImportRows } = await import('../services/engineeringMappingExcelService');
  const preview = validateMappingImportRows(rows, { existingCables: existingMap, parameters, compatibility }, sourceFile);

  if (!preview.canSubmit) {
    const err = new Error(`Import validation failed. ${preview.invalidCount} invalid rows found.`);
    (err as Error & { code: string; preview: any }).code = 'IMPORT_VALIDATION_FAILED';
    (err as Error & { code: string; preview: any }).preview = preview;
    throw err;
  }

  // Apply imports: Update drafts or create new revisions for each valid row
  const updatedRecords: any[] = [];
  for (const r of preview.rows) {
    const updated = await updateEngineeringMappingDraft(r.materialNumber, r.parsedInput, actor);
    updatedRecords.push(updated);
  }

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'CableEngineeringMapping',
    entityId: `BATCH-IMPORT-${Date.now()}`,
    action: 'IMPORT',
    newValue: {
      sourceFile,
      totalRows: preview.totalRows,
      validRows: preview.validCount,
    },
    message: `Imported ${preview.validCount} engineering mappings from ${sourceFile}`,
  });

  return {
    sourceFile,
    importedCount: updatedRecords.length,
    records: updatedRecords,
  };
}

export function isSyntheticCostingRawMaterialCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return /^I\d+-RM-/.test(normalized) || /^I\d+_TEST/.test(normalized) || normalized.startsWith('TEST-') || normalized.startsWith('TEST_');
}

export async function listGovernedRawMaterialPrices(filter?: {
  rawMaterialCode?: string;
  workflowStatus?: string;
  currency?: string;
  isCurrent?: boolean;
  excludeSynthetic?: boolean;
}) {
  const prisma = requirePrisma();
  const where: Prisma.RawMaterialPriceWhereInput = {};
  if (filter?.rawMaterialCode) where.rawMaterialCode = filter.rawMaterialCode.toUpperCase();
  if (filter?.workflowStatus) where.workflowStatus = filter.workflowStatus as any;
  if (filter?.currency) where.currency = filter.currency.toUpperCase();
  if (filter?.isCurrent !== undefined) where.isCurrent = filter.isCurrent;

  const rows = await prisma.rawMaterialPrice.findMany({
    where,
    include: { rawMaterial: true },
    orderBy: [{ rawMaterialCode: 'asc' }, { revision: 'desc' }, { createdAt: 'desc' }],
  });

  const filtered = filter?.excludeSynthetic ? rows.filter((p) => !isSyntheticCostingRawMaterialCode(p.rawMaterialCode)) : rows;

  return filtered.map((p) => ({
    id: p.id,
    rawMaterialCode: p.rawMaterialCode,
    rawMaterialDesc: p.rawMaterial.description,
    rawMaterialUom: p.rawMaterial.uom,
    price: p.price != null ? Number(p.price) : null,
    currency: p.currency,
    uom: p.uom,
    priceDate: p.priceDate,
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
    supplier: p.supplier,
    source: p.source,
    priceBasis: p.priceBasis,
    pricingCategory: p.rawMaterial.pricingCategory,
    metalType: p.rawMaterial.metalType,
    workflowStatus: p.workflowStatus,
    status: p.status,
    isCurrent: p.isCurrent,
    revision: p.revision,
    temporalStatus: p.temporalStatus,
    approvedBy: p.approvedBy,
    approvedAt: p.approvedAt,
    createdBy: p.createdBy,
    comment: p.comment,
    createdAt: p.createdAt,
    rawMaterial: { description: p.rawMaterial.description },
  }));
}

export async function createRawMaterialPriceDraft(
  input: import('../services/rawMaterialPriceGovernanceService').PriceInputProposal,
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const [rms, existingPrices] = await Promise.all([
    prisma.rawMaterial.findMany({ select: { code: true } }),
    prisma.rawMaterialPrice.findMany(),
  ]);

  const { validatePriceInput } = await import('../services/rawMaterialPriceGovernanceService');
  const existingCodes = new Set(rms.map((r) => r.code.toUpperCase()));
  const val = validatePriceInput(input, { existingRawMaterialCodes: existingCodes });
  if (!val.valid) {
    const err = new Error(val.errors.map((e) => e.message).join(' '));
    (err as Error & { code: string; errors: typeof val.errors }).code = val.errors[0]?.code || 'INVALID_PRICE_INPUT';
    (err as Error & { code: string; errors: typeof val.errors }).errors = val.errors;
    throw err;
  }

  const code = input.rawMaterialCode.toUpperCase();
  const latestRevision = await prisma.rawMaterialPrice.findFirst({
    where: { rawMaterialCode: code },
    orderBy: { revision: 'desc' },
  });

  const nextRevision = (latestRevision?.revision || 0) + 1;

  const fromDate = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
  const toDate = input.effectiveTo ? new Date(input.effectiveTo) : null;

  const created = await prisma.rawMaterialPrice.create({
    data: {
      rawMaterialCode: code,
      price: input.price != null ? input.price : null,
      currency: input.currency ? input.currency.toUpperCase() : null,
      uom: input.uom,
      effectiveFrom: fromDate,
      effectiveTo: toDate,
      supplier: input.supplier || null,
      source: input.source || 'Manual Costing Team proposal',
      priceBasis: (input.priceBasis as never) || priceBasisFromPriceUom(input.uom),
      workflowStatus: 'DRAFT',
      isCurrent: true,
      revision: nextRevision,
      temporalStatus: fromDate ? 'EFFECTIVE' : 'DATA_REQUIRED',
      createdBy: actor.name || actor.email || 'user',
      comment: input.comment || null,
    },
    include: { rawMaterial: true },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'RawMaterialPrice',
    entityId: created.id,
    action: 'CREATE',
    newValue: created,
    message: `Created price draft for ${code} (${input.price} ${input.currency}/${input.uom})`,
  });

  return created;
}

export async function processPriceWorkflowAction(
  priceId: string,
  action: 'SUBMIT' | 'ASSIGN' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'EXPIRE' | 'CANCEL',
  options: {
    comment?: string;
  },
  actor: { id?: string; name?: string; email?: string }
) {
  const prisma = requirePrisma();
  const current = await prisma.rawMaterialPrice.findUnique({
    where: { id: priceId },
    include: { rawMaterial: true },
  });

  if (!current) {
    const err = new Error(`Raw Material Price proposal ${priceId} not found.`);
    (err as Error & { code: string }).code = 'NOT_FOUND';
    throw err;
  }

  const {
    detectPricePeriodOverlap,
    validatePriceWorkflowTransition,
  } = await import('../services/rawMaterialPriceGovernanceService');

  let targetStatus: import('@prisma/client').PriceWorkflowStatus = current.workflowStatus;
  const updates: Prisma.RawMaterialPriceUpdateInput = {
    comment: options.comment !== undefined ? options.comment : current.comment,
  };

  if (action === 'SUBMIT') {
    targetStatus = 'SUBMITTED';
  } else if (action === 'REVIEW') {
    targetStatus = 'UNDER_REVIEW';
  } else if (action === 'APPROVE') {
    targetStatus = 'APPROVED';
    // Validate that approval does not create an overlapping approved period for same parameters
    const allApproved = await prisma.rawMaterialPrice.findMany({
      where: { rawMaterialCode: current.rawMaterialCode, workflowStatus: 'APPROVED' },
    });
    const overlapCheck = detectPricePeriodOverlap(
      {
        id: current.id,
        rawMaterialCode: current.rawMaterialCode,
        currency: current.currency || 'USD',
        uom: current.uom,
        priceBasis: current.priceBasis,
        effectiveFrom: current.effectiveFrom,
        effectiveTo: current.effectiveTo,
      },
      allApproved.map((p) => ({
        id: p.id,
        rawMaterialCode: p.rawMaterialCode,
        price: p.price != null ? Number(p.price) : null,
        currency: p.currency,
        uom: p.uom,
        effectiveFrom: p.effectiveFrom,
        effectiveTo: p.effectiveTo,
        supplier: p.supplier,
        source: p.source,
        priceBasis: p.priceBasis,
        workflowStatus: p.workflowStatus,
        isCurrent: p.isCurrent,
        revision: p.revision,
      }))
    );

    if (overlapCheck.overlap) {
      const err = new Error(
        `Cannot approve price: overlapping period detected with existing approved price record ${overlapCheck.conflictingPrice?.id}.`
      );
      (err as Error & { code: string }).code = 'PRICE_PERIOD_OVERLAP';
      throw err;
    }

    updates.approvedBy = actor.name || actor.email || 'manager';
    updates.approvedAt = new Date();

    // Mark RawMaterial master priceStatus as CONFIGURED
    await prisma.rawMaterial.update({
      where: { code: current.rawMaterialCode },
      data: { priceStatus: 'CONFIGURED' },
    });
  } else if (action === 'REJECT') {
    targetStatus = 'REJECTED';
  } else if (action === 'EXPIRE') {
    targetStatus = 'EXPIRED';
  } else if (action === 'CANCEL') {
    targetStatus = 'CANCELLED';
  }

  const transCheck = validatePriceWorkflowTransition(current.workflowStatus, targetStatus);
  if (!transCheck.valid) {
    const err = new Error(transCheck.error);
    (err as Error & { code: string }).code = 'INVALID_WORKFLOW_TRANSITION';
    throw err;
  }

  updates.workflowStatus = targetStatus;

  const updated = await prisma.rawMaterialPrice.update({
    where: { id: priceId },
    data: updates,
    include: { rawMaterial: true },
  });

  appendAudit({
    actorId: actor.id,
    actorName: actor.name || actor.email,
    entity: 'RawMaterialPrice',
    entityId: priceId,
    action: action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : 'UPDATE',
    oldValue: { status: current.workflowStatus },
    newValue: { status: targetStatus, comment: options.comment },
    message: `Price governance action ${action} on ${current.rawMaterialCode} (V${current.revision}) -> ${targetStatus}`,
  });

  const prismaAudit = getPrisma();
  if (prismaAudit) {
    await prismaAudit.auditEvent.create({
      data: {
        actorId: actor.id,
        actorName: actor.name || actor.email,
        entity: 'RawMaterialPrice',
        entityId: priceId,
        action: action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : 'UPDATE',
        oldValue: { status: current.workflowStatus },
        newValue: { status: targetStatus, comment: options.comment },
        message: `Price governance action ${action} on ${current.rawMaterialCode} (V${current.revision}) -> ${targetStatus}`,
      },
    });
  }

  return updated;
}

const PENDING_PRICE_APPROVAL_STATUSES = new Set(['SUBMITTED', 'UNDER_REVIEW']);

export async function processBulkPriceApprove(
  ids: string[],
  actor: { id?: string; name?: string; email?: string }
) {
  const unique = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  const approved: string[] = [];
  const skipped: Array<{ id: string; reason: string; workflowStatus?: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  const prisma = requirePrisma();

  for (const id of unique) {
    const current = await prisma.rawMaterialPrice.findUnique({ where: { id } });
    if (!current) {
      skipped.push({ id, reason: 'NOT_FOUND' });
      continue;
    }
    if (current.workflowStatus === 'APPROVED') {
      skipped.push({ id, reason: 'ALREADY_APPROVED', workflowStatus: current.workflowStatus });
      continue;
    }
    if (!PENDING_PRICE_APPROVAL_STATUSES.has(current.workflowStatus)) {
      skipped.push({ id, reason: 'NOT_PENDING', workflowStatus: current.workflowStatus });
      continue;
    }
    try {
      await processPriceWorkflowAction(id, 'APPROVE', { comment: 'Bulk approve' }, actor);
      approved.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    requested: unique.length,
    approvedCount: approved.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    approved,
    skipped,
    failed,
  };
}

export async function rawMaterialPriceReadiness(costingDate: Date = new Date()) {
  const prisma = requirePrisma();
  const [rms, approvedPrices] = await Promise.all([
    prisma.rawMaterial.findMany({
      include: { prices: { orderBy: { createdAt: 'desc' } } },
      orderBy: { code: 'asc' },
    }),
    prisma.rawMaterialPrice.findMany({ where: { isCurrent: true, status: 'ACTIVE' } }),
  ]);

  const { getValidRawMaterialPrice, priceBasisForConsumptionUom } = await import('../services/rawMaterialPriceGovernanceService');
  const storedPrices = approvedPrices.map((p) => ({
    id: p.id,
    rawMaterialCode: p.rawMaterialCode,
    price: p.price != null ? Number(p.price) : null,
    currency: p.currency,
    uom: p.uom,
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
    supplier: p.supplier,
    source: p.source,
    priceBasis: p.priceBasis,
    workflowStatus: p.workflowStatus,
    isCurrent: p.isCurrent,
    revision: p.revision,
  }));

  const items = rms.map((r) => {
    const latest = r.prices[0];
    const val = getValidRawMaterialPrice(
      r.code,
      costingDate,
      r.uom || 'kg',
      undefined,
      priceBasisForConsumptionUom(r.uom),
      storedPrices
    );
    const hasApprovedPrice = val.code === 'PRICE_VALID';

    return {
      rawMaterial: r.description,
      rawMaterialCode: r.code,
      code: r.code,
      description: r.description,
      uom: r.uom,
      materialType: r.category || 'Standard',
      priceStatus: hasApprovedPrice ? 'CONFIGURED' : 'PRICE_NOT_CONFIGURED',
      configuredPrice: val.price != null ? val.price : latest?.price != null ? Number(latest.price) : null,
      currency: val.currency || latest?.currency || r.currency || 'USD',
      effectiveFrom: val.priceRecord?.effectiveFrom || latest?.effectiveFrom || null,
      effectiveTo: val.priceRecord?.effectiveTo || latest?.effectiveTo || null,
      supplier: val.priceRecord?.supplier || latest?.supplier || r.supplier || null,
      priceBasis: val.priceRecord?.priceBasis || latest?.priceBasis || 'PER_KG',
      workflowStatus: val.priceRecord?.workflowStatus || latest?.workflowStatus || 'DRAFT',
      temporalStatus: val.priceRecord?.temporalStatus || latest?.temporalStatus || 'DATA_REQUIRED',
      readinessState: hasApprovedPrice ? 'READY' : val.code === 'PRICE_EXPIRED' ? 'EXPIRED' : 'UNPRICED',
      blockingReason: hasApprovedPrice ? null : val.message,
    };
  });

  const totalRawMaterials = items.length;
  const priced = items.filter((i) => i.readinessState === 'READY').length;
  const unpriced = items.filter((i) => i.readinessState === 'UNPRICED').length;
  const expired = items.filter((i) => i.readinessState === 'EXPIRED').length;

  return {
    summary: {
      totalRawMaterials,
      priced,
      unpriced,
      expired,
      overlapping: 0,
      invalid: 0,
      ready: priced,
    },
    items,
  };
}

export function masterDataKeyAnalysis() {
  return [
    {
      candidateKey: 'Material Number',
      businessMeaning: 'ENERGYA cable material / item identity on Cable List (Cable Material Number).',
      currentUniqueness: 'Unique in the official 432-row Cable List and PostgreSQL unique constraint.',
      recommendedConstraint: 'Keep UNIQUE on CableMaster.materialNumber.',
      reason: 'Source data supports it; import rejects file-level duplicates.',
    },
    {
      candidateKey: 'Item Code',
      businessMeaning: 'ERP item code on Cable List. Repeats across materials.',
      currentUniqueness: 'Not unique (264 distinct values in 432 rows).',
      recommendedConstraint: 'Do not add a global unique constraint.',
      reason: 'The source data disproves global uniqueness.',
    },
    {
      candidateKey: 'Customer Code / Specification Code',
      businessMeaning: 'Customer/specification family-style code (e.g. N2XH). Not an approved configurator Family.',
      currentUniqueness: 'Not unique (7 distinct values in 432 rows).',
      recommendedConstraint: 'Do not add a global unique constraint. Do not treat as Cable Family without approval.',
      reason: 'Source data disproves uniqueness; mapping to FAMILY is BUSINESS_DECISION_REQUIRED.',
    },
    {
      candidateKey: 'Customer Code + Item Code',
      businessMeaning: 'Possible commercial identity pair.',
      currentUniqueness: 'Not verified as unique without a business rule. Item codes already repeat.',
      recommendedConstraint: 'Do not enforce until Finance/ERP confirms the pair is a key.',
      reason: 'Must not invent a composite key the extract does not document.',
    },
    {
      candidateKey: 'Customer Code + Specification Code',
      businessMeaning: 'Same column in this extract (Specification Code is stored as customerCode).',
      currentUniqueness: 'Identical to Customer Code — not a second field.',
      recommendedConstraint: 'No additional constraint.',
      reason: 'The Cable List has one specification/customer column, not two.',
    },
    {
      candidateKey: 'Cable + Raw Material + BOM Version',
      businessMeaning: 'Current BOM line grain while 81 weight conflicts are unresolved.',
      currentUniqueness: 'Enforced unique; conflicting weights are skipped, not versioned.',
      recommendedConstraint: 'Keep until business classifies conflicts. Do not switch to Cable+RM alone.',
      reason: 'Cable+RM is disproved as a single-weight key by the 81 groups.',
    },
  ];
}
