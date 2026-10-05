import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MasterCableCatalogItem } from '../types';
import {
  evaluateDynamicFilterOptions,
  getAllParsedCables,
} from '../services/cableSelectionService';
import {
  filterCableRecordsV2,
  getAllMasterRecordsV2,
} from '../components/cable-configurator/v2/services/cableSelectionEngineV2';
import { validateCableConfiguration } from '../services/cableConstraintEngine';
import {
  preferPostgresMasterData,
} from './masterDataSoT';
import { resolveMasterListPreferringPostgres } from '../services/masterDataApiService';

/**
 * Task 04B-6A — production caller inventory (read-path classification)
 *
 * evaluateDynamicFilterOptions:
 *   SmartConfigurator.tsx          — AUTHORITATIVE_PG (pg catalog injected)
 *   CableConfiguratorModal.tsx     — AUTHORITATIVE_PG (pg catalog injected)
 *   cableSelectionService.ts       — DEGRADED_READ (LS default when allCables omitted)
 *
 * getAllParsedCables():
 *   cableSelectionService.ts       — DEGRADED_READ (no-arg LS default)
 *   cableConstraintEngine.ts       — DEGRADED_READ (validateCableConfiguration default)
 *   SmartConfigurator.tsx          — AUTHORITATIVE_PG (explicit pgCatalog arg)
 *   CableConfiguratorModal.tsx     — AUTHORITATIVE_PG (explicit pgCatalog arg)
 *
 * getAllMasterRecordsV2():
 *   cableSelectionEngineV2.ts      — DEGRADED_READ (no-arg LS default)
 *   technicalValidationEngineV2.ts — DEGRADED_READ (default param; V2 UI overrides)
 *   CableConfiguratorV2.tsx        — AUTHORITATIVE_PG (catalogItems from loadAuthoritativeCableCatalog)
 *
 * getStoredCableCatalog():
 *   cableCatalogService.ts         — DEGRADED_READ / NON_AUTHORITATIVE_MIRROR
 *   masterDataApiService.ts        — mirror + resolve fallback only
 *   CableSearchSelectModal.tsx     — AUTHORITATIVE_PG (PG search; LS catch authoritative=false)
 *   ExcelCableUploadModal.tsx      — write context (pre-upload snapshot)
 *   technicalOfficeServiceV2.ts    — write/mirror context after PG success
 *   cableBomService.ts             — DEGRADED_READ (BOM scope)
 *   importPipelineService.ts       — NON_AUTHORITATIVE_MIRROR default store
 *   masterDataQualityService.ts    — DEGRADED_READ (no snapshot)
 *   TechnicalOffice.tsx            — NON_AUTHORITATIVE_MIRROR (event refresh)
 */

function cableFixture(
  overrides: Partial<MasterCableCatalogItem> & { cableCode: string }
): MasterCableCatalogItem {
  return {
    id: overrides.id ?? overrides.cableCode,
    itemCode: overrides.itemCode ?? `ITM-${overrides.cableCode}`,
    customerCode: overrides.customerCode ?? 'N2XH',
    code: overrides.code ?? overrides.cableCode,
    description:
      overrides.description ??
      'N2XH 0.6/1 kV 1 Core 16 mm² Copper XLPE Unarmoured LSHF Cable IEC 60502-1',
    voltageClass: overrides.voltageClass ?? 'LV',
    conductor: overrides.conductor ?? 'Copper',
    cores: overrides.cores ?? '1C',
    crossSectionMm2: overrides.crossSectionMm2 ?? 16,
    outerDiameterMm: overrides.outerDiameterMm ?? 12.5,
    approxWeightKgKm: overrides.approxWeightKgKm ?? 268,
    standardPriceUsdPerM: overrides.standardPriceUsdPerM ?? 0,
    ...overrides,
  };
}

const PG_CATALOG: MasterCableCatalogItem[] = [
  cableFixture({ cableCode: '10009487', customerCode: 'N2XH', voltageClass: 'LV' }),
  cableFixture({
    cableCode: '10009488',
    customerCode: 'N2XS2Y',
    description: 'N2XS2Y 6/10 kV 3 Core 95 mm² Copper XLPE SWA PVC Cable IEC 60502-2',
    voltageClass: 'MV',
    cores: '3C',
    crossSectionMm2: 95,
  }),
];

