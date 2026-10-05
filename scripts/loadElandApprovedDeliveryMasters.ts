import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../src/server/db';
import { ELAND_APPROVED_DELIVERY_COMBINATIONS, planElandDeliveryMasterLoad } from '../src/domain/customerDeliveryCombination';
import { createDestinationPort, createIncoterm } from '../src/server/shippingCostRepository';
import type { RequestActor } from '../src/server/auth';

dotenv.config();

const ACTOR: RequestActor = {
  id: 'eland-approved-delivery-load',
  name: 'Eland approved delivery load',
  email: 'eland-approved-delivery-load@energya.local',
  userType: 'internal',
};

async function main() {
  const prisma = getPrisma();
  if (!prisma) {
    throw new Error('DATABASE_URL is not set.');
  }
  const customer = await prisma.customer.findUnique({ where: { code: 'C-ELAND' } });
  const ports = await prisma.destinationPort.findMany({ select: { code: true, name: true, countryCode: true } });
  const incoterms = await prisma.incoterm.findMany({ select: { code: true, name: true } });
  const existingCombinations = customer
    ? await prisma.customerDeliveryCombination.findMany({
        where: { customerId: customer.id },
        select: { countryCode: true, incotermCode: true, destinationPortCode: true },
      })
    : [];

  const plan = planElandDeliveryMasterLoad({
    customerCode: customer?.code,
    ports,
    incoterms,
    combinations: existingCombinations.map((row) => ({
      customerCode: 'C-ELAND',
      countryCode: row.countryCode,
      incotermCode: row.incotermCode,
      destinationPortCode: row.destinationPortCode,
    })),
  });

  console.log(
    JSON.stringify(
      {
        before: {
          customer: customer ? { id: customer.id, code: customer.code, name: customer.name } : null,
          ports,
          incoterms,
          combinations: existingCombinations,
        },
        plan,
      },
      null,
      2
    )
  );

  if (plan.customer === 'missing' || !customer) {
    throw new Error('C-ELAND customer was not found. Refusing to create a customer.');
  }

  for (const incoterm of plan.incoterms) {
    if (incoterm.action === 'reuse') continue;
    await createIncoterm({ code: incoterm.code, name: incoterm.name, active: true }, ACTOR);
  }
  for (const port of plan.ports) {
    if (port.action === 'reuse') continue;
    await createDestinationPort(
      { code: port.code, name: port.name, countryCode: port.countryCode, active: true },
      ACTOR
    );
  }
  for (const combo of plan.combinations) {
    if (combo.action === 'reuse') continue;
    await prisma.customerDeliveryCombination.create({
      data: {
        customerId: customer.id,
        countryCode: combo.countryCode,
        countryLabel: combo.countryLabel,
        incotermCode: combo.incotermCode,
        destinationPortCode: combo.destinationPortCode,
        active: true,
        createdBy: ACTOR.id,
        updatedBy: ACTOR.id,
      },
    });
  }

  const loaded = await prisma.customerDeliveryCombination.findMany({
    where: { customerId: customer.id, active: true },
    include: { destinationPort: true, incoterm: true },
    orderBy: [{ countryLabel: 'asc' }, { destinationPortCode: 'asc' }],
  });
  const tuples = loaded.map((row) => `${row.countryLabel} → ${row.incotermCode} → ${row.destinationPort.name}`);
  const expected = ELAND_APPROVED_DELIVERY_COMBINATIONS.map(
    (row) => `${row.countryLabel} → ${row.incotermCode} → ${row.destinationPortName}`
  );
  const extra = tuples.filter((row) => !expected.includes(row));
  const missing = expected.filter((row) => !tuples.includes(row));
  const allIncoterms = await prisma.incoterm.findMany({ select: { code: true } });
  const allPorts = await prisma.destinationPort.findMany({ select: { code: true, name: true } });

  console.log(
    JSON.stringify(
      {
        after: {
          combinations: tuples,
          extra,
          missing,
          incotermCodes: allIncoterms.map((row) => row.code),
          portCodes: allPorts.map((row) => `${row.code}:${row.name}`),
        },
      },
      null,
      2
    )
  );
  if (extra.length || missing.length || tuples.length !== 4) {
    throw new Error('Eland delivery combinations did not match the four approved rows.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
