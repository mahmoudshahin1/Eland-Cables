import React from 'react';
import {
  ShieldCheck,
  CheckCircle,
  Sparkles,
  Lock,
  Zap,
  Activity,
  Layers,
  Truck,
  Cpu,
  Flame,
  Award,
  Search,
} from 'lucide-react';
import { DynamicFilterOptions } from '../../services/cableSelectionService';
import { CableConfiguration } from '../../services/cableConstraintEngine';

export interface Cable45ParameterTableProps {
  config: CableConfiguration;
  dynamicFilter: DynamicFilterOptions;
  selectionMode: 'CUSTOMER' | 'TECHNICAL';
  onUpdateParam: (key: keyof CableConfiguration, value: any) => void;
  calculatedPhysics: {
    outerDiameterMm?: number;
    approxWeightKgKm?: number;
    minBendingRadiusMm?: number;
    operatingTempC?: string;
    shortCircuitRatingKa?: string;
    insulationThicknessMm?: number;
    armourDim?: string;
    drumCapacity?: number;
  };
}

export interface ParamRowDefinition {
  index: number;
  key: keyof CableConfiguration | string;
  name: string;
  category: string;
  type: 'select' | 'input-number' | 'input-text' | 'calculated';
  value: string | number;
  options?: string[];
  unit?: string;
  standardRef?: string;
  isOpen: boolean;
  isDone: boolean;
  badgeText?: string;
}

