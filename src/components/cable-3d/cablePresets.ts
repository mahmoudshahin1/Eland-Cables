export interface Cable3DConfig {
  id: string;
  name: string;
  category: 'LV Power' | 'MV Power' | 'Control' | 'Solar PV' | 'Fire Resistant' | 'Instrumentation';
  materialNumber?: string;
  itemCode?: string;
  standard: string;
  voltageClass: 'LV' | 'MV' | 'HV' | 'Control';
  voltageRating: string;
  cores: number; // 1, 2, 3, 4, 5
  conductorMaterial: 'Copper' | 'Aluminium' | 'Tinned Copper';
  conductorStranding: 'Class 2 Stranded' | 'Class 1 Solid' | 'Flexible Class 5';
  crossSectionMm2: number; // 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630
  insulation: 'XLPE' | 'PVC' | 'EPR' | 'Crosslinked Polyolefin';
  screen: 'None' | 'Copper Tape (CTS)' | 'Copper Wire Screen (CWS)';
  bedding: 'Extruded PVC' | 'LSHF Bedding' | 'PE' | 'None';
  armour: 'Unarmoured' | 'SWA' | 'AWA' | 'STA';
  outerSheath: 'LSHF' | 'PVC' | 'MDPE' | 'HDPE';
  sheathColor: 'Black' | 'Red' | 'Orange' | 'Blue' | 'Grey';
  description: string;
  applications: string;
}

export const CABLE_PRESETS: Cable3DConfig[] = [
  {
    id: 'lv-power-swa-4x16',
    name: 'LV Mains Power 4x16 mm² SWA',
    category: 'LV Power',
    materialNumber: '10009487',
    itemCode: 'ICO117X101C0002',
    standard: 'IEC 60502-1 / BS 5467',
    voltageClass: 'LV',
    voltageRating: '0.6/1 (1.2) kV',
    cores: 4,
    conductorMaterial: 'Copper',
    conductorStranding: 'Class 2 Stranded',
    crossSectionMm2: 16,
    insulation: 'XLPE',
    screen: 'None',
    bedding: 'LSHF Bedding',
    armour: 'SWA',
    outerSheath: 'LSHF',
    sheathColor: 'Black',
    description: 'Cu / XLPE / SWA / LSHF 0.6/1 kV 4X16 mm² RMC IEC 60502-1',
    applications: 'Direct burial, building risers, industrial mains power distribution with heavy mechanical protection.',
  },
  {
    id: 'lv-power-swa-4x50',
    name: 'LV Industrial Feeder 4x50 mm² SWA',
    category: 'LV Power',
    materialNumber: '10009512',
    itemCode: 'ICO117X101C0005',
    standard: 'IEC 60502-1 / BS 5467',
    voltageClass: 'LV',
    voltageRating: '0.6/1 (1.2) kV',
    cores: 4,
    conductorMaterial: 'Copper',
    conductorStranding: 'Class 2 Stranded',
    crossSectionMm2: 50,
    insulation: 'XLPE',
    screen: 'None',
    bedding: 'Extruded PVC',
    armour: 'SWA',
    outerSheath: 'PVC',
    sheathColor: 'Black',
    description: 'Cu / XLPE / PVC / SWA / PVC 0.6/1 kV 4X50 mm² IEC 60502-1',
    applications: 'Heavy factory sub-distribution, utility underground networks, switchgear interconnects.',
  },
  {
    id: 'mv-power-single-240',
    name: 'MV Single Core 1x240 mm² 11/33 kV',
    category: 'MV Power',
    materialNumber: '10008821',
    itemCode: 'IMV330X101C0012',
    standard: 'IEC 60502-2 / BS 6622',
    voltageClass: 'MV',
    voltageRating: '18/30 (36) kV',
    cores: 1,
    conductorMaterial: 'Copper',
    conductorStranding: 'Class 2 Stranded',
    crossSectionMm2: 240,
    insulation: 'XLPE',
    screen: 'Copper Tape (CTS)',
    bedding: 'LSHF Bedding',
    armour: 'AWA',
    outerSheath: 'LSHF',
    sheathColor: 'Red',
    description: 'Cu / Semi-con / XLPE / CTS / AWA / LSHF 18/30 kV 1X240 mm² IEC 60502-2',
    applications: 'Power generation plants, primary substations, renewable wind & solar substation feeders.',
  },
  {
    id: 'control-multi-core-12x2.5',
    name: 'Industrial Control Cable 12x2.5 mm²',
    category: 'Control',
    materialNumber: '10007204',
    itemCode: 'ICT100X112C0001',
    standard: 'IEC 60502-1 / BS 5467',
    voltageClass: 'Control',
    voltageRating: '600/1000 V',
    cores: 5, // multi-core demonstration
    conductorMaterial: 'Copper',
    conductorStranding: 'Class 2 Stranded',
    crossSectionMm2: 2.5,
    insulation: 'PVC',
    screen: 'None',
    bedding: 'Extruded PVC',
    armour: 'SWA',
    outerSheath: 'PVC',
    sheathColor: 'Grey',
    description: 'Cu / PVC / SWA / PVC 600/1000V 12X2.5 mm² IEC 60502-1',
    applications: 'Industrial automation, switchboards, PLC connections, substation monitoring & telemetry.',
  },
  {
    id: 'solar-pv-h1z2z2-6',
    name: 'Solar PV H1Z2Z2-K 1x6 mm² DC',
    category: 'Solar PV',
    materialNumber: '10004108',
    itemCode: 'IPV150X101C0001',
    standard: 'EN 50618 / IEC 62930',
    voltageClass: 'LV',
    voltageRating: '1.5 kV DC (1.8 kV max)',
    cores: 1,
    conductorMaterial: 'Tinned Copper',
    conductorStranding: 'Flexible Class 5',
    crossSectionMm2: 6,
    insulation: 'Crosslinked Polyolefin',
    screen: 'None',
    bedding: 'None',
    armour: 'Unarmoured',
    outerSheath: 'LSHF',
    sheathColor: 'Red',
    description: 'Tinned Cu / XL-PO / XL-PO 1.5 kV DC 1X6 mm² EN 50618 H1Z2Z2-K',
    applications: 'Solar array string interconnections, inverter DC inputs, rooftop & utility solar installations.',
  },
  {
    id: 'fire-resistant-4x25',
    name: 'Fire Resistant (Mica+XLPE) 4x25 mm²',
    category: 'Fire Resistant',
    materialNumber: '10006733',
    itemCode: 'IFR117X101C0003',
    standard: 'BS 7846 / CWZ Cat 4',
    voltageClass: 'LV',
    voltageRating: '0.6/1 kV',
    cores: 4,
    conductorMaterial: 'Copper',
    conductorStranding: 'Class 2 Stranded',
    crossSectionMm2: 25,
    insulation: 'XLPE',
    screen: 'None',
    bedding: 'LSHF Bedding',
    armour: 'SWA',
    outerSheath: 'LSHF',
    sheathColor: 'Orange',
    description: 'Cu / Mica Glass / XLPE / SWA / LSHF 0.6/1 kV 4X25 mm² BS 7846 Cat 4',
    applications: 'Emergency life safety circuits, hospital emergency power, smoke extraction fans, fire alarms.',
  },
];

export const DEFAULT_CABLE_CONFIG: Cable3DConfig = CABLE_PRESETS[0];
