import type { PrismaClient } from '@prisma/client';

/** Tear down Container Study aggregates so inquiry/line cleanup can proceed. */
export async function deleteContainerStudiesForInquiries(
  prisma: PrismaClient,
  inquiryIds: string[]
): Promise<void> {
  if (!inquiryIds.length) return;
  const studies = await prisma.containerStudy.findMany({
    where: { inquiryId: { in: inquiryIds } },
    select: { id: true },
  });
  const studyIds = studies.map((s) => s.id);
  await prisma.financialOfferSnapshot.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
  await prisma.shipmentCostSnapshot.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
  if (studyIds.length) {
    await prisma.containerStudy.updateMany({
      where: { id: { in: studyIds } },
      data: { currentSnapshotId: null, currentResultId: null },
    });
    await prisma.containerStudyResult.deleteMany({ where: { studyId: { in: studyIds } } });
    await prisma.containerStudyInputSnapshot.deleteMany({ where: { studyId: { in: studyIds } } });
    await prisma.containerStudy.deleteMany({ where: { id: { in: studyIds } } });
  }
  await prisma.containerShipmentGroup.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
}

/** Also drop V2 line pointers/plans so tests that delete INQ lines do not hit leftover FKs. */
export async function deleteV2LineageForInquiries(
  prisma: PrismaClient,
  inquiryIds: string[]
): Promise<void> {
  await deleteContainerStudiesForInquiries(prisma, inquiryIds);
  if (!inquiryIds.length) return;
  await prisma.commercialInquiryLine.updateMany({
    where: { inquiryId: { in: inquiryIds } },
    data: { v2CurrentSnapshotId: null, v2CurrentCuttingPlanId: null, v2CurrentDrumPlanId: null },
  });
  await prisma.v2DrumPlanLine.deleteMany({
    where: { drumPlan: { inquiryLine: { inquiryId: { in: inquiryIds } } } },
  });
  await prisma.v2DrumPlan.deleteMany({ where: { inquiryLine: { inquiryId: { in: inquiryIds } } } });
  await prisma.v2CuttingLengthPlan.deleteMany({ where: { inquiryLine: { inquiryId: { in: inquiryIds } } } });
  await prisma.v2CuttingLengthRequirement.deleteMany({
    where: { inquiryLine: { inquiryId: { in: inquiryIds } } },
  });
  await prisma.v2ConfigurationSnapshot.deleteMany({
    where: { inquiryLine: { inquiryId: { in: inquiryIds } } },
  });
}
