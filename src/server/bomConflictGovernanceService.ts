/**
 * Task 04B-13 — Cable BOM conflict governance (classification + disposition).
 * Does NOT delete, dedupe, merge, or auto-resolve conflicts to game gates.
 */
import type { BomDuplicateObservation, BomInvestigationStatus } from '@prisma/client';
import { getPrisma } from './db';

/** Lettered taxonomy A–L (Task 04B-13 spec). */
export const BOM_GOVERNANCE_CLASSIFICATION_LETTERS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
] as const;

export type BomGovernanceClassificationLetter = (typeof BOM_GOVERNANCE_CLASSIFICATION_LETTERS)[number];

export const BOM_GOVERNANCE_CLASSIFICATIONS = {
  A: 'TRUE_DUPLICATE',
  B: 'REVISION_CONFLICT',
  C: 'QUANTITY_CONSUMPTION_CONFLICT',
  D: 'PLANT_VARIATION',
  E: 'MANUFACTURING_ROUTE',
  F: 'EFFECTIVE_DATE_CONFLICT',
  G: 'ALTERNATIVE_CONSUMPTION_BASIS',
  H: 'SOURCE_DATA_ERROR',
  I: 'SCRAP_COMPONENT_AMBIGUITY',
  J: 'UOM_AMBIGUITY',
  K: 'INSUFFICIENT_INFORMATION',
  L: 'UNRESOLVED',
} as const satisfies Record<BomGovernanceClassificationLetter, string>;

export type BomGovernanceClassification =
  (typeof BOM_GOVERNANCE_CLASSIFICATIONS)[BomGovernanceClassificationLetter];

export const BOM_GOVERNANCE_DISPOSITIONS = [
  'AUTO_RESOLVE_SAFE',
  'ENGINEERING_REVIEW_REQUIRED',
  'PRESERVE_AS_VALID_VARIANT',
  'RETIRE_OBSOLETE',
  'BLOCK',
] as const;

export type BomGovernanceDisposition = (typeof BOM_GOVERNANCE_DISPOSITIONS)[number];

export const OFFICIAL_BOM_CONFLICT_ID_PREFIX = 'BOM-CONF-';
export const EXPECTED_OFFICIAL_CONFLICT_COUNT = 81;
export const GOVERNANCE_REGISTER_VERSION = '04B-13.1';

export interface BomConflictInventoryRow {
  conflictId: string;
  cableMaterialNumber: string;
  cableDescription: string | null;
  customerCode: string | null;
  rawMaterialCode: string;
  rawMaterialDesc: string | null;
  weightA: number;
  weightB: number;
  weightDelta: number;
  relativeDelta: number | null;
  uom: string;
  occurrenceCount: number;
  sourceFile: string | null;
  sourceWorksheet: string | null;
  sourceRows: unknown;
  sourceBatch: string | null;
  investigationStatus: BomInvestigationStatus;
  workflowClassification: string;
  sourceCableBomLineCount: number;
  governedBomLineCount: number;
  costingImpact: 'BLOCKED_UNTIL_RESOLVED' | 'GOVERNED_OVERRIDE_POSSIBLE' | 'NO_SOURCE_LINE';
  classificationLetter: BomGovernanceClassificationLetter;
  classification: BomGovernanceClassification;
  classificationReason: string;
  disposition: BomGovernanceDisposition;
  dispositionReason: string;
  assessedAt: string;
}

export interface BomConflictGovernanceRegister {
  version: string;
  generatedAt: string;
  generatedBy: string;
  totalConflicts: number;
  officialConflictIdPrefix: string;
  cableBomAuthority: 'POSTGRESQL_PRIMARY';
  cutoverOutcome: 'OUTCOME_B_ENGINEERING_REVIEW';
  classificationCounts: Record<BomGovernanceClassification, number>;
  dispositionCounts: Record<BomGovernanceDisposition, number>;
  investigationStatusCounts: Record<string, number>;
  rawMaterialBreakdown: Record<string, number>;
  recordsDeleted: number;
  recordsMerged: number;
  conflicts: BomConflictInventoryRow[];
}

function requirePrisma() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured or not reachable.');
  return prisma;
}

function relativeWeightDelta(a: number, b: number): number | null {
  const min = Math.min(a, b);
  if (min <= 0) return null;
  return Math.abs(a - b) / min;
}

