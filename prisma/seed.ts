import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  INITIAL_ARMOURS,
  INITIAL_CABLE_FAMILIES,
  INITIAL_CABLE_STANDARDS,
  INITIAL_CONDUCTOR_MATERIALS,
  INITIAL_INSULATIONS,
  INITIAL_SCREEN_TYPES,
  INITIAL_SHEATHING_COLORS,
  INITIAL_SHEATHINGS,
  INITIAL_VOLTAGES,
} from '../src/data/cableParameterMasters';

dotenv.config();

const prisma = new PrismaClient();

async function seedKind(kind: 'FAMILY' | 'VOLTAGE' | 'CONDUCTOR' | 'INSULATION' | 'SCREEN' | 'ARMOUR' | 'SHEATH' | 'CORE_COLOUR' | 'STANDARD', rows: Array<{ code: string; description?: string; name?: string; active?: boolean }>) {
  for (const row of rows) {
    const code = row.code;
    if (!code) continue;
    await prisma.cableParameter.upsert({
      where: { kind_code: { kind, code } },
      create: {
        kind,
        code,
        name: row.description || row.name || code,
        status: row.active === false ? 'INACTIVE' : 'ACTIVE',
      },
      update: {
        name: row.description || row.name || code,
        status: row.active === false ? 'INACTIVE' : 'ACTIVE',
      },
    });
  }
}

