import {
  CableFamilyCode,
  VoltageClassCode,
  TriState,
  VoltageMasterRecord,
  VoltageMasterStatus,
} from '../types';

export interface ParameterMasterItem {
  id: string;
  category: string;
  code: string;
  label: string;
  isActive: boolean;
  sortOrder: number;
  applicableFamilies?: CableFamilyCode[];
  applicableVoltages?: string[];
  metadata?: Record<string, any>;
}

// -------------------------------------------------------------
// DEFAULT PRELOADED MASTER VALUES (SEEDED) - 11 STEP TAXONOMY
// -------------------------------------------------------------

// 1. CABLE FAMILY & SUB-TYPES
export const DEFAULT_CABLE_FAMILIES = [
  { code: 'UGC', label: 'UGC Power Cable', desc: 'Underground power cables for buried, duct, trench & tray power distribution (LV, MV, HV, EHV)' },
  { code: 'OHL', label: 'OHL', desc: 'Bare overhead transmission conductors (AAC, AAAC, ACSR)' },
  { code: 'ABC', label: 'ABC', desc: 'Self-supporting insulated Aerial Bundled Cables for aerial distribution' },
  { code: 'SINGLE', label: 'Single Core', desc: 'High ampacity single-conductor power cables across LV/MV/HV/EHV' },
  { code: 'CONTROL', label: 'Signal & Control', desc: 'Multi-core signaling, substation automation & instrumentation cables' },
  { code: 'TELECOM', label: 'Telecom', desc: 'Copper pair/quad, coaxial & telecommunication cables' },
];

export const DEFAULT_FAMILY_SUBTYPES: Record<string, string[]> = {
  UGC: ['LV', 'MV', 'HV', 'EHV'],
  OHL: ['AAC', 'AAAC', 'ACSR'],
  ABC: ['LV ABC', 'MV ABC'],
  SINGLE: ['LV/MV/HV', 'LV Single Core', 'MV Single Core', 'HV Single Core', 'EHV Single Core'],
  CONTROL: ['Signal', 'Control', 'Instrumentation'],
  TELECOM: ['Telecom', 'Pair/Quad', 'Coaxial'],
};

// -------------------------------------------------------------
// CONSTRUCTION LOGIC MATRIX
// -------------------------------------------------------------
export interface ConstructionLogicEntry {
  familyCode: string;
  familyLabel: string;
  subFamily: string;
  voltageCategory: string;
  constructionLogic: string;
  description: string;
  rules: {
    isBareConductor?: boolean;
    requiresScreen?: boolean;
    requiresSemiCon?: boolean;
    requiresInsulation?: boolean;
    requiresSheath?: boolean;
    isSingleCore?: boolean;
    recommendedArmour?: string;
    voltageRuleNote?: string;
    keyStandards?: string[];
  };
}

