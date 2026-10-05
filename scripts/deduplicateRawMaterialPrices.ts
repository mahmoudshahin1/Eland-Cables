/**
 * Deduplicate Raw Material Prices:
 * 1. Remove all duplicate records per rawMaterialCode.
 * 2. Retain exactly one canonical record per rawMaterialCode.
 * 3. Set Status = ACTIVE (RecordStatus.ACTIVE) and Approval Status = APPROVED (PriceWorkflowStatus.APPROVED).
 * 4. Ensure correct UOM, PriceBasis, and Currency normalization.
 * 5. Update RawMaterial priceStatus = CONFIGURED.
 */
import dotenv from 'dotenv';
import { disconnectPrisma, getPrisma } from '../src/server/db';
import { canonicalizePriceUom, priceBasisFromPriceUom } from '../src/domain/priceUom';

dotenv.config();

const EXPLICIT_MT_CODES = new Set(['HF27', 'HF30', 'CX05', 'ML04', 'TP01', 'XL08']);

function determineUomAndBasis(code: string, existingUom?: string | null, rawMaterialUom?: string | null) {
  const c = code.toUpperCase();
  if (EXPLICIT_MT_CODES.has(c)) {
    return { uom: 'MT', priceBasis: 'PER_TON' as const };
  }
  if (
    c === 'A-ECAP10' ||
    (rawMaterialUom && rawMaterialUom.toLowerCase() === 'pcs') ||
    (existingUom && existingUom.toUpperCase() === 'PCS')
  ) {
    return { uom: 'PCS', priceBasis: 'PER_PCS' as const };
  }
  const u = existingUom || rawMaterialUom || 'kg';
  const canonical = canonicalizePriceUom(u);
  if (canonical === 'MT') {
    return { uom: 'MT', priceBasis: 'PER_TON' as const };
  }
  if (canonical === 'PCS') {
    return { uom: 'PCS', priceBasis: 'PER_PCS' as const };
  }
  if (canonical === 'M') {
    return { uom: 'm', priceBasis: 'PER_METER' as const };
  }
  return { uom: 'kg', priceBasis: 'PER_KG' as const };
}

function normalizeCurrency(curr?: string | null): string {
  if (!curr) return 'USD';
  const c = curr.trim().toUpperCase();
  if (c === 'EURO' || c === 'EUR') return 'EUR';
  if (c === 'LE' || c === 'EGP') return 'LE';
  if (c === 'SAR') return 'SAR';
  if (c === 'GBP') return 'GBP';
  return c;
}

