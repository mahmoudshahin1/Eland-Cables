import type { Prisma, PrismaClient } from '@prisma/client';
import { deleteV2LineageForInquiries } from '../platform/containerStudyTestCleanup';

/**
 * Deletes only the matching commercial inquiries and their dependents.
 * Tests must never call unscoped commercialInquiry.deleteMany() — that wipes demo data
 * in the shared local database.
 */
export async function deleteCommercialInquiriesMatching(
  prisma: PrismaClient,
  where: Prisma.CommercialInquiryWhereInput
): Promise<string[]> {
  const inquiries = await prisma.commercialInquiry.findMany({ where, select: { id: true } });
  const inquiryIds = inquiries.map((row) => row.id);
  if (inquiryIds.length === 0) return [];

  const lines = await prisma.commercialInquiryLine.findMany({
    where: { inquiryId: { in: inquiryIds } },
    select: { id: true },
  });
  const lineIds = lines.map((row) => row.id);

  await prisma.costingCalculation.updateMany({
    where: {
      OR: [{ inquiryId: { in: inquiryIds } }, { inquiryLineId: { in: lineIds } }],
    },
    data: {
      configurationSnapshotId: null,
      cuttingLengthPlanId: null,
      drumPlanId: null,
    },
  });

  await deleteV2LineageForInquiries(prisma, inquiryIds);

  const quotations = await prisma.commercialQuotation.findMany({
    where: { inquiryId: { in: inquiryIds } },
    select: { id: true },
  });
  const quotationIds = quotations.map((row) => row.id);

  const commitments = await prisma.commercialCommitment.findMany({
    where: {
      OR: [{ inquiryId: { in: inquiryIds } }, { quotationId: { in: quotationIds } }],
    },
    select: { id: true },
  });
  const commitmentIds = commitments.map((row) => row.id);

  const salesOrders = await prisma.epcSalesOrder.findMany({
    where: {
      OR: [
        { inquiryId: { in: inquiryIds } },
        { quotationId: { in: quotationIds } },
        { commitmentId: { in: commitmentIds } },
      ],
    },
    select: { id: true },
  });
  const salesOrderIds = salesOrders.map((row) => row.id);

  const agreements = await prisma.salesAgreement.findMany({
    where: {
      OR: [{ commitmentId: { in: commitmentIds } }, { quotationId: { in: quotationIds } }],
    },
    select: { id: true },
  });
  const agreementIds = agreements.map((row) => row.id);

  const releases = await prisma.agreementRelease.findMany({
    where: { agreementId: { in: agreementIds } },
    select: { id: true },
  });
  const releaseIds = releases.map((row) => row.id);

  await prisma.epcSalesOrderLine.deleteMany({ where: { salesOrderId: { in: salesOrderIds } } });
  await prisma.epcSalesOrder.deleteMany({ where: { id: { in: salesOrderIds } } });
  await prisma.agreementReleaseLine.deleteMany({ where: { releaseId: { in: releaseIds } } });
  await prisma.agreementRelease.deleteMany({ where: { id: { in: releaseIds } } });
  await prisma.salesAgreementLine.deleteMany({ where: { agreementId: { in: agreementIds } } });
  await prisma.salesAgreement.deleteMany({ where: { id: { in: agreementIds } } });
  await prisma.commercialCommitment.deleteMany({ where: { id: { in: commitmentIds } } });

  await prisma.commercialPricingSnapshot.deleteMany({ where: { quotationId: { in: quotationIds } } });
  await prisma.commercialQuotationLine.deleteMany({ where: { quotationId: { in: quotationIds } } });
  await prisma.commercialQuotation.deleteMany({ where: { id: { in: quotationIds } } });
  await prisma.commercialInquiryAttachment.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
  await prisma.commercialInquiryLine.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
  await prisma.commercialInquiry.deleteMany({ where: { id: { in: inquiryIds } } });
  return inquiryIds;
}

/** Restrict cleanup to records created by a test run identified by `suffix`. */
export async function deleteCommercialInquiriesForTestSuffix(
  prisma: PrismaClient,
  suffix: string
): Promise<string[]> {
  const testUsers = await prisma.userAccount.findMany({
    where: { email: { contains: suffix } },
    select: { id: true },
  });
  const testUserIds = testUsers.map((row) => row.id);
  return deleteCommercialInquiriesMatching(prisma, {
    OR: [
      ...(testUserIds.length > 0 ? [{ customerId: { in: testUserIds } }] : []),
      { projectName: { contains: suffix } },
      { inquiryNumber: { contains: suffix } },
    ],
  });
}
