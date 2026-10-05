import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../src/server/db';

dotenv.config();

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('PostgreSQL is not configured.');
  const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string; column_default: string | null }>>(
    `SELECT column_name, data_type, column_default
     FROM information_schema.columns
     WHERE table_name = 'RawMaterial'
       AND column_name IN ('pricingCategory', 'metalType')
     ORDER BY column_name`
  );
  const counts = {
    cables: await prisma.cableMaster.count(),
    boms: await prisma.cableBomLine.count(),
    rms: await prisma.rawMaterial.count(),
    prices: await prisma.rawMaterialPrice.count(),
  };
  const probeCables = await prisma.cableMaster.findMany({
    where: { materialNumber: { in: ['10009487', '10009488', '10009489', '10009490'] } },
    select: { materialNumber: true },
  });
  const categories = await prisma.rawMaterial.groupBy({ by: ['pricingCategory'], _count: true });
  console.log(JSON.stringify({ cols, counts, probeCables, categories }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