export const CABLE_CONSTRUCTION_LOGIC_MATRIX: ConstructionLogicEntry[] = [
  {
    familyCode: 'UGC',
    familyLabel: 'UGC Power Cable',
    subFamily: 'LV',
    voltageCategory: 'LV',
    constructionLogic: 'Power cable',
    description: 'Low-voltage multi-core or single-core insulated power cable for buried ducts, trays, and industrial supply without requirement for semi-conductive field control layers.',
    rules: {
      isBareConductor: false,
      requiresScreen: false,
      requiresSemiCon: false,
      requiresInsulation: true,
      requiresSheath: true,
      recommendedArmour: 'SWA / STA (multi-core) or AWA (single-core)',
      voltageRuleNote: 'Standard 300/500V, 450/750V, 0.6/1 kV (Um: 1.2 kV)',
      keyStandards: ['IEC 60502-1', 'BS 5467', 'BS 6724'],
    },
  },
  {
    familyCode: 'UGC',
    familyLabel: 'UGC Power Cable',
    subFamily: 'MV',
    voltageCategory: 'MV',
    constructionLogic: 'Screened MV power cable',
    description: 'Medium-voltage power cable with extruded inner conductor screen, XLPE dielectric insulation, outer insulation screen, and metallic screening (copper tape/wire) to control radial electrical stress.',
    rules: {
      isBareConductor: false,
      requiresScreen: true,
      requiresSemiCon: true,
      requiresInsulation: true,
      requiresSheath: true,
      recommendedArmour: 'SWA / STA / AWA / DSTA',
      voltageRuleNote: '3.6/6 kV to 20.8/36 kV (Um: 7.2 kV - 36 kV)',
      keyStandards: ['IEC 60502-2', 'BS 6622', 'BS 7835', 'SEC 01-TMSS-01'],
    },
  },
  {
    familyCode: 'UGC',
    familyLabel: 'UGC Power Cable',
    subFamily: 'HV',
    voltageCategory: 'HV',
    constructionLogic: 'Screened HV power cable',
    description: 'High-voltage transmission cable featuring ultra-smooth triple extrusion, bonded semi-conductive screens, high purity super-clean XLPE, heavy copper wire screen, and radial water blocking.',
    rules: {
      isBareConductor: false,
      requiresScreen: true,
      requiresSemiCon: true,
      requiresInsulation: true,
      requiresSheath: true,
      recommendedArmour: 'Non-magnetic AWA / Lead sheath / Corrugated Aluminium',
      voltageRuleNote: '66 kV to 150 kV (Um: 72.5 kV - 170 kV)',
      keyStandards: ['IEC 60840', 'Saudi Aramco 15-SAMSS-502'],
    },
  },
  {
    familyCode: 'UGC',
    familyLabel: 'UGC Power Cable',
    subFamily: 'EHV',
    voltageCategory: 'EHV',
    constructionLogic: 'Specialized HV/EHV construction',
    description: 'Extra High Voltage supergrid transmission with segmental Milliken conductors, extra-thick degassing-treated XLPE, integrated metallic moisture barrier / lead alloy sheath, and heavy MDPE/HDPE outer jacket.',
    rules: {
      isBareConductor: false,
      requiresScreen: true,
      requiresSemiCon: true,
      requiresInsulation: true,
      requiresSheath: true,
      recommendedArmour: 'Lead Sheath / Metallic Laminate / Non-magnetic AWA',
      voltageRuleNote: '220 kV to 500 kV (Um: 245 kV - 550 kV)',
      keyStandards: ['IEC 62067'],
    },
  },
  {
    familyCode: 'OHL',
    familyLabel: 'OHL',
    subFamily: 'AAC',
    voltageCategory: 'N/A',
    constructionLogic: 'Bare overhead conductor',
    description: 'All Aluminium Conductor (AAC) concentric-lay-stranded bare conductor designed for short-span overhead distribution and substation busbars.',
    rules: {
      isBareConductor: true,
      requiresScreen: false,
      requiresSemiCon: false,
      requiresInsulation: false,
      requiresSheath: false,
      voltageRuleNote: 'Voltage rating determined by aerial insulator string design (N/A internal cable voltage)',
      keyStandards: ['IEC 61089', 'BS 215-1', 'ASTM B231'],
    },
  },
  {
    familyCode: 'OHL',
    familyLabel: 'OHL',
    subFamily: 'AAAC',
    voltageCategory: 'N/A',
    constructionLogic: 'Bare overhead alloy conductor',
    description: 'All Aluminium Alloy Conductor (AAAC - Al-Mg-Si) high-strength corrosion-resistant bare conductor for longer spans and coastal/industrial aerial transmission lines.',
    rules: {
      isBareConductor: true,
      requiresScreen: false,
      requiresSemiCon: false,
      requiresInsulation: false,
      requiresSheath: false,
      voltageRuleNote: 'Voltage rating determined by aerial insulator string design (N/A internal cable voltage)',
      keyStandards: ['IEC 61089', 'BS 3242', 'ASTM B399'],
    },
  },
  {
    familyCode: 'OHL',
    familyLabel: 'OHL',
    subFamily: 'ACSR',
    voltageCategory: 'N/A',
    constructionLogic: 'Bare overhead steel-reinforced conductor',
    description: 'Aluminium Conductor Steel Reinforced (ACSR) composite stranded bare conductor with central galvanized steel core wire for maximum tensile strength on river crossings and ultra-long transmission spans.',
    rules: {
      isBareConductor: true,
      requiresScreen: false,
      requiresSemiCon: false,
      requiresInsulation: false,
      requiresSheath: false,
      voltageRuleNote: 'Voltage rating determined by aerial insulator string design (N/A internal cable voltage)',
      keyStandards: ['IEC 61089', 'BS 215-2', 'ASTM B232'],
    },
  },
  {
    familyCode: 'ABC',
    familyLabel: 'ABC',
    subFamily: 'LV ABC',
    voltageCategory: 'LV',
    constructionLogic: 'Aerial bundled cable',
    description: 'Self-supporting aerial bundled cable consisting of compact insulated phase conductors twisted around an insulated or bare neutral/messenger wire (AAAC) for rural and urban overhead distribution without clearing risks.',
    rules: {
      isBareConductor: false,
      requiresScreen: false,
      requiresSemiCon: false,
      requiresInsulation: true,
      requiresSheath: true,
      voltageRuleNote: 'Standard 0.6/1 kV rating with carbon-black UV-stabilized weather-resistant XLPE insulation',
      keyStandards: ['HD 626 S1', 'BS 7870-5', 'NF C 33-209'],
    },
  },
  {
    familyCode: 'SINGLE',
    familyLabel: 'Single Core',
    subFamily: 'LV/MV/HV',
    voltageCategory: 'Depending on design',
    constructionLogic: 'Single-core construction',
    description: 'Single-conductor power cable designed for high continuous ampacity, substation transformers, generator links, and heavy industrial switchgear connections. Non-magnetic armour (AWA/ATA) required when mechanical protection is specified.',
    rules: {
      isBareConductor: false,
      isSingleCore: true,
      recommendedArmour: 'AWA (Aluminium Wire Armour) or Non-magnetic ATA / Unarmoured (Strictly NO steel SWA)',
      voltageRuleNote: 'Applicable across LV, MV, HV and EHV voltage classes (0.6/1 kV to 500 kV)',
      keyStandards: ['IEC 60502-1', 'IEC 60502-2', 'IEC 60840'],
    },
  },
  {
    familyCode: 'CONTROL',
    familyLabel: 'Signal & Control',
    subFamily: 'Signal',
    voltageCategory: 'Usually LV',
    constructionLogic: 'Control/signal construction',
    description: 'Multi-conductor cable (2 to 61 cores) for relay panels, PLC inputs/outputs, switchboard interlocks, and instrumentation systems. Features flexible Class 5 or Class 2 conductors, color/number coding, and optional copper braid/tape shielding.',
    rules: {
      isBareConductor: false,
      requiresInsulation: true,
      requiresSheath: true,
      recommendedArmour: 'GSWB (Galvanised Steel Wire Braid) / SWA / Unarmoured',
      voltageRuleNote: 'Usually 300/500 V, 450/750 V or 0.6/1 kV',
      keyStandards: ['IEC 60502-1', 'BS 5467', 'BS 6724'],
    },
  },
  {
    familyCode: 'TELECOM',
    familyLabel: 'Telecom',
    subFamily: 'Telecom',
    voltageCategory: 'N/A',
    constructionLogic: 'Telecom-specific construction',
    description: 'Specialized twisted pair/quad communication cable, coaxial RF feed line, or optical fiber communication link optimized for high-frequency signal integrity, low attenuation, and electromagnetic immunity.',
    rules: {
      isBareConductor: false,
      requiresInsulation: true,
      requiresSheath: true,
      voltageRuleNote: 'Voltage rating N/A or low signaling voltage (< 50V)',
      keyStandards: ['IEC 60708', 'ITU-T Recommendations', 'EN 50288'],
    },
  },
];

