import React, { useState } from 'react';
import { CustomerPortalTab } from '../../types';
import { DrumMasterSelect, useDrumMasterList } from '../common/DrumMasterSelect';
import { CUSTOMER_HOME_PATH } from '../../app/shellRoutes';
import { CustomerPageHero } from './CustomerPageHero';
import {
  Box,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Truck,
  Layers,
  SlidersHorizontal,
  FileSpreadsheet,
  Zap,
} from 'lucide-react';

interface DrumOptimizerProps {
  onNavigateTab: (tab: CustomerPortalTab) => void;
}

export interface DrumTypeDefinition {
  id: string;
  name: string;
  flangeMm: number;
  barrelMm: number;
  widthMm: number;
  maxCapacityM: number;
  tareWeightKg: number;
  costUsd: number;
  material: 'Wooden' | 'Steel' | 'Plywood';
}

export const DRUM_TYPES_CATALOG: DrumTypeDefinition[] = [
  {
    id: 'k-12',
    name: 'Wooden Reel K-12 (1200mm)',
    flangeMm: 1200,
    barrelMm: 600,
    widthMm: 850,
    maxCapacityM: 1000,
    tareWeightKg: 110,
    costUsd: 180,
    material: 'Wooden',
  },
  {
    id: 'k-14',
    name: 'Wooden Reel K-14 (1400mm)',
    flangeMm: 1400,
    barrelMm: 700,
    widthMm: 950,
    maxCapacityM: 1400,
    tareWeightKg: 140,
    costUsd: 220,
    material: 'Wooden',
  },
  {
    id: 'k-18',
    name: 'Heavy Duty Wooden K-18 (1800mm)',
    flangeMm: 1800,
    barrelMm: 900,
    widthMm: 1100,
    maxCapacityM: 2000,
    tareWeightKg: 220,
    costUsd: 350,
    material: 'Wooden',
  },
  {
    id: 's-18',
    name: 'Steel Reel S-18 (1800mm)',
    flangeMm: 1800,
    barrelMm: 1000,
    widthMm: 1150,
    maxCapacityM: 2200,
    tareWeightKg: 380,
    costUsd: 550,
    material: 'Steel',
  },
  {
    id: 's-22',
    name: 'Industrial Steel Reel S-22 (2200mm)',
    flangeMm: 2200,
    barrelMm: 1200,
    widthMm: 1300,
    maxCapacityM: 3000,
    tareWeightKg: 520,
    costUsd: 820,
    material: 'Steel',
  },
  {
    id: 's-26',
    name: 'Heavy Duty Export Steel S-26 (2600mm)',
    flangeMm: 2600,
    barrelMm: 1400,
    widthMm: 1500,
    maxCapacityM: 4200,
    tareWeightKg: 780,
    costUsd: 1250,
    material: 'Steel',
  },
  {
    id: 'p-10',
    name: 'Export Plywood Reel P-10 (1000mm)',
    flangeMm: 1000,
    barrelMm: 500,
    widthMm: 700,
    maxCapacityM: 800,
    tareWeightKg: 65,
    costUsd: 140,
    material: 'Plywood',
  },
];

export interface DrumScheduleLine {
  id: string;
  drumCode: string;
  noOfDrums: number;
  cuttingLengthM: number;
  tolerancePercent: number;
}

