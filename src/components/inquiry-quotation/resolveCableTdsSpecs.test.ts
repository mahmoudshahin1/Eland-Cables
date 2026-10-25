import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCableTdsSpecs } from './VipCommercialOfferDocumentViewer';

test('resolveCableTdsSpecs accurately parses 4x300 unarmoured copper cable', () => {
  const specs = resolveCableTdsSpecs('Cu / XLPE / LSHF 0.6/1 kV 4X300 mm2 RMC IEC 60502-1');
  assert.equal(specs.coreCount, 4);
  assert.equal(specs.nominalArea, 300);
  assert.equal(specs.cores, '4 Cores');
  assert.equal(specs.size, '4 x 300 mm²');
  assert.equal(specs.conductorMaterial, 'Copper');
  assert.ok(specs.conductorType.includes('Copper'));
  assert.ok(specs.insulationMaterial.includes('XLPE'));
  assert.equal(specs.armourType, 'Unarmoured');
  assert.ok(specs.sheathMaterial.includes('LSHF'));
  assert.equal(specs.standard, 'IEC 60502-1');
  assert.equal(specs.diameter, '68.5 mm');
  assert.equal(specs.totalWeight, '14,200 kg/km');
  assert.equal(specs.cuWeight, '10,539.47 kg/km');
  assert.equal(specs.alWeight, '0.00 kg/km');
  assert.equal(specs.dcResistance, '0.0601 Ω/km');
  assert.equal(specs.currentAir, '560 Amps');
  assert.equal(specs.currentGround, '460 Amps');
  assert.equal(specs.shortCircuit, '42.9 kA');
});

test('resolveCableTdsSpecs matches catalog for 4x300 armoured cable (Item 10009536)', () => {
  const specs = resolveCableTdsSpecs('4x300 mm² Cu / XLPE / SWA / PVC 0.6/1kV', undefined, '10009536');
  assert.equal(specs.coreCount, 4);
  assert.equal(specs.nominalArea, 300);
  assert.equal(specs.cores, '4 Cores');
  assert.equal(specs.diameter, '65.4 mm');
  assert.equal(specs.totalWeight, '13,700 kg/km');
  assert.equal(specs.armourType, 'Galvanized Steel Wire Armour (SWA)');
  assert.equal(specs.standard, 'BS 5467');
  assert.ok(specs.sheathMaterial.includes('PVC'));
});

test('resolveCableTdsSpecs dynamically parses 4x185 multi-core without falling back to 1-core', () => {
  const specs = resolveCableTdsSpecs('4x185 mm² Cu / XLPE / SWA / PVC 0.6/1kV', undefined, '10009534');
  assert.equal(specs.coreCount, 4);
  assert.equal(specs.nominalArea, 185);
  assert.equal(specs.cores, '4 Cores');
  assert.equal(specs.size, '4 x 185 mm²');
  assert.equal(specs.diameter, '52.8 mm');
  assert.equal(specs.totalWeight, '8,550 kg/km');
  assert.equal(specs.armourType, 'Galvanized Steel Wire Armour (SWA)');
  assert.equal(specs.dcResistance, '0.0991 Ω/km');
  assert.equal(specs.currentAir, '425 Amps');
  assert.equal(specs.currentGround, '360 Amps');
  assert.equal(specs.shortCircuit, '26.5 kA');
});

test('resolveCableTdsSpecs accurately handles aluminium conductor cable', () => {
  const specs = resolveCableTdsSpecs('Al / XLPE / SWA / PVC 4x240 mm2 0.6/1kV');
  assert.equal(specs.coreCount, 4);
  assert.equal(specs.nominalArea, 240);
  assert.equal(specs.conductorMaterial, 'Aluminium');
  assert.ok(specs.conductorType.includes('Aluminum') || specs.conductorType.includes('Aluminium'));
  assert.equal(specs.cuWeight, '0.00 kg/km');
  assert.notEqual(specs.alWeight, '0.00 kg/km');
  assert.equal(specs.dcResistance, '0.1250 Ω/km');
});

test('resolveCableTdsSpecs handles single core 1x630 mm2 cable', () => {
  const specs = resolveCableTdsSpecs('1x630 mm² Cu / XLPE / AWA / PVC 0.6/1kV');
  assert.equal(specs.coreCount, 1);
  assert.equal(specs.nominalArea, 630);
  assert.equal(specs.cores, '1 Core');
  assert.equal(specs.size, '630 mm²');
  assert.equal(specs.armourType, 'Aluminium Wire Armour (AWA)');
  assert.equal(specs.dcResistance, '0.0283 Ω/km');
  assert.equal(specs.currentAir, '1020 Amps');
  assert.equal(specs.currentGround, '840 Amps');
});
