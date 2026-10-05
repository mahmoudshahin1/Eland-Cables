import {
  SelectionStateV2,
  AvailableOptionsV2,
  CableFamilyCode,
  VoltageClassCode,
} from '../types';
import {
  DEFAULT_VOLTAGE_CLASSES,
  DEFAULT_VOLTAGES_BY_CLASS,
  DEFAULT_STANDARDS,
  DEFAULT_CONDUCTOR_MATERIALS,
  DEFAULT_CONDUCTOR_CLASSES,
  DEFAULT_CONDUCTOR_SHAPES,
  DEFAULT_CONDUCTOR_SIZES,
  DEFAULT_CORE_COUNTS,
  DEFAULT_INSULATIONS,
  DEFAULT_INSULATION_COLORS,
  DEFAULT_OUTER_SEMI_CONDUCTORS,
  DEFAULT_SCREEN_TYPES,
  DEFAULT_SCREEN_CSAS,
  DEFAULT_ARMOUR_TYPES,
  DEFAULT_SHEATHINGS,
  DEFAULT_SHEATHING_COLORS,
  DEFAULT_WATER_BLOCKING_TYPES,
  DEFAULT_TERMITE_PROTECTIONS,
  DEFAULT_SPECIAL_ADDITIVES,
  DEFAULT_CPR_CLASSES,
  DEFAULT_SPECIAL_AREAS,
  DEFAULT_CUSTOMER_IDENTIFICATIONS,
  DEFAULT_CORE_COLORS,
  resolveConstructionLogic,
  ConstructionLogicEntry,
} from './masterDataServiceV2';

/** MV U0/U ratings shown when Voltage Class = MV (IEC 60502-2). */
export const MV_VOLTAGE_OPTIONS = [
  '3.6/6 kV',
  '6/10 kV (6.35/11 kV)',
  '8.7/15 kV',
  '12/20 kV (12.7/22 kV)',
  '18/30 kV (19/33 kV)',
] as const;

/** Fields removed from the main parameter grid but retained on SelectionStateV2 for API / TCR compatibility. */
export const REMOVED_UI_FIELDS: (keyof SelectionStateV2)[] = [
  'familySubType',
  'um',
  'conductorCompacting',
  'semiConApplicable',
  'innerSemiConductor',
  'screenMaterial',
  'armourMaterial',
  'armourCSA',
  'cpr',
  'coreIdentification',
  'coreNumbering',
  'cuttingLength',
  'lengthTolerance',
  'drumType',
];

export const REMOVED_SPECIAL_ADDITIVES = [
  'Substation Grade Anti-Vibration',
  'Low Temperature Resistant (-40°C)',
];

const BEDDING_OPTIONS = [
  'Extruded PVC Bedding',
  'Extruded LSHF Bedding',
  'Extruded PE Bedding',
  'Lapped / Non-hygroscopic Tape',
  'Not Applicable',
];

/** Visible grid parameters in display order (new sequential numbering). */
export const GRID_PARAMETER_ORDER: (keyof SelectionStateV2)[] = [
  'family',
  'voltageClass',
  'voltage',
  'standard',
  'conductorMaterial',
  'conductorClass',
  'conductorShape',
  'conductorSize',
  'cores',
  'conductorWaterTight',
  'insulation',
  'insulationColor',
  'outerSemiConductor',
  'screenType',
  'screenCSA',
  'screenWaterTight',
  'bedding',
  'armour',
  'armourWaterTight',
  'sheathing',
  'sheathingColor',
  'waterTight',
  'termiteProtection',
  'cprClass',
  'specialArea',
  'specialAdditives',
  'customerIdentification',
];

export type CascadableField = (typeof GRID_PARAMETER_ORDER)[number];

const CASCADE_SANITIZE_ORDER: (keyof SelectionStateV2)[] = [
  'customerCode',
  'family',
  'voltageClass',
  'voltage',
  'standard',
  'conductorMaterial',
  'conductorClass',
  'conductorShape',
  'conductorSize',
  'cores',
  'conductorWaterTight',
  'insulation',
  'insulationColor',
  'outerSemiConductor',
  'screenType',
  'screenCSA',
  'screenWaterTight',
  'bedding',
  'armour',
  'armourWaterTight',
  'sheathing',
  'sheathingColor',
  'waterTight',
  'termiteProtection',
  'cprClass',
  'specialArea',
  'specialAdditives',
  'customerIdentification',
];

const BARE_CONDUCTOR_INSULATION = 'None (Bare Conductor)';
const NO_SCREEN = 'No Screen';
const NO_ARMOUR = 'No Armour';

function getCoresCount(selections: SelectionStateV2): number {
  return selections.coresCount || (selections.cores ? parseInt(selections.cores, 10) : 0) || 0;
}

