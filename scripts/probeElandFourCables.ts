/**
 * Live probe of four ELAND regression identities via executeCostingForInquiryLine (persist:false).
 * Does not write prices or snapshots.
 */
import dotenv from 'dotenv';
import { getPrisma, disconnectPrisma } from '../src/server/db';
import {
  ELAND_REGRESSION_CABLES,
  evaluateCostingReadinessForCables,
} from '../src/server/costingReadinessService';

dotenv.config();

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured.');
  const actor = { id: 'u-admin-1', name: 'final-acceptance-probe' };

  const cables = await prisma.cableMaster.findMany({
    where: { materialNumber: { in: [...ELAND_REGRESSION_CABLES] } },
    select: { materialNumber: true, description: true, status: true, family: true },
  });

  const mappings = await prisma.cableEngineeringMapping.findMany({
    where: { materialNumber: { in: [...ELAND_REGRESSION_CABLES] } },
    select: { materialNumber: true, status: true, mappingStatus: true, family: true },
  });

  const sourceBom = await prisma.cableBomLine.groupBy({
    by: ['cableMaterialNumber'],
    where: { cableMaterialNumber: { in: [...ELAND_REGRESSION_CABLES] } },
    _count: true,
  });

  const governedBom = await prisma.governedBomLine.groupBy({
    by: ['cableMaterialNumber'],
    where: { cableMaterialNumber: { in: [...ELAND_REGRESSION_CABLES] }, status: 'APPROVED' },
    _count: true,
  });

  const conflicts = await prisma.bomDuplicateObservation.findMany({
    where: { cableMaterialNumber: { in: [...ELAND_REGRESSION_CABLES] } },
    select: { conflictId: true, cableMaterialNumber: true, rawMaterialCode: true, investigationStatus: true },
  });

  const approvedPrices = await prisma.rawMaterialPrice.count({
    where: { workflowStatus: 'APPROVED', isCurrent: true },
  });

  const officialApproved = await prisma.rawMaterialPrice.count({
    where: {
      workflowStatus: 'APPROVED',
      isCurrent: true,
      NOT: { rawMaterialCode: { startsWith: 'I' } },
    },
  });

  const preview = await evaluateCostingReadinessForCables([...ELAND_REGRESSION_CABLES], actor, {
    lengthMeters: 1000,
    quantity: 1,
    currency: 'USD',
  });

  console.log(
    JSON.stringify(
      {
        cables,
        mappings,
        sourceBom,
        governedBom,
        conflicts,
        approvedPriceRows: approvedPrices,
        officialApprovedPriceRowsNote: 'count of APPROVED current rows excluding I*-prefix test codes (heuristic)',
        officialApprovedHeuristic: officialApproved,
        preview,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
