import type { PrismaClient } from '@prisma/client';

/** Parse `{PREFIX}{YY}-{#####}` serials so leftover rows cannot collide with the cursor. */
export function maxAllocatedSerial(values: string[], prefix: string): number {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{2}-(\\d+)$`, 'i');
  let max = 0;
  for (const value of values) {
    const match = value.match(re);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return max;
}

/**
 * Advance INQ/CST/QUO sequences past any leftover allocated numbers still in the shared DB.
 * Tests must not reset nextSerial to 1 while prior rows remain.
 */
export async function ensureNumberSequencesAheadOfExisting(
  prisma: PrismaClient,
  codes: string[] = ['INQ_COMMERCIAL', 'CONTAINER_STUDY', 'QUO_COMMERCIAL']
): Promise<void> {
  for (const code of codes) {
    const seq = await prisma.numberSequence.findUnique({ where: { code } });
    if (!seq) continue;
    let maxExisting = 0;
    if (code === 'INQ_COMMERCIAL') {
      const rows = await prisma.commercialInquiry.findMany({
        where: { inquiryNumber: { startsWith: seq.prefix } },
        select: { inquiryNumber: true },
      });
      maxExisting = maxAllocatedSerial(
        rows.map((r) => r.inquiryNumber),
        seq.prefix
      );
    } else if (code === 'CONTAINER_STUDY') {
      const rows = await prisma.containerStudy.findMany({
        where: { studyNumber: { startsWith: seq.prefix } },
        select: { studyNumber: true },
      });
      maxExisting = maxAllocatedSerial(
        rows.map((r) => r.studyNumber),
        seq.prefix
      );
    } else if (code === 'QUO_COMMERCIAL') {
      const rows = await prisma.commercialQuotation.findMany({
        where: { quotationNumber: { startsWith: seq.prefix } },
        select: { quotationNumber: true },
      });
      maxExisting = maxAllocatedSerial(
        rows.map((r) => r.quotationNumber),
        seq.prefix
      );
    }
    const next = maxExisting + 1;
    if (seq.nextSerial < next) {
      await prisma.numberSequence.update({
        where: { code },
        data: { nextSerial: next },
      });
    }
  }
}

export async function resetSeedUserLoginState(
  prisma: PrismaClient,
  emails: string[]
): Promise<void> {
  if (!emails.length) return;
  await prisma.userAccount.updateMany({
    where: { email: { in: emails } },
    data: {
      failedLoginAttempts: 0,
      isLocked: false,
      isActive: true,
      status: 'ACTIVE',
    },
  });
}