function isMvVoltage(voltage?: string): boolean {
  if (!voltage) return false;
  const v = voltage.toUpperCase();
  return (
    v.includes('3.6/6') ||
    v.includes('6/10') ||
    v.includes('6.35/11') ||
    v.includes('8.7/15') ||
    v.includes('12/20') ||
    v.includes('12.7/22') ||
    v.includes('18/30') ||
    v.includes('19/33') ||
    v.includes('20.8/36')
  );
}

function selectionsVoltageClassIsMv(voltageClass?: string): boolean {
  return (voltageClass || '').toUpperCase() === 'MV';
}

function isHvOrEhv(voltageClass?: string, voltage?: string): boolean {
  const vc = (voltageClass || '').toUpperCase();
  if (vc === 'HV' || vc === 'EHV') return true;
  const v = (voltage || '').toUpperCase();
  return (
    v.includes('66') ||
    v.includes('110') ||
    v.includes('132') ||
    v.includes('150') ||
    v.includes('220') ||
    v.includes('275') ||
    v.includes('400') ||
    v.includes('500')
  );
}

function isHighPotential(selections: SelectionStateV2): boolean {
  return (
    isMvVoltage(selections.voltage) ||
    selectionsVoltageClassIsMv(selections.voltageClass) ||
    isHvOrEhv(selections.voltageClass, selections.voltage)
  );
}

function isLvVoltage(selections: SelectionStateV2): boolean {
  const vc = (selections.voltageClass || '').toUpperCase();
  if (vc === 'LV') return true;
  const v = (selections.voltage || '').toLowerCase();
  return (
    v.includes('0.6/1') ||
    v.includes('300/500') ||
    v.includes('450/750') ||
    v.includes('600/1000') ||
    v.includes('1.8/3')
  );
}

function getConstructionContext(selections: SelectionStateV2): ConstructionLogicEntry {
  return resolveConstructionLogic(
    selections.family,
    selections.familySubType,
    selections.voltageClass
  );
}

function isBareConductorFamily(selections: SelectionStateV2): boolean {
  return Boolean(getConstructionContext(selections).rules.isBareConductor);
}

function hasScreen(selections: SelectionStateV2): boolean {
  const st = selections.screenType || '';
  return Boolean(st) && st !== 'None' && st !== NO_SCREEN;
}

function hasArmour(selections: SelectionStateV2): boolean {
  const a = selections.armour || '';
  return Boolean(a) && a !== 'None' && a !== NO_ARMOUR;
}

function normalizeToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/COPPER/g, 'CU')
    .replace(/ALUMINUM/g, 'AL')
    .replace(/ALUMINIUM/g, 'AL')
    .replace(/STRANDED/g, '')
    .replace(/SOLID/g, '');
}