export const Cable45ParameterTable: React.FC<Cable45ParameterTableProps> = ({
  config,
  dynamicFilter,
  selectionMode,
  onUpdateParam,
  calculatedPhysics,
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterCategory, setFilterCategory] = React.useState<string>('ALL');

  // Categorized 45 Parameters with exact names from the specification image
  const parameterList: ParamRowDefinition[] = [
    // 1 - 5: Commercial, Family & Standards
    {
      index: 1,
      key: 'customerCode',
      name: 'Customer Code',
      category: 'Standards & Commercial',
      type: 'select',
      value: config.customerCode || '',
      options: dynamicFilter.availableCustomerCodes,
      standardRef: 'Customer Master Ref (e.g. N2XH, N2XS2Y, BS 5467)',
      isOpen: true,
      isDone: !!config.customerCode,
      badgeText: config.customerCode ? 'Selected' : 'Mandatory Step 1',
    },
    {
      index: 2,
      key: 'family',
      name: 'Cable Family',
      category: 'Standards & Commercial',
      type: 'select',
      value: config.family || '',
      options: dynamicFilter.availableFamilies,
      standardRef: 'IEC 60502 / IEC 60840 / OHTL',
      isOpen: selectionMode === 'CUSTOMER' ? !!config.customerCode : true,
      isDone: !!config.family,
    },
    {
      index: 3,
      key: 'cableType',
      name: 'Cable Type / Application',
      category: 'Standards & Commercial',
      type: 'select',
      value: config.cableType || '',
      options: dynamicFilter.availableCableTypes.length > 0
        ? dynamicFilter.availableCableTypes
        : ['LV Power', 'MV Power', 'HV Power', 'Control'],
      standardRef: 'Product Family Standard (Underground / Substation / Overhead)',
      isOpen: !!config.family,
      isDone: !!config.cableType,
    },
    {
      index: 4,
      key: 'standard',
      name: 'Applicable Standard',
      category: 'Standards & Commercial',
      type: 'select',
      value: config.standard || '',
      options: dynamicFilter.availableStandards,
      standardRef: 'IEC 60502-1, IEC 60502-2, BS 5467, BS 6724, VDE 0276',
      isOpen: !!config.family,
      isDone: !!config.standard,
    },
    {
      index: 5,
      key: 'voltage',
      name: 'Voltage',
      category: 'Standards & Commercial',
      type: 'select',
      value: config.voltage || '',
      options: dynamicFilter.availableVoltages,
      standardRef: 'U₀/U (Um) Operating Voltage Rating',
      isOpen: !!config.family,
      isDone: !!config.voltage,
    },

    // 6 - 10: Conductor Engineering
    {
      index: 6,
      key: 'conductor',
      name: 'Conductor Material',
      category: 'Conductor Core',
      type: 'select',
      value: config.conductor || '',
      options: dynamicFilter.availableConductorMaterials,
      standardRef: 'IEC 60228: Copper (Cu) / Aluminum (Al)',
      isOpen: !!config.voltage,
      isDone: !!config.conductor,
    },
    {
      index: 7,
      key: 'conductorClass',
      name: 'Conductor Class',
      category: 'Conductor Core',
      type: 'select',
      value: config.conductorClass || '',
      options: dynamicFilter.availableConductorClasses.length > 0
        ? dynamicFilter.availableConductorClasses
        : ['Class 1 (Solid)', 'Class 2 (Stranded)', 'Class 5 (Flexible)'],
      standardRef: 'IEC 60228 Flexibility Class',
      isOpen: !!config.conductor,
      isDone: !!config.conductorClass,
    },
    {
      index: 8,
      key: 'conductorConstruction',
      name: 'Conductor Construction',
      category: 'Conductor Core',
      type: 'select',
      value: config.conductorConstruction || '',
      options: dynamicFilter.availableConductorConstructions.length > 0
        ? dynamicFilter.availableConductorConstructions
        : ['Stranded Compact', 'Sector Shaped', 'Milliken Segmented'],
      standardRef: 'Shaping (Circular Compacted / Sector / Segmental)',
      isOpen: !!config.conductor,
      isDone: !!config.conductorConstruction,
    },
    {
      index: 9,
      key: 'conductorSize',
      name: 'Conductor Cross Section',
      category: 'Conductor Core',
      type: 'select',
      value: config.conductorSize || '',
      options: dynamicFilter.availableConductorSizes,
      unit: 'mm²',
      standardRef: 'Nominal Conductor Cross-Sectional Area (mm²)',
      isOpen: !!config.conductor,
      isDone: !!config.conductorSize,
    },
    {
      index: 10,
      key: 'conductorWaterTight',
      name: 'Water Tight Conductor',
      category: 'Conductor Core',
      type: 'select',
      value: config.conductorWaterTight || '',
      options: dynamicFilter.availableConductorWaterTights.length > 0
        ? dynamicFilter.availableConductorWaterTights
        : ['None', 'Swellable Powder', 'Longitudinal Swellable Tape'],
      standardRef: 'IEC 60502-2 Swellable Water-Blocking In-Conductor',
      isOpen: !!config.conductor,
      isDone: !!config.conductorWaterTight,
    },

    // 11 - 15: Core & Insulation System
    {
      index: 11,
      key: 'core',
      name: 'Core Count',
      category: 'Core & Insulation',
      type: 'select',
      value: config.core || '',
      options: dynamicFilter.availableCores,
      standardRef: 'Number of Conductive Cores (1C to 37C)',
      isOpen: !!config.conductorSize,
      isDone: !!config.core,
    },
    {
      index: 12,
      key: 'coreIdentification',
      name: 'Core Identification / Color',
      category: 'Core & Insulation',
      type: 'select',
      value: config.coreIdentification || '',
      options: dynamicFilter.availableCoreIdentifications.length > 0
        ? dynamicFilter.availableCoreIdentifications
        : ['HD 308 S2', 'Traditional Red/Yellow/Blue/Black', 'Numbered Cores'],
      standardRef: 'CENELEC HD 308 S2 / BS 7671 Core Identification',
      isOpen: !!config.core,
      isDone: !!config.coreIdentification,
    },
    {
      index: 13,
      key: 'coreConstruction',
      name: 'Core Construction',
      category: 'Core & Insulation',
      type: 'select',
      value: config.coreConstruction || '',
      options: dynamicFilter.availableCoreConstructions.length > 0
        ? dynamicFilter.availableCoreConstructions
        : ['Laid-up with Fillers', 'Extruded Inner Core Assembly', 'Single-Core Concentric'],
      standardRef: 'Multi-Core Lay-up Geometry & Assembly',
      isOpen: !!config.core,
      isDone: !!config.coreConstruction,
    },
    {
      index: 14,
      key: 'insulation',
      name: 'Insulation Material',
      category: 'Core & Insulation',
      type: 'select',
      value: config.insulation || '',
      options: dynamicFilter.availableInsulations,
      standardRef: 'XLPE (90°C) / EPR (90°C) / PVC (70°C) / LSZH',
      isOpen: !!config.core,
      isDone: !!config.insulation,
    },
    {
      index: 15,
      key: 'insulationThickness',
      name: 'Insulation Thickness',
      category: 'Core & Insulation',
      type: 'calculated',
      value: calculatedPhysics.insulationThicknessMm ? `${calculatedPhysics.insulationThicknessMm} mm` : 'Auto per IEC',
      standardRef: 'IEC 60502 Nominal Insulation Radial Wall Thickness (mm)',
      isOpen: !!config.insulation,
      isDone: true,
      badgeText: 'Auto-IEC',
    },

    // 16 - 21: Semi-Conductor & Screening
    {
      index: 16,
      key: 'outerSemiConductor',
      name: 'Outer Semi-Conductor',
      category: 'Screening System',
      type: 'select',
      value: config.outerSemiConductor || '',
      options: dynamicFilter.availableOuterSemiConductors,
      standardRef: 'IEC 60502-2 Extruded Insulation Screen (MV/HV only)',
      isOpen: !!config.insulation && (config.family === 'MV' || config.family === 'HV'),
      isDone: !!config.outerSemiConductor || (config.family !== 'MV' && config.family !== 'HV'),
    },
    {
      index: 17,
      key: 'outerSemiConductorType',
      name: 'Outer Semi-Conductor Type',
      category: 'Screening System',
      type: 'select',
      value: config.outerSemiConductorType || '',
      options: dynamicFilter.availableOuterSemiConductorTypes.length > 0
        ? dynamicFilter.availableOuterSemiConductorTypes
        : ['Bonded', 'Strippable'],
      standardRef: 'Strippable (Cold Strip) vs Fully Bonded Screen',
      isOpen: !!config.outerSemiConductor && config.outerSemiConductor !== 'None' && config.outerSemiConductor !== 'No',
      isDone: !!config.outerSemiConductorType,
    },
    {
      index: 18,
      key: 'screen',
      name: 'Screen Type',
      category: 'Screening System',
      type: 'select',
      value: config.screen || '',
      options: dynamicFilter.availableScreenTypes,
      standardRef: 'Copper Wire Screen / Copper Tape Screen / Concentric / Lead Sheath',
      isOpen: !!config.insulation,
      isDone: !!config.screen,
    },
    {
      index: 19,
      key: 'screenCSA',
      name: 'Screen Cross Section Area',
      category: 'Screening System',
      type: 'select',
      value: config.screenCSA || '',
      options: dynamicFilter.availableScreenCSAs,
      unit: 'mm²',
      standardRef: 'Metallic Screen Cross-Sectional Area (16 to 150 mm²)',
      isOpen: !!config.screen && config.screen !== 'No Screen' && config.screen !== 'None',
      isDone: !!config.screenCSA,
    },
    {
      index: 20,
      key: 'screenWaterTight',
      name: 'Screen Water Tightness',
      category: 'Screening System',
      type: 'select',
      value: config.screenWaterTight || '',
      options: dynamicFilter.availableScreenWaterTights,
      standardRef: 'Longitudinal Swellable Tape under / over screen',
      isOpen: !!config.screen && config.screen !== 'No Screen' && config.screen !== 'None',
      isDone: !!config.screenWaterTight,
    },
    {
      index: 21,
      key: 'screenConstruction',
      name: 'Screen Construction',
      category: 'Screening System',
      type: 'select',
      value: config.screenConstruction || '',
      options: dynamicFilter.availableScreenConstructions.length > 0
        ? dynamicFilter.availableScreenConstructions
        : ['Copper Wire + Helical Equalizing Tape', 'Overlapping Copper Tape (CTS)'],
      standardRef: 'Helical Copper Binder / Equalizing Tape Geometry',
      isOpen: !!config.screen && config.screen !== 'No Screen' && config.screen !== 'None',
      isDone: !!config.screenConstruction,
    },

    // 22 - 28: Bedding, Fillers & Armour
    {
      index: 22,
      key: 'fillerBinder',
      name: 'Filler / Binder',
      category: 'Bedding & Armour',
      type: 'select',
      value: config.fillerBinder || '',
      options: dynamicFilter.availableFillerBinders.length > 0
        ? dynamicFilter.availableFillerBinders
        : ['PP Fillers + Binder Tape', 'Extruded Elastomeric Bedding'],
      standardRef: 'Non-hygroscopic Polypropylene Yarns / Binder Tape',
      isOpen: !!config.core && config.core !== '1 Core' && config.core !== '1C',
      isDone: !!config.fillerBinder || config.core === '1 Core' || config.core === '1C',
    },
    {
      index: 23,
      key: 'bedding',
      name: 'Bedding',
      category: 'Bedding & Armour',
      type: 'select',
      value: config.bedding || '',
      options: dynamicFilter.availableBeddings.length > 0
        ? dynamicFilter.availableBeddings
        : ['Extruded PVC', 'Extruded LSZH', 'Taped Bedding'],
      standardRef: 'Inner Extruded Bedding Cushion Layer per IEC 60502-1',
      isOpen: !!config.armour && config.armour !== 'No Armour' && config.armour !== 'None',
      isDone: !!config.bedding || config.armour === 'No Armour' || config.armour === 'None',
    },
    {
      index: 24,
      key: 'armour',
      name: 'Armour Type',
      category: 'Bedding & Armour',
      type: 'select',
      value: config.armour || '',
      options: dynamicFilter.availableArmours,
      standardRef: 'SWA (Steel Wire) / STA (Steel Tape) / AWA (Aluminum Wire) / None',
      isOpen: !!config.screen,
      isDone: !!config.armour,
    },
    {
      index: 25,
      key: 'armourMaterial',
      name: 'Armour Material',
      category: 'Bedding & Armour',
      type: 'select',
      value: config.armourMaterial || '',
      options: dynamicFilter.availableArmourMaterials,
      standardRef: 'Galvanized Steel / Aluminum (Single-core non-magnetic)',
      isOpen: !!config.armour && config.armour !== 'No Armour' && config.armour !== 'None',
      isDone: !!config.armourMaterial || config.armour === 'No Armour' || config.armour === 'None',
    },
    {
      index: 26,
      key: 'armourCSA',
      name: 'Armour Cross Section',
      category: 'Bedding & Armour',
      type: 'select',
      value: config.armourCSA || '',
      options: dynamicFilter.availableArmourCSAs,
      standardRef: 'Armour Wire Diameter (mm) or Tape Thickness (mm) per IEC',
      isOpen: !!config.armour && config.armour !== 'No Armour' && config.armour !== 'None',
      isDone: !!config.armourCSA || config.armour === 'No Armour' || config.armour === 'None',
    },
    {
      index: 27,
      key: 'armourWaterTight',
      name: 'Armour Water Tightness',
      category: 'Bedding & Armour',
      type: 'select',
      value: config.armourWaterTight || '',
      options: dynamicFilter.availableArmourWaterTights,
      standardRef: 'Bitumen Coated / Swellable Tape over Armour',
      isOpen: !!config.armour && config.armour !== 'No Armour' && config.armour !== 'None',
      isDone: !!config.armourWaterTight || config.armour === 'No Armour' || config.armour === 'None',
    },
    {
      index: 28,
      key: 'innerSheath',
      name: 'Inner Sheath / Bedding Material',
      category: 'Bedding & Armour',
      type: 'select',
      value: config.innerSheath || '',
      options: dynamicFilter.availableInnerSheaths,
      standardRef: 'PVC ST2 / LSZH ST8 / MDPE ST7 Inner Separation Sheath',
      isOpen: !!config.armour && config.armour !== 'No Armour' && config.armour !== 'None',
      isDone: !!config.innerSheath || config.armour === 'No Armour' || config.armour === 'None',
    },

    // 29 - 35: Outer Sheathing Jacket & Special Attributes
    {
      index: 29,
      key: 'sheathing',
      name: 'Outer Sheathing Material',
      category: 'Outer Sheath & CPR',
      type: 'select',
      value: config.sheathing || '',
      options: dynamicFilter.availableSheathings,
      standardRef: 'PVC Type ST2 / MDPE Type ST7 / HDPE Type ST8 / LSZH',
      isOpen: !!config.armour,
      isDone: !!config.sheathing,
    },
    {
      index: 30,
      key: 'sheathingColor',
      name: 'Sheathing Color',
      category: 'Outer Sheath & CPR',
      type: 'select',
      value: config.sheathingColor || '',
      options: dynamicFilter.availableSheathingColors,
      standardRef: 'Standard Black (UV) / Red (MV) / Blue (IS) / Grey',
      isOpen: !!config.sheathing,
      isDone: !!config.sheathingColor,
    },
    {
      index: 31,
      key: 'specialAdditives',
      name: 'Special Additives',
      category: 'Outer Sheath & CPR',
      type: 'select',
      value: config.specialAdditives || '',
      options: dynamicFilter.availableSpecialAdditives,
      standardRef: 'UV Resistant / Anti-Termite / Anti-Rodent / Oil Resistant',
      isOpen: !!config.sheathing,
      isDone: !!config.specialAdditives,
    },
    {
      index: 32,
      key: 'semiConductiveSheath',
      name: 'Semi-Conductive Sheath',
      category: 'Outer Sheath & CPR',
      type: 'select',
      value: config.semiConductiveSheath || '',
      options: dynamicFilter.availableSemiConductiveSheaths,
      standardRef: 'Extruded Conductive Skin for DC Spark Integrity Testing',
      isOpen: !!config.sheathing && (config.family === 'MV' || config.family === 'HV'),
      isDone: !!config.semiConductiveSheath || (config.family !== 'MV' && config.family !== 'HV'),
    },
    {
      index: 33,
      key: 'graphiteCoating',
      name: 'Graphite Coating',
      category: 'Outer Sheath & CPR',
      type: 'select',
      value: config.graphiteCoating || '',
      options: dynamicFilter.availableGraphiteCoatings,
      standardRef: 'Outer Graphite Lacquer Coating for DC Sheath Voltage Test',
      isOpen: !!config.sheathing,
      isDone: !!config.graphiteCoating,
    },
    {
      index: 34,
      key: 'cpr',
      name: 'CPR Classification',
      category: 'Outer Sheath & CPR',
      type: 'select',
      value: config.cpr || '',
      options: dynamicFilter.availableCPRs,
      standardRef: 'EN 50575 Euroclass Fire Rating (B2ca, Cca, Dca, Eca)',
      isOpen: !!config.sheathing,
      isDone: !!config.cpr,
    },
    {
      index: 35,
      key: 'edr',
      name: 'EDR',
      category: 'Outer Sheath & CPR',
      type: 'select',
      value: config.edr || '',
      options: dynamicFilter.availableEDRs,
      standardRef: 'Energya Engineering Design Record (EDR-STD)',
      isOpen: !!config.sheathing,
      isDone: !!config.edr,
    },

    // 36 - 40: Calculated Physical & Electrical Performance
    {
      index: 36,
      key: 'outerDiameterMm',
      name: 'Cable Overall Diameter',
      category: 'Physical & Electrical Specs',
      type: 'calculated',
      value: calculatedPhysics.outerDiameterMm ? `Ø ${calculatedPhysics.outerDiameterMm} mm` : 'Auto Calculated',
      standardRef: 'Calculated Nominal Overall Outer Diameter (OD mm)',
      isOpen: true,
      isDone: true,
      badgeText: 'Physics Engine',
    },
    {
      index: 37,
      key: 'approxWeightKgKm',
      name: 'Cable Weight',
      category: 'Physical & Electrical Specs',
      type: 'calculated',
      value: calculatedPhysics.approxWeightKgKm ? `${calculatedPhysics.approxWeightKgKm} kg/km` : 'Auto Calculated',
      standardRef: 'Calculated Total Finished Cable Weight (kg/km)',
      isOpen: true,
      isDone: true,
      badgeText: 'Physics Engine',
    },
    {
      index: 38,
      key: 'minBendingRadiusMm',
      name: 'Minimum Bending Radius',
      category: 'Physical & Electrical Specs',
      type: 'calculated',
      value: calculatedPhysics.minBendingRadiusMm ? `${calculatedPhysics.minBendingRadiusMm} mm` : 'Auto Calculated',
      standardRef: 'Minimum Installation Bending Radius (12× to 15× OD)',
      isOpen: true,
      isDone: true,
      badgeText: 'Physics Engine',
    },
    {
      index: 39,
      key: 'operatingTempC',
      name: 'Operating Temperature',
      category: 'Physical & Electrical Specs',
      type: 'calculated',
      value: calculatedPhysics.operatingTempC || '90°C Continuous / 250°C Short-Circuit',
      standardRef: 'Conductor Maximum Permissible Operating Temperature',
      isOpen: true,
      isDone: true,
      badgeText: 'Physics Engine',
    },
    {
      index: 40,
      key: 'shortCircuitRatingKa',
      name: 'Short Circuit Rating',
      category: 'Physical & Electrical Specs',
      type: 'calculated',
      value: calculatedPhysics.shortCircuitRatingKa || 'Auto Calculated (kA / 1s)',
      standardRef: 'Adiabatic 1-Second Conductor & Screen Fault Current (kA)',
      isOpen: true,
      isDone: true,
      badgeText: 'Physics Engine',
    },

    // 41 - 45: Logistics, Cutting Length & Delivery
    {
      index: 41,
      key: 'cuttingLength',
      name: 'Cutting Length',
      category: 'Logistics & Packaging',
      type: 'input-number',
      value: config.cuttingLength || 500,
      unit: 'm',
      standardRef: 'Production Cut Delivery Length per Drum (100 m – 5000 m)',
      isOpen: !!config.sheathing,
      isDone: !!config.cuttingLength,
    },
    {
      index: 42,
      key: 'lengthTolerance',
      name: 'Length Tolerance',
      category: 'Logistics & Packaging',
      type: 'select',
      value: config.lengthTolerance || '±0%',
      options: ['±0%', '±1%', '±2%', '±5%'],
      standardRef: 'Production Cutting Tolerance Specification',
      isOpen: !!config.cuttingLength,
      isDone: !!config.lengthTolerance,
    },
    {
      index: 43,
      key: 'drumType',
      name: 'Drum Type',
      category: 'Logistics & Packaging',
      type: 'select',
      value: config.drumType || 'Lagged Wooden Non-Returnable',
      options: [
        'Lagged Wooden Non-Returnable',
        'Treated Wooden Returnable',
        'Heavy Steel Drum',
        'Plywood Reel',
      ],
      standardRef: 'Export / Domestic Heavy Cable Delivery Reel Standard',
      isOpen: !!config.cuttingLength,
      isDone: !!config.drumType,
    },
    {
      index: 44,
      key: 'drumCapacity',
      name: 'Drum Capacity',
      category: 'Logistics & Packaging',
      type: 'calculated',
      value: calculatedPhysics.drumCapacity ? `${calculatedPhysics.drumCapacity} kg Gross` : '4,500 kg Gross Max',
      standardRef: 'Maximum Safe Drum Gross Weight & Winding Volume',
      isOpen: true,
      isDone: true,
      badgeText: 'Drum Optimizer',
    },
    {
      index: 45,
      key: 'specialCustomerRequirements',
      name: 'Special Customer Requirements',
      category: 'Logistics & Packaging',
      type: 'input-text',
      value: config.specialCustomerRequirements || '',
      standardRef: 'Custom Drum Stenciling / PO Ref / Sequential Meter Marking',
      isOpen: !!config.cuttingLength,
      isDone: !!config.specialCustomerRequirements,
    },
  ];

  // Filtering by search term and category
  const filteredParams = parameterList.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(p.index).includes(searchTerm) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.standardRef && p.standardRef.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCat = filterCategory === 'ALL' || p.category === filterCategory;
    return matchesSearch && matchesCat;
  });

  const categories = [
    'ALL',
    'Standards & Commercial',
    'Conductor Core',
    'Core & Insulation',
    'Screening System',
    'Bedding & Armour',
    'Outer Sheath & CPR',
    'Physical & Electrical Specs',
    'Logistics & Packaging',
  ];

  return (
    <div className="space-y-4" id="all-45-parameter-table-container">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search parameter by name, number (#1 - #45), or engineering standard..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-[11px] font-bold text-slate-500 shrink-0">Filter Category:</span>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-xs font-semibold rounded-xl p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'ALL' ? 'All 45 Parameters' : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Complete 45-Parameter Master Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-900">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-extrabold uppercase text-[10px] tracking-wider">
              <th className="py-3 px-3 w-12 text-center">#</th>
              <th className="py-3 px-4 min-w-[200px]">Parameter Name</th>
              <th className="py-3 px-4 min-w-[140px]">Category</th>
              <th className="py-3 px-4 min-w-[220px]">Current Value / Selection</th>
              <th className="py-3 px-3 text-center min-w-[100px]">Status</th>
              <th className="py-3 px-4 min-w-[240px]">IEC / Technical Standard Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
            {filteredParams.map((param) => {
              const isSelected = !!param.value && param.value !== 'None' && param.value !== '—';

              return (
                <tr
                  key={param.index}
                  className={`transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-950/20 ${
                    param.index % 2 === 0 ? 'bg-slate-50/40 dark:bg-slate-800/20' : 'bg-white dark:bg-slate-900'
                  }`}
                >
                  {/* # Index */}
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500 dark:text-slate-400">
                    #{param.index}
                  </td>

                  {/* Parameter Name */}
                  <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{param.name}</span>
                    {param.unit && (
                      <span className="text-[10px] font-mono text-slate-400">({param.unit})</span>
                    )}
                  </td>

                  {/* Category */}
                  <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-300">
                      {param.category}
                    </span>
                  </td>

                  {/* Current Value / Inline Selector */}
                  <td className="py-2 px-4">
                    {param.type === 'select' && param.options ? (
                      <select
                        value={String(param.value || '')}
                        disabled={!param.isOpen}
                        onChange={(e) => onUpdateParam(param.key as keyof CableConfiguration, e.target.value)}
                        className={`w-full rounded-xl py-1.5 px-2.5 text-xs font-semibold outline-none transition-all ${
                          param.isOpen
                            ? 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <option value="">
                          {!param.isOpen
                            ? '-- Dimmed (Select Upstream First) --'
                            : `-- Select ${param.name} --`}
                        </option>
                        {param.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : param.type === 'input-number' ? (
                      <input
                        type="number"
                        min={50}
                        max={10000}
                        step={50}
                        disabled={!param.isOpen}
                        value={Number(param.value) || 500}
                        onChange={(e) =>
                          onUpdateParam(param.key as keyof CableConfiguration, Number(e.target.value))
                        }
                        className="w-full rounded-xl py-1.5 px-2.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                      />
                    ) : param.type === 'input-text' ? (
                      <input
                        type="text"
                        placeholder="e.g. PO-8891 / PROJECT CODE"
                        disabled={!param.isOpen}
                        value={String(param.value || '')}
                        onChange={(e) =>
                          onUpdateParam(param.key as keyof CableConfiguration, e.target.value)
                        }
                        className="w-full rounded-xl py-1.5 px-2.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                      />
                    ) : (
                      <div className="py-1 px-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-900/60 font-mono font-bold text-teal-900 dark:text-teal-200 text-xs">
                        {String(param.value)}
                      </div>
                    )}
                  </td>

                  {/* Status Badge */}
                  <td className="py-2.5 px-3 text-center">
                    {param.badgeText ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800">
                        {param.badgeText}
                      </span>
                    ) : param.isDone && isSelected ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <CheckCircle className="h-3 w-3" /> Done
                      </span>
                    ) : param.isOpen ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                        <Sparkles className="h-3 w-3" /> Open
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                        <Lock className="h-3 w-3" /> Dimmed
                      </span>
                    )}
                  </td>

                  {/* Standard Ref */}
                  <td className="py-2.5 px-4 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {param.standardRef || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