/**
 * Resolves the matching Construction Logic entry given family, sub-family and voltage
 */
export function resolveConstructionLogic(
  family?: string,
  subFamily?: string,
  voltageClass?: string
): ConstructionLogicEntry {
  if (!family) {
    return CABLE_CONSTRUCTION_LOGIC_MATRIX[0];
  }

  const famUpper = family.toUpperCase();
  const subUpper = (subFamily || '').toUpperCase();
  const voltUpper = (voltageClass || '').toUpperCase();

  // Match OHL sub-families
  if (famUpper.includes('OHL') || famUpper.includes('OHTL')) {
    if (subUpper.includes('AAAC')) return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.subFamily === 'AAAC')!;
    if (subUpper.includes('ACSR')) return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.subFamily === 'ACSR')!;
    return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.subFamily === 'AAC')!;
  }

  // Match ABC
  if (famUpper.includes('ABC')) {
    return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.familyCode === 'ABC')!;
  }

  // Match Single Core
  if (famUpper.includes('SINGLE')) {
    return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.familyCode === 'SINGLE')!;
  }

  // Match Signal & Control
  if (famUpper.includes('CONTROL') || famUpper.includes('SIGNAL')) {
    return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.familyCode === 'CONTROL')!;
  }

  // Match Telecom
  if (famUpper.includes('TELECOM')) {
    return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.familyCode === 'TELECOM')!;
  }

  // Match UGC by Voltage Class or Sub-Family
  if (famUpper.includes('UGC') || famUpper.includes('UNDERGROUND')) {
    if (subUpper.includes('EHV') || voltUpper === 'EHV') {
      return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.familyCode === 'UGC' && m.subFamily === 'EHV')!;
    }
    if (subUpper.includes('HV') || voltUpper === 'HV') {
      return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.familyCode === 'UGC' && m.subFamily === 'HV')!;
    }
    if (subUpper.includes('MV') || voltUpper === 'MV') {
      return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.familyCode === 'UGC' && m.subFamily === 'MV')!;
    }
    return CABLE_CONSTRUCTION_LOGIC_MATRIX.find(m => m.familyCode === 'UGC' && m.subFamily === 'LV')!;
  }

  return CABLE_CONSTRUCTION_LOGIC_MATRIX[0];
}

