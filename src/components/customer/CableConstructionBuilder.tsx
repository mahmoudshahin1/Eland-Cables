import React, { useState } from 'react';
import {
  Layers,
  Cpu,
  Shield,
  ShieldAlert,
  Flame,
  Award,
  Zap,
  Activity,
  Maximize2,
  Sliders,
  CheckCircle2,
  CircleDot,
  RotateCw,
  Info,
} from 'lucide-react';
import { CableConfiguration } from '../../services/cableConstraintEngine';
import { DynamicFilterOptions } from '../../services/cableSelectionService';

interface CableConstructionBuilderProps {
  config: CableConfiguration;
  dynamicFilter: DynamicFilterOptions;
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

export const CableConstructionBuilder: React.FC<CableConstructionBuilderProps> = ({
  config,
  dynamicFilter,
  onUpdateParam,
  calculatedPhysics,
}) => {
  const [selectedLayer, setSelectedLayer] = useState<string>('conductor');

  // Core count parser
  const coreCountNum = (() => {
    if (!config.core) return 1;
    const coreText = String(config.core);
    if (coreText.includes('1')) return 1;
    if (coreText.includes('2')) return 2;
    if (coreText.includes('3.5')) return 4;
    if (coreText.includes('3')) return 3;
    if (coreText.includes('4')) return 4;
    if (coreText.includes('5')) return 5;
    return 1;
  })();

  const isArmoured = config.armour && config.armour !== 'No Armour' && config.armour !== 'None';
  const hasScreen = config.screen && config.screen !== 'No Screen' && config.screen !== 'None';
  const isHighVoltage = config.family === 'MV' || config.family === 'HV';

  // Layers mapping to the 45 parameters
  const layers = [
    {
      id: 'conductor',
      name: '1. Conductor Core',
      icon: Zap,
      color: config.conductor === 'Aluminum' ? 'bg-slate-300 border-slate-400 text-slate-800' : 'bg-accent-600 border-amber-700 text-white',
      accentColor: 'text-amber-500',
      params: [
        { num: 6, name: 'Conductor Material', val: config.conductor || 'Copper (Cu)' },
        { num: 7, name: 'Conductor Class', val: config.conductorClass || 'Class 2 Stranded' },
        { num: 8, name: 'Conductor Construction', val: config.conductorConstruction || 'Compacted Circular' },
        { num: 9, name: 'Conductor Cross Section', val: config.conductorSize ? `${config.conductorSize} mm²` : '—' },
        { num: 10, name: 'Water Tight Conductor', val: config.conductorWaterTight || 'None' },
      ],
      desc: 'High-conductivity annealed electrical conductor engineered per IEC 60228.',
    },
    {
      id: 'insulation',
      name: '2. Insulation System',
      icon: Layers,
      color: 'bg-emerald-600 border-emerald-700 text-white',
      accentColor: 'text-emerald-500',
      params: [
        { num: 11, name: 'Core Count', val: config.core || '1 Core' },
        { num: 12, name: 'Core Identification / Color', val: config.coreIdentification || 'HD 308 S2' },
        { num: 13, name: 'Core Construction', val: config.coreConstruction || 'Laid-up with Fillers' },
        { num: 14, name: 'Insulation Material', val: config.insulation || 'XLPE (90°C)' },
        { num: 15, name: 'Insulation Thickness', val: calculatedPhysics.insulationThicknessMm ? `${calculatedPhysics.insulationThicknessMm} mm` : 'Auto per IEC' },
      ],
      desc: 'Cross-linked Polyethylene (XLPE) dielectric insulation extruded under dry curing vulcanization.',
    },
    {
      id: 'screen',
      name: '3. Metallic Screening & Semi-Con',
      icon: Cpu,
      color: 'bg-indigo-600 border-indigo-700 text-white',
      accentColor: 'text-indigo-500',
      params: [
        { num: 16, name: 'Outer Semi-Conductor', val: config.outerSemiConductor || (isHighVoltage ? 'Extruded Semi-Con' : 'N/A (LV)') },
        { num: 17, name: 'Outer Semi-Conductor Type', val: config.outerSemiConductorType || (isHighVoltage ? 'Strippable' : 'N/A') },
        { num: 18, name: 'Screen Type', val: config.screen || 'Copper Wire Screen' },
        { num: 19, name: 'Screen Cross Section Area', val: config.screenCSA ? `${config.screenCSA} mm²` : '—' },
        { num: 20, name: 'Screen Water Tightness', val: config.screenWaterTight || 'Longitudinal Water-Blocking' },
        { num: 21, name: 'Screen Construction', val: config.screenConstruction || 'Copper Wire + Helical Tape' },
      ],
      desc: 'Electromagnetic screening layer carrying capacitive charging currents and fault earth return currents.',
    },
    {
      id: 'bedding_armour',
      name: '4. Bedding & Metallic Armour',
      icon: ShieldAlert,
      color: 'bg-sky-600 border-sky-700 text-white',
      accentColor: 'text-sky-500',
      params: [
        { num: 22, name: 'Filler / Binder', val: config.fillerBinder || (coreCountNum > 1 ? 'PP Fillers + Tape' : 'N/A (1C)') },
        { num: 23, name: 'Bedding', val: config.bedding || (isArmoured ? 'Extruded PVC/LSZH' : 'Unarmoured') },
        { num: 24, name: 'Armour Type', val: config.armour || 'SWA (Steel Wire Armour)' },
        { num: 25, name: 'Armour Material', val: config.armourMaterial || (isArmoured ? 'Galvanized Steel' : 'N/A') },
        { num: 26, name: 'Armour Cross Section', val: config.armourCSA || 'Standard Wire Diameter' },
        { num: 27, name: 'Armour Water Tightness', val: config.armourWaterTight || 'None' },
        { num: 28, name: 'Inner Sheath / Bedding Material', val: config.innerSheath || (isArmoured ? 'PVC ST2' : 'N/A') },
      ],
      desc: 'Heavy mechanical protection against impact, external puncture, direct burial soil stress, and tensile pulling forces.',
    },
    {
      id: 'sheath',
      name: '5. Outer Sheathing & Protective Jacket',
      icon: Shield,
      color: 'bg-purple-600 border-purple-700 text-white',
      accentColor: 'text-purple-500',
      params: [
        { num: 29, name: 'Outer Sheathing Material', val: config.sheathing || 'PVC ST2 / LSZH ST8' },
        { num: 30, name: 'Sheathing Color', val: config.sheathingColor || 'Black (UV Resistant)' },
        { num: 31, name: 'Special Additives', val: config.specialAdditives || 'Anti-Termite + Anti-Rodent' },
        { num: 32, name: 'Semi-Conductive Sheath', val: config.semiConductiveSheath || 'None' },
        { num: 33, name: 'Graphite Coating', val: config.graphiteCoating || 'None' },
        { num: 34, name: 'CPR Classification', val: config.cpr || 'Cca-s1b,d2,a1' },
        { num: 35, name: 'EDR', val: config.edr || 'EDR-STD-2026' },
      ],
      desc: 'Rugged outer protective barrier engineered for environmental sealing, UV resistance, moisture barrier, and CPR fire safety.',
    },
    {
      id: 'performance',
      name: '6. Ratings & Physical Specifications',
      icon: Activity,
      color: 'bg-teal-600 border-teal-700 text-white',
      accentColor: 'text-teal-500',
      params: [
        { num: 36, name: 'Cable Overall Diameter', val: calculatedPhysics.outerDiameterMm ? `Ø ${calculatedPhysics.outerDiameterMm} mm` : 'Auto Calculated' },
        { num: 37, name: 'Cable Weight', val: calculatedPhysics.approxWeightKgKm ? `${calculatedPhysics.approxWeightKgKm} kg/km` : 'Auto Calculated' },
        { num: 38, name: 'Minimum Bending Radius', val: calculatedPhysics.minBendingRadiusMm ? `${calculatedPhysics.minBendingRadiusMm} mm` : 'Auto Calculated' },
        { num: 39, name: 'Operating Temperature', val: calculatedPhysics.operatingTempC || '90°C Normal / 250°C Short-Circuit' },
        { num: 40, name: 'Short Circuit Rating', val: calculatedPhysics.shortCircuitRatingKa || 'Auto Calculated (kA / 1s)' },
      ],
      desc: 'Electrical current carrying ampacity, thermal dissipation limits, and physical mechanical tolerances.',
    },
    {
      id: 'logistics',
      name: '7. Logistics & Delivery Packaging',
      icon: Award,
      color: 'bg-accent-600 border-accent-700 text-white',
      accentColor: 'text-accent-500',
      params: [
        { num: 41, name: 'Cutting Length', val: `${config.cuttingLength || 500} meters` },
        { num: 42, name: 'Length Tolerance', val: config.lengthTolerance || '±0%' },
        { num: 43, name: 'Drum Type', val: config.drumType || 'Lagged Wooden Non-Returnable' },
        { num: 44, name: 'Drum Capacity', val: calculatedPhysics.drumCapacity ? `${calculatedPhysics.drumCapacity} kg` : '4,500 kg Gross' },
        { num: 45, name: 'Special Customer Requirements', val: config.specialCustomerRequirements || 'Standard Production Stenciling' },
      ],
      desc: 'Drum packaging optimization, shipment logistics, cutting length allocation, and customer identification markings.',
    },
  ];

  const activeLayerData = layers.find((l) => l.id === selectedLayer) || layers[0];

  return (
    <div className="space-y-6" id="construction-builder-view">
      {/* Header Info */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-md border border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
              Interactive Construction Builder
            </span>
            <h3 className="text-lg font-black tracking-tight mt-1 flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-400" />
              <span>Full Cross-Section & 45-Parameter Layer Matrix</span>
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Inspect how all 45 engineering parameters map directly into the concentric physical cable stack from the central conductors to the outer jacket and logistics reels.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3 self-start md:self-auto bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-bold uppercase">Finished OD</span>
              <span className="text-sm font-mono font-black text-amber-400">
                {calculatedPhysics.outerDiameterMm ? `Ø ${calculatedPhysics.outerDiameterMm} mm` : 'Auto'}
              </span>
            </div>
            <div className="w-px h-8 bg-slate-700" />
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block font-bold uppercase">Weight</span>
              <span className="text-sm font-mono font-black text-emerald-400">
                {calculatedPhysics.approxWeightKgKm ? `${calculatedPhysics.approxWeightKgKm} kg/km` : 'Auto'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Builder Grid: Visual Cross-Section (Left) + Layer Parameter Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visual Cable Cross Section Representation */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center min-h-[380px] relative overflow-hidden">
            <div className="absolute top-3 left-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <CircleDot className="h-3.5 w-3.5 text-blue-500" />
              <span>Interactive Concentric Cross-Section</span>
            </div>

            {/* SVG Visual Cross-Section Diagram */}
            <div className="relative w-64 h-64 my-6 flex items-center justify-center">
              <svg viewBox="0 0 300 300" className="w-full h-full drop-shadow-md">
                {/* Outer Sheath (Outer Ring) */}
                <circle
                  cx="150"
                  cy="150"
                  r="140"
                  fill="#1e293b"
                  stroke={config.sheathingColor === 'Red' ? '#dc2626' : config.sheathingColor === 'Blue' ? '#2563eb' : '#0f172a'}
                  strokeWidth="8"
                  className={`cursor-pointer transition-all hover:opacity-90 ${
                    selectedLayer === 'sheath' ? 'stroke-purple-500 stroke-[10]' : ''
                  }`}
                  onClick={() => setSelectedLayer('sheath')}
                />

                {/* Metallic Armour (Wire / Tape Ring) */}
                {isArmoured ? (
                  <circle
                    cx="150"
                    cy="150"
                    r="125"
                    fill="#475569"
                    stroke="#94a3b8"
                    strokeWidth="6"
                    strokeDasharray="4 2"
                    className={`cursor-pointer transition-all ${
                      selectedLayer === 'bedding_armour' ? 'stroke-sky-400 stroke-[8]' : ''
                    }`}
                    onClick={() => setSelectedLayer('bedding_armour')}
                  />
                ) : null}

                {/* Bedding / Inner Covering */}
                <circle
                  cx="150"
                  cy="150"
                  r={isArmoured ? 112 : 128}
                  fill="#334155"
                  stroke="#64748b"
                  strokeWidth="3"
                  className={`cursor-pointer transition-all ${
                    selectedLayer === 'bedding_armour' ? 'stroke-sky-400 stroke-[5]' : ''
                  }`}
                  onClick={() => setSelectedLayer('bedding_armour')}
                />

                {/* Metallic Screen Layer */}
                {hasScreen ? (
                  <circle
                    cx="150"
                    cy="150"
                    r={isArmoured ? 98 : 112}
                    fill="#1e1b4b"
                    stroke="#818cf8"
                    strokeWidth="4"
                    strokeDasharray="6 3"
                    className={`cursor-pointer transition-all ${
                      selectedLayer === 'screen' ? 'stroke-indigo-400 stroke-[7]' : ''
                    }`}
                    onClick={() => setSelectedLayer('screen')}
                  />
                ) : null}

                {/* Core Cross-Section Geometry based on Core Count */}
                {coreCountNum === 1 && (
                  <>
                    {/* Single Core Insulation */}
                    <circle
                      cx="150"
                      cy="150"
                      r="80"
                      fill="#065f46"
                      stroke="#10b981"
                      strokeWidth="5"
                      className={`cursor-pointer transition-all ${
                        selectedLayer === 'insulation' ? 'stroke-emerald-300 stroke-[7]' : ''
                      }`}
                      onClick={() => setSelectedLayer('insulation')}
                    />
                    {/* Single Core Conductor */}
                    <circle
                      cx="150"
                      cy="150"
                      r="50"
                      fill={config.conductor === 'Aluminum' ? '#cbd5e1' : '#d97706'}
                      stroke={config.conductor === 'Aluminum' ? '#94a3b8' : '#b45309'}
                      strokeWidth="3"
                      className={`cursor-pointer transition-all ${
                        selectedLayer === 'conductor' ? 'stroke-amber-300 stroke-[6]' : ''
                      }`}
                      onClick={() => setSelectedLayer('conductor')}
                    />
                    <text
                      x="150"
                      y="155"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="12"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {config.conductorSize || '150'} mm²
                    </text>
                  </>
                )}

                {coreCountNum === 3 && (
                  <>
                    {/* 3 Cores arranged in 120-degree triangle */}
                    {/* Core 1 (Top) */}
                    <g
                      className="cursor-pointer"
                      onClick={() => setSelectedLayer('conductor')}
                    >
                      <circle cx="150" cy="100" r="38" fill="#065f46" stroke="#10b981" strokeWidth="4" />
                      <circle cx="150" cy="100" r="22" fill={config.conductor === 'Aluminum' ? '#cbd5e1' : '#d97706'} />
                      <text x="150" y="104" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">L1</text>
                    </g>
                    {/* Core 2 (Bottom Right) */}
                    <g
                      className="cursor-pointer"
                      onClick={() => setSelectedLayer('conductor')}
                    >
                      <circle cx="190" cy="175" r="38" fill="#065f46" stroke="#10b981" strokeWidth="4" />
                      <circle cx="190" cy="175" r="22" fill={config.conductor === 'Aluminum' ? '#cbd5e1' : '#d97706'} />
                      <text x="190" y="179" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">L2</text>
                    </g>
                    {/* Core 3 (Bottom Left) */}
                    <g
                      className="cursor-pointer"
                      onClick={() => setSelectedLayer('conductor')}
                    >
                      <circle cx="110" cy="175" r="38" fill="#065f46" stroke="#10b981" strokeWidth="4" />
                      <circle cx="110" cy="175" r="22" fill={config.conductor === 'Aluminum' ? '#cbd5e1' : '#d97706'} />
                      <text x="110" y="179" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">L3</text>
                    </g>
                  </>
                )}

                {coreCountNum === 4 && (
                  <>
                    {/* 4 Cores in quad layout */}
                    <g className="cursor-pointer" onClick={() => setSelectedLayer('conductor')}>
                      <circle cx="115" cy="115" r="32" fill="#065f46" stroke="#10b981" strokeWidth="3" />
                      <circle cx="115" cy="115" r="18" fill={config.conductor === 'Aluminum' ? '#cbd5e1' : '#d97706'} />
                      <text x="115" y="118" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">L1</text>

                      <circle cx="185" cy="115" r="32" fill="#065f46" stroke="#10b981" strokeWidth="3" />
                      <circle cx="185" cy="115" r="18" fill={config.conductor === 'Aluminum' ? '#cbd5e1' : '#d97706'} />
                      <text x="185" y="118" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">L2</text>

                      <circle cx="185" cy="185" r="32" fill="#065f46" stroke="#10b981" strokeWidth="3" />
                      <circle cx="185" cy="185" r="18" fill={config.conductor === 'Aluminum' ? '#cbd5e1' : '#d97706'} />
                      <text x="185" y="188" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">L3</text>

                      <circle cx="115" cy="185" r="32" fill="#065f46" stroke="#10b981" strokeWidth="3" />
                      <circle cx="115" cy="185" r="18" fill={config.conductor === 'Aluminum' ? '#cbd5e1' : '#d97706'} />
                      <text x="115" y="188" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">N</text>
                    </g>
                  </>
                )}
              </svg>
            </div>

            {/* Quick Layer Switcher Buttons */}
            <div className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {layers.slice(0, 4).map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedLayer(l.id)}
                  className={`px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all text-left flex items-center gap-1.5 ${
                    selectedLayer === l.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <l.icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{l.name.split('.')[1]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Layer Parameter Matrix & Interactive Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          {/* Layer Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {layers.map((l) => {
              const isSel = selectedLayer === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setSelectedLayer(l.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap flex items-center gap-2 ${
                    isSel
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <l.icon className="h-3.5 w-3.5" />
                  <span>{l.name}</span>
                </button>
              );
            })}
          </div>

          {/* Active Layer Details Card */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${activeLayerData.color}`}>
                  <activeLayerData.icon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    {activeLayerData.name}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeLayerData.desc}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full text-slate-600 dark:text-slate-300">
                {activeLayerData.params.length} Parameters
              </span>
            </div>

            {/* List of 45 Parameters belonging to this layer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeLayerData.params.map((p) => (
                <div
                  key={p.num}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400">
                      #{p.num}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Configured
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {p.name}
                  </div>
                  <div className="text-xs font-mono font-semibold text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    {p.val}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