const STALE_LS_CATALOG: MasterCableCatalogItem[] = [
  ...PG_CATALOG,
  cableFixture({
    cableCode: 'STALE-ONLY',
    customerCode: 'GHOST',
    description: 'GHOST stale-only record that must not appear when PG is authoritative',
  }),
];

describe('Task 04B-6A Cable Master V1/V2 read-path convergence', () => {
  it('PG catalog affects V1 dynamic filter options', () => {
    const pgParsed = getAllParsedCables(PG_CATALOG);
    const staleParsed = getAllParsedCables(STALE_LS_CATALOG);

    const pgFilters = evaluateDynamicFilterOptions({ family: 'LV' }, pgParsed);
    const staleFilters = evaluateDynamicFilterOptions({ family: 'LV' }, staleParsed);

    assert.equal(pgFilters.availableCustomerCodes.includes('GHOST'), false);
    assert.equal(staleFilters.availableCustomerCodes.includes('GHOST'), true);
    assert.notDeepEqual(
      pgFilters.availableCustomerCodes,
      staleFilters.availableCustomerCodes
    );
  });

  it('stale LS cannot alter V1 results when PG catalog is injected', () => {
    const pgParsed = getAllParsedCables(PG_CATALOG);
    const validation = validateCableConfiguration(
      { family: 'LV', customerCode: 'GHOST' },
      { customCatalog: PG_CATALOG }
    );

    assert.equal(validation.matchCount, 0);
    assert.equal(validation.matchingCables.length, 0);

    const filters = evaluateDynamicFilterOptions({ customerCode: 'GHOST' }, pgParsed);
    assert.equal(filters.availableFamilies.length, 0);
    assert.equal(filters.hasMatches, false);
  });

  it('empty PG cannot resurrect LS records in V1 filters or validation', () => {
    const emptyPgParsed = getAllParsedCables([]);
    const filters = evaluateDynamicFilterOptions({}, emptyPgParsed);
    assert.deepEqual(filters.availableCustomerCodes, []);
    assert.equal(filters.matchingCables.length, 0);

    const validation = validateCableConfiguration(
      { family: 'LV' },
      { customCatalog: [] }
    );
    assert.equal(validation.matchCount, 0);
  });

  it('PG failure resolves to degraded non-authoritative fallback', () => {
    const fallback = resolveMasterListPreferringPostgres(
      { ok: false, error: '503' },
      STALE_LS_CATALOG
    );
    assert.equal(fallback.authoritative, false);
    assert.equal(fallback.source, 'LOCALSTORAGE_FALLBACK');
    assert.equal(fallback.data.length, STALE_LS_CATALOG.length);

    const resolved = preferPostgresMasterData({ ok: true, data: PG_CATALOG }, STALE_LS_CATALOG);
    assert.equal(resolved.authoritative, true);
    assert.equal(resolved.data.some((c) => c.cableCode === 'STALE-ONLY'), false);
  });

  it('V1 and V2 produce equivalent candidate sets for the same PG catalog', () => {
    const v1Parsed = getAllParsedCables(PG_CATALOG);
    const v2Records = getAllMasterRecordsV2(PG_CATALOG);

    const v1Lv = evaluateDynamicFilterOptions({ family: 'LV' }, v1Parsed).matchingCables;
    const v2Lv = filterCableRecordsV2(v2Records, {
      selectionMode: 'TECHNICAL',
      family: 'LV',
      voltageClass: 'LV',
    });

    assert.equal(v1Lv.length, 1);
    assert.equal(v2Lv.length, 1);
    assert.equal(v1Lv[0].cableCode, v2Lv[0].materialNumber);

    const v1Codes = new Set(v1Parsed.map((c) => c.cableCode));
    const v2Codes = new Set(v2Records.map((c) => c.materialNumber));
    assert.deepEqual(v1Codes, v2Codes);
  });
});
