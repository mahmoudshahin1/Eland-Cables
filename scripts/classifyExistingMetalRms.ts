/**
 * Classify existing copper/aluminium raw materials in place.
 * Does not create cables, BOM lines, RM codes, or prices.
 */
import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../src/server/db';
import { classifySuggestedRawMaterials } from '../src/server/masterDataRepository';

dotenv.config();

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured.');

  const before = await prisma.rawMaterial.groupBy({
    by: ['pricingCategory'],
    _count: true,
  });

  const result = await classifySuggestedRawMaterials(
    { id: 'u-admin-1', name: 'metal-classification' },
    { onlyUnclassified: true }
  );

  const after = await prisma.rawMaterial.groupBy({
    by: ['pricingCategory'],
    _count: true,
  });

  const counts = {
    cables: await prisma.cableMaster.count(),
    bomLines: await prisma.cableBomLine.count(),
    rawMaterials: await prisma.rawMaterial.count(),
    prices: await prisma.rawMaterialPrice.count(),
  };

  console.log(JSON.stringify({ before, result, after, preservedCounts: counts }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
