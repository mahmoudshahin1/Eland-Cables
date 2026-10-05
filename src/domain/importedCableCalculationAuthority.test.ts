import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  evaluateMissingSnapshotForCalculation,
  importedCableSatisfiesCalculationEngineering,
  isOfficialEnergyaCableMasterSource,
  isOfficialImportedCableIdentity,
  type ImportedCableCalculationEvidence,
} from './importedCableCalculationAuthority';
import { evaluateVipInquiryReadiness, evaluateVipLineReadiness } from './vipCalculateReadiness';
import {
  evaluateStandardEngineering,
  evaluateStandardPostSubmitReadiness,
  lineRequiresTechnicalOffice,
} from './standardWorkflowReadiness';
import { evaluateLineQuotationReadiness } from './v2QuotationService';
import {
  CUSTOMER_COSTING_NOT_AVAILABLE,
  CUSTOMER_COSTING_READY,
  presentCustomerCostingFromLine,
} from './calculationCompleteness';

const here = dirname(fileURLToPath(import.meta.url));

function catalogCable(
  materialNumber: string,
  bomLineCount: number,
  extra: Partial<ImportedCableCalculationEvidence> = {}
): ImportedCableCalculationEvidence {
  return {
    materialNumber,
    cableMasterApprovalStatus: 'APPROVED',
    engineeringWorkflowStatus: 'APPROVED',
    bomLineCount,
    unresolvedBomConflictCount: 0,
    ...extra,
  };
}

/** Several catalog structures — identities are fixtures, not production branches. */
const CATALOG_STRUCTURES: ImportedCableCalculationEvidence[] = [
  catalogCable('88001001', 3),
  catalogCable('88001002', 8),
  catalogCable('88001003', 14),
  catalogCable('88001004', 6, { cableMasterApprovalStatus: 'IMPORTED' }),
];

function vipLine(imported: ImportedCableCalculationEvidence) {
  return {
    lineId: `line-${imported.materialNumber}`,
    lineNumber: 1,
    v2CurrentSnapshotId: null,
    v2CurrentCuttingPlanId: null,
    v2CurrentDrumPlanId: null,
    importedCable: imported,
    configurationSnapshot: null,
    cuttingPlan: null,
    drumPlan: null,
  };
}

