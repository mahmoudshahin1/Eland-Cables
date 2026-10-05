import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDrumCapacity,
  floorToNearest10,
  cableWeightOnDrumKg,
  grossLoadedDrumWeightKg,
  lengthUtilizationPercent,
  loadUtilizationPercent,
  WINDING_ALLOWANCE_FACTOR,
} from './drumCapacityCalculator';

describe('drumCapacityCalculator', () => {
  it('floors to nearest 10 without normal rounding', () => {
    assert.equal(floorToNearest10(919), 910);
    assert.equal(floorToNearest10(920), 920);
    assert.equal(floorToNearest10(925.9), 920);
    assert.equal(floorToNearest10(9), 0);
  });

  it('rejects missing cable data', () => {
    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD630-0',
        flange: 630,
        barrel: 300,
        innerWidth: 600,
        clearanceMm: 20,
        maxLoadKg: 650,
      },
      { cableDiameterMm: 0, approxWeightKgKm: 268 }
    );
    assert.equal(r.status, 'MISSING_CABLE_DATA');
  });

  it('requires clearance when cable diameter <= 50', () => {
    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD630-0',
        flange: 630,
        barrel: 300,
        innerWidth: 600,
        clearanceMm: null,
        maxLoadKg: 650,
      },
      { cableDiameterMm: 25, approxWeightKgKm: 800 }
    );
    assert.equal(r.status, 'MISSING_CLEARANCE');
    assert.ok(r.reasons.some((x) => /Missing drum clearance for cable diameter ≤50 mm/i.test(x)));
  });

  it('requires MaxLoad (permitted cable payload)', () => {
    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD630-0',
        flange: 630,
        barrel: 300,
        innerWidth: 600,
        clearanceMm: 20,
        maxLoadKg: null,
      },
      { cableDiameterMm: 25, approxWeightKgKm: 800 }
    );
    assert.equal(r.status, 'MISSING_MAX_LOAD');
    assert.ok(r.reasons.some((x) => x === 'Missing drum MaxLoad.'));
  });

  it('computes capacity for cable diameter <= 50 with clearance', () => {
    const diameter = 20;
    const clearance = 15;
    const flange = 1200;
    const barrel = 600;
    const innerWidth = 800;
    const output = diameter;
    const windings = Math.floor(innerWidth / (output * WINDING_ALLOWANCE_FACTOR));
    const layers = Math.floor((flange - barrel - 2 * clearance) / (2 * output));
    const geo = (windings * Math.PI * layers * (barrel + layers * output)) / 1000;
    const weightPerM = 1000 / 1000;
    const maxLoad = 2000;
    const loadLimited = maxLoad / weightPerM;
    const expectedUsable = floorToNearest10(Math.min(geo, loadLimited));

    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD1200-T',
        flange,
        barrel,
        innerWidth,
        clearanceMm: clearance,
        maxLoadKg: maxLoad,
        emptyDrumNetWeightKg: 110,
      },
      { cableDiameterMm: diameter, approxWeightKgKm: 1000 }
    );
    assert.equal(r.status, 'OK');
    assert.equal(r.windingsPerLayer, windings);
    assert.equal(r.layers, layers);
    assert.ok(r.geometricalCapacityMeters != null);
    assert.ok(Math.abs((r.geometricalCapacityMeters || 0) - geo) < 1e-6);
    assert.equal(r.loadLimitedCapacityMeters, loadLimited);
    assert.equal(r.maximumUsableLengthMeters, expectedUsable);
    assert.equal(r.emptyDrumNetWeightKg, 110);
  });

  it('uses cable diameter as clearance term when diameter > 50', () => {
    const diameter = 55;
    const flange = 2200;
    const barrel = 1200;
    const innerWidth = 1300;
    const windings = Math.floor(innerWidth / (diameter * WINDING_ALLOWANCE_FACTOR));
    const layers = Math.floor((flange - barrel - 2 * diameter) / (2 * diameter));
    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD2200',
        flange,
        barrel,
        innerWidth,
        clearanceMm: null,
        maxLoadKg: 8000,
      },
      { cableDiameterMm: diameter, approxWeightKgKm: 4000 }
    );
    assert.equal(r.status, 'OK');
    assert.equal(r.clearanceUsedMm, diameter);
    assert.equal(r.windingsPerLayer, windings);
    assert.equal(r.layers, layers);
  });

  it('uses Drum.Clearance (50) as clearance term for Ø10.9 ≤ 50', () => {
    const diameter = 10.9;
    const clearance = 50;
    const flange = 2600;
    const barrel = 1400;
    const innerWidth = 1500;
    const layers = Math.floor((flange - barrel - 2 * clearance) / (2 * diameter));
    const windings = Math.floor(innerWidth / (diameter * WINDING_ALLOWANCE_FACTOR));
    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD2600',
        flange,
        barrel,
        innerWidth,
        clearanceMm: clearance,
        maxLoadKg: 8000,
      },
      { cableDiameterMm: diameter, approxWeightKgKm: 268 }
    );
    assert.equal(r.status, 'OK');
    assert.equal(r.clearanceUsedMm, 50);
    assert.equal(r.windingsPerLayer, windings);
    assert.equal(r.layers, layers);
    assert.ok((r.maximumUsableLengthMeters || 0) >= 1500);
  });

  it('empty drum weight missing is warning-only, never blocks OK', () => {
    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD1200',
        flange: 1200,
        barrel: 600,
        innerWidth: 800,
        clearanceMm: 50,
        maxLoadKg: 2500,
        emptyDrumNetWeightKg: null,
      },
      { cableDiameterMm: 10.9, approxWeightKgKm: 268 }
    );
    assert.equal(r.status, 'OK');
    assert.ok(r.warnings.some((w) => /Empty drum weight not configured/i.test(w)));
  });

  it('marks zero windings / layers unsuitable', () => {
    const tiny = calculateDrumCapacity(
      {
        drumCode: 'EWD630-T06',
        flange: 630,
        barrel: 315,
        innerWidth: 10,
        clearanceMm: 20,
        maxLoadKg: 250,
      },
      { cableDiameterMm: 30, approxWeightKgKm: 800 }
    );
    assert.equal(tiny.status, 'UNSUITABLE_GEOMETRY');
    assert.ok((tiny.windingsPerLayer ?? 0) <= 0 || (tiny.layers ?? 0) <= 0);
  });

  it('does not add empty drum weight into payload capacity', () => {
    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD700-3',
        flange: 1400,
        barrel: 700,
        innerWidth: 900,
        clearanceMm: 20,
        maxLoadKg: 1000,
        emptyDrumNetWeightKg: 500,
      },
      { cableDiameterMm: 25, approxWeightKgKm: 1000 }
    );
    assert.equal(r.status, 'OK');
    assert.equal(r.permittedCablePayloadKg, 1000);
    assert.equal(r.loadLimitedCapacityMeters, 1000);
    const cableKg = cableWeightOnDrumKg(500, 1);
    assert.equal(cableKg, 500);
    assert.equal(grossLoadedDrumWeightKg(cableKg, 500), 1000);
    assert.equal(grossLoadedDrumWeightKg(cableKg, null), null);
  });

  it('warns when empty drum weight is missing but still returns OK', () => {
    const r = calculateDrumCapacity(
      {
        drumCode: 'EWD700-3',
        flange: 1400,
        barrel: 700,
        innerWidth: 900,
        clearanceMm: 20,
        maxLoadKg: 1000,
        emptyDrumNetWeightKg: null,
      },
      { cableDiameterMm: 25, approxWeightKgKm: 1000 }
    );
    assert.equal(r.status, 'OK');
    assert.ok(r.warnings.some((w) => /Empty drum weight not configured/i.test(w)));
    assert.equal(r.emptyDrumNetWeightKg, null);
  });

  it('computes length and load utilization percentages', () => {
    assert.equal(lengthUtilizationPercent(900, 920), (900 / 920) * 100);
    assert.equal(loadUtilizationPercent(241, 650), (241 / 650) * 100);
  });

  it('limits by geometrical when geo < load', () => {
    const r = calculateDrumCapacity(
      {
        drumCode: 'GEO-LIMIT',
        flange: 700,
        barrel: 400,
        innerWidth: 200,
        clearanceMm: 10,
        maxLoadKg: 50_000,
      },
      { cableDiameterMm: 25, approxWeightKgKm: 100 }
    );
    assert.equal(r.status, 'OK');
    assert.ok(r.geometricalCapacityMeters != null);
    assert.ok(r.loadLimitedCapacityMeters != null);
    assert.ok((r.geometricalCapacityMeters || 0) < (r.loadLimitedCapacityMeters || 0));
    assert.equal(
      r.maximumUsableLengthMeters,
      floorToNearest10(r.geometricalCapacityMeters || 0)
    );
  });

  it('limits by load when load < geo', () => {
    const r = calculateDrumCapacity(
      {
        drumCode: 'LOAD-LIMIT',
        flange: 2200,
        barrel: 1000,
        innerWidth: 1400,
        clearanceMm: 20,
        maxLoadKg: 100,
      },
      { cableDiameterMm: 20, approxWeightKgKm: 2000 }
    );
    assert.equal(r.status, 'OK');
    assert.ok((r.loadLimitedCapacityMeters || 0) < (r.geometricalCapacityMeters || 0));
    assert.equal(
      r.maximumUsableLengthMeters,
      floorToNearest10(r.loadLimitedCapacityMeters || 0)
    );
  });
});
