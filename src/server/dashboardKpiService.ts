import { getPrisma } from './db';

export interface PlatformKpis {
  activeCustomers: number;
  openInquiries: number;
  openQuotations: number;
  costingReadyCables: number;
  bomConflicts: number;
  unpricedRawMaterials: number;
  technicalOfficeRequests: number;
  pendingApprovals: number;
  inquiryByStatus: Array<{ status: string; count: number }>;
  quotationByStatus: Array<{ status: string; count: number }>;
}

/** Real KPIs from PostgreSQL — no fabricated percentages. */
export async function getPlatformKpis(): Promise<PlatformKpis> {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      activeCustomers: 0,
      openInquiries: 0,
      openQuotations: 0,
      costingReadyCables: 0,
      bomConflicts: 0,
      unpricedRawMaterials: 0,
      technicalOfficeRequests: 0,
      pendingApprovals: 0,
      inquiryByStatus: [],
      quotationByStatus: [],
    };
  }

  const [
    activeCustomers,
    openInquiries,
    openQuotations,
    bomConflicts,
    unpricedRawMaterials,
    technicalOfficeRequests,
    pendingScrap,
    pendingFx,
    inquiryGroups,
    quotationGroups,
    costingReady,
  ] = await Promise.all([
    prisma.customer.count({ where: { status: 'ACTIVE' } }),
    prisma.commercialInquiry.count({
      where: { isCurrent: true, status: { in: ['DRAFT', 'UNDER_REVIEW', 'SUBMITTED'] } },
    }),
    prisma.commercialQuotation.count({
      where: { isCurrent: true, status: { in: ['DRAFT', 'OPEN', 'SUBMITTED'] } },
    }),
    prisma.bomDuplicateObservation.count({
      where: { investigationStatus: { not: 'RESOLVED' } },
    }),
    prisma.rawMaterial.count({ where: { priceStatus: 'PRICE_NOT_CONFIGURED' } }),
    prisma.technicalOfficeRequest.count({
      where: { canonicalStatus: { in: ['PENDING', 'IN_REVIEW', 'SUBMITTED'] } },
    }),
    prisma.costingScrapRule.count({ where: { workflowStatus: 'SUBMITTED' } }),
    prisma.costingExchangeRate.count({ where: { workflowStatus: 'SUBMITTED' } }),
    prisma.commercialInquiry.groupBy({ by: ['status'], where: { isCurrent: true }, _count: true }),
    prisma.commercialQuotation.groupBy({ by: ['status'], where: { isCurrent: true }, _count: true }),
    prisma.costingCalculation.count({ where: { status: { in: ['LOCKED', 'READY'] } } }),
  ]);

  return {
    activeCustomers,
    openInquiries,
    openQuotations,
    costingReadyCables: costingReady,
    bomConflicts,
    unpricedRawMaterials,
    technicalOfficeRequests,
    pendingApprovals: pendingScrap + pendingFx,
    inquiryByStatus: inquiryGroups.map((g) => ({ status: g.status, count: g._count })),
    quotationByStatus: quotationGroups.map((g) => ({ status: g.status, count: g._count })),
  };
}