describe('imported catalog calculation authority — generic rule', () => {
  it('recognizes official Energya Cable Master source files', () => {
    assert.equal(isOfficialEnergyaCableMasterSource('Energya Cable Master Data.xlsx (Cable List)'), true);
    assert.equal(isOfficialEnergyaCableMasterSource('i4-fixture.xlsx'), false);
  });

  it('treats numeric Energya identities as official imported cables', () => {
    assert.equal(isOfficialImportedCableIdentity('88001001'), true);
    assert.equal(isOfficialImportedCableIdentity('I8-CABLE-BOM-TEST-01'), false);
  });

  it('A. multiple approved catalog + validated BOM structures calculate without V2 snapshot', () => {
    for (const evidence of CATALOG_STRUCTURES) {
      assert.equal(importedCableSatisfiesCalculationEngineering(evidence), true, String(evidence.materialNumber));
      const gates = evaluateVipLineReadiness(vipLine(evidence));
      assert.equal(gates.find((g) => g.gate === 'CONFIGURATION_SNAPSHOT')?.status, 'PASS');
      assert.equal(gates.find((g) => g.gate === 'CONFIGURATION_SNAPSHOT')?.code, 'IMPORTED_CABLE_AUTHORITY');
      assert.equal(gates.some((g) => g.status === 'BLOCK'), false);
      const quotation = evaluateLineQuotationReadiness(
        {
          lineId: 'l1',
          lineNumber: 1,
          materialNumber: evidence.materialNumber,
          importedCable: evidence,
          configurationSnapshot: null,
        },
        'CREATE_DRAFT'
      );
      assert.equal(quotation.ready, true);
      assert.equal(
        presentCustomerCostingFromLine({
          importedEngineeringReady: true,
          v2CurrentSnapshotId: null,
          costingReadinessStatus: 'READY_FOR_COSTING',
        }).status,
        CUSTOMER_COSTING_READY
      );
    }
  });

  it('E/F. structural invalid BOM, conflicts, and unapproved catalog stay blocked without SNAPSHOT_REQUIRED', () => {
    const emptyBom = catalogCable('88001901', 0);
    assert.equal(importedCableSatisfiesCalculationEngineering(emptyBom), false);
    const emptyGate = evaluateMissingSnapshotForCalculation({ lineNumber: 1, importedCable: emptyBom });
    assert.equal(emptyGate.status, 'BLOCK');
    assert.equal(emptyGate.code, 'BOM_LINES_MISSING');
    assert.notEqual(emptyGate.code, 'SNAPSHOT_REQUIRED');

    const conflicted = catalogCable('88001902', 8, { unresolvedBomConflictCount: 2 });
    assert.equal(importedCableSatisfiesCalculationEngineering(conflicted), false);
    const conflictGate = evaluateVipLineReadiness(vipLine(conflicted)).find((g) => g.status === 'BLOCK');
    assert.ok(conflictGate);
    assert.notEqual(conflictGate?.code, 'SNAPSHOT_REQUIRED');

    const unapproved = catalogCable('88001903', 8, {
      cableMasterApprovalStatus: 'IMPORTED',
      engineeringWorkflowStatus: 'DRAFT',
    });
    assert.equal(importedCableSatisfiesCalculationEngineering(unapproved), false);
    const unapprovedGate = evaluateMissingSnapshotForCalculation({ lineNumber: 1, importedCable: unapproved });
    assert.equal(unapprovedGate.status, 'BLOCK');
    assert.ok(
      unapprovedGate.code === 'CABLE_MASTER_NOT_APPROVED' || unapprovedGate.code === 'ENGINEERING_MAPPING_NOT_APPROVED'
    );
    assert.doesNotMatch(unapprovedGate.message, /snapshot required/i);
  });

  it('G. VIP inquiry with catalog authority is ready without snapshot or shipment', () => {
    const readiness = evaluateVipInquiryReadiness({
      commercialMetadata: {},
      copperPriceRate: 9000,
      aluminiumPriceRate: 2500,
      deliveryDestination: 'Rotterdam',
      incoterms: 'CIF',
      lines: CATALOG_STRUCTURES.map((evidence, index) => ({
        ...vipLine(evidence),
        lineNumber: index + 1,
        lineId: `vip-${index}`,
      })),
    });
    assert.equal(readiness.ready, true);
    assert.equal(
      readiness.gates.filter((g) => g.gate === 'CONFIGURATION_SNAPSHOT' && g.code === 'SNAPSHOT_REQUIRED').length,
      0
    );
    assert.equal(readiness.gates.filter((g) => g.gate === 'CONTAINER_STUDY' && g.status === 'BLOCK').length, 0);
  });

  it('H. STANDARD engineering and costing lineage pass catalog cables without snapshot', () => {
    const lines = CATALOG_STRUCTURES.map((evidence, index) => ({
      lineId: `std-${index}`,
      lineNumber: index + 1,
      v2CurrentSnapshotId: null,
      v2CurrentCuttingPlanId: null,
      v2CurrentDrumPlanId: null,
      importedCable: evidence,
      configurationSnapshot: null,
      cuttingPlan: null,
      drumPlan: null,
    }));
    const engineering = evaluateStandardEngineering(lines);
    assert.equal(engineering.allApproved, true);
    assert.equal(engineering.toRequired, false);
    assert.equal(lineRequiresTechnicalOffice(lines[0]), false);
    const post = evaluateStandardPostSubmitReadiness({
      lines,
      containerStudyEvidence: {
        processCode: 'STANDARD_WORKFLOW',
        shipmentGroups: [],
        studies: [],
        drumPlansConfirmed: false,
      },
    });
    assert.equal(post.lineageGates.some((g) => g.status === 'BLOCK'), false);
  });

  it('I. STANDARD still blocks genuine cutting/drum requirements when catalog authority is absent', () => {
    const post = evaluateStandardPostSubmitReadiness({
      containerStudyEvidence: {
        processCode: 'STANDARD_WORKFLOW',
        shipmentGroups: [],
        studies: [],
        drumPlansConfirmed: false,
      },
      lines: [
        {
          lineId: 'l1',
          lineNumber: 1,
          v2CurrentSnapshotId: 's1',
          v2CurrentCuttingPlanId: null,
          v2CurrentDrumPlanId: null,
          configurationSnapshot: {
            id: 's1',
            validationStatus: 'EXISTING_APPROVED',
            flowState: 'VALID',
            bomGovernanceBlocked: false,
            unresolvedBomConflictCount: 0,
            engineeringStatus: 'Released',
          },
          cuttingPlan: null,
          drumPlan: null,
        },
      ],
    });
    assert.ok(post.lineageGates.some((g) => g.code === 'CUTTING_PLAN_REQUIRED' && g.status === 'BLOCK'));
    assert.ok(post.lineageGates.some((g) => g.code === 'DRUM_PLAN_REQUIRED' && g.status === 'BLOCK'));
  });

  it('VIP calculate still requires snapshot when cable is not catalog-validated', () => {
    const gates = evaluateVipLineReadiness({
      lineId: 'l1',
      lineNumber: 1,
      v2CurrentSnapshotId: null,
      v2CurrentCuttingPlanId: 'c1',
      v2CurrentDrumPlanId: 'd1',
      configurationSnapshot: null,
      cuttingPlan: { id: 'c1', validationStatus: 'VALID' },
      drumPlan: { id: 'd1', lifecycleStatus: 'CONFIRMED' },
    });
    assert.ok(gates.some((g) => g.code === 'SNAPSHOT_REQUIRED' && g.status === 'BLOCK'));
  });

  it('L. calculation orchestrators do not fabricate V2 configuration snapshots', () => {
    const files = [
      join(here, '../server/vipCalculateService.ts'),
      join(here, '../server/standardWorkflowOrchestrator.ts'),
      join(here, '../server/v2QuotationRepository.ts'),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      assert.equal(src.includes('v2ConfigurationSnapshot.create'), false, file);
      assert.equal(src.includes('markSnapshotAsCurrent'), false, file);
      assert.equal(/if\s*\(\s*!.*v2CurrentSnapshotId[\s\S]{0,80}createSnapshot\s*\(/.test(src), false, file);
    }
  });
});
