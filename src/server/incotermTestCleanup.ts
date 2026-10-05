import type { PrismaClient } from '@prisma/client';
import { canonicalizeIncotermCode, ICC_INCOTERM_CODE_SET_2020 } from '../domain/globalIncotermMaster';

function isProtectedIccCode(code: string): boolean {
  const canon = canonicalizeIncotermCode(code);
  return Boolean(canon && ICC_INCOTERM_CODE_SET_2020.has(canon));
}

/** Delete a non-ICC Incoterm and its dependent rates/combinations. Never touches ICC 2020 codes. */
export async function deleteNonIccTestIncoterm(prisma: PrismaClient, code: string): Promise<void> {
  const canon = canonicalizeIncotermCode(code);
  if (!canon || isProtectedIccCode(canon)) return;
  await prisma.shippingCostRate.deleteMany({ where: { incotermCode: canon } });
  await prisma.customerDeliveryCombination.deleteMany({ where: { incotermCode: canon } });
  await prisma.incoterm.deleteMany({ where: { code: canon } });
}

/** Leftover B4-B/C/D Incoterms use codes like IB4CMU05RAKW. */
export async function deleteLeftoverB4TestIncoterms(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.incoterm.findMany({
    where: { code: { startsWith: 'IB4' } },
    select: { code: true },
  });
  const deleted: string[] = [];
  for (const row of rows) {
    await deleteNonIccTestIncoterm(prisma, row.code);
    deleted.push(row.code);
  }
  return deleted;
}
