import type { PrismaClient } from '@prisma/client';

/**
 * Deletes costing rows for the given inquiry lines only.
 * Test teardown must pass its own line ids. A V2 channel or a non-null
 * inquiryLineId is not a license to delete every business costing run.
 */
export async function deleteCostingArtifactsForInquiryLines(
  prisma: PrismaClient,
  inquiryLineIds: string[]
): Promise<void> {
  if (inquiryLineIds.length === 0) return;
  await prisma.costingCalculationSnapshot.deleteMany({
    where: { calculation: { inquiryLineId: { in: inquiryLineIds } } },
  });
  await prisma.costingLine.deleteMany({
    where: { costingRun: { inquiryLineId: { in: inquiryLineIds } } },
  });
  await prisma.costingRun.deleteMany({
    where: { inquiryLineId: { in: inquiryLineIds } },
  });
  await prisma.costingCalculation.deleteMany({
    where: { inquiryLineId: { in: inquiryLineIds } },
  });
}
