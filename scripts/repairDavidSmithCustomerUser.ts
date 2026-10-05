/**
 * One-off production repair: create missing CustomerUser for
 * david.smith@elandcables.com → Customer C-ELAND.
 *
 * Does NOT modify UserAccount (passwordHash/status/isLocked) or Customer.
 * Idempotent: if any CustomerUser for this userAccountId already exists, skips create.
 *
 * Connects ONLY to TARGET_DATABASE_URL (never rewrites app DATABASE_URL).
 *
 * Usage:
 *   npx tsx scripts/repairDavidSmithCustomerUser.ts
 *
 * EXECUTION PENDING USER APPROVAL — do not run until reviewed.
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const USER_ACCOUNT_ID = 'cmulj2mgr000env0pdkjmjmq5';
const CUSTOMER_ID = 'cmuk6t57k006rtx2cxzsdwzbd';
const EXPECTED_EMAIL = 'david.smith@elandcables.com';
const EXPECTED_CUSTOMER_CODE = 'C-ELAND';
const ASSIGNED_BY = 'repair:david-smith-customer-user';

function requireTargetDatabaseUrl(): string {
  const url = process.env.TARGET_DATABASE_URL;
  if (!url) {
    throw new Error('TARGET_DATABASE_URL is not set.');
  }
  return url;
}

async function main() {
  const prisma = new PrismaClient({
    datasources: { db: { url: requireTargetDatabaseUrl() } },
  });

  try {
    const user = await prisma.userAccount.findUnique({
      where: { id: USER_ACCOUNT_ID },
      select: {
        id: true,
        email: true,
        userType: true,
        status: true,
        isLocked: true,
      },
    });
    if (!user) {
      throw new Error(`UserAccount not found: ${USER_ACCOUNT_ID}`);
    }
    if (user.email.toLowerCase() !== EXPECTED_EMAIL.toLowerCase()) {
      throw new Error(
        `UserAccount email mismatch: expected ${EXPECTED_EMAIL}, got ${user.email}`
      );
    }

    const customer = await prisma.customer.findUnique({
      where: { id: CUSTOMER_ID },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });
    if (!customer) {
      throw new Error(`Customer not found: ${CUSTOMER_ID}`);
    }
    if (customer.code !== EXPECTED_CUSTOMER_CODE) {
      throw new Error(
        `Customer code mismatch: expected ${EXPECTED_CUSTOMER_CODE}, got ${customer.code}`
      );
    }

    console.log('Pre-checks OK:', {
      user: { id: user.id, email: user.email, userType: user.userType, status: user.status },
      customer: { id: customer.id, code: customer.code, name: customer.name, status: customer.status },
    });

    const existingForPair = await prisma.customerUser.findFirst({
      where: { userAccountId: USER_ACCOUNT_ID, customerId: CUSTOMER_ID },
      select: {
        id: true,
        customerId: true,
        userAccountId: true,
        status: true,
        assignedAt: true,
        assignedBy: true,
        updatedAt: true,
      },
    });
    const existingForUser = await prisma.customerUser.findMany({
      where: { userAccountId: USER_ACCOUNT_ID },
      select: {
        id: true,
        customerId: true,
        userAccountId: true,
        status: true,
        assignedAt: true,
        assignedBy: true,
        updatedAt: true,
      },
    });

    let link = existingForPair;
    let action: 'created' | 'existing' = 'existing';

    if (existingForUser.length > 0) {
      console.log('CustomerUser already exists for this userAccountId — skipping create.', {
        count: existingForUser.length,
        links: existingForUser,
      });
      link = existingForPair ?? existingForUser[0]!;
    } else {
      // Exact Prisma create that runs on approval (id omitted → @default(cuid())):
      // prisma.customerUser.create({
      //   data: {
      //     customerId: CUSTOMER_ID,
      //     userAccountId: USER_ACCOUNT_ID,
      //     status: 'ACTIVE',
      //     assignedBy: ASSIGNED_BY,
      //   },
      // })
      link = await prisma.customerUser.create({
        data: {
          customerId: CUSTOMER_ID,
          userAccountId: USER_ACCOUNT_ID,
          status: 'ACTIVE',
          assignedBy: ASSIGNED_BY,
          // id omitted — Prisma generates via @default(cuid())
          // assignedAt / updatedAt use schema defaults
        },
        select: {
          id: true,
          customerId: true,
          userAccountId: true,
          status: true,
          assignedAt: true,
          assignedBy: true,
          updatedAt: true,
        },
      });
      action = 'created';
    }

    const verified = await prisma.customerUser.findUnique({
      where: { id: link.id },
      select: {
        id: true,
        status: true,
        assignedAt: true,
        assignedBy: true,
        updatedAt: true,
        userAccount: {
          select: { id: true, email: true, userType: true, status: true },
        },
        customer: {
          select: { id: true, code: true, name: true, status: true },
        },
      },
    });

    console.log(JSON.stringify({ action, customerUser: link, verification: verified }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
