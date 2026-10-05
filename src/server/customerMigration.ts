import { getPrisma } from './db';
import crypto from 'node:crypto';

/**
 * Link historical CommercialInquiry / CommercialQuotation.customerId strings to Customer
 * when the mapping is unique and evidence-based. Never invent named customers.
 */
export async function reconcileCommercialCustomerMasters(): Promise<{ linked: number; exceptions: number }> {
  const prisma = getPrisma();
  if (!prisma) return { linked: 0, exceptions: 0 };

  const inquiries = await prisma.commercialInquiry.findMany({
    select: { id: true, customerId: true, customerMasterId: true },
  });
  const quotations = await prisma.commercialQuotation.findMany({
    select: { id: true, customerId: true, customerMasterId: true },
  });

  let linked = 0;
  let exceptions = 0;

  const resolve = async (legacy: string): Promise<{ masterId: string | null; reason?: string }> => {
    const byPk = await prisma.customer.findUnique({ where: { id: legacy } });
    if (byPk) return { masterId: byPk.id };
    const byCode = await prisma.customer.findUnique({ where: { code: legacy } });
    if (byCode) return { masterId: byCode.id };

    const users = await prisma.userAccount.findMany({
      where: {
        OR: [{ id: legacy }, { email: legacy }, { customerId: legacy }],
      },
      include: { customerUsers: { where: { status: 'ACTIVE' } } },
    });
    if (users.length === 0) {
      return { masterId: null, reason: 'No UserAccount or Customer matches this historical customerId; record left unchanged.' };
    }
    if (users.length > 1) {
      return { masterId: null, reason: 'Multiple UserAccount rows match this historical customerId; refused to guess.' };
    }
    const masters = [...new Set(users[0].customerUsers.map((l) => l.customerId))];
    if (masters.length === 1) return { masterId: masters[0] };
    if (masters.length > 1) {
      return { masterId: null, reason: 'User is assigned to multiple customers; refused to guess which master owns the commercial record.' };
    }
    return { masterId: null, reason: 'Matching UserAccount has no active CustomerUser assignment; refused to fabricate a Customer.' };
  };

  const process = async (sourceEntity: string, row: { id: string; customerId: string; customerMasterId: string | null }) => {
    if (row.customerMasterId) return;
    const { masterId, reason } = await resolve(row.customerId);
    if (masterId) {
      if (sourceEntity === 'CommercialInquiry') {
        await prisma.commercialInquiry.update({ where: { id: row.id }, data: { customerMasterId: masterId } });
      } else {
        await prisma.commercialQuotation.update({ where: { id: row.id }, data: { customerMasterId: masterId } });
      }
      linked += 1;
      return;
    }
    if (reason) {
      const exists = await prisma.customerMigrationException.findFirst({
        where: { sourceEntity, sourceId: row.id, legacyCustomerId: row.customerId },
      });
      if (!exists) {
        await prisma.customerMigrationException.create({
          data: {
            sourceEntity,
            sourceId: row.id,
            legacyCustomerId: row.customerId,
            reason,
          },
        });
        exceptions += 1;
      }
    }
  };

  for (const row of inquiries) await process('CommercialInquiry', row);
  for (const row of quotations) await process('CommercialQuotation', row);
  return { linked, exceptions };
}

