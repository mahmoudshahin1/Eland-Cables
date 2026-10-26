const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const inq = await prisma.commercialInquiry.findFirst({
    where: { inquiryNumber: 'INQ-20261026-KUVV' },
    include: {
      quotations: { where: { isCurrent: true } }
    }
  });

  if (!inq) {
    console.log('Inquiry not found');
    return;
  }

  const quoteNo = inq.quotations?.[0]?.quotationNumber || 'QUO26-00005';
  const salesUsers = await prisma.userAccount.findMany({
    where: {
      roles: {
        some: {
          role: { code: 'SALES_MANAGER' }
        }
      }
    }
  });

  console.log(`Found ${salesUsers.length} sales managers.`);

  for (const user of salesUsers) {
    const notif = await prisma.userNotification.create({
      data: {
        userAccountId: user.id,
        roleCode: 'SALES_MANAGER',
        title: `New VIP Order Submitted: ${inq.inquiryNumber}`,
        message: `Customer ${inq.customerName || 'ELAND Cables'} submitted contract [Direct Sales Order (أمر بيع مباشر)] for quotation ${quoteNo}. Total: $31,192.29. Awaiting Sales review and release to production floor.`,
        eventCode: 'COMMERCIAL_ORDER_SUBMITTED_TO_SALES',
        entityType: 'COMMERCIAL_INQUIRY',
        entityId: inq.id,
      }
    });
    console.log(`Created notification ${notif.id} for user ${user.email}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
