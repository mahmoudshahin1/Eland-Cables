import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { preferPostgresMasterData } from '../platform/masterDataSoT';
import { resolveMasterListPreferringPostgres } from './masterDataApiService';
import { resolveDrumListForSelect } from './drumMasterApiService';
import { computeMasterDataQuality } from './masterDataQualityService';
import {
  CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE,
} from './cableCatalogService';
import { RAW_MATERIAL_LOCAL_IS_AUTHORITATIVE } from './rawMaterialMasterService';
import { BOM_LOCAL_IS_AUTHORITATIVE } from './cableBomService';
import { DRUM_MASTER_LOCAL_IS_AUTHORITATIVE } from './drumMasterService';
import {
  IMPORT_BATCH_LOCAL_IS_AUTHORITATIVE,
} from './importBatchService';

describe('Task 04A master data API preference helpers', () => {
  it('marks local catalog/BOM/RM/Drum/ImportBatch stores as non-authoritative', () => {
    assert.equal(CABLE_CATALOG_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(BOM_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(RAW_MATERIAL_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(DRUM_MASTER_LOCAL_IS_AUTHORITATIVE, false);
    assert.equal(IMPORT_BATCH_LOCAL_IS_AUTHORITATIVE, false);
  });

  it('refuses LS-only Raw Material deactivate after SoT cutover', async () => {
    const { deactivateRawMaterial } = await import('./rawMaterialMasterService');
    assert.throws(() => deactivateRawMaterial('X'), /NON_AUTHORITATIVE_MIRROR|PostgreSQL/);
  });

  it('refuses LS-only Cable catalog save after 04B-6 remediation', async () => {
    const { saveCableCatalog } = await import('./cableCatalogService');
    assert.throws(
      () => saveCableCatalog([{ id: 'x', cableCode: '1', itemCode: 'i', customerCode: 'c', description: 'd' } as any]),
      /NON_AUTHORITATIVE_MIRROR|PostgreSQL/
    );
  });

  it('resolveMasterListPreferringPostgres: empty PG wins over stale LS', () => {
    const stale = [{ id: 'ls', cableCode: 'STALE' }];
    const resolved = resolveMasterListPreferringPostgres({ ok: true, data: [] as typeof stale }, stale);
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.deepEqual(resolved.data, []);
  });

  it('resolveMasterListPreferringPostgres: PG failure is non-authoritative LS', () => {
    const ls = [{ id: 'ls', cableCode: 'OFFLINE' }];
    const resolved = resolveMasterListPreferringPostgres({ ok: false, error: '503' }, ls);
    assert.equal(resolved.source, 'LOCALSTORAGE_FALLBACK');
    assert.equal(resolved.authoritative, false);
  });

  it('resolveDrumListForSelect: empty PG active list is not replaced by LS', () => {
    const resolved = resolveDrumListForSelect({ ok: true, data: [] });
    assert.equal(resolved.source, 'POSTGRESQL');
    assert.equal(resolved.authoritative, true);
    assert.deepEqual(resolved.data, []);
  });

  it('quality without snapshot is explicitly non-authoritative fallback', () => {
    const result = computeMasterDataQuality();
    assert.equal(result.source, 'LOCALSTORAGE_FALLBACK');
    assert.equal(result.authoritative, false);
    assert.ok(result.kpi);
  });

  it('quality with PG snapshot is authoritative', () => {
    const result = computeMasterDataQuality({
      cables: [],
      boms: [],
      drums: [],
      rawMaterials: [],
    });
    assert.equal(result.source, 'POSTGRESQL_SNAPSHOT');
    assert.equal(result.authoritative, true);
    assert.equal(result.kpi.totalCables, 0);
  });

  it('preferPostgresMasterData exposes authoritative flag for callers', () => {
    const a = preferPostgresMasterData({ ok: true, data: [1] }, [9]);
    const b = preferPostgresMasterData({ ok: false }, [9]);
    assert.equal(a.authoritative, true);
    assert.equal(b.authoritative, false);
  });
});
