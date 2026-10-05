import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  assessBomGovernanceBoundary,
  buildConfigurationSnapshot,
  canProceedToDownstream,
  deriveFlowState,
  evaluateDownstreamGates,
  mergeServerCableMatches,
  V2_CABLE_CONFIG_LS_INVENTORY,
  V2_CABLE_CONFIGURATION_READINESS,
} from '../components/cable-configurator/v2/services/v2CableConfigurationService';
import {
  evaluateCableConfigurationV2,
  selectionsToConfig,
} from '../components/cable-configurator/v2/services/technicalValidationEngineV2';
import { evaluateCableAuthority } from '../domain/cableAuthority';
import { EXPECTED_OFFICIAL_CONFLICT_COUNT } from '../server/bomConflictGovernanceService';
import { sotStatusForEntity } from './masterDataSoT';
import type { SelectionStateV2, TechnicalValidationResultV2 } from '../components/cable-configurator/v2/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(repoRoot, 'src', rel), 'utf8');
}

const baseSelections: SelectionStateV2 = {
  selectionMode: 'TECHNICAL',
  family: 'UGC',
  voltageClass: 'MV',
  voltage: '6/10 kV (6.35/11 kV)',
  conductorMaterial: 'CU',
  conductorClass: 'Class 2 — Stranded',
  conductorSize: '120 mm²',
  cores: '1 Core',
  coresCount: 1,
  coreColors: { 1: 'Black' },
  insulation: 'XLPE',
  outerSemiConductor: 'Strippable',
  screenType: 'Copper Wire',
  screenCSA: '16 mm²',
  armour: 'No Armour',
  sheathing: 'MDPE',
  sheathingColor: 'Black',
  specialAdditives: ['UV Resistant'],
  cpr: 'No',
};

function validationFixture(
  overrides: Partial<TechnicalValidationResultV2>
): TechnicalValidationResultV2 {
  return {
    status: 'EXISTING_APPROVED',
    isValid: true,
    errors: [],
    warnings: [],
    matchingCable: {
      id: 'c1',
      materialNumber: '10009557',
      itemCode: 'ICO171',
      customerCode: 'N2XS2Y',
      description: 'Test cable',
      family: 'MV',
      voltageClass: 'MV',
      voltage: '6/10 kV',
      standard: 'IEC 60502-2',
      conductorMaterial: 'Copper',
      conductorClass: 'Class 2',
      conductorSize: '120 mm²',
      conductorSizeNum: 120,
      conductorWaterTight: 'No',
      cores: '1 Core',
      coresCount: 1,
      coreColors: ['Black'],
      coreIdentification: 'HD 308',
      coreConstruction: 'Single Core',
      insulation: 'XLPE',
      insulationColor: 'Natural',
      insulationThicknessMm: 3.4,
      outerSemiConductor: 'Strippable',
      outerSemiConductorType: 'Strippable',
      screenType: 'Copper Wire Screen',
      screenMaterial: 'Copper',
      screenCSA: '16 mm²',
      screenWaterTight: 'No',
      screenConstruction: 'Helical',
      armour: 'None',
      armourMaterial: 'None',
      armourCSA: 'None',
      armourWaterTight: 'No',
      sheathing: 'MDPE ST7',
      sheathingColor: 'Black',
      specialAdditives: [],
      semiConduct: 'No',
      graphite: 'No',
      cpr: 'No',
      cprClass: 'Fca',
      edr: 'No',
      outerDiameterMm: 45,
      approxWeightKgKm: 1800,
      minBendingRadiusMm: 540,
      operatingTempC: '90°C',
      shortCircuitRatingKa: '17 kA',
      approvedStatus: 'Released',
      raw: {} as any,
    },
    similarCables: [],
    summaryDescription: 'Cu / XLPE / MDPE 6/10 kV 1X120 mm2',
    estimatedDiameterMm: 45,
    estimatedWeightKgKm: 1800,
    ...overrides,
  };
}

