import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { deleteCommercialInquiriesMatching } from '../src/server/commercialTestCleanup';

dotenv.config();
const prisma = new PrismaClient();

const KEEP_IDS = [
  'cmvnyx5ie009ol5b4fgqqu06i', // 1: INQ-20261025-UHNT (Latest multi-cable 1x185 + 4x300 offer with PDF)
  'cmvnyje73007bl5b4f6b98ery', // 2: INQ-20261025-ZAYA (2-cable 1x35 + 1x50 quotation)
  'cmvna1def005ol5b48523jt57', // 3: INQ-20261025-FDVP (1-cable 1x70 quotation)
  'cmvn6jpy30042l5b4pblagejj', // 4: INQ-20261025-3UG5 (1-cable 4x300 power cable quotation)
  'cmvjjona2009nl57k5fs5kxjw', // 5: INQ-20261022-BATK (Quoted & Confirmed SO-202610241341-5WYF with tracking)
];

async function main() {
  console.log('Running cleanup of old test inquiries for David / C-ELAND...');
  const deletedIds = await deleteCommercialInquiriesMatching(prisma, {
    customerId: 'C-ELAND',
    id: { notIn: KEEP_IDS },
  });
  console.log(`Successfully deleted ${deletedIds.length} old/test inquiries.`);

  const remaining = await prisma.commercialInquiry.findMany({
    where: { customerId: 'C-ELAND' },
    select: {
      id: true,
      inquiryNumber: true,
      status: true,
      lines: { select: { cableDescription: true } },
      quotations: { select: { quotationNumber: true, status: true, sellingPrice: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Remaining inquiries for C-ELAND (${remaining.length}):`);
  for (const inq of remaining) {
    console.log(
      `- ${inq.inquiryNumber} [${inq.status}] | Lines: ${inq.lines.length} (${inq.lines.map((l) => l.cableDescription).join('; ')}) | Quotes: ${inq.quotations.map((q) => `${q.quotationNumber}:${q.status}`).join(', ')}`
    );
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
