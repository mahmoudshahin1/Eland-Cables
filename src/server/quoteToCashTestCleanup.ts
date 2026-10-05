/** Deletes Phase 1 Q2C dependents so commercial quotation cleanup can proceed. */
export async function deleteQuoteToCashDependents(prisma: {
  epcSalesOrderLine: { deleteMany: (args?: object) => Promise<unknown> };
  epcSalesOrder: { deleteMany: (args?: object) => Promise<unknown> };
  agreementReleaseLine: { deleteMany: (args?: object) => Promise<unknown> };
  agreementRelease: { deleteMany: (args?: object) => Promise<unknown> };
  salesAgreementLine: { deleteMany: (args?: object) => Promise<unknown> };
  salesAgreement: { deleteMany: (args?: object) => Promise<unknown> };
  commercialCommitment: { deleteMany: (args?: object) => Promise<unknown> };
}) {
  await prisma.epcSalesOrderLine.deleteMany();
  await prisma.epcSalesOrder.deleteMany();
  await prisma.agreementReleaseLine.deleteMany();
  await prisma.agreementRelease.deleteMany();
  await prisma.salesAgreementLine.deleteMany();
  await prisma.salesAgreement.deleteMany();
  await prisma.commercialCommitment.deleteMany();
}

/** Scoped Q2C teardown — never wipe another suite's commitments/orders. */
export async function deleteQuoteToCashDependentsForQuotations(
  prisma: {
    commercialQuotation: { findMany: (args: object) => Promise<Array<{ id: string }>> };
    commercialCommitment: {
      findMany: (args: object) => Promise<Array<{ id: string }>>;
      deleteMany: (args: object) => Promise<unknown>;
    };
    salesAgreement: {
      findMany: (args: object) => Promise<Array<{ id: string }>>;
      deleteMany: (args: object) => Promise<unknown>;
    };
    salesAgreementLine: { deleteMany: (args: object) => Promise<unknown> };
    agreementRelease: {
      findMany: (args: object) => Promise<Array<{ id: string }>>;
      deleteMany: (args: object) => Promise<unknown>;
    };
    agreementReleaseLine: { deleteMany: (args: object) => Promise<unknown> };
    epcSalesOrder: {
      findMany: (args: object) => Promise<Array<{ id: string }>>;
      deleteMany: (args: object) => Promise<unknown>;
    };
    epcSalesOrderLine: { deleteMany: (args: object) => Promise<unknown> };
  },
  quotationIds: string[]
) {
  if (!quotationIds.length) return;
  const commitments = await prisma.commercialCommitment.findMany({
    where: { quotationId: { in: quotationIds } },
    select: { id: true },
  });
  const commitmentIds = commitments.map((row) => row.id);
  const agreements = await prisma.salesAgreement.findMany({
    where: {
      OR: [{ quotationId: { in: quotationIds } }, { commitmentId: { in: commitmentIds } }],
    },
    select: { id: true },
  });
  const agreementIds = agreements.map((row) => row.id);
  const releases = await prisma.agreementRelease.findMany({
    where: { agreementId: { in: agreementIds } },
    select: { id: true },
  });
  const releaseIds = releases.map((row) => row.id);
  const orders = await prisma.epcSalesOrder.findMany({
    where: {
      OR: [
        { quotationId: { in: quotationIds } },
        { commitmentId: { in: commitmentIds } },
      ],
    },
    select: { id: true },
  });
  const orderIds = orders.map((row) => row.id);
  await prisma.epcSalesOrderLine.deleteMany({ where: { salesOrderId: { in: orderIds } } });
  await prisma.epcSalesOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.agreementReleaseLine.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.agreementRelease.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.salesAgreementLine.deleteMany({ where: { agreementId: { in: agreementIds } } });
  await prisma.salesAgreement.deleteMany({ where: { id: { in: agreementIds } } });
  await prisma.commercialCommitment.deleteMany({ where: { id: { in: commitmentIds } } });
}