/** Evidence-based classification — does not mutate DB or resolve conflicts. */
export function classifyBomConflictEvidence(input: {
  weightA: number;
  weightB: number;
  rawMaterialCode: string;
  uom: string;
  occurrenceCount: number;
  workflowClassification?: string | null;
  plant?: string | null;
  bomVersion?: number | null;
  manufacturingRoute?: string | null;
  effectiveFrom?: Date | null;
  sourceCableBomLineCount: number;
  investigationStatus?: BomInvestigationStatus;
}): {
  classification: BomGovernanceClassification;
  classificationLetter: BomGovernanceClassificationLetter;
  reason: string;
} {
  const rel = relativeWeightDelta(input.weightA, input.weightB);
  const rm = input.rawMaterialCode.toUpperCase();

  if (input.plant && input.workflowClassification === 'DIFFERENT_PLANT') {
    return {
      classification: 'PLANT_VARIATION',
      classificationLetter: 'D',
      reason: 'Workflow evidence cites distinct plant; weights require governed plant-specific BOM lines.',
    };
  }

  if (input.bomVersion != null && input.bomVersion > 1 && input.workflowClassification === 'DIFFERENT_BOM_VERSION') {
    return {
      classification: 'REVISION_CONFLICT',
      classificationLetter: 'B',
      reason: 'Explicit BOM version dimension supplied in governance workflow.',
    };
  }

  if (input.manufacturingRoute && input.workflowClassification === 'DIFFERENT_ROUTE') {
    return {
      classification: 'MANUFACTURING_ROUTE',
      classificationLetter: 'E',
      reason: 'Manufacturing route evidence supplied in governance workflow.',
    };
  }

  if (input.effectiveFrom && input.workflowClassification === 'EFFECTIVE_DATE_DIFFERENCE') {
    return {
      classification: 'EFFECTIVE_DATE_CONFLICT',
      classificationLetter: 'F',
      reason: 'Effective date evidence supplied in governance workflow.',
    };
  }

  if (rel != null && rel < 0.005) {
    return {
      classification: 'TRUE_DUPLICATE',
      classificationLetter: 'A',
      reason: 'Weights differ by less than 0.5%; likely spreadsheet duplication without dimensional context.',
    };
  }

  if (input.uom && input.uom.toUpperCase() !== 'KG' && rel != null && rel > 0.2) {
    return {
      classification: 'UOM_AMBIGUITY',
      classificationLetter: 'J',
      reason: 'Non-kg UOM with materially different weights — verify consumption basis before costing.',
    };
  }

  if (rm === 'HB02' || rm === 'AR01' || rm === 'SC01') {
    if (rel != null && rel >= 0.05) {
      return {
        classification: 'QUANTITY_CONSUMPTION_CONFLICT',
        classificationLetter: 'C',
        reason: `Systematic ${rm} weight spread in official extract (${input.weightA} vs ${input.weightB}); no version/plant/date columns in source.`,
      };
    }
    if (rel != null && rel < 0.05) {
      return {
        classification: 'ALTERNATIVE_CONSUMPTION_BASIS',
        classificationLetter: 'G',
        reason: `Small ${rm} delta (<5%) — may reflect rounding or alternate consumption basis; engineering confirmation required.`,
      };
    }
  }

  if (input.sourceCableBomLineCount === 0 && input.occurrenceCount >= 2) {
    return {
      classification: 'INSUFFICIENT_INFORMATION',
      classificationLetter: 'K',
      reason:
        'Conflicting weights preserved only in BomDuplicateObservation; source CableBomLine rows were skipped on import — dimensional context missing from workbook.',
    };
  }

  return {
    classification: 'UNRESOLVED',
    classificationLetter: 'L',
    reason: 'Insufficient independent evidence to classify beyond preserving both weights for Technical Office review.',
  };
}

