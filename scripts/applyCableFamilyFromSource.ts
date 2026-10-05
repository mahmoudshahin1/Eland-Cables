/**
 * Update-in-place Cable Master family/description from source workbooks.
 * Does not delete cables, costing runs, or RM prices.
 */
import dotenv from 'dotenv';
import { applyCableMasterFamilyOverlay } from '../src/services/cableMasterFamilyOverlay';
import { getPrisma, disconnectPrisma } from '../src/server/db';

dotenv.config();

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('DATABASE_URL is not set');
  const overlay = await applyCableMasterFamilyOverlay(prisma);
  const [total, active, emptyFamily, familyGroups] = await Promise.all([
    prisma.cableMaster.count(),
    prisma.cableMaster.count({ where: { status: 'ACTIVE' } }),
    prisma.cableMaster.count({
      where: { status: 'ACTIVE', OR: [{ family: null }, { family: '' }] },
    }),
    prisma.cableMaster.groupBy({
      by: ['family'],
      _count: true,
      where: { status: 'ACTIVE' },
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        overlay,
        total,
        active,
        familyFilled: active - emptyFamily,
        emptyFamily,
        familyGroups,
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