// 2. VOLTAGE (Level, U0/U, Um)
export const DEFAULT_VOLTAGE_CLASSES: VoltageClassCode[] = ['LV', 'MV', 'HV', 'EHV'];

export const DEFAULT_VOLTAGES_BY_CLASS: Record<VoltageClassCode, string[]> = {
  LV: ['300/500 V', '450/750 V', '600/1000 V (0.6/1 kV)', '1800/3000 V (1.8/3 kV)'],
  MV: ['3.6/6 kV', '6/10 kV', '6.35/11 kV', '8.7/15 kV', '12/20 kV', '18/30 kV', '20.8/36 kV'],
  HV: ['38/66 kV', '64/110 kV', '76/132 kV', '87/150 kV'],
  EHV: ['127/220 kV', '160/275 kV', '230/400 kV', '290/500 kV'],
};

export const DEFAULT_VOLTAGE_RATINGS_DETAILED = [
  { level: 'LV', u0_u: '0.6/1 kV', um: '1.2 kV', desc: 'Low Voltage Standard Industrial / Utility' },
  { level: 'LV', u0_u: '300/500 V', um: '0.6 kV', desc: 'Internal Wiring & Control' },
  { level: 'LV', u0_u: '450/750 V', um: '0.9 kV', desc: 'Building Wire & Panel Wiring' },
  { level: 'MV', u0_u: '3.6/6 kV', um: '7.2 kV', desc: 'Medium Voltage Distribution' },
  { level: 'MV', u0_u: '6/10 kV', um: '12 kV', desc: 'Medium Voltage Distribution' },
  { level: 'MV', u0_u: '8.7/15 kV', um: '17.5 kV', desc: 'Medium Voltage Distribution' },
  { level: 'MV', u0_u: '12/20 kV', um: '24 kV', desc: 'Medium Voltage Distribution' },
  { level: 'MV', u0_u: '18/30 kV', um: '36 kV', desc: 'Medium Voltage Distribution' },
  { level: 'HV', u0_u: '38/66 kV', um: '72.5 kV', desc: 'High Voltage Transmission' },
  { level: 'HV', u0_u: '64/110 kV', um: '123 kV', desc: 'High Voltage Transmission' },
  { level: 'HV', u0_u: '76/132 kV', um: '145 kV', desc: 'High Voltage Transmission' },
  { level: 'EHV', u0_u: '127/220 kV', um: '245 kV', desc: 'Extra High Voltage Grid' },
  { level: 'EHV', u0_u: '230/400 kV', um: '420 kV', desc: 'Extra High Voltage Supergrid' },
];