export async function seedGovernedElandCustomer(): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  const customer = await prisma.customer.upsert({
    where: { code: 'C-ELAND' },
    create: {
      code: 'C-ELAND',
      name: 'ELAND Cables',
      type: 'EPC_CUSTOMER',
      status: 'ACTIVE',
      defaultCurrency: 'USD',
      defaultIncoterm: 'FOB',
      paymentTerms: 'LC at sight',
      deliveryTerms: 'CIF Alexandria',
      allowedQuotationCurrencies: ['USD', 'EUR'],
      defaultInquiryProcessCode: 'VIP_FAST_TRACK',
      companyLogoUrl: '/customer-logos/eland-cables.png',
      companyTagline: 'A Member of ELSEWEDY HELAL Group',
    },
    update: {
      name: 'ELAND Cables',
      defaultInquiryProcessCode: 'VIP_FAST_TRACK',
      companyTagline: 'A Member of ELSEWEDY HELAL Group',
    },
  });
  if (!customer.companyLogoUrl) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { companyLogoUrl: '/customer-logos/eland-cables.png' },
    });
  }
  const user = await prisma.userAccount.findFirst({
    where: { OR: [{ email: 'david.smith@elandcables.com' }, { id: 'dev-cust-eland' }] },
  });
  if (!user) return;
  await prisma.customerUser.upsert({
    where: { customerId_userAccountId: { customerId: customer.id, userAccountId: user.id } },
    create: {
      customerId: customer.id,
      userAccountId: user.id,
      status: 'ACTIVE',
      assignedBy: 'dev-seed',
    },
    update: { status: 'ACTIVE' },
  });
}

export const STANDARD_TEST_CUSTOMER_CODE = 'TEST-STANDARD-001';
export const STANDARD_TEST_CUSTOMER_NAME = 'Energya Standard Test Customer';
export const STANDARD_TEST_USERNAME = 'standard.test';
export const STANDARD_TEST_EMAIL = 'standard.test@energya.local';
export const STANDARD_TEST_FULL_NAME = 'Standard Workflow Test User';

const STANDARD_TEST_CREDENTIALS_FILE = 'logs/.standard-test-credentials.local.json';

export function generateStandardTestPassword(): string {
  return `Std.${crypto.randomBytes(16).toString('base64url')}.9!`;
}

async function persistStandardTestCredentials(password: string) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const file = path.join(process.cwd(), STANDARD_TEST_CREDENTIALS_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        customerCode: STANDARD_TEST_CUSTOMER_CODE,
        customerName: STANDARD_TEST_CUSTOMER_NAME,
        username: STANDARD_TEST_USERNAME,
        email: STANDARD_TEST_EMAIL,
        password,
        loginUrl: 'http://localhost:3847/login',
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    { encoding: 'utf8', mode: 0o600 }
  );
}

async function readPersistedStandardTestPassword(): Promise<string | null> {
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const raw = await fs.readFile(path.join(process.cwd(), STANDARD_TEST_CREDENTIALS_FILE), 'utf8');
    const parsed = JSON.parse(raw) as { password?: unknown };
    return typeof parsed.password === 'string' && parsed.password.length >= 8 ? parsed.password : null;
  } catch {
    return null;
  }
}

export async function resolveStandardTestUserPassword(): Promise<string> {
  const fromEnv = process.env.TEST_STANDARD_USER_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('TEST_STANDARD_USER_PASSWORD is required to seed the standard test user in production.');
  }
  return (await readPersistedStandardTestPassword()) || generateStandardTestPassword();
}

async function ensureStandardTestDeliveryCombination(
  prisma: NonNullable<ReturnType<typeof getPrisma>>,
  customerId: string
) {
  const existing = await prisma.customerDeliveryCombination.findFirst({
    where: { customerId, active: true },
  });
  if (existing) return;
  const incoterm =
    (await prisma.incoterm.findFirst({ where: { code: 'FOB', active: true } })) ||
    (await prisma.incoterm.findFirst({ where: { active: true }, orderBy: { code: 'asc' } }));
  const port = await prisma.destinationPort.findFirst({
    where: { active: true },
    orderBy: { code: 'asc' },
  });
  if (!incoterm || !port) return;
  await prisma.customerDeliveryCombination.create({
    data: {
      customerId,
      countryCode: port.countryCode,
      countryLabel: port.countryCode,
      incotermCode: incoterm.code,
      destinationPortCode: port.code,
      active: true,
      isDefault: true,
      createdBy: 'dev-seed',
      updatedBy: 'dev-seed',
    },
  });
}

/**
 * One fake/dev STANDARD_WORKFLOW customer. Does not modify ELAND or production customers.
 * No dummy cables/drums/inquiries — only the customer + one user.
 */