/** Disposition rules — advisory only; no automatic DB resolution. */
export function dispositionForBomClassification(input: {
  classification: BomGovernanceClassification;
  relativeDelta: number | null;
  investigationStatus: BomInvestigationStatus;
  occurrenceCount: number;
}): { disposition: BomGovernanceDisposition; reason: string } {
  if (input.investigationStatus === 'APPROVED') {
    return {
      disposition: 'ENGINEERING_REVIEW_REQUIRED',
      reason: 'Already approved via governed workflow — disposition recorded for audit trail only.',
    };
  }

  switch (input.classification) {
    case 'TRUE_DUPLICATE':
      if (input.relativeDelta != null && input.relativeDelta < 0.005 && input.occurrenceCount === 2) {
        return {
          disposition: 'AUTO_RESOLVE_SAFE',
          reason:
            'Candidate for safe auto-resolution after TO sign-off — NOT auto-applied in 04B-13 (no gate gaming).',
        };
      }
      return {
        disposition: 'ENGINEERING_REVIEW_REQUIRED',
        reason: 'Near-duplicate weights still require explicit governed weight selection.',
      };
    case 'QUANTITY_CONSUMPTION_CONFLICT':
      return {
        disposition: 'ENGINEERING_REVIEW_REQUIRED',
        reason:
          'Materially different consumptions for the same cable+RM pair — Technical Office must document basis and approve governed weight.',
      };
    case 'ALTERNATIVE_CONSUMPTION_BASIS':
      return {
        disposition: 'PRESERVE_AS_VALID_VARIANT',
        reason: 'Small delta may reflect alternate valid consumption basis — preserve both source rows until governed decision.',
      };
    case 'PLANT_VARIATION':
    case 'MANUFACTURING_ROUTE':
    case 'REVISION_CONFLICT':
    case 'EFFECTIVE_DATE_CONFLICT':
      return {
        disposition: 'ENGINEERING_REVIEW_REQUIRED',
        reason: 'Dimensional evidence partially captured — manager approval required before GovernedBomLine.',
      };
    case 'SOURCE_DATA_ERROR':
      return {
        disposition: 'RETIRE_OBSOLETE',
        reason: 'One weight likely obsolete after source error confirmation — retire via governance, never silent delete.',
      };
    case 'INSUFFICIENT_INFORMATION':
    case 'UNRESOLVED':
    case 'UOM_AMBIGUITY':
    case 'SCRAP_COMPONENT_AMBIGUITY':
      return {
        disposition: 'BLOCK',
        reason: 'Costing Gate 2 remains blocked until Technical Office resolves and approves governed consumption.',
      };
    default:
      return {
        disposition: 'BLOCK',
        reason: 'Default safe disposition — engineering review mandatory.',
      };
  }
}

function mapObservationToInventoryRow(
  obs: BomDuplicateObservation,
  sourceCableBomLineCount: number,
  governedBomLineCount: number,
  assessedAt: string
): BomConflictInventoryRow {
  const weightA = Number(obs.weightA);
  const weightB = Number(obs.weightB);
  const relativeDelta = relativeWeightDelta(weightA, weightB);
  const { classification, classificationLetter, reason: classificationReason } = classifyBomConflictEvidence({
    weightA,
    weightB,
    rawMaterialCode: obs.rawMaterialCode,
    uom: obs.uom,
    occurrenceCount: obs.occurrenceCount,
    workflowClassification: obs.classification,
    plant: obs.plant,
    bomVersion: obs.bomVersion,
    manufacturingRoute: obs.manufacturingRoute,
    effectiveFrom: obs.effectiveFrom,
    sourceCableBomLineCount,
    investigationStatus: obs.investigationStatus,
  });
  const { disposition, reason: dispositionReason } = dispositionForBomClassification({
    classification,
    relativeDelta,
    investigationStatus: obs.investigationStatus,
    occurrenceCount: obs.occurrenceCount,
  });

  let costingImpact: BomConflictInventoryRow['costingImpact'] = 'BLOCKED_UNTIL_RESOLVED';
  if (obs.investigationStatus === 'APPROVED') costingImpact = 'GOVERNED_OVERRIDE_POSSIBLE';
  else if (sourceCableBomLineCount === 0) costingImpact = 'NO_SOURCE_LINE';

  return {
    conflictId: obs.conflictId || obs.id,
    cableMaterialNumber: obs.cableMaterialNumber,
    cableDescription: obs.cableDescription,
    customerCode: obs.customerCode,
    rawMaterialCode: obs.rawMaterialCode,
    rawMaterialDesc: obs.rawMaterialDesc,
    weightA,
    weightB,
    weightDelta: Math.abs(weightA - weightB),
    relativeDelta,
    uom: obs.uom,
    occurrenceCount: obs.occurrenceCount,
    sourceFile: obs.sourceFile,
    sourceWorksheet: obs.sourceWorksheet,
    sourceRows: obs.sourceRows,
    sourceBatch: obs.sourceBatch,
    investigationStatus: obs.investigationStatus,
    workflowClassification: obs.classification,
    sourceCableBomLineCount,
    governedBomLineCount,
    costingImpact,
    classificationLetter,
    classification,
    classificationReason,
    disposition,
    dispositionReason,
    assessedAt,
  };
}