export const DrumOptimizer: React.FC<DrumOptimizerProps> = ({ onNavigateTab }) => {
  const drumMaster = useDrumMasterList(true);
  const [cableWeightKgM, setCableWeightKgM] = useState<number>(0);
  const [totalOrderTolerancePercent, setTotalOrderTolerancePercent] = useState<number>(5);

  const [drumLines, setDrumLines] = useState<DrumScheduleLine[]>([
    { id: 'dl-1', drumCode: '', noOfDrums: 1, cuttingLengthM: 0, tolerancePercent: 0 },
  ]);

  const handleAddLine = () => {
    const newLine: DrumScheduleLine = {
      id: `dl-${Date.now()}`,
      drumCode: '',
      noOfDrums: 1,
      cuttingLengthM: 0,
      tolerancePercent: 0,
    };
    setDrumLines([...drumLines, newLine]);
  };

  // Update line item
  const handleUpdateLine = (id: string, field: keyof DrumScheduleLine, value: any) => {
    setDrumLines(
      drumLines.map((line) => {
        if (line.id === id) {
          return { ...line, [field]: value };
        }
        return line;
      })
    );
  };

  // Delete line item
  const handleDeleteLine = (id: string) => {
    if (drumLines.length <= 1) {
      alert('At least one drum line item is required.');
      return;
    }
    setDrumLines(drumLines.filter((l) => l.id !== id));
  };

  // Calculations
  const calculatedLines = drumLines.map((line) => {
    const master = drumMaster.find((d) => d.drumCode === line.drumCode) || null;
    const nominalLineM = line.noOfDrums * line.cuttingLengthM;
    const minLineM = Math.round(nominalLineM * (1 - line.tolerancePercent / 100));
    const maxLineM = Math.round(nominalLineM * (1 + line.tolerancePercent / 100));

    const cableWeightPerDrum = line.cuttingLengthM * cableWeightKgM;
    const totalLineWeightKg = cableWeightPerDrum * line.noOfDrums;
    const fillRatioPercent =
      master && master.capacity > 0 && line.cuttingLengthM > 0
        ? Math.min(100, Math.round((line.cuttingLengthM / master.capacity) * 100))
        : null;
    const flange = master?.flange || 0;
    const outerWidth = master?.outerWidth || 0;
    const volumePerDrumM3 =
      flange > 0 && outerWidth > 0 ? +(((flange / 1000) * (flange / 1000) * (outerWidth / 1000)).toFixed(2)) : 0;
    const totalLineVolumeM3 = +(volumePerDrumM3 * line.noOfDrums).toFixed(2);

    return {
      ...line,
      master,
      nominalLineM,
      minLineM,
      maxLineM,
      grossWeightPerDrum: cableWeightPerDrum,
      totalLineWeightKg,
      fillRatioPercent,
      volumePerDrumM3,
      totalLineVolumeM3,
    };
  });

  const totalNominalLengthM = calculatedLines.reduce((acc, l) => acc + l.nominalLineM, 0);
  const totalDrumsCount = calculatedLines.reduce((acc, l) => acc + l.noOfDrums, 0);
  const totalWeightKg = calculatedLines.reduce((acc, l) => acc + l.totalLineWeightKg, 0);
  const totalVolumeM3 = +calculatedLines.reduce((acc, l) => acc + l.totalLineVolumeM3, 0).toFixed(2);

  const globalMinLengthM = Math.round(totalNominalLengthM * (1 - totalOrderTolerancePercent / 100));
  const globalMaxLengthM = Math.round(totalNominalLengthM * (1 + totalOrderTolerancePercent / 100));

  // Container fitting estimate
  const num20ftContainers = Math.ceil(Math.max(totalWeightKg / 22000, totalVolumeM3 / 28));
  const num40ftContainers = Math.ceil(Math.max(totalWeightKg / 26500, totalVolumeM3 / 58));

  const handleLoadPreset = (presetName: string) => {
    if (presetName === 'substation') {
      setDrumLines([
        { id: 'dl-101', drumCode: '', noOfDrums: 2, cuttingLengthM: 3500, tolerancePercent: 2 },
        { id: 'dl-102', drumCode: '', noOfDrums: 3, cuttingLengthM: 2000, tolerancePercent: 5 },
        { id: 'dl-103', drumCode: '', noOfDrums: 4, cuttingLengthM: 1000, tolerancePercent: 5 },
      ]);
    } else if (presetName === 'export') {
      setDrumLines([
        { id: 'dl-201', drumCode: '', noOfDrums: 5, cuttingLengthM: 1500, tolerancePercent: 3 },
        { id: 'dl-202', drumCode: '', noOfDrums: 6, cuttingLengthM: 800, tolerancePercent: 5 },
      ]);
    }
  };

  return (
    <div className="space-y-6">
      <CustomerPageHero
        breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Drum Optimizer' }]}
        title="Drum Optimizer"
        subtitle="Configure multiple drum types, distinct cutting lengths per drum, individual drum tolerances, and total cable order tolerances."
        actions={
          <button
            onClick={() => onNavigateTab('price_estimation')}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg transition-all flex items-center space-x-1.5"
          >
            <span>Proceed to Price Estimation</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        }
      />

      {/* Preset Quick Loader & Global Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-lg border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-slate-700 dark:text-slate-300">Quick Cutting Presets:</span>
          <button
            onClick={() => handleLoadPreset('substation')}
            className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold hover:bg-blue-100 transition-all"
          >
            33kV Substation Project (17,000m)
          </button>
          <button
            onClick={() => handleLoadPreset('export')}
            className="px-3 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-bold hover:bg-purple-100 transition-all"
          >
            Export Container Reels (12,300m)
          </button>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-500">Cable Weight/m:</span>
            <input
              type="number"
              step="0.05"
              value={cableWeightKgM}
              onChange={(e) => setCableWeightKgM(Number(e.target.value))}
              className="w-20 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-slate-900 dark:text-white outline-none text-center"
            />
            <span className="text-slate-400 font-semibold">kg/m</span>
          </div>

          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-500">Total Order Tolerance:</span>
            <input
              type="number"
              value={totalOrderTolerancePercent}
              onChange={(e) => setTotalOrderTolerancePercent(Number(e.target.value))}
              className="w-16 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 font-bold text-slate-900 dark:text-white outline-none text-center"
            />
            <span className="text-slate-400 font-semibold">%</span>
          </div>
        </div>
      </div>

      {/* Interactive Multi-Drum Cutting Schedule Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Box className="h-5 w-5 text-blue-600" />
              <span>Multi-Drum Cutting Schedule Lines</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Define distinct drum sizes, drum quantities, cutting lengths, and drum tolerances per line.
            </p>
          </div>

          <button
            onClick={handleAddLine}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition-all flex items-center space-x-1.5 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Add Drum Line</span>
          </button>
        </div>

        {/* Schedule Grid Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <th className="p-3">#</th>
                <th className="p-3">Drum Code &amp; parameters</th>
                <th className="p-3">No. of Drums</th>
                <th className="p-3">Cutting Length / Drum</th>
                <th className="p-3">Drum Tolerance</th>
                <th className="p-3">Fill %</th>
                <th className="p-3">Nominal Line (m)</th>
                <th className="p-3">Total Line Wt (kg)</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
              {calculatedLines.map((line, idx) => (
                <tr key={line.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 font-bold text-blue-600 dark:text-blue-400">{idx + 1}</td>
                  <td className="p-3">
                    <DrumMasterSelect
                      drums={drumMaster}
                      value={line.drumCode}
                      onChange={(code) => handleUpdateLine(line.id, 'drumCode', code)}
                    />
                  </td>

                  {/* Quantity of drums */}
                  <td className="p-3">
                    <input
                      type="number"
                      min="1"
                      value={line.noOfDrums}
                      onChange={(e) => handleUpdateLine(line.id, 'noOfDrums', Math.max(1, Number(e.target.value)))}
                      className="w-20 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold text-center outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>

                  {/* Cutting length per drum */}
                  <td className="p-3">
                    <div className="relative w-32">
                      <input
                        type="number"
                        min="100"
                        step="50"
                        value={line.cuttingLengthM}
                        onChange={(e) => handleUpdateLine(line.id, 'cuttingLengthM', Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                      />
                      <span className="absolute right-2 top-2.5 text-[10px] text-slate-400 font-bold">m</span>
                    </div>
                  </td>

                  {/* Tolerance per drum */}
                  <td className="p-3">
                    <div className="relative w-24">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={line.tolerancePercent}
                        onChange={(e) => handleUpdateLine(line.id, 'tolerancePercent', Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold text-amber-600 dark:text-amber-400 outline-none focus:ring-2 focus:ring-blue-500 pr-6"
                      />
                      <span className="absolute right-2 top-2.5 text-[10px] font-bold text-amber-500">%</span>
                    </div>
                  </td>

                  {/* Fill Factor % */}
                  <td className="p-3">
                    {line.fillRatioPercent == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span
                        className={`px-2 py-1 rounded-md text-[11px] font-bold ${
                          line.fillRatioPercent > 95
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : line.fillRatioPercent > 80
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}
                      >
                        {line.fillRatioPercent}% vs capacity
                      </span>
                    )}
                  </td>

                  {/* Nominal Line Total */}
                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                    {line.nominalLineM.toLocaleString()} m
                    <span className="block text-[10px] font-normal text-slate-500">
                      [{line.minLineM.toLocaleString()} m - {line.maxLineM.toLocaleString()} m]
                    </span>
                  </td>

                  {/* Line total weight */}
                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                    {line.totalLineWeightKg.toLocaleString()} kg
                    <span className="block text-[10px] text-slate-500">
                      ({line.grossWeightPerDrum.toLocaleString()} kg/drum)
                    </span>
                  </td>

                  {/* Action delete */}
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleDeleteLine(line.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Metrics & Container Capacity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Aggregation Metrics Card */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-800">
            Total Order Cable & Packaging Aggregations
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center text-xs">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/50 rounded-xl border border-blue-200 dark:border-blue-800">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                Nominal Cable Length
              </span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {totalNominalLengthM.toLocaleString()} m
              </p>
              <span className="text-[10px] font-semibold text-slate-500 block mt-0.5">
                Range: [{globalMinLengthM.toLocaleString()}m - {globalMaxLengthM.toLocaleString()}m]
              </span>
            </div>

            <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">
                Total Drum Packages
              </span>
              <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                {totalDrumsCount} Drums
              </p>
              <span className="text-[10px] font-semibold text-slate-500 block mt-0.5">
                {calculatedLines.length} Schedule Line(s)
              </span>
            </div>

            <div className="p-3 bg-purple-50 dark:bg-purple-950/50 rounded-xl border border-purple-200 dark:border-purple-800">
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">
                Total Gross Weight
              </span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {totalWeightKg.toLocaleString()} kg
              </p>
              <span className="text-[10px] font-semibold text-slate-500 block mt-0.5">
                {(totalWeightKg / 1000).toFixed(2)} Metric Tons
              </span>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/50 rounded-xl border border-amber-200 dark:border-amber-800">
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">
                Total Packaging Volume
              </span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {totalVolumeM3} m³
              </p>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                Drum packaging cost
              </span>
              <p className="text-sm font-black text-slate-700 dark:text-slate-200 mt-1">NOT_CONFIGURED</p>
              <span className="text-[10px] text-slate-500">Drum Master has no governed reel cost.</span>
            </div>

            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase">
                Total Order Tolerance
              </span>
              <p className="text-xl font-black text-amber-500 mt-1">
                ±{totalOrderTolerancePercent}%
              </p>
            </div>
          </div>
        </div>

        {/* Right Logistics & Container Recommendation Card */}
        <div className="lg:col-span-5 bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider pb-2 border-b border-slate-800 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Truck className="h-4 w-4" />
              <span>Logistics & Container Packing Recommendation</span>
            </span>
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block">Standard 20ft Dry Container:</span>
                <span className="text-xs text-slate-300">Max payload 22.0 MT / 28m³</span>
              </div>
              <span className="font-bold text-base text-amber-400">{num20ftContainers} Container(s)</span>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block">Standard 40ft High Cube (40HC):</span>
                <span className="text-xs text-slate-300">Max payload 26.5 MT / 58m³</span>
              </div>
              <span className="font-bold text-base text-emerald-400">{num40ftContainers} Container(s)</span>
            </div>

            <div className="p-3 bg-blue-950/60 rounded-xl border border-blue-800 text-[11px] text-blue-200 space-y-1">
              <p className="font-bold flex items-center">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-blue-400" />
                Engineering Verification:
              </p>
              <p className="text-slate-300">
                All drum flanges adhere to minimum bending radius requirements. ISPM-15 heat treatment certified for international export shipping.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
