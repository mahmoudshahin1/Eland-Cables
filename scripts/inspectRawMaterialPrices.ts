import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../src/server/db';

dotenv.config();

async function main() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('Database connection failed');

  const totalPrices = await prisma.rawMaterialPrice.count();
  const totalRms = await prisma.rawMaterial.count();

  const prices = await prisma.rawMaterialPrice.findMany({
    orderBy: [{ rawMaterialCode: 'asc' }, { createdAt: 'desc' }],
  });

  const byCode = new Map<string, typeof prices>();
  for (const p of prices) {
    const list = byCode.get(p.rawMaterialCode) || [];
    list.push(p);
    byCode.set(p.rawMaterialCode, list);
  }

  const duplicates: Array<{ code: string; count: number; rows: any[] }> = [];
  for (const [code, list] of byCode.entries()) {
    if (list.length > 1) {
      duplicates.push({
        code,
        count: list.length,
        rows: list.map((r) => ({
          id: r.id,
          price: r.price != null ? Number(r.price) : null,
          currency: r.currency,
          uom: r.uom,
          priceBasis: r.priceBasis,
          workflowStatus: r.workflowStatus,
          status: r.status,
          isCurrent: r.isCurrent,
          revision: r.revision,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          temporalStatus: r.temporalStatus,
          source: r.source,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      });
    }
  }

  const statusDistribution: Record<string, number> = {};
  const workflowStatusDistribution: Record<string, number> = {};

  for (const p of prices) {
    statusDistribution[p.status] = (statusDistribution[p.status] || 0) + 1;
    workflowStatusDistribution[p.workflowStatus] = (workflowStatusDistribution[p.workflowStatus] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        totalRms,
        totalPrices,
        uniqueCodesWithPrices: byCode.size,
        duplicateCodesCount: duplicates.length,
        statusDistribution,
        workflowStatusDistribution,
        duplicates,
      },
      null,
      2
    )
  );

  await disconnectPrisma();
}

main().catch(console.error);
