import { Cable3DConfig } from './cablePresets';

export interface CableCalculatedSpecs {
  conductorDiameterMm: number;
  insulationThicknessMm: number;
  beddingThicknessMm: number;
  armourWireDiameterMm: number;
  outerSheathThicknessMm: number;
  approxOverallDiameterMm: number;
  approxNetWeightKgKm: number;
  maxDcResistanceOhmKm: number;
  currentCarryingAirAmps: number;
  currentCarryingGroundAmps: number;
  shortCircuitRatingKa: number;
  minBendingRadiusMm: number;
  iecStandard: string;
}

// Standard copper DC resistance at 20C (approximate per IEC 60228)
const COPPER_RESISTANCE_TABLE: Record<number, number> = {
  1.5: 12.1,
  2.5: 7.41,
  4: 4.61,
  6: 3.08,
  10: 1.83,
  16: 1.15,
  25: 0.727,
  35: 0.524,
  50: 0.387,
  70: 0.268,
  95: 0.193,
  120: 0.153,
  150: 0.124,
  185: 0.0991,
  240: 0.0754,
  300: 0.0601,
  400: 0.047,
  500: 0.0366,
  630: 0.0283,
};

// Approximate current rating in air (30C, XLPE, Cu, 3/4-core)
const CURRENT_RATING_AIR_XLPE_CU: Record<number, number> = {
  1.5: 24,
  2.5: 33,
  4: 45,
  6: 58,
  10: 80,
  16: 107,
  25: 142,
  35: 175,
  50: 215,
  70: 279,
  95: 342,
  120: 400,
  150: 464,
  185: 533,
  240: 634,
  300: 730,
  400: 840,
  500: 970,
  630: 1100,
};

export function calculateCableSpecs(config: Cable3DConfig): CableCalculatedSpecs {
  const { cores, crossSectionMm2, conductorMaterial, voltageClass, armour, outerSheath } = config;

  // 1. Conductor Diameter
  const condDia = 2 * Math.sqrt(crossSectionMm2 / Math.PI) * 1.12; // stranding factor

  // 2. Insulation Thickness (IEC 60502-1 / 60502-2)
  let insThick = 0.8;
  if (voltageClass === 'MV') {
    insThick = 4.5; // for 11/33kV
  } else if (crossSectionMm2 <= 16) {
    insThick = 0.8;
  } else if (crossSectionMm2 <= 35) {
    insThick = 1.0;
  } else if (crossSectionMm2 <= 70) {
    insThick = 1.2;
  } else if (crossSectionMm2 <= 120) {
    insThick = 1.4;
  } else {
    insThick = 1.7;
  }

  const coreDia = condDia + 2 * insThick;

  // 3. Bedding & Assembly Diameter
  let assembledDia = coreDia;
  if (cores === 2) assembledDia = coreDia * 2;
  else if (cores === 3) assembledDia = coreDia * 2.15;
  else if (cores === 4) assembledDia = coreDia * 2.41;
  else if (cores >= 5) assembledDia = coreDia * 2.7;

  const beddingThick = armour !== 'Unarmoured' ? 1.0 : 0.0;
  const underArmourDia = assembledDia + 2 * beddingThick;

  // 4. Armour wire diameter
  let armourWireDia = 0;
  if (armour === 'SWA' || armour === 'AWA') {
    if (underArmourDia <= 15) armourWireDia = 1.25;
    else if (underArmourDia <= 25) armourWireDia = 1.6;
    else if (underArmourDia <= 40) armourWireDia = 2.0;
    else armourWireDia = 2.5;
  } else if (armour === 'STA') {
    armourWireDia = 0.5; // tape thickness
  }

  // 5. Outer Sheath Thickness
  const sheathThick = 1.4 + 0.03 * (underArmourDia + 2 * armourWireDia);

  // 6. Overall Diameter
  const overallDia = underArmourDia + 2 * armourWireDia + 2 * sheathThick;

  // 7. Net Weight calculation (kg/km)
  const conductorDensity = conductorMaterial === 'Aluminium' ? 2.7 : 8.9;
  const copperWeight = crossSectionMm2 * conductorDensity * cores * 1.02;
  const insWeight = cores * Math.PI * (Math.pow(coreDia / 2, 2) - Math.pow(condDia / 2, 2)) * 0.95;
  const beddingWeight = beddingThick > 0 ? Math.PI * (Math.pow((assembledDia / 2) + beddingThick, 2) - Math.pow(assembledDia / 2, 2)) * 1.4 : 0;
  const armourWeight = armourWireDia > 0 ? (armour === 'AWA' ? 2.7 : 7.85) * Math.PI * (Math.pow((underArmourDia / 2) + armourWireDia, 2) - Math.pow(underArmourDia / 2, 2)) * 0.75 : 0;
  const sheathWeight = Math.PI * (Math.pow(overallDia / 2, 2) - Math.pow((overallDia / 2) - sheathThick, 2)) * (outerSheath === 'LSHF' ? 1.5 : 1.4);
  const totalWeight = Math.round(copperWeight + insWeight + beddingWeight + armourWeight + sheathWeight);

  // 8. Electrical values
  let dcRes = COPPER_RESISTANCE_TABLE[crossSectionMm2] || (18.1 / crossSectionMm2);
  if (conductorMaterial === 'Aluminium') {
    dcRes = dcRes * 1.64;
  } else if (conductorMaterial === 'Tinned Copper') {
    dcRes = dcRes * 1.02;
  }

  let airAmp = CURRENT_RATING_AIR_XLPE_CU[crossSectionMm2] || Math.round(crossSectionMm2 * 6);
  if (conductorMaterial === 'Aluminium') airAmp = Math.round(airAmp * 0.78);
  if (cores === 1) airAmp = Math.round(airAmp * 1.25);
  const groundAmp = Math.round(airAmp * 1.15);

  // Short circuit rating for 1 second (kA)
  // I = k * S / sqrt(t)  (k=143 for Cu/XLPE, 94 for Al/XLPE)
  const kFactor = conductorMaterial === 'Aluminium' ? 94 : 143;
  const scRating = Math.round((kFactor * crossSectionMm2) / 1000 * 10) / 10;

  // Minimum Bending Radius
  const minBendingRadius = Math.round(overallDia * (armour !== 'Unarmoured' ? 12 : 8));

  return {
    conductorDiameterMm: Math.round(condDia * 10) / 10,
    insulationThicknessMm: Math.round(insThick * 10) / 10,
    beddingThicknessMm: Math.round(beddingThick * 10) / 10,
    armourWireDiameterMm: Math.round(armourWireDia * 10) / 10,
    outerSheathThicknessMm: Math.round(sheathThick * 10) / 10,
    approxOverallDiameterMm: Math.round(overallDia * 10) / 10,
    approxNetWeightKgKm: totalWeight,
    maxDcResistanceOhmKm: Math.round(dcRes * 10000) / 10000,
    currentCarryingAirAmps: airAmp,
    currentCarryingGroundAmps: groundAmp,
    shortCircuitRatingKa: scRating,
    minBendingRadiusMm: minBendingRadius,
    iecStandard: voltageClass === 'MV' ? 'IEC 60502-2' : 'IEC 60502-1',
  };
}