export async function deduplicateAndApproveRawMaterialPrices() {
  const prisma = getPrisma();
  if (!prisma) throw new Error('Database connection failed (Prisma client not available).');

  const beforeTotal = await prisma.rawMaterialPrice.count();
  const allPrices = await prisma.rawMaterialPrice.findMany({
    include: { rawMaterial: true },
    orderBy: [{ rawMaterialCode: 'asc' }, { createdAt: 'desc' }],
  });

  const byCode = new Map<string, typeof allPrices>();
  for (const p of allPrices) {
    const list = byCode.get(p.rawMaterialCode.toUpperCase()) || [];
    list.push(p);
    byCode.set(p.rawMaterialCode.toUpperCase(), list);
  }

  const allDeletedIds: string[] = [];
  const deduplicatedReport: Array<{
    code: string;
    description: string;
    price: number | null;
    currency: string;
    uom: string;
    priceBasis: string;
    status: string;
    workflowStatus: string;
    keptId: string;
    deletedCount: number;
    deletedIds: string[];
  }> = [];

  for (const [code, list] of byCode.entries()) {
    // Rank candidates to determine the best canonical record to keep
    const sorted = [...list].sort((a, b) => {
      // 1. Approved first
      const aApproved = a.workflowStatus === 'APPROVED' ? 1 : 0;
      const bApproved = b.workflowStatus === 'APPROVED' ? 1 : 0;
      if (aApproved !== bApproved) return bApproved - aApproved;

      // 2. Explicit MT / PCS matching
      if (EXPLICIT_MT_CODES.has(code)) {
        const aMt = a.uom === 'MT' || a.uom === 'ton' ? 1 : 0;
        const bMt = b.uom === 'MT' || b.uom === 'ton' ? 1 : 0;
        if (aMt !== bMt) return bMt - aMt;
      }
      if (code === 'A-ECAP10') {
        const aPcs = a.uom === 'PCS' ? 1 : 0;
        const bPcs = b.uom === 'PCS' ? 1 : 0;
        if (aPcs !== bPcs) return bPcs - aPcs;
      }

      // 3. Valid non-null price first
      const aHasPrice = a.price != null ? 1 : 0;
      const bHasPrice = b.price != null ? 1 : 0;
      if (aHasPrice !== bHasPrice) return bHasPrice - aHasPrice;

      // 4. Higher revision first
      if (a.revision !== b.revision) return b.revision - a.revision;

      // 5. Latest created date first
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    const canonical = sorted[0];
    const duplicates = sorted.slice(1);
    const duplicateIds = duplicates.map((d) => d.id);
    allDeletedIds.push(...duplicateIds);

    const rmUom = canonical.rawMaterial?.uom;
    const { uom, priceBasis } = determineUomAndBasis(code, canonical.uom, rmUom);
    const currency = normalizeCurrency(canonical.currency);

    // Update canonical record to Status = ACTIVE, Approval Status = APPROVED
    await prisma.rawMaterialPrice.update({
      where: { id: canonical.id },
      data: {
        rawMaterialCode: canonical.rawMaterialCode, // keep original case
        currency,
        uom,
        priceBasis,
        status: 'ACTIVE',
        workflowStatus: 'APPROVED',
        isCurrent: true,
        approvedBy: canonical.approvedBy || 'costing-admin',
        approvedAt: canonical.approvedAt || new Date(),
        temporalStatus: canonical.effectiveFrom ? 'EFFECTIVE' : 'DATA_REQUIRED',
      },
    });

    // Delete redundant duplicate records
    if (duplicateIds.length > 0) {
      await prisma.rawMaterialPrice.deleteMany({
        where: { id: { in: duplicateIds } },
      });
    }

    // Ensure raw material price status is marked CONFIGURED
    if (canonical.price != null) {
      await prisma.rawMaterial.update({
        where: { code: canonical.rawMaterialCode },
        data: { priceStatus: 'CONFIGURED', status: 'ACTIVE' },
      });
    }

    deduplicatedReport.push({
      code,
      description: canonical.rawMaterial?.description || '',
      price: canonical.price != null ? Number(canonical.price) : null,
      currency,
      uom,
      priceBasis,
      status: 'ACTIVE',
      workflowStatus: 'APPROVED',
      keptId: canonical.id,
      deletedCount: duplicates.length,
      deletedIds: duplicateIds,
    });
  }

  const afterTotal = await prisma.rawMaterialPrice.count();
  const activeCount = await prisma.rawMaterialPrice.count({ where: { status: 'ACTIVE' } });
  const approvedCount = await prisma.rawMaterialPrice.count({ where: { workflowStatus: 'APPROVED' } });

  return {
    beforeTotal,
    afterTotal,
    deletedDuplicatesTotal: allDeletedIds.length,
    uniqueCodesTotal: byCode.size,
    activeCount,
    approvedCount,
    deduplicatedReport,
  };
}

async function main() {
  const result = await deduplicateAndApproveRawMaterialPrices();
  console.log(
    JSON.stringify(
      {
        summary: {
          totalBefore: result.beforeTotal,
          totalAfter: result.afterTotal,
          duplicatesRemoved: result.deletedDuplicatesTotal,
          uniqueCodes: result.uniqueCodesTotal,
          statusActiveCount: result.activeCount,
          approvalStatusApprovedCount: result.approvedCount,
        },
        sampleReport: result.deduplicatedReport.slice(0, 15),
      },
      null,
      2
    )
  );

  await disconnectPrisma();
}

if (process.argv[1]?.endsWith('deduplicateRawMaterialPrices.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