describe('Task 05A V2 Cable Configuration production readiness', () => {
  it('Test A: V2 routes and core modules exist', () => {
    assert.ok(readSrc('components/cable-configurator/v2/components/CableConfiguratorV2.tsx').includes('CableConfiguratorV2'));
    assert.ok(readSrc('server/cableAuthorityRoutes.ts').includes("cableAuthorityRouter.post('/evaluate'"));
    assert.ok(readSrc('domain/cableAuthority.ts').includes('evaluateCableAuthority'));
    assert.ok(readSrc('components/cable-configurator/v2/services/technicalValidationEngineV2.ts').includes('evaluateCableConfigurationV2'));
    assert.ok(readSrc('components/cable-configurator/v2/services/cableSelectionEngineV2.ts').includes('resolveAllMasterRecordsV2'));
  });

  it('Test B: V2 uses authoritative PG cable catalog contract', () => {
    const v2 = readSrc('components/cable-configurator/v2/components/CableConfiguratorV2.tsx');
    const api = readSrc('services/masterDataApiService.ts');
    assert.match(v2, /loadAuthoritativeCableCatalog/);
    assert.match(v2, /\/api\/cables\/evaluate/);
    assert.match(api, /\/api\/master\/cables/);
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
  });

  it('Test C: single technical parameter engine — cableAuthority is sole match authority', () => {
    const engine = readSrc('components/cable-configurator/v2/services/technicalValidationEngineV2.ts');
    assert.match(engine, /evaluateCableAuthority/);
    assert.doesNotMatch(engine, /evaluateDynamicFilterOptions/);
    const config = selectionsToConfig(baseSelections);
    const decision = evaluateCableAuthority(config, { cables: [], parameters: [], compatibility: [] });
    assert.ok(['INVALID_CONFIGURATION', 'CONFIGURATION_REQUIRED', 'TECHNICALLY_VALID_NOT_MASTER'].includes(decision.code));
  });

  it('Test D: configuration flow states map to governed terms', () => {
    assert.equal(
      deriveFlowState(validationFixture({ status: 'EXISTING_APPROVED' }), true, false),
      'VALID'
    );
    assert.equal(
      deriveFlowState(validationFixture({ status: 'EXISTING_APPROVED' }), false, false),
      'INCOMPLETE_ENGINEERING_DATA'
    );
    assert.equal(
      deriveFlowState(validationFixture({ status: 'VALID_NEW_CABLE', isValid: true, matchingCable: null }), true, false),
      'BLOCKED_ENGINEERING_APPROVAL'
    );
    assert.equal(
      deriveFlowState(validationFixture({ status: 'INVALID_CONFIGURATION', isValid: false }), true, false),
      'INVALID'
    );
    assert.equal(
      deriveFlowState(validationFixture({ status: 'CONFIGURATION_REQUIRED', isValid: false }), true, false),
      'INCOMPLETE_ENGINEERING_DATA'
    );
    assert.equal(
      deriveFlowState(validationFixture({ status: 'EXISTING_APPROVED' }), true, true),
      'ENGINEERING_DATA_BLOCKED'
    );
  });

  it('Test E: BOM governance boundary blocks costing without silent LS fallback', () => {
    const bom = assessBomGovernanceBoundary(EXPECTED_OFFICIAL_CONFLICT_COUNT);
    assert.equal(bom.blocked, true);
    assert.match(bom.reason, /ENGINEERING DATA BLOCKED/i);
    assert.equal(sotStatusForEntity('CableBomLine')?.status, 'POSTGRESQL_PRIMARY');
    const boms = readSrc('services/cableBomService.ts');
    assert.match(boms, /BOM_LOCAL_IS_AUTHORITATIVE\s*=\s*false/);
  });

  it('Test F: configuration snapshot preserves identity, params, engineering status, actor', () => {
    const validation = validationFixture({});
    const snapshot = buildConfigurationSnapshot({
      selections: baseSelections,
      validation,
      catalogSource: 'POSTGRESQL',
      catalogAuthoritative: true,
      unresolvedBomConflictCount: 0,
      actorContext: { email: 'eng@energya.com', role: 'INTERNAL' },
      snapshotId: 'snap-test-1',
      capturedAt: '2026-09-05T00:00:00.000Z',
    });
    assert.equal(snapshot.snapshotId, 'snap-test-1');
    assert.equal(snapshot.cableMaterialNumber, '10009557');
    assert.equal(snapshot.itemCode, 'ICO171');
    assert.deepEqual(snapshot.configInput.family, baseSelections.family);
    assert.equal(snapshot.engineeringStatus, 'Released');
    assert.equal(snapshot.actorContext?.email, 'eng@energya.com');
    assert.equal(snapshot.catalogAuthoritative, true);
  });

  it('Test G: customer-facing evaluate route does not require cable master write RBAC', () => {
    const routes = readSrc('server/cableAuthorityRoutes.ts');
    const evalBlock = routes.match(/cableAuthorityRouter\.post\('\/evaluate'[\s\S]*?\n\}\);/);
    assert.ok(evalBlock, 'evaluate route handler present');
    assert.doesNotMatch(evalBlock![0], /assertCanWriteCableMaster/);
  });

  it('Test H: internal Technical Office list enforces RBAC', () => {
    const routes = readSrc('server/cableAuthorityRoutes.ts');
    assert.match(routes, /assertCanProcessTechnicalOffice/);
    assert.match(routes, /technicalOfficeRouter\.get\('\/requests'/);
  });

  it('Test I: cable search supports customer isolation filter', () => {
    const routes = readSrc('server/cableAuthorityRoutes.ts');
    assert.match(routes, /customerCode/);
    const searchModal = readSrc('components/common/CableSearchSelectModal.tsx');
    assert.match(searchModal, /customerCode/);
  });

  it('Test J: cutting length handoff gated on VALID + authoritative catalog', () => {
    const snap = buildConfigurationSnapshot({
      selections: baseSelections,
      validation: validationFixture({}),
      catalogSource: 'POSTGRESQL',
      catalogAuthoritative: true,
      unresolvedBomConflictCount: EXPECTED_OFFICIAL_CONFLICT_COUNT,
    });
    assert.equal(canProceedToDownstream(snap, 'cuttingLength'), true);

    const blocked = buildConfigurationSnapshot({
      selections: baseSelections,
      validation: validationFixture({ status: 'INVALID_CONFIGURATION', isValid: false, matchingCable: null }),
      catalogSource: 'LOCALSTORAGE_FALLBACK',
      catalogAuthoritative: false,
    });
    assert.equal(canProceedToDownstream(blocked, 'cuttingLength'), false);
  });

  it('Test K: drum selection handoff follows same gate as cutting length', () => {
    const snap = buildConfigurationSnapshot({
      selections: baseSelections,
      validation: validationFixture({}),
      catalogSource: 'POSTGRESQL',
      catalogAuthoritative: true,
      unresolvedBomConflictCount: EXPECTED_OFFICIAL_CONFLICT_COUNT,
    });
    assert.equal(snap.downstreamGates.drumSelection, snap.downstreamGates.cuttingLength);
    assert.equal(canProceedToDownstream(snap, 'drumSelection'), true);
  });

  it('Test L: costing handoff blocked by BOM governance (verify gates only)', () => {
    const snap = buildConfigurationSnapshot({
      selections: baseSelections,
      validation: validationFixture({}),
      catalogSource: 'POSTGRESQL',
      catalogAuthoritative: true,
      unresolvedBomConflictCount: EXPECTED_OFFICIAL_CONFLICT_COUNT,
    });
    assert.equal(canProceedToDownstream(snap, 'cuttingLength'), true);
    assert.equal(canProceedToDownstream(snap, 'costing'), false);
    assert.equal(canProceedToDownstream(snap, 'quotation'), false);
    const costing = readSrc('domain/costingEngine.ts');
    assert.match(costing, /evaluateCostingGates/);
    assert.match(costing, /Gate 2 Failed: BOM conflict/);
  });

  it('Test M: LS inventory classified UI_STATE / CACHE / NON_AUTHORITATIVE / PROHIBITED', () => {
    const classes = new Set(V2_CABLE_CONFIG_LS_INVENTORY.map((e) => e.classification));
    assert.ok(classes.has('UI_STATE'));
    assert.ok(classes.has('CACHE'));
    assert.ok(classes.has('NON_AUTHORITATIVE'));
    assert.ok(classes.has('PROHIBITED'));
    const prohibited = V2_CABLE_CONFIG_LS_INVENTORY.find((e) => e.key === 'energya_cable_boms_v3');
    assert.equal(prohibited?.classification, 'PROHIBITED');
  });

  it('Test N: server TCR mutation path exists (appendServerAudit via repository)', () => {
    const routes = readSrc('server/cableAuthorityRoutes.ts');
    assert.match(routes, /createTechnicalOfficeRequest/);
    const repo = readSrc('server/masterDataRepository.ts');
    assert.match(repo, /createTechnicalOfficeRequest/);
  });

  it('Test O: V2 does not import SmartConfigurator as authority', () => {
    const v2Dir = [
      'components/cable-configurator/v2/components/CableConfiguratorV2.tsx',
      'components/cable-configurator/v2/services/cableSelectionEngineV2.ts',
      'components/cable-configurator/v2/services/technicalValidationEngineV2.ts',
      'components/cable-configurator/v2/services/technicalOfficeServiceV2.ts',
    ];
    for (const file of v2Dir) {
      const src = readSrc(file);
      assert.doesNotMatch(src, /SmartConfigurator/);
      assert.doesNotMatch(src, /cableConstraintEngine/);
      assert.doesNotMatch(src, /evaluateDynamicFilterOptions/);
    }
  });

  it('Test P: V2 does not import legacy V1 modal configurator as authority', () => {
    const v2Files = [
      'components/cable-configurator/v2/components/CableConfiguratorV2.tsx',
      'components/cable-configurator/v2/services/v2CableConfigurationService.ts',
      'components/cable-configurator/v2/services/technicalValidationEngineV2.ts',
    ];
    for (const file of v2Files) {
      const src = readSrc(file);
      assert.doesNotMatch(src, /from ['"].*CableConfiguratorModal/);
      assert.doesNotMatch(src, /from ['"].*SmartConfigurator/);
    }
  });

  it('Test Q: Cable BOM governance debt preserved — no mass resolution', () => {
    assert.equal(EXPECTED_OFFICIAL_CONFLICT_COUNT, 81);
    assert.equal(sotStatusForEntity('CableBomLine')?.postgresSoT, false);
    const readiness = V2_CABLE_CONFIGURATION_READINESS.bomGovernanceBoundary;
    assert.equal(readiness.classification, 'BLOCKED');
  });

  it('Test R: production readiness classifications per area', () => {
    const areas = Object.keys(V2_CABLE_CONFIGURATION_READINESS);
    assert.ok(areas.length >= 15);
    for (const area of areas) {
      const row = V2_CABLE_CONFIGURATION_READINESS[area as keyof typeof V2_CABLE_CONFIGURATION_READINESS];
      assert.ok(['LIVE', 'PARTIAL', 'BLOCKED', 'MISSING', 'MOCK'].includes(row.classification));
      assert.ok(row.evidence.length > 0);
    }
    assert.equal(V2_CABLE_CONFIGURATION_READINESS.costingHandoff.classification, 'BLOCKED');
    assert.equal(V2_CABLE_CONFIGURATION_READINESS.v1Exclusion.classification, 'LIVE');
  });

  it('Test S: documentation spec file exists with 24 sections', () => {
    const docPath = join(repoRoot, 'docs', 'v2', '34_V2_CABLE_CONFIGURATION_PRODUCTION_READINESS.md');
    const doc = readFileSync(docPath, 'utf8');
    const sections = doc.match(/^## \d+\./gm) ?? [];
    assert.ok(sections.length >= 24, `expected 24 sections, found ${sections.length}`);
    assert.match(doc, /NOT production-ready|PARTIAL|BLOCKED/i);
  });

  it('mergeServerCableMatches prefers decision.matches over cable', () => {
    const matches = [{ id: '1', materialNumber: 'A', itemCode: 'X', customerCode: 'C', description: 'd' }];
    const cable = { id: '2', materialNumber: 'B', itemCode: 'Y', customerCode: 'C', description: 'd' };
    assert.deepEqual(mergeServerCableMatches(matches, cable), matches);
    assert.deepEqual(mergeServerCableMatches([], cable), [cable]);
    assert.deepEqual(mergeServerCableMatches(undefined, undefined), []);
  });

  it('evaluateDownstreamGates blocks all stages when INVALID', () => {
    const gates = evaluateDownstreamGates({
      flowState: 'INVALID',
      validationStatus: 'INVALID_CONFIGURATION',
      catalogAuthoritative: true,
      bomGovernanceBlocked: false,
      matchingCable: null,
    });
    assert.equal(gates.cuttingLength, false);
    assert.equal(gates.costing, false);
    assert.equal(gates.quotation, false);
  });

  it('evaluateCableConfigurationV2 integrates cableAuthority decision codes', () => {
    const result = evaluateCableConfigurationV2(baseSelections, [], {
      cables: [],
      parameters: [],
      compatibility: [],
    });
    assert.ok(
      ['VALID_NEW_CABLE', 'INVALID_CONFIGURATION', 'CONFIGURATION_REQUIRED'].includes(result.status)
    );
  });
});
