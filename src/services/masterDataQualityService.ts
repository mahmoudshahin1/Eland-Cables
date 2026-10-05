import { MasterDataQualityIssue, MasterDataQualityKpi } from '../types';
import { CableBomRawMaterial, DrumMasterRecord, MasterCableCatalogItem, RawMaterialMasterRecord } from '../types';
import { getStoredCableBoms } from './cableBomService';
import { getStoredCableCatalog } from './cableCatalogService';
import { getStoredDrumMaster } from './drumMasterService';
import { getStoredRawMaterials } from './rawMaterialMasterService';

export type MasterDataQualitySnapshot = {
  cables: MasterCableCatalogItem[];
  boms: CableBomRawMaterial[];
  drums: DrumMasterRecord[];
  rawMaterials: RawMaterialMasterRecord[];
};

export type MasterDataQualityResult = {
  kpi: MasterDataQualityKpi;
  issues: MasterDataQualityIssue[];
  /** True only when caller supplied a PG-backed snapshot (or async loader succeeded). */
  authoritative: boolean;
  source: 'POSTGRESQL_SNAPSHOT' | 'LOCALSTORAGE_FALLBACK';
};

/**
 * Quality KPIs. Prefer an explicit PostgreSQL-backed snapshot (Task 04A).
 * Calling without a snapshot uses LS mirrors as non-authoritative degraded input —
 * storage dependency is not part of the quality rules themselves.
 */
export function computeMasterDataQuality(snapshot?: MasterDataQualitySnapshot): MasterDataQualityResult {
  const usedSnapshot = Boolean(snapshot);
  const cables = snapshot?.cables ?? getStoredCableCatalog();
  const boms = snapshot?.boms ?? getStoredCableBoms();
  const drums = snapshot?.drums ?? getStoredDrumMaster();
  const rms = snapshot?.rawMaterials ?? getStoredRawMaterials();
  const issues: MasterDataQualityIssue[] = [];

  const bomByCable = new Set(boms.map((b) => b.cableMaterialNumber.toLowerCase()));
  const rmCodes = new Set(rms.map((r) => r.rawMaterialCode.toUpperCase()));
  const cableCodes = new Set(cables.map((c) => c.cableCode.toLowerCase()));

  const cablesWithoutBom = cables.filter((c) => !bomByCable.has(c.cableCode.toLowerCase()));
  cablesWithoutBom.forEach((c) =>
    issues.push({
      severity: 'ERROR',
      domain: 'Cable',
      key: c.cableCode,
      message: 'Cable has no BOM lines. Calculation must not run.',
    })
  );

  const missingRm = boms.filter((b) => rms.length > 0 && !rmCodes.has(b.rawMaterial.toUpperCase()));
  missingRm.forEach((b) =>
    issues.push({
      severity: 'ERROR',
      domain: 'BOM',
      key: `${b.cableMaterialNumber}/${b.rawMaterial}`,
      message: 'BOM raw material is not in Raw Material Master.',
    })
  );

  const orphanBom = boms.filter((b) => cables.length > 0 && !cableCodes.has(b.cableMaterialNumber.toLowerCase()));
  orphanBom.forEach((b) =>
    issues.push({
      severity: 'ERROR',
      domain: 'BOM',
      key: b.cableMaterialNumber,
      message: 'BOM references a cable that is not in Cable Master.',
    })
  );

  const unpriced = rms.filter((r) => r.priceStatus === 'PRICE_NOT_CONFIGURED' || r.price === null);
  unpriced.forEach((r) =>
    issues.push({
      severity: 'ERROR',
      domain: 'RawMaterial',
      key: r.rawMaterialCode,
      message: 'PRICE_NOT_CONFIGURED. Do not calculate using price 0.',
    })
  );

  const missingDia = cables.filter((c) => !c.outerDiameterMm);
  const missingWt = cables.filter((c) => !c.approxWeightKgKm);
  missingDia.forEach((c) =>
    issues.push({ severity: 'ERROR', domain: 'Cable', key: c.cableCode, message: 'Missing diameter.' })
  );
  missingWt.forEach((c) =>
    issues.push({ severity: 'ERROR', domain: 'Cable', key: c.cableCode, message: 'Missing weight.' })
  );

  const matCounts = new Map<string, number>();
  cables.forEach((c) => matCounts.set(c.cableCode.toLowerCase(), (matCounts.get(c.cableCode.toLowerCase()) || 0) + 1));
  let duplicateCables = 0;
  matCounts.forEach((n, k) => {
    if (n > 1) {
      duplicateCables += n;
      issues.push({ severity: 'ERROR', domain: 'Cable', key: k, message: 'Duplicate Cable Material Number in store.' });
    }
  });

  const pairCounts = new Map<string, Set<number>>();
  boms.forEach((b) => {
    const k = `${b.cableMaterialNumber.toLowerCase()}::${b.rawMaterial.toUpperCase()}`;
    const set = pairCounts.get(k) || new Set();
    set.add(b.weight);
    pairCounts.set(k, set);
  });
  let duplicateBoms = 0;
  pairCounts.forEach((weights, k) => {
    if (weights.size > 1) {
      duplicateBoms += 1;
      issues.push({
        severity: 'ERROR',
        domain: 'BOM',
        key: k,
        message: 'Duplicate BOM component with differing consumption.',
      });
    }
  });

  const unpricedCables = cables.filter((c) => c.priceConfigured === false);
  unpricedCables.forEach((c) =>
    issues.push({
      severity: 'WARNING',
      domain: 'Costing',
      key: c.cableCode,
      message: 'Catalog selling price is PRICE_NOT_CONFIGURED (source file has no price).',
    })
  );

  const kpi: MasterDataQualityKpi = {
    totalCables: cables.length,
    activeCables: cables.filter((c) => c.status !== 'INACTIVE').length,
    cablesWithoutBom: cablesWithoutBom.length,
    bomsWithMissingRawMaterials: new Set(missingRm.map((b) => b.rawMaterial)).size,
    rawMaterialsWithoutPrice: unpriced.length,
    activeDrums: drums.filter((d) => d.status === 'ACTIVE').length,
    inactiveDrums: drums.filter((d) => d.status !== 'ACTIVE').length,
    cablesMissingDiameter: missingDia.length,
    cablesMissingWeight: missingWt.length,
    duplicateCables,
    duplicateBoms,
    invalidReferences: missingRm.length + orphanBom.length,
    missingCostingConfiguration: unpriced.length + unpricedCables.length,
  };

  return {
    kpi,
    issues,
    authoritative: usedSnapshot,
    source: usedSnapshot ? 'POSTGRESQL_SNAPSHOT' : 'LOCALSTORAGE_FALLBACK',
  };
}
