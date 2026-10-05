import dotenv from 'dotenv';
import { evaluateCableCostingReadiness } from '../src/server/governanceRepository';
import { disconnectPrisma } from '../src/server/db';

dotenv.config();

async function main() {
  const list = await evaluateCableCostingReadiness();
  const summary = {
    totalCables: list.length,
    readyForCosting: list.filter((c) => c.overallStatus === 'READY_FOR_COSTING').length,
    dataIssue: list.filter((c) => c.overallStatus === 'DATA_ISSUE').length,
    underReview: list.filter((c) => c.overallStatus === 'UNDER_REVIEW').length,
    notReady: list.filter((c) => c.overallStatus === 'NOT_READY').length,
    gate1Failures: list.filter((c) => c.blockingReasons.some((r) => r.includes('Gate 1'))).length,
    gate2Failures: list.filter((c) => c.blockingReasons.some((r) => r.includes('Gate 2'))).length,
    gate3Failures: list.filter((c) => c.blockingReasons.some((r) => r.includes('Gate 3'))).length,
    gate4Failures: list.filter((c) => c.blockingReasons.some((r) => r.includes('Gate 4'))).length,
    sampleBlockers: list
      .filter((c) => c.overallStatus !== 'READY_FOR_COSTING')
      .slice(0, 3)
      .map((c) => ({ materialNumber: c.materialNumber, reasons: c.blockingReasons.slice(0, 2) })),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