export const DEFAULT_STANDARDS = [
  'IEC 60502-1 (0.6/1 kV to 1.8/3 kV)',
  'IEC 60502-2 (6 kV to 30 kV)',
  'IEC 60840 (30 kV to 150 kV)',
  'IEC 62067 (150 kV to 500 kV)',
  'IEC 60228 (Conductor Standards)',
  'BS 5467 (LV XLPE SWA Armoured)',
  'BS 6724 (LV LSHF SWA Armoured)',
  'BS 6622 (MV PVC Armoured)',
  'BS 7835 (MV LSHF Armoured)',
  'SEC 01-TMSS-01 (Saudi Electricity Co)',
  'Saudi Aramco 15-SAMSS-502',
  'EN 50575 (CPR Euroclasses)',
  'IEC 60332-1 / IEC 60332-3 (Flame Retardancy)',
  'IEC 60754 (Halogen Acid Gas)',
  'IEC 61034 (Smoke Density)',
];

// 3. CONDUCTOR (Material, Class, Shape, Compacting, CSA, Core Qty, Water Blocking)
export const DEFAULT_CONDUCTOR_MATERIALS = [
  { code: 'CU', label: 'Copper (Cu)', desc: 'Electrolytic Plain Annealed Copper (IEC 60228 Class 1/2/5)' },
  { code: 'AL', label: 'Aluminium (Al)', desc: 'EC Grade Stranded Aluminium / Aluminium Alloy' },
];

export const DEFAULT_CONDUCTOR_CLASSES = [
  'Class 1 — Solid',
  'Class 2 — Stranded',
  'Class 5 — Flexible',
];

export const DEFAULT_CONDUCTOR_SHAPES = [
  'Round (re / rm)',
  'Compacted Round (rm)',
  'Sector Shaped (se / sm)',
  'Segmental / Milliken (5 or 6 segments)',
];

export const DEFAULT_CONDUCTOR_COMPACTING = [
  'Compacted',
  'Non-compacted',
];

export const DEFAULT_CONDUCTOR_SIZES = [
  '0.5',
  '0.75',
  '1.0',
  '1.5',
  '2.5',
  '4',
  '6',
  '10',
  '16',
  '25',
  '35',
  '50',
  '70',
  '95',
  '120',
  '150',
  '185',
  '240',
  '300',
  '400',
  '500',
  '630',
  '800',
  '1000',
  '1200',
  '1600',
  '2000',
  '2500',
];

export const DEFAULT_CORE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 19, 24, 27, 30, 37, 48, 61];

// 4. INSULATION (XLPE, PVC, LSHF, EPR)
export const DEFAULT_INSULATIONS = ['XLPE', 'PVC', 'LSHF', 'EPR'];

export const DEFAULT_INSULATION_COLORS = [
  'Natural',
  'Black',
  'Red',
  'Blue',
  'Brown',
  'Grey',
  'Yellow',
  'Green/Yellow',
  'N/A',
];

// 5. SEMI-CONDUCTIVE LAYER (Applicable, Inner, Outer)
export const DEFAULT_SEMI_CON_APPLICABLE: TriState[] = ['Yes', 'No', 'N/A'];

export const DEFAULT_INNER_SEMI_CONDUCTORS = [
  'Extruded Bonded Semi-Conductor',
  'Extruded Strippable Semi-Conductor',
  'Semi-Conducting Tape',
  'Not Applicable (LV)',
];

export const DEFAULT_OUTER_SEMI_CONDUCTORS = [
  'Extruded Bonded Semi-Conductor',
  'Extruded Cold Strippable (Easy-Strip)',
  'Semi-Conducting Tape & Varnish',
  'Not Applicable (LV)',
];