async function main() {
  await seedKind('FAMILY', INITIAL_CABLE_FAMILIES);
  await seedKind('VOLTAGE', INITIAL_VOLTAGES.map((v) => ({ code: v.code, description: v.description, active: v.active })));
  await seedKind('CONDUCTOR', INITIAL_CONDUCTOR_MATERIALS.map((v) => ({ code: v.code, description: v.description, active: v.active })));
  await seedKind('INSULATION', INITIAL_INSULATIONS.map((v) => ({ code: v.code, description: v.description, active: v.active })));
  await seedKind('SCREEN', INITIAL_SCREEN_TYPES.map((v) => ({ code: v.code, description: v.description, active: v.active })));
  await seedKind('ARMOUR', INITIAL_ARMOURS.map((v) => ({ code: v.code, description: v.description, active: v.active })));
  await seedKind('SHEATH', INITIAL_SHEATHINGS.map((v) => ({ code: v.code, description: v.description, active: v.active })));
  await seedKind('CORE_COLOUR', INITIAL_SHEATHING_COLORS.map((v) => ({ code: v.code, description: v.description, active: v.active })));
  await seedKind('STANDARD', INITIAL_CABLE_STANDARDS.map((v) => ({ code: v.code, description: v.description, active: v.active })));

  for (const voltage of INITIAL_VOLTAGES) {
    for (const family of voltage.applicableFamilies || []) {
      await prisma.parameterCompatibility.upsert({
        where: {
          fromKind_fromCode_toKind_toCode_relation: {
            fromKind: 'VOLTAGE',
            fromCode: voltage.code,
            toKind: 'FAMILY',
            toCode: family,
            relation: 'ALLOWED',
          },
        },
        create: {
          fromKind: 'VOLTAGE',
          fromCode: voltage.code,
          toKind: 'FAMILY',
          toCode: family,
          relation: 'ALLOWED',
          source: 'parameter_master_applicable_families',
        },
        update: {},
      });
    }
  }

  console.log('Seeded CableParameter + VOLTAGE↔FAMILY compatibility from existing masters. SCREEN↔FAMILY is not seeded (CONFIGURATION_REQUIRED).');

  await prisma.numberSequence.upsert({
    where: { code: 'INQ_COMMERCIAL' },
    create: {
      code: 'INQ_COMMERCIAL',
      name: 'Commercial Inquiry (V2)',
      prefix: 'INQ',
      format: '{PREFIX}{YY}-{#####}',
      nextSerial: 1,
      active: true,
      moduleId: 'INQUIRY_QUOTATION',
      description: 'Server-generated inquiry numbers for V2 customer inquiry workflow (Task 05B).',
    },
    update: {},
  });
  console.log('Seeded INQ_COMMERCIAL number sequence for V2 inquiries.');

  await prisma.numberSequence.upsert({
    where: { code: 'QUO_COMMERCIAL' },
    create: {
      code: 'QUO_COMMERCIAL',
      name: 'Commercial Quotation (V2)',
      prefix: 'QUO',
      format: '{PREFIX}{YY}-{#####}',
      nextSerial: 1,
      active: true,
      moduleId: 'INQUIRY_QUOTATION',
      description: 'Server-generated quotation numbers for V2 quote-to-cash (Task 05F).',
    },
    update: {},
  });
  console.log('Seeded QUO_COMMERCIAL number sequence for V2 quotations.');

  await prisma.numberSequence.upsert({
    where: { code: 'CONTAINER_STUDY' },
    create: {
      code: 'CONTAINER_STUDY',
      name: 'Container Study',
      prefix: 'CST',
      format: '{PREFIX}{YY}-{#####}',
      nextSerial: 1,
      active: true,
      moduleId: 'LOGISTICS',
      description: 'Server-generated Container Study numbers (Task 05I-DD).',
    },
    update: {},
  });
  console.log('Seeded CONTAINER_STUDY number sequence.');

  const { COMPLAINT_CATEGORY_SEED, CUSTOMER_SERVICE_CASE_SEQUENCE } = await import(
    '../src/domain/complaintCategorySeed'
  );
  await prisma.numberSequence.upsert({
    where: { code: CUSTOMER_SERVICE_CASE_SEQUENCE.code },
    create: {
      code: CUSTOMER_SERVICE_CASE_SEQUENCE.code,
      name: CUSTOMER_SERVICE_CASE_SEQUENCE.name,
      prefix: CUSTOMER_SERVICE_CASE_SEQUENCE.prefix,
      format: CUSTOMER_SERVICE_CASE_SEQUENCE.format,
      nextSerial: 1,
      active: true,
      moduleId: CUSTOMER_SERVICE_CASE_SEQUENCE.moduleId,
      description: CUSTOMER_SERVICE_CASE_SEQUENCE.description,
    },
    update: {},
  });
  for (const row of COMPLAINT_CATEGORY_SEED) {
    await prisma.complaintCategory.upsert({
      where: { code: row.code },
      create: { code: row.code, name: row.name, sortOrder: row.sortOrder, active: true },
      update: { name: row.name, sortOrder: row.sortOrder, active: true },
    });
  }
  console.log('Seeded CUSTOMER_SERVICE_CASE number sequence and complaint category master (15 controlled rows).');

  if (process.env.NODE_ENV === 'production') {
    const {
      validateProductionAdminSeedPassword,
      seedProductionAdministrator,
      isDemoUserSeedAllowed,
      seedDemoPersonaUsers,
    } = await import('../src/server/identityService');
    const adminPassword = validateProductionAdminSeedPassword(process.env.ADMIN_SEED_PASSWORD);
    await seedProductionAdministrator(adminPassword);
    console.log('Seeded production permissions, system roles, and verified production administrator.');
    if (isDemoUserSeedAllowed()) {
      const summary = await seedDemoPersonaUsers();
      console.log(
        `Demo personas seeded (ALLOW_DEMO_USERS/DEMO_SEED): created=${summary.created.length}, skippedExisting=${summary.skippedExisting.length}, passwordReset=${summary.passwordReset.length}.`
      );
    }
  } else {
    const { seedDevelopmentUsers } = await import('../src/server/identityService');
    await seedDevelopmentUsers();
    console.log('Seeded Increment 12 B1 identity catalog and roles. Development users are created only when NODE_ENV is not production and never overwrite existing passwords.');
  }

  const { seedGovernedElandCustomer } = await import('../src/server/customerMigration');
  await seedGovernedElandCustomer();

  await prisma.incoterm.upsert({
    where: { code: 'DAP' },
    create: { code: 'DAP', name: 'Delivered at Place', active: true },
    update: { active: true },
  });
  await prisma.incoterm.upsert({
    where: { code: 'CIF' },
    create: { code: 'CIF', name: 'Cost, Insurance and Freight', active: true },
    update: { active: true },
  });

  const { seedElandCustomerShippingCostRates } = await import('../src/server/customerShippingCostRepository');
  const shippingSeed = await seedElandCustomerShippingCostRates();
  console.log(
    `Seeded Eland shipping cost rates. customerId=${shippingSeed.customerId} DAP=${shippingSeed.incotermIds.DAP} CIF=${shippingSeed.incotermIds.CIF} created=${shippingSeed.created} skipped=${shippingSeed.skipped}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
