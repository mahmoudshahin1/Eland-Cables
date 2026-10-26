const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updatePrices() {
  const res = await prisma.rawMaterialPrice.updateMany({
    where: { isCurrent: true },
    data: {
      uom: 'MT',
      priceBasis: 'PER_TON',
      workflowStatus: 'APPROVED',
    }
  });
  console.log('Updated prices count:', res.count);
}

updatePrices().finally(() => prisma.$disconnect());