// 6. SCREENING (None, Copper Tape, Copper Wire, Aluminium Tape, Other)
export const DEFAULT_SCREEN_TYPES = [
  'None',
  'Copper Tape',
  'Copper Wire',
  'Aluminium Tape',
  'Other approved screen',
  'Copper Wire + Equalising Tape',
  'Lead Sheath',
];

export const DEFAULT_SCREEN_MATERIALS = ['Copper', 'Aluminium', 'Lead', 'Other', 'N/A'];

export const DEFAULT_SCREEN_CSAS = [
  'None',
  '1.5 mm²',
  '2.5 mm²',
  '4 mm²',
  '6 mm²',
  '10 mm²',
  '16 mm²',
  '25 mm²',
  '35 mm²',
  '50 mm²',
  '70 mm²',
  '95 mm²',
  '120 mm²',
  '150 mm²',
  '185 mm²',
  '240 mm²',
];

// 7. ARMOUR (None, SWA, STA, AWA, ATA)
export const DEFAULT_ARMOUR_TYPES = [
  'None',
  'SWA',
  'STA',
  'AWA',
  'ATA',
  'DSTA',
  'GSWB (Galvanised Steel Wire Braid)',
];

export const DEFAULT_ARMOUR_MATERIALS = ['Steel', 'Aluminium', 'Copper', 'Other', 'N/A'];

export const DEFAULT_ARMOUR_CSAS = [
  'None',
  '0.5 mm Tape',
  '0.8 mm Tape',
  '0.9 mm Wire',
  '1.25 mm Wire',
  '1.6 mm Wire',
  '2.0 mm Wire',
  '2.5 mm Wire',
  '3.15 mm Wire',
];

// 8. SHEATH (PVC, PE, LSHF)
export const DEFAULT_SHEATHINGS = [
  'PVC',
  'PE',
  'LSHF',
  'MDPE',
  'HDPE',
  'Polyamide / Nylon',
  'Lead Alloy',
];

export const DEFAULT_SHEATHING_COLORS = [
  'Black',
  'Red',
  'Blue',
  'Brown',
  'Grey',
  'Orange',
  'Yellow',
  'Green',
  'Green/Yellow',
  'Natural',
];

// 9. SPECIAL PROPERTIES (Water Tight, Termite, Additives, CPR, Special Area)
export const DEFAULT_WATER_BLOCKING_TYPES = [
  'None',
  'Longitudinal Water Blocking (Swellable Tape / Yarn)',
  'Radial Water Blocking (Aluminium / Copper Foil Laminate)',
  'Radial & Longitudinal Water Tight (Hermetic Seal)',
  'Conductor Water Swellable Powder & Tapes',
];

export const DEFAULT_TERMITE_PROTECTIONS = [
  'None',
  'Anti-Termite (Polyamide-12 Outer Jacket)',
  'Anti-Termite (Pyrethroid Masterbatch Additive)',
  'Anti-Rodent (Brass / Galvanised Steel Tape Barrier)',
  'Anti-Termite & Anti-Rodent Combined',
];

export const DEFAULT_SPECIAL_ADDITIVES = [
  'None',
  'UV Resistant (ASTM G154 / ISO 4892)',
  'Flame Retardant (IEC 60332-1 / IEC 60332-3 Category A/B/C)',
  'Low Smoke Zero Halogen (IEC 60754 / IEC 61034)',
  'Oil & Hydrocarbon Resistant (UIC 895 / NEK 606)',
  'Sunlight Resistant (UL 1581)',
  'Substation Grade Anti-Vibration',
  'Low Temperature Resistant (-40°C)',
];

export const DEFAULT_CPR_CLASSES = [
  'N/A',
  'B2ca-s1a,d1,a1',
  'Cca-s1b,d1,a1',
  'Dca-s2,d2,a2',
  'Eca',
  'Fca',
];

export const DEFAULT_SPECIAL_AREAS = [
  'Direct Burial in Ground',
  'Underground Concrete Duct / Conduit',
  'Open Cable Tray / Ladder in Air',
  'Substation Cable Trench / Tunnel',
  'Wet / Flooded Location',
  'Subsea / Offshore / Marine',
  'Solar PV Installation',
  'Nuclear / Industrial Hazardous Area',
  'Railway Infrastructure',
];