function tokensMatch(a: string, b: string): boolean {
  const na = normalizeToken(a);
  const nb = normalizeToken(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function mergeWithCatalog(engineering: string[], catalog: string[] | undefined): string[] {
  if (!catalog || catalog.length === 0) return engineering;
  const matched = engineering.filter((opt) =>
    catalog.some((c) => tokensMatch(opt, c) || c === opt)
  );
  return matched.length > 0 ? matched : engineering;
}

function filterStandardsForVoltage(
  standards: string[],
  voltageClass?: string,
  voltage?: string
): string[] {
  const vc = (voltageClass || '').toUpperCase();
  const isMv = vc === 'MV' || isMvVoltage(voltage);
  const isHv = vc === 'HV' || (voltage || '').toUpperCase().includes('KV') && isHvOrEhv(vc, voltage);
  const isEhv = vc === 'EHV';

  if (isEhv) {
    return standards.filter(
      (s) => s.includes('62067') || s.includes('60840') || s.includes('SAMSS')
    );
  }
  if (isHv) {
    return standards.filter(
      (s) =>
        s.includes('60840') ||
        s.includes('62067') ||
        s.includes('SAMSS') ||
        s.includes('7835')
    );
  }
  if (isMv) {
    return standards.filter(
      (s) =>
        s.includes('60502-2') ||
        s.includes('6622') ||
        s.includes('7835') ||
        s.includes('TMSS') ||
        s.includes('SAMSS')
    );
  }
  return standards.filter(
    (s) =>
      s.includes('60502-1') ||
      s.includes('5467') ||
      s.includes('6724') ||
      s.includes('626') ||
      s.includes('7870')
  );
}

function filterArmourTypes(types: string[], coresCount: number, family?: string): string[] {
  if (coresCount === 1 && family !== 'CONTROL') {
    return types.filter(
      (t) =>
        t === 'None' ||
        t === NO_ARMOUR ||
        t.includes('AWA') ||
        t.includes('ATA') ||
        t.includes('Aluminium')
    );
  }
  return types.filter((t) => !t.includes('AWA') || coresCount === 1);
}

function filterInsulationOptions(selections: SelectionStateV2, base: string[]): string[] {
  if (isBareConductorFamily(selections)) {
    return [BARE_CONDUCTOR_INSULATION];
  }
  if (isHighPotential(selections)) {
    return base.filter((i) => i !== 'PVC' && i !== 'LSHF');
  }
  return base;
}

function filterOuterSemiConductor(selections: SelectionStateV2, base: string[]): string[] {
  if (isBareConductorFamily(selections) || isLvVoltage(selections)) {
    return base.filter((o) => o.includes('N/A') || o.includes('Not Applicable'));
  }
  if (isHighPotential(selections)) {
    return base.filter((o) => !o.includes('N/A') && !o.includes('Not Applicable'));
  }
  return base;
}

function filterScreenTypes(selections: SelectionStateV2, base: string[]): string[] {
  if (isBareConductorFamily(selections)) {
    return [NO_SCREEN];
  }
  const logic = getConstructionContext(selections);
  if (logic.rules.requiresScreen || isHighPotential(selections)) {
    return base.filter((s) => s !== 'None' && s !== NO_SCREEN);
  }
  return base;
}

function filterVoltageOptions(selections: SelectionStateV2): string[] {
  const vc = (selections.voltageClass || 'LV') as VoltageClassCode;
  if (vc === 'MV') {
    return [...MV_VOLTAGE_OPTIONS];
  }
  return DEFAULT_VOLTAGES_BY_CLASS[vc] || DEFAULT_VOLTAGES_BY_CLASS.LV;
}

function filterVoltageClasses(selections: SelectionStateV2): string[] {
  const family = (selections.family || '').toUpperCase() as CableFamilyCode;
  if (family === 'OHL' || family === 'TELECOM') {
    return [];
  }
  if (family === 'ABC') {
    return ['LV'];
  }
  return [...DEFAULT_VOLTAGE_CLASSES];
}

function filterSpecialAdditives(additives: string[]): string[] {
  return additives.filter((a) => !REMOVED_SPECIAL_ADDITIVES.includes(a));
}

export function getParameterDisplayNumber(field: keyof SelectionStateV2): number | undefined {
  const idx = GRID_PARAMETER_ORDER.indexOf(field as CascadableField);
  return idx >= 0 ? idx + 1 : undefined;
}

export function isParameterUnlocked(
  field: keyof SelectionStateV2,
  selections: SelectionStateV2
): boolean {
  switch (field) {
    case 'family':
      return true;
    case 'voltageClass':
      return Boolean(selections.family);
    case 'voltage':
      return Boolean(selections.voltageClass);
    case 'standard':
      return Boolean(selections.voltage);
    case 'conductorMaterial':
      return Boolean(selections.voltage);
    case 'conductorClass':
      return Boolean(selections.conductorMaterial);
    case 'conductorShape':
      return Boolean(selections.conductorClass);
    case 'conductorSize':
      return Boolean(selections.conductorMaterial);
    case 'cores':
      return Boolean(selections.conductorSize);
    case 'conductorWaterTight':
      return Boolean(selections.conductorSize);
    case 'insulation':
      return Boolean(selections.cores);
    case 'insulationColor':
      return Boolean(selections.insulation);
    case 'outerSemiConductor':
      return Boolean(selections.insulation);
    case 'screenType':
      return Boolean(selections.insulation);
    case 'screenCSA':
      return hasScreen(selections);
    case 'screenWaterTight':
      return hasScreen(selections);
    case 'bedding':
      return Boolean(selections.insulation) && Boolean(selections.screenType);
    case 'armour':
      return Boolean(selections.bedding) || Boolean(selections.screenType);
    case 'armourWaterTight':
      return hasArmour(selections);
    case 'sheathing':
      return Boolean(selections.insulation);
    case 'sheathingColor':
      return Boolean(selections.sheathing);
    case 'waterTight':
    case 'termiteProtection':
    case 'cprClass':
    case 'specialArea':
    case 'specialAdditives':
    case 'customerIdentification':
      return Boolean(selections.sheathing);
    default:
      return false;
  }
}

export function resolveParameterOptionsV2(
  field: keyof SelectionStateV2,
  selections: SelectionStateV2,
  catalogOptions?: Partial<AvailableOptionsV2>
): string[] {
  const coresCount = getCoresCount(selections);
  const family = selections.family;

  switch (field) {
    case 'voltageClass':
      return filterVoltageClasses(selections);
    case 'voltage':
      return filterVoltageOptions(selections);
    case 'standard':
      return filterStandardsForVoltage(
        mergeWithCatalog(DEFAULT_STANDARDS, catalogOptions?.standards),
        selections.voltageClass,
        selections.voltage
      );
    case 'conductorMaterial':
      return mergeWithCatalog(
        DEFAULT_CONDUCTOR_MATERIALS.map((m) => m.code),
        catalogOptions?.conductorMaterials
      );
    case 'conductorClass':
      return mergeWithCatalog(DEFAULT_CONDUCTOR_CLASSES, catalogOptions?.conductorClasses);
    case 'conductorShape':
      return DEFAULT_CONDUCTOR_SHAPES;
    case 'conductorSize':
      return mergeWithCatalog(DEFAULT_CONDUCTOR_SIZES, catalogOptions?.conductorSizes);
    case 'cores':
      return DEFAULT_CORE_COUNTS.map((c) => (c === 1 ? '1 Core' : `${c} Cores`));
    case 'insulation':
      return filterInsulationOptions(
        selections,
        mergeWithCatalog(DEFAULT_INSULATIONS, catalogOptions?.insulations)
      );
    case 'insulationColor':
      return DEFAULT_INSULATION_COLORS;
    case 'outerSemiConductor':
      return filterOuterSemiConductor(
        selections,
        mergeWithCatalog(DEFAULT_OUTER_SEMI_CONDUCTORS, catalogOptions?.outerSemiConductors)
      );
    case 'screenType':
      return filterScreenTypes(
        selections,
        mergeWithCatalog(DEFAULT_SCREEN_TYPES, catalogOptions?.screenTypes)
      );
    case 'screenCSA':
      return DEFAULT_SCREEN_CSAS;
    case 'bedding':
      if (isBareConductorFamily(selections)) return ['Not Applicable'];
      return BEDDING_OPTIONS;
    case 'armour':
      return filterArmourTypes(
        mergeWithCatalog(DEFAULT_ARMOUR_TYPES, catalogOptions?.armours),
        coresCount,
        family
      );
    case 'sheathing':
      if (isBareConductorFamily(selections)) return ['None'];
      return mergeWithCatalog(DEFAULT_SHEATHINGS, catalogOptions?.sheathings);
    case 'sheathingColor':
      return DEFAULT_SHEATHING_COLORS;
    case 'waterTight':
      return DEFAULT_WATER_BLOCKING_TYPES;
    case 'termiteProtection':
      return DEFAULT_TERMITE_PROTECTIONS;
    case 'cprClass':
      return DEFAULT_CPR_CLASSES;
    case 'specialArea':
      return DEFAULT_SPECIAL_AREAS;
    case 'customerIdentification':
      return DEFAULT_CUSTOMER_IDENTIFICATIONS;
    case 'specialAdditives':
      return getVisibleSpecialAdditives();
    default:
      return [];
  }
}

function isValueInOptions(value: unknown, options: string[]): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return true;
  return options.some((o) => o === value || tokensMatch(o, value));
}

function clearField(target: SelectionStateV2, field: keyof SelectionStateV2): void {
  if (field === 'specialAdditives') {
    target.specialAdditives = undefined;
    return;
  }
  delete (target as unknown as Record<string, unknown>)[field as string];
}

/**
 * Clears downstream selections that are no longer valid after an upstream change.
 * Removed UI fields are not actively cleared — they may remain on state for API compatibility.
 */
export function sanitizeSelectionsAfterChange(
  selections: SelectionStateV2,
  changedField: keyof SelectionStateV2
): SelectionStateV2 {
  const changedIndex = CASCADE_SANITIZE_ORDER.indexOf(changedField);
  if (changedIndex === -1) return selections;

  const next: SelectionStateV2 = { ...selections };

  for (let i = changedIndex + 1; i < CASCADE_SANITIZE_ORDER.length; i++) {
    const field = CASCADE_SANITIZE_ORDER[i];
    const options = resolveParameterOptionsV2(field, next);
    const current = next[field];

    if (field === 'specialAdditives') {
      const additives = (current as string[] | undefined) || [];
      const filtered = additives.filter((a) => filterSpecialAdditives([a]).length > 0);
      const valid = filtered.filter((a) =>
        filterSpecialAdditives(resolveParameterOptionsV2('specialAdditives', next)).includes(a)
      );
      if (valid.length !== additives.length) {
        next.specialAdditives = valid.length > 0 ? valid : undefined;
      }
      continue;
    }

    if (!isValueInOptions(current, options)) {
      clearField(next, field);
    }
  }

  // Auto-sync familySubType from voltage class for UGC (field hidden but used by construction logic)
  if (changedField === 'voltageClass' || changedField === 'family' || changedField === 'voltage') {
    const fam = (next.family || '').toUpperCase();
    if (fam === 'UGC' && next.voltageClass) {
      next.familySubType = next.voltageClass;
    }
  }

  return next;
}

export function getVisibleSpecialAdditives(): string[] {
  return filterSpecialAdditives(DEFAULT_SPECIAL_ADDITIVES);
}

export function getCoreColorOptions(): string[] {
  return DEFAULT_CORE_COLORS;
}
