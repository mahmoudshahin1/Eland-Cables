/**
 * One-off cleanup of increment / lab costing configuration.
 * Does not delete official Cable Master, official Raw Material List, official BOMs,
 * or ELAND regression cables (10009487 / 10009546 / 10010347 / 10010439).
 *
 * Run: npx tsx scripts/resetCostingTestData.ts
 */
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  isIncrementTestCableCode,
  isIncrementTestScrapCode,
  isSyntheticCostingConfigCode,
  isSyntheticRawMaterialCode,
} from '../src/domain/costingSyntheticCodes';

dotenv.config();

const ELAND = new Set(['10009487', '10009546', '10010347', '10010439']);

function matchesAny(code: string, testers: Array<(c: string) => boolean>) {
  return testers.some((fn) => fn(code));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set.');
  }
  const prisma = new PrismaClient();
  const counts: Record<string, number> = {};

  try {
    const [rms, prices, variables, formulas, scraps, cables] = await Promise.all([
      prisma.rawMaterial.findMany({ select: { code: true } }),
      prisma.rawMaterialPrice.findMany({ select: { id: true, rawMaterialCode: true } }),
      prisma.costingVariable.findMany({ select: { id: true, code: true, isSystem: true } }),
      prisma.costingFormula.findMany({ select: { id: true, code: true } }),
      prisma.costingScrapRule.findMany({ select: { id: true, code: true, sourceReference: true } }),
      prisma.cableMaster.findMany({ select: { materialNumber: true } }),
    ]);

    const rmCodes = rms.map((r) => r.code).filter((c) => isSyntheticRawMaterialCode(c));
    const priceIds = prices.filter((p) => isSyntheticRawMaterialCode(p.rawMaterialCode)).map((p) => p.id);
    const varIds = variables.filter((v) => !v.isSystem && isSyntheticCostingConfigCode(v.code)).map((v) => v.id);
    const formulaIds = formulas.filter((f) => isSyntheticCostingConfigCode(f.code)).map((f) => f.id);
    const scrapIds = scraps
      .filter(
        (s) =>
          isIncrementTestScrapCode(s.code) ||
          /increment\s*1[34]|i13|i14/i.test(s.sourceReference || '')
      )
      .map((s) => s.id);
    const testCables = cables
      .map((c) => c.materialNumber)
      .filter((n) => !ELAND.has(n) && isIncrementTestCableCode(n));

    counts.rawMaterialPrices = (
      await prisma.rawMaterialPrice.deleteMany({
        where: { OR: [{ id: { in: priceIds } }, { rawMaterialCode: { in: rmCodes } }] },
      })
    ).count;

    if (formulaIds.length) {
      await prisma.costingFormulaDependency.deleteMany({ where: { formulaVersion: { formulaId: { in: formulaIds } } } });
      await prisma.costingFormulaVersion.deleteMany({ where: { formulaId: { in: formulaIds } } });
      counts.costingFormulas = (await prisma.costingFormula.deleteMany({ where: { id: { in: formulaIds } } })).count;
    } else {
      counts.costingFormulas = 0;
    }

    if (varIds.length) {
      await prisma.costingFormulaDependency.deleteMany({ where: { variableCode: { in: variables.filter((v) => varIds.includes(v.id)).map((v) => v.code) } } });
      counts.costingVariables = (await prisma.costingVariable.deleteMany({ where: { id: { in: varIds } } })).count;
    } else {
      counts.costingVariables = 0;
    }

    counts.costingScrapRules = scrapIds.length
      ? (await prisma.costingScrapRule.deleteMany({ where: { id: { in: scrapIds } } })).count
      : 0;

    const bomWhere = {
      OR: [{ rawMaterialCode: { in: rmCodes } }, { cableMaterialNumber: { in: testCables } }],
    };
    counts.governedBomLinesTestOnly = rmCodes.length || testCables.length
      ? (await prisma.governedBomLine.deleteMany({ where: bomWhere })).count
      : 0;
    counts.sourceBomLinesTestOnly = rmCodes.length || testCables.length
      ? (await prisma.cableBomLine.deleteMany({ where: bomWhere })).count
      : 0;
    counts.bomDuplicateObservationsTest = rmCodes.length || testCables.length
      ? (
          await prisma.bomDuplicateObservation.deleteMany({
            where: { OR: [{ rawMaterialCode: { in: rmCodes } }, { cableMaterialNumber: { in: testCables } }] },
          })
        ).count
      : 0;

    if (testCables.length) {
      await prisma.costingLine.deleteMany({ where: { costingRun: { materialNumber: { in: testCables } } } });
      counts.costingRuns = (await prisma.costingRun.deleteMany({ where: { materialNumber: { in: testCables } } })).count;
      await prisma.costingCalculation.deleteMany({ where: { materialNumber: { in: testCables } } }).catch(() => null);
      await prisma.cableEngineeringMapping.deleteMany({ where: { materialNumber: { in: testCables } } });
      counts.testCables = (await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: testCables } } })).count;
    } else {
      counts.costingRuns = 0;
      counts.testCables = 0;
    }

    counts.rawMaterials = rmCodes.length ? (await prisma.rawMaterial.deleteMany({ where: { code: { in: rmCodes } } })).count : 0;

    const remaining = {
      syntheticRmLeft: (await prisma.rawMaterial.count({ where: { code: { in: rmCodes.length ? rmCodes : ['__none__'] } } })) || 0,
      scrapTestLeft: (
        await prisma.costingScrapRule.findMany({ select: { code: true } })
      ).filter((s) => isIncrementTestScrapCode(s.code)).length,
      officialRm: await prisma.rawMaterial.count({
        where: { NOT: { OR: [{ code: { startsWith: 'I4-RM-' } }, { code: { startsWith: 'TEST-' } }] } },
      }),
      officialCables: await prisma.cableMaster.count(),
      elandPresent: await prisma.cableMaster.count({ where: { materialNumber: { in: [...ELAND] } } }),
    };

    console.log(JSON.stringify({ deleted: counts, remaining, note: 'Official Cable Master / RM list / ELAND cables were not targeted.' }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