// 10. CORE IDENTIFICATION (Core Color, Numbering, Customer-specific)
export const DEFAULT_CORE_COLORS = [
  'Black',
  'Brown',
  'Grey',
  'Blue',
  'Red',
  'Yellow',
  'Green/Yellow',
  'White',
  'Orange',
  'Natural',
  'Numbered',
];

export const DEFAULT_STANDARD_CORE_COLORS_BY_COUNT: Record<number, string[]> = {
  1: ['Black'],
  2: ['Brown', 'Blue'],
  3: ['Brown', 'Black', 'Grey'],
  4: ['Brown', 'Black', 'Grey', 'Blue'],
  5: ['Brown', 'Black', 'Grey', 'Blue', 'Green/Yellow'],
};

export const DEFAULT_CORE_IDENTIFICATIONS = [
  'HD 308 S2 Standard Color Scheme',
  'BS 7671 Legacy Colors (Red, Yellow, Blue, Black)',
  'White Numbering on Black Cores (+ Green/Yellow)',
  'Custom Striped Cores',
  'Customer Specific Specification',
];

export const DEFAULT_CUSTOMER_IDENTIFICATIONS = [
  'Standard IEC / BS Catalog Format',
  'SEC Specification (Saudi Electricity Co)',
  'Saudi Aramco 15-SAMSS-502',
  'DEWA Standard (Dubai)',
  'ADDC / AADC Standard (Abu Dhabi)',
  'Kahramaa Standard (Qatar)',
  'Custom OEM Customer Part Number',
];

// 11. SIZE / COMMERCIAL PARAMETERS (Cutting Length, Drum Type, Customer Code)
export const DEFAULT_DRUM_TYPES = [
  'Wooden Drum (Standard Non-Returnable)',
  'Treated Wooden Drum (Export ISPM 15)',
  'Steel Drum (Heavy Duty)',
  'Steel-Corrugated Reel',
  'Returnable Steel Drum (1800mm - 3200mm)',
  'Coil / Ring (100m - 200m Shrinkwrapped)',
];

export const DEFAULT_LENGTH_TOLERANCES = [
  '± 1% Standard Tolerance',
  '± 2% Standard Tolerance',
  'Exact Length (+0% / -0%)',
  'Custom Customer Tolerance',
];

// -------------------------------------------------------------
// LOCAL STORAGE MASTER DATA STORAGE SERVICE
// -------------------------------------------------------------
const STORAGE_KEY_CUSTOM_MASTER = 'energya_v2_custom_master_params';

export function getCustomMasterParams(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_MASTER);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to load custom master parameters:', e);
    return {};
  }
}

export function saveCustomMasterParams(params: Record<string, string[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_MASTER, JSON.stringify(params));
    window.dispatchEvent(new CustomEvent('v2MasterParametersUpdated', { detail: params }));
  } catch (e) {
    console.error('Failed to save custom master parameters:', e);
  }
}

export function getCustomMasterParameters(): ParameterMasterItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_MASTER);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to load custom master parameters:', e);
    return [];
  }
}

export function saveCustomMasterParameter(item: ParameterMasterItem): void {
  try {
    const list = getCustomMasterParameters();
    const idx = list.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.push(item);
    }
    localStorage.setItem(STORAGE_KEY_CUSTOM_MASTER, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('v2MasterParametersUpdated', { detail: list }));
  } catch (e) {
    console.error('Failed to save master parameter:', e);
  }
}

export function toggleMasterParameterStatus(id: string, active: boolean): void {
  try {
    const list = getCustomMasterParameters();
    const item = list.find((i) => i.id === id);
    if (item) {
      item.isActive = active;
      localStorage.setItem(STORAGE_KEY_CUSTOM_MASTER, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('v2MasterParametersUpdated', { detail: list }));
    }
  } catch (e) {
    console.error('Failed to toggle master parameter:', e);
  }
}
