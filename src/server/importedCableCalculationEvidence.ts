import { getPrisma } from './db';
import type { ImportedCableCalculationEvidence } from '../domain/importedCableCalculationAuthority';

export async function loadImportedCableCalculationEvidence(
  materialNumber: string | null | undefined
): Promise<ImportedCableCalculationEvidence> {
  const prisma = getPrisma();
  const material = String(materialNumber || '').trim() || null;
  if (!prisma || !material) {
    return { materialNumber: material, bomLineCount: 0, unresolvedBomConflictCount: 0 };
  }
  const [cable, mapping, bomLineCount, unresolvedBomConflictCount] = await Promise.all([
    prisma.cableMaster.findUnique({
      where: { materialNumber: material },
      select: { approvalStatus: true },
    }),
    prisma.cableEngineeringMapping.findFirst({
      where: { materialNumber: material, isCurrent: true },
      select: { status: true },
    }),
    prisma.cableBomLine.count({ where: { cableMaterialNumber: material, status: 'ACTIVE' } }),
    prisma.bomDuplicateObservation.count({
      where: { cableMaterialNumber: material, investigationStatus: { not: 'APPROVED' } },
    }),
  ]);
  return {
    materialNumber: material,
    cableMasterApprovalStatus: cable?.approvalStatus ?? null,
    engineeringWorkflowStatus: mapping?.status ?? null,
    bomLineCount,
    unresolvedBomConflictCount,
  };
}
