/**
 * Calculation/engineering authority for cables imported from the approved Energya Cable Master.
 * Validated Cable Master + validated BOM + validated BOM lines are sufficient for
 * engineering-for-calculation. A V2 configuration snapshot is optional lineage, not a calc gate.
 */

export const OFFICIAL_CABLE_MASTER_SOURCE_MARKERS = ['energya cable master data'] as const;

export const CABLE_MASTER_APPROVAL_VALIDATED = 'APPROVED';
export const CABLE_MASTER_APPROVAL_IMPORTED = 'IMPORTED';

export function isOfficialEnergyaCableMasterSource(sourceFile?: string | null): boolean {
  const n = String(sourceFile || '').toLowerCase();
  return OFFICIAL_CABLE_MASTER_SOURCE_MARKERS.some((marker) => n.includes(marker));
}

/** Official Energya Cable List identities are numeric material numbers (e.g. 10009492). */
export function isOfficialImportedCableIdentity(materialNumber?: string | null): boolean {
  const n = String(materialNumber || '').trim();
  return /^\d{8,}$/.test(n);
}

export type ImportedCableCalculationEvidence = {
  materialNumber: string | null;
  cableMasterApprovalStatus?: string | null;
  engineeringWorkflowStatus?: string | null;
  bomLineCount: number;
  unresolvedBomConflictCount: number;
};

function mappingIsApproved(status?: string | null): boolean {
  return status === 'APPROVED';
}

function masterIsValidatedForCalculation(evidence: ImportedCableCalculationEvidence): boolean {
  const material = String(evidence.materialNumber || '').trim();
  return (
    evidence.cableMasterApprovalStatus === CABLE_MASTER_APPROVAL_VALIDATED ||
    evidence.cableMasterApprovalStatus === 'APPROVED_MAPPING' ||
    (evidence.cableMasterApprovalStatus === CABLE_MASTER_APPROVAL_IMPORTED &&
      mappingIsApproved(evidence.engineeringWorkflowStatus) &&
      isOfficialImportedCableIdentity(material))
  );
}

export function importedCableSatisfiesCalculationEngineering(
  evidence: ImportedCableCalculationEvidence
): boolean {
  const material = String(evidence.materialNumber || '').trim();
  if (!material) return false;
  if (evidence.unresolvedBomConflictCount > 0) return false;
  if (evidence.bomLineCount <= 0) return false;
  return mappingIsApproved(evidence.engineeringWorkflowStatus) && masterIsValidatedForCalculation(evidence);
}

export type ImportedCableStructuralIssue = {
  code: string;
  message: string;
};

/** Fail-closed structural reasons — never a V2 snapshot substitute. */
export function describeImportedCableCalculationIssues(
  evidence: ImportedCableCalculationEvidence
): ImportedCableStructuralIssue[] {
  const issues: ImportedCableStructuralIssue[] = [];
  const material = String(evidence.materialNumber || '').trim();
  if (!material) {
    return [{ code: 'CABLE_NOT_IDENTIFIED', message: 'cable material number is missing' }];
  }
  if (!masterIsValidatedForCalculation(evidence)) {
    issues.push({
      code: 'CABLE_MASTER_NOT_APPROVED',
      message: `Cable Master approval status is ${evidence.cableMasterApprovalStatus || 'MISSING'} (APPROVED required)`,
    });
  }
  if (!mappingIsApproved(evidence.engineeringWorkflowStatus)) {
    issues.push({
      code: 'ENGINEERING_MAPPING_NOT_APPROVED',
      message: `engineering mapping is ${evidence.engineeringWorkflowStatus || 'MISSING'} (APPROVED required)`,
    });
  }
  if (evidence.bomLineCount <= 0) {
    issues.push({
      code: 'BOM_LINES_MISSING',
      message: 'validated BOM lines are missing',
    });
  }
  if (evidence.unresolvedBomConflictCount > 0) {
    issues.push({
      code: 'BOM_CONFLICT_UNRESOLVED',
      message: `${evidence.unresolvedBomConflictCount} unresolved BOM conflict(s)`,
    });
  }
  return issues;
}

export function snapshotNotRequiredForImportedCableMessage(lineNumber: number): string {
  return `Line ${lineNumber}: imported Cable Master + BOM is the engineering authority; V2 configuration snapshot is not required for calculation.`;
}

export function evaluateMissingSnapshotForCalculation(input: {
  lineNumber: number;
  importedCable?: ImportedCableCalculationEvidence | null;
}): { status: 'PASS' | 'BLOCK'; code: string; message: string } {
  const evidence = input.importedCable || {
    materialNumber: null,
    bomLineCount: 0,
    unresolvedBomConflictCount: 0,
  };
  if (importedCableSatisfiesCalculationEngineering(evidence)) {
    return {
      status: 'PASS',
      code: 'IMPORTED_CABLE_AUTHORITY',
      message: snapshotNotRequiredForImportedCableMessage(input.lineNumber),
    };
  }
  if (isOfficialImportedCableIdentity(evidence.materialNumber)) {
    const issues = describeImportedCableCalculationIssues(evidence);
    const detail = issues.map((issue) => issue.message).join('; ');
    return {
      status: 'BLOCK',
      code: issues[0]?.code || 'IMPORTED_CABLE_NOT_READY',
      message: `Line ${input.lineNumber}: imported catalog cable cannot calculate — ${detail}.`,
    };
  }
  return {
    status: 'BLOCK',
    code: 'SNAPSHOT_REQUIRED',
    message: `Line ${input.lineNumber}: V2 configuration snapshot required and must be current.`,
  };
}
