import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import {
  BOM_GOVERNANCE_CLASSIFICATIONS,
  BOM_GOVERNANCE_DISPOSITIONS,
  EXPECTED_OFFICIAL_CONFLICT_COUNT,
  OFFICIAL_BOM_CONFLICT_ID_PREFIX,
  buildBomConflictGovernanceRegister,
  classifyBomConflictEvidence,
  dispositionForBomClassification,
  summarizeGovernanceRegister,
  validateBomImportConflictPreservation,
} from '../server/bomConflictGovernanceService';
import { listBomConflictRegister } from '../server/governanceRepository';
import {
  allCutoverGatesPassed,
  canPromoteToPostgresqlSot,
  cutoverMatrixForEntity,
  sotStatusForEntity,
} from './masterDataSoT';
import { checkDatabase, disconnectPrisma, getPrisma } from '../server/db';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const registerPath = join(__dirname, '..', '..', 'data', 'governance', 'bom-conflict-register.json');

describe('Task 04B-13 Cable BOM conflict governance', () => {
  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
  });

  after(async () => {
    await disconnectPrisma();
  });

  it('Test A: all 81 official conflict groups preserved in PostgreSQL', async () => {
    const prisma = getPrisma();
    const official = await prisma!.bomDuplicateObservation.count({
      where: { conflictId: { startsWith: OFFICIAL_BOM_CONFLICT_ID_PREFIX } },
    });
    assert.equal(official, EXPECTED_OFFICIAL_CONFLICT_COUNT);
  });

  it('Test B: governance register lists every official conflict without loss', async () => {
    const register = await buildBomConflictGovernanceRegister({ generatedBy: 'test' });
    assert.equal(register.totalConflicts, EXPECTED_OFFICIAL_CONFLICT_COUNT);
    assert.equal(register.conflicts.length, EXPECTED_OFFICIAL_CONFLICT_COUNT);
    const ids = new Set(register.conflicts.map((c) => c.conflictId));
    assert.equal(ids.size, EXPECTED_OFFICIAL_CONFLICT_COUNT);
  });

  it('Test C: every row uses lettered classification taxonomy A–L', async () => {
    const register = await buildBomConflictGovernanceRegister({ generatedBy: 'test' });
    for (const row of register.conflicts) {
      assert.ok(row.classificationLetter in BOM_GOVERNANCE_CLASSIFICATIONS);
      assert.equal(row.classification, BOM_GOVERNANCE_CLASSIFICATIONS[row.classificationLetter as keyof typeof BOM_GOVERNANCE_CLASSIFICATIONS]);
      assert.ok(row.classificationReason.length > 0);
    }
  });

  it('Test D: every row has an allowed governance disposition', async () => {
    const register = await buildBomConflictGovernanceRegister({ generatedBy: 'test' });
    for (const row of register.conflicts) {
      assert.ok(BOM_GOVERNANCE_DISPOSITIONS.includes(row.disposition));
      assert.ok(row.dispositionReason.length > 0);
    }
  });

  it('Test E: source CableBomLine volume preserved — no mass deletion', async () => {
    const prisma = getPrisma();
    const totalSourceBoms = await prisma!.cableBomLine.count();
    assert.ok(totalSourceBoms >= 4822);
    const register = await buildBomConflictGovernanceRegister({ generatedBy: 'test' });
    assert.equal(register.recordsDeleted, 0);
    assert.equal(register.recordsMerged, 0);
  });

  it('Test F: no mass auto-approve — zero AUTO_RESOLVE_SAFE without explicit evidence', async () => {
    const register = await buildBomConflictGovernanceRegister({ generatedBy: 'test' });
    const approved = register.conflicts.filter((c) => c.investigationStatus === 'APPROVED');
    assert.equal(approved.length, 0, '04B-13 must not mass-approve conflicts to game gates');
    for (const row of register.conflicts) {
      if (row.disposition === 'AUTO_RESOLVE_SAFE') {
        assert.ok(row.relativeDelta != null && row.relativeDelta < 0.005);
      }
    }
  });

  it('Test G: cutover OUTCOME B — CableBomLine remains POSTGRESQL_PRIMARY', () => {
    const bom = sotStatusForEntity('CableBomLine');
    assert.ok(bom);
    assert.equal(bom.status, 'POSTGRESQL_PRIMARY');
    assert.equal(bom.postgresSoT, false);
    assert.equal(canPromoteToPostgresqlSot(bom), false);
    const matrix = cutoverMatrixForEntity('CableBomLine');
    assert.ok(matrix);
    assert.equal(matrix.cutoverReady, false);
    assert.match(String(matrix.blockingReason || ''), /81|governance|BomDuplicateObservation/i);
  });

  it('Test H: import pipeline guard rejects silent conflict deletion or mass approval', () => {
    const blockedDelete = validateBomImportConflictPreservation({
      existingOfficialConflictCount: 81,
      incomingDuplicateGroups: 2,
      proposedDeletes: 1,
      proposedMassApprovals: 0,
    });
    assert.equal(blockedDelete.valid, false);
    assert.match(blockedDelete.errors.join(' '), /must not delete/i);

    const blockedApprove = validateBomImportConflictPreservation({
      existingOfficialConflictCount: 81,
      incomingDuplicateGroups: 2,
      proposedDeletes: 0,
      proposedMassApprovals: 5,
    });
    assert.equal(blockedApprove.valid, false);
    assert.match(blockedApprove.errors.join(' '), /mass-approve/i);

    const blockedReduction = validateBomImportConflictPreservation({
      existingOfficialConflictCount: 81,
      incomingDuplicateGroups: 2,
      proposedDeletes: 0,
      proposedMassApprovals: 0,
      proposedOfficialConflictReduction: 3,
    });
    assert.equal(blockedReduction.valid, false);
    assert.match(blockedReduction.errors.join(' '), /must not reduce/i);

    const ok = validateBomImportConflictPreservation({
      existingOfficialConflictCount: 81,
      incomingDuplicateGroups: 0,
      proposedDeletes: 0,
      proposedMassApprovals: 0,
    });
    assert.equal(ok.valid, true);
  });

  it('Test I: existing Technical Office governance register API remains authoritative', async () => {
    const register = await listBomConflictRegister();
    const official = register.filter((r) => r.conflictId?.startsWith(OFFICIAL_BOM_CONFLICT_ID_PREFIX));
    assert.equal(official.length, EXPECTED_OFFICIAL_CONFLICT_COUNT);
  });

  it('Test J: workflow classifications remain on observations — governance is additive', async () => {
    const prisma = getPrisma();
    const first = await prisma!.bomDuplicateObservation.findFirst({
      where: { conflictId: `${OFFICIAL_BOM_CONFLICT_ID_PREFIX}001` },
    });
    assert.ok(first);
    assert.ok(Number(first.weightA) > 0);
    assert.ok(Number(first.weightB) > 0);
    assert.notEqual(Number(first.weightA), Number(first.weightB));
  });

  it('Test K: costing impact flagged BLOCKED or NO_SOURCE_LINE for unresolved conflicts', async () => {
    const register = await buildBomConflictGovernanceRegister({ generatedBy: 'test' });
    const unresolved = register.conflicts.filter((c) => c.investigationStatus !== 'APPROVED');
    assert.equal(unresolved.length, EXPECTED_OFFICIAL_CONFLICT_COUNT);
    for (const row of unresolved) {
      assert.ok(['BLOCKED_UNTIL_RESOLVED', 'NO_SOURCE_LINE'].includes(row.costingImpact));
    }
  });

  it('Test L: bomVersion semantics unchanged — all conflicts at default version grain', async () => {
    const prisma = getPrisma();
    const versionDistinct = await prisma!.cableBomLine.groupBy({
      by: ['bomVersion'],
      _count: true,
    });
    assert.ok(versionDistinct.every((v) => v.bomVersion === 1));
  });

  it('Test M: committed JSON register matches live PostgreSQL inventory', async () => {
    const live = await buildBomConflictGovernanceRegister({ generatedBy: 'test' });
    const committed = JSON.parse(readFileSync(registerPath, 'utf8')) as Awaited<
      ReturnType<typeof buildBomConflictGovernanceRegister>
    >;
    assert.equal(committed.totalConflicts, live.totalConflicts);
    assert.equal(committed.conflicts.length, live.conflicts.length);
    assert.deepEqual(Object.keys(committed.classificationCounts).sort(), Object.keys(live.classificationCounts).sort());
  });

  it('Test N: promotion gates pass but entity not promoted — honest registry', () => {
    const bom = sotStatusForEntity('CableBomLine');
    assert.ok(bom);
    assert.equal(allCutoverGatesPassed(bom.gates), true);
    assert.equal(canPromoteToPostgresqlSot(bom), false);
  });

  it('Test O: governance summary reports zero deleted records and OUTCOME B', async () => {
    const register = await buildBomConflictGovernanceRegister({ generatedBy: 'test' });
    const summary = summarizeGovernanceRegister(register);
    assert.equal(summary.recordsDeleted, 0);
    assert.equal(summary.cableBomPromoted, false);
    assert.equal(summary.cutoverOutcome, 'OUTCOME_B_ENGINEERING_REVIEW');
    assert.ok(summary.engineeringReviewRequired > 0);
  });

  it('classifyBomConflictEvidence maps near-equal weights to TRUE_DUPLICATE', () => {
    const result = classifyBomConflictEvidence({
      weightA: 100,
      weightB: 100.2,
      rawMaterialCode: 'CR01',
      uom: 'kg',
      occurrenceCount: 2,
      sourceCableBomLineCount: 0,
    });
    assert.equal(result.classification, 'TRUE_DUPLICATE');
    assert.equal(result.classificationLetter, 'A');
  });

  it('dispositionForBomClassification never returns RETIRE_OBSOLETE without SOURCE_DATA_ERROR', () => {
    for (const classification of Object.values(BOM_GOVERNANCE_CLASSIFICATIONS)) {
      const { disposition } = dispositionForBomClassification({
        classification,
        relativeDelta: 0.5,
        investigationStatus: 'BUSINESS_DECISION_REQUIRED',
        occurrenceCount: 2,
      });
      if (disposition === 'RETIRE_OBSOLETE') {
        assert.equal(classification, 'SOURCE_DATA_ERROR');
      }
    }
  });
});
