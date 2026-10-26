const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const notifs = await prisma.userNotification.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      userAccount: {
        select: { email: true, fullName: true }
      }
    }
  });
  console.log('Recent Notifications count:', notifs.length);
  console.log(JSON.stringify(notifs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
