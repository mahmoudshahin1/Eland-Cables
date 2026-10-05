/**
 * One-shot: normalize ACTIVE Drum Master engineering fields per TO rule.
 * - clearanceMm = 50 for all ACTIVE
 * - maxWeight (MaxLoad) = capacity when capacity > 0
 * - reports MaxLoad≠Capacity overrides before apply
 * - does NOT invent capacity; does NOT touch emptyDrumNetWeightKg; does NOT duplicate drums
 *
 * Run: npx tsx scripts/normalizeDrumEngineeringFromCapacity.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Diag = {
  active: number;
  withValidCapacity: number;
  invalidCapacityCodes: string[];
  withClearance: number;
  clearanceEquals50: number;
  withMaxLoad: number;
  maxLoadEqualsCapacity: number;
  maxLoadDiffersFromCapacity: Array<{ code: string; capacity: number; maxWeight: number }>;
  emptyWeightPopulated: number;
};

async function diagnose(): Promise<Diag> {
  const active = await prisma.drumMaster.findMany({ where: { status: 'ACTIVE' } });
  const withCap = active.filter((d) => d.capacity != null && Number(d.capacity) > 0);
  const invalidCap = active.filter((d) => d.capacity == null || !(Number(d.capacity) > 0));
  const withClearance = active.filter((d) => d.clearanceMm != null);
  const clearance50 = active.filter((d) => d.clearanceMm != null && Number(d.clearanceMm) === 50);
  const withMaxLoad = active.filter((d) => d.maxWeight != null && Number(d.maxWeight) > 0);
  const maxLoadEqualsCapacity = active.filter((d) => {
    const cap = Number(d.capacity);
    const mw = d.maxWeight != null ? Number(d.maxWeight) : null;
    return mw != null && Number.isFinite(cap) && cap > 0 && mw === cap;
  });
  const maxLoadDiffers = active
    .filter((d) => {
      const cap = Number(d.capacity);
      const mw = d.maxWeight != null ? Number(d.maxWeight) : null;
      return mw != null && Number.isFinite(cap) && cap > 0 && mw !== cap;
    })
    .map((d) => ({
      code: d.drumCode,
      capacity: Number(d.capacity),
      maxWeight: Number(d.maxWeight),
    }));

  return {
    active: active.length,
    withValidCapacity: withCap.length,
    invalidCapacityCodes: invalidCap.map((d) => d.drumCode),
    withClearance: withClearance.length,
    clearanceEquals50: clearance50.length,
    withMaxLoad: withMaxLoad.length,
    maxLoadEqualsCapacity: maxLoadEqualsCapacity.length,
    maxLoadDiffersFromCapacity: maxLoadDiffers,
    emptyWeightPopulated: active.filter((d) => d.emptyDrumNetWeightKg != null).length,
  };
}

async function main() {
  const before = await diagnose();
  console.log('=== BEFORE ===');
  console.log(JSON.stringify(before, null, 2));

  if (before.maxLoadDiffersFromCapacity.length > 0) {
    console.log('=== MaxLoad≠Capacity CONFLICTS (will override to Capacity per TO) ===');
    console.log(JSON.stringify(before.maxLoadDiffersFromCapacity, null, 2));
  } else {
    console.log('=== MaxLoad≠Capacity CONFLICTS: none ===');
  }

  if (before.invalidCapacityCodes.length > 0) {
    console.log('=== INVALID CAPACITY (MaxLoad left incomplete) ===');
    console.log(before.invalidCapacityCodes.join(', '));
  }

  const clearanceResult = await prisma.drumMaster.updateMany({
    where: { status: 'ACTIVE' },
    data: { clearanceMm: 50 },
  });

  // Set MaxLoad = Capacity where Capacity valid. Prisma cannot express column-to-column
  // assignment in updateMany, so use raw SQL matching the migration.
  const maxLoadResult = await prisma.$executeRawUnsafe(`
    UPDATE "DrumMaster"
    SET "maxWeight" = "capacity",
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE status = 'ACTIVE'
      AND "capacity" IS NOT NULL
      AND "capacity" > 0
  `);

  const after = await diagnose();
  console.log('=== AFTER ===');
  console.log(JSON.stringify(after, null, 2));
  console.log(
    JSON.stringify(
      {
        clearanceRowsTouched: clearanceResult.count,
        maxLoadRowsTouched: Number(maxLoadResult),
        clearanceNormalizationCount: after.clearanceEquals50,
        maxLoadNormalizationCount: after.maxLoadEqualsCapacity,
        conflictsReported: before.maxLoadDiffersFromCapacity.length,
        incompleteMaxLoadCodes: after.invalidCapacityCodes,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