export async function buildBomConflictGovernanceRegister(options?: {
  generatedBy?: string;
}): Promise<BomConflictGovernanceRegister> {
  const prisma = requirePrisma();
  const assessedAt = new Date().toISOString();
  const observations = await prisma.bomDuplicateObservation.findMany({
    where: { conflictId: { startsWith: OFFICIAL_BOM_CONFLICT_ID_PREFIX } },
    orderBy: { conflictId: 'asc' },
  });

  const conflicts: BomConflictInventoryRow[] = [];
  for (const obs of observations) {
    const [sourceCableBomLineCount, governedBomLineCount] = await Promise.all([
      prisma.cableBomLine.count({
        where: {
          cableMaterialNumber: obs.cableMaterialNumber,
          rawMaterialCode: obs.rawMaterialCode,
        },
      }),
      prisma.governedBomLine.count({
        where: {
          cableMaterialNumber: obs.cableMaterialNumber,
          rawMaterialCode: obs.rawMaterialCode,
        },
      }),
    ]);
    conflicts.push(mapObservationToInventoryRow(obs, sourceCableBomLineCount, governedBomLineCount, assessedAt));
  }

  const classificationCounts = Object.fromEntries(
    Object.values(BOM_GOVERNANCE_CLASSIFICATIONS).map((c) => [c, 0])
  ) as Record<BomGovernanceClassification, number>;
  const dispositionCounts = Object.fromEntries(BOM_GOVERNANCE_DISPOSITIONS.map((d) => [d, 0])) as Record<
    BomGovernanceDisposition,
    number
  >;
  const investigationStatusCounts: Record<string, number> = {};
  const rawMaterialBreakdown: Record<string, number> = {};

  for (const row of conflicts) {
    classificationCounts[row.classification] += 1;
    dispositionCounts[row.disposition] += 1;
    investigationStatusCounts[row.investigationStatus] = (investigationStatusCounts[row.investigationStatus] || 0) + 1;
    rawMaterialBreakdown[row.rawMaterialCode] = (rawMaterialBreakdown[row.rawMaterialCode] || 0) + 1;
  }

  return {
    version: GOVERNANCE_REGISTER_VERSION,
    generatedAt: assessedAt,
    generatedBy: options?.generatedBy || 'task-04b-13',
    totalConflicts: conflicts.length,
    officialConflictIdPrefix: OFFICIAL_BOM_CONFLICT_ID_PREFIX,
    cableBomAuthority: 'POSTGRESQL_PRIMARY',
    cutoverOutcome: 'OUTCOME_B_ENGINEERING_REVIEW',
    classificationCounts,
    dispositionCounts,
    investigationStatusCounts,
    rawMaterialBreakdown,
    recordsDeleted: 0,
    recordsMerged: 0,
    conflicts,
  };
}

/** Import pipeline guard — conflicts must not be silently removed or mass-resolved. */
export function validateBomImportConflictPreservation(input: {
  existingOfficialConflictCount: number;
  incomingDuplicateGroups: number;
  proposedDeletes: number;
  proposedMassApprovals: number;
  proposedOfficialConflictReduction?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (input.proposedDeletes > 0) {
    errors.push('BOM import must not delete BomDuplicateObservation rows to clear governance debt.');
  }
  if (input.proposedMassApprovals > 0) {
    errors.push('BOM import must not mass-approve unresolved conflicts.');
  }
  if ((input.proposedOfficialConflictReduction ?? 0) > 0) {
    errors.push('BOM import must not reduce the official BomDuplicateObservation register without governance workflow.');
  }
  return { valid: errors.length === 0, errors };
}

export function summarizeGovernanceRegister(register: BomConflictGovernanceRegister) {
  const engineeringReview =
    register.dispositionCounts.ENGINEERING_REVIEW_REQUIRED + register.dispositionCounts.PRESERVE_AS_VALID_VARIANT;
  return {
    totalConflicts: register.totalConflicts,
    classificationCounts: register.classificationCounts,
    dispositionCounts: register.dispositionCounts,
    engineeringReviewRequired: engineeringReview,
    autoResolveSafeCandidates: register.dispositionCounts.AUTO_RESOLVE_SAFE,
    blocked: register.dispositionCounts.BLOCK,
    recordsDeleted: register.recordsDeleted,
    cableBomPromoted: false as const,
    cutoverOutcome: register.cutoverOutcome,
  };
}

export function governanceClassificationFromLetter(letter: string): BomGovernanceClassification | null {
  if (!(letter in BOM_GOVERNANCE_CLASSIFICATIONS)) return null;
  return BOM_GOVERNANCE_CLASSIFICATIONS[letter as BomGovernanceClassificationLetter];
}

export function isOfficialBomConflictId(conflictId: string | null | undefined): boolean {
  return Boolean(conflictId?.startsWith(OFFICIAL_BOM_CONFLICT_ID_PREFIX));
}