export async function seedStandardTestCustomer(): Promise<{
  customerCode: string;
  customerName: string;
  username: string;
  email: string;
  created: boolean;
  passwordReset: boolean;
} | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_STANDARD_TEST_USER !== 'true') {
    return null;
  }

  const classification = await prisma.customerClassification.upsert({
    where: { code: 'STANDARD' },
    create: {
      code: 'STANDARD',
      name: 'STANDARD',
      description: 'Standard commercial classification',
      active: true,
      defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
    },
    update: {},
  });
  const segment = await prisma.customerSegment.upsert({
    where: { code: 'STANDARD' },
    create: {
      code: 'STANDARD',
      name: 'STANDARD',
      description: 'Standard commercial segment',
      active: true,
      defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
    },
    update: {},
  });

  const customer = await prisma.customer.upsert({
    where: { code: STANDARD_TEST_CUSTOMER_CODE },
    create: {
      code: STANDARD_TEST_CUSTOMER_CODE,
      name: STANDARD_TEST_CUSTOMER_NAME,
      type: 'EPC_CUSTOMER',
      status: 'ACTIVE',
      defaultCurrency: 'USD',
      defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      classificationId: classification.id,
      segmentId: segment.id,
      companyTagline: 'Development STANDARD_WORKFLOW test customer',
    },
    update: {
      name: STANDARD_TEST_CUSTOMER_NAME,
      defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      classificationId: classification.id,
      segmentId: segment.id,
    },
  });

  const { hashPassword } = await import('../domain/passwordService');
  const existing = await prisma.userAccount.findFirst({
    where: { OR: [{ email: STANDARD_TEST_EMAIL }, { username: STANDARD_TEST_USERNAME }] },
  });

  let created = false;
  let passwordReset = false;
  let userId = existing?.id;
  const persisted = await readPersistedStandardTestPassword();
  const envPassword = process.env.TEST_STANDARD_USER_PASSWORD?.trim();
  if (!existing) {
    const password = envPassword || generateStandardTestPassword();
    const passwordHash = await hashPassword(password);
    const user = await prisma.userAccount.create({
      data: {
        id: 'dev-cust-standard-test',
        email: STANDARD_TEST_EMAIL,
        username: STANDARD_TEST_USERNAME,
        fullName: STANDARD_TEST_FULL_NAME,
        passwordHash,
        passwordChangedAt: new Date(),
        userType: 'customer',
        department: 'Commercial Procurement',
        customerId: STANDARD_TEST_CUSTOMER_CODE,
        createdBy: 'dev-seed',
      },
    });
    userId = user.id;
    created = true;
    await persistStandardTestCredentials(password);
    const role = await prisma.role.findUnique({ where: { code: 'CUSTOMER_USER' } });
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id, assignedBy: 'dev-seed' },
      });
    }
  } else {
    const shouldReset =
      process.env.TEST_STANDARD_RESET_PASSWORD === 'true' || Boolean(envPassword) || !persisted;
    if (shouldReset) {
      const password = envPassword || persisted || generateStandardTestPassword();
      const passwordHash = await hashPassword(password);
      await prisma.userAccount.update({
        where: { id: existing.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await persistStandardTestCredentials(password);
      passwordReset = true;
    }
    userId = existing.id;
  }

  if (userId) {
    await prisma.customerUser.upsert({
      where: { customerId_userAccountId: { customerId: customer.id, userAccountId: userId } },
      create: {
        customerId: customer.id,
        userAccountId: userId,
        status: 'ACTIVE',
        assignedBy: 'dev-seed',
      },
      update: { status: 'ACTIVE' },
    });
  }

  await ensureStandardTestDeliveryCombination(prisma, customer.id);

  return {
    customerCode: STANDARD_TEST_CUSTOMER_CODE,
    customerName: STANDARD_TEST_CUSTOMER_NAME,
    username: STANDARD_TEST_USERNAME,
    email: STANDARD_TEST_EMAIL,
    created,
    passwordReset,
  };
}
