import type { CableAuthorityConfigDto, CableAuthorityMatchDto } from './cableAuthorityApi';
import type { CableRecordV2, SelectionStateV2 } from '../components/cable-configurator/v2/types';

export type CableConfigInputV2 = CableAuthorityConfigDto;

export type CableMasterSnapshotV2 = CableAuthorityMatchDto;

/**
 * Normalizes numeric sizes for conductor and screens
 */
export function parseNumber(val: string | number | undefined): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = val.toString().match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

/**
 * Generates an engineering technical description from active parameter selections
 */
export function generateTechnicalDescriptionV2(selections: SelectionStateV2): string {
  const condMat = selections.conductorMaterial === 'AL' ? 'Al' : 'Cu';
  const insul = selections.insulation || 'XLPE';
  const sheath = selections.sheathing || 'MDPE';
  const volt = selections.voltage || '6/10 kV';
  const cores = selections.coresCount || (selections.cores ? parseNumber(selections.cores) : 1);
  const size = selections.conductorSize ? parseNumber(selections.conductorSize) : 120;
  const screen = selections.screenCSA && selections.screenCSA !== 'None' ? `/${parseNumber(selections.screenCSA)}` : '';
  const arm = selections.armour && selections.armour !== 'No Armour' && selections.armour !== 'None' ? ` ${selections.armour.split(' ')[0]}` : '';
  const std = selections.standard ? ` ${selections.standard}` : '';

  return `${condMat} / ${insul} / ${sheath} ${volt} ${cores}X${size}${screen} mm2${arm}${std}`;
}

/**
 * Estimates cable physical properties based on technical geometry
 */
export function estimateCablePhysicals(
  selections: SelectionStateV2
): { diameterMm: number; weightKgKm: number } {
  const size = selections.conductorSize ? parseNumber(selections.conductorSize) : 120;
  const cores = selections.coresCount || (selections.cores ? parseNumber(selections.cores) : 1);
  const isAl = selections.conductorMaterial === 'AL';
  const hasArmour = selections.armour && selections.armour !== 'No Armour' && selections.armour !== 'None';
  const voltUpper = (selections.voltage || '').toUpperCase();

  let baseDiam = Math.sqrt(size) * 1.25;
  if (voltUpper.includes('6/10') || voltUpper.includes('11')) baseDiam += 8;
  else if (voltUpper.includes('12/20')) baseDiam += 12;
  else if (voltUpper.includes('18/30')) baseDiam += 16;
  else if (voltUpper.includes('110') || voltUpper.includes('132')) baseDiam += 32;

  const totalDiam = (baseDiam * Math.sqrt(cores) * (hasArmour ? 1.2 : 1.1) + 4);
  const conductorWeight = (isAl ? 2.7 : 8.9) * size * cores * 1.05;
  const insulAndSheathWeight = Math.PI * (totalDiam * totalDiam - (baseDiam * baseDiam)) * 0.95;
  const armourWeight = hasArmour ? (cores * size * 2.2) : 0;
  const totalWeight = Math.round(conductorWeight + insulAndSheathWeight + armourWeight + 150);

  return {
    diameterMm: Math.round(totalDiam * 10) / 10,
    weightKgKm: Math.max(350, totalWeight),
  };
}

export function selectionsToConfig(selections: SelectionStateV2): CableConfigInputV2 {
  return {
    customerCode: selections.customerCode,
    itemCode: selections.itemCode,
    materialNumber: selections.materialNumber,
    family: selections.family,
    voltage: selections.voltage,
    conductor: selections.conductorMaterial,
    conductorSize: selections.conductorSize,
    cores: selections.coresCount || selections.cores,
    insulation: selections.insulation,
    screen: selections.screenType,
    armour: selections.armour,
    sheath: selections.sheathing,
  };
}

export function recordsToSnapshots(records: CableRecordV2[]): CableMasterSnapshotV2[] {
  return records.map((rec) => ({
    id: rec.id,
    materialNumber: rec.materialNumber,
    itemCode: rec.itemCode,
    customerCode: rec.customerCode,
    description: rec.description,
    family: rec.family,
    voltage: rec.voltage,
    conductor: rec.conductorMaterial,
    conductorSize: rec.conductorSize,
    cores: String(rec.coresCount ?? rec.cores),
    insulation: rec.insulation,
    screen: rec.screenType,
    armour: rec.armour,
    sheath: rec.sheathing,
    status: 'ACTIVE',
    approvalStatus: rec.approvedStatus,
    diameter: rec.outerDiameterMm,
  }));
}
