import React, { useEffect, useState } from 'react';
import { ErpRequestItem } from '../../types';
import { DrumMasterSelect, useDrumMasterList } from './DrumMasterSelect';
import {
  cableWeightKgFromCuttingLength,
  drumCapacityFillPercent,
} from '../../services/drumMasterService';
import {
  Box,
  Truck,
  X,
  Check,
  Plus,
  Trash2,
  Layers,
  Info,
} from 'lucide-react';

interface ContainerAndDrumOptimizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items?: ErpRequestItem[];
  onApplyToInquiry?: (drumScheduleSummary: string) => void;
  onNavigateToFullOptimizer?: () => void;
}

export interface DrumAssignment {
  id: string;
  drumCode: string;
  noOfDrums: number;
  cuttingLengthM: number;
}

interface ScheduleLine {
  id: string;
  itemDescription: string;
  approxWeightKgKm: number;
  drums: DrumAssignment[];
}

function newDrumAssignment(): DrumAssignment {
  return {
    id: `drum-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    drumCode: '',
    noOfDrums: 1,
    cuttingLengthM: 0,
  };
}

function linesFromItems(items: ErpRequestItem[]): ScheduleLine[] {
  if (!items.length) {
    return [
      {
        id: `line-${Date.now()}`,
        itemDescription: '',
        approxWeightKgKm: 0,
        drums: [newDrumAssignment()],
      },
    ];
  }
  return items.map((it, idx) => {
    const wKgKm = it.bomDetails?.grossWeightKgKm || 0;
    const list = it.drumDetails?.drumsList;
    const drums: DrumAssignment[] =
      list && list.length > 0
        ? list.map((d, di) => ({
            id: `drum-${idx}-${di}-${Date.now()}`,
            drumCode: d.drumMasterCode || '',
            noOfDrums: 1,
            cuttingLengthM: d.lengthMeters || 0,
          }))
        : [
            {
              id: `drum-${idx}-0-${Date.now()}`,
              drumCode: '',
              noOfDrums: it.drumDetails?.noOfDrums || 1,
              cuttingLengthM: it.drumDetails?.cuttingLengthMeters || 0,
            },
          ];
    return {
      id: `line-${idx}-${Date.now()}`,
      itemDescription: it.itemCode ? `${it.itemCode} - ${it.cableCode || 'Cable'}` : `Item #${it.serial}`,
      approxWeightKgKm: wKgKm,
      drums,
    };
  });
}

export const ContainerAndDrumOptimizerModal: React.FC<ContainerAndDrumOptimizerModalProps> = ({
  isOpen,
  onClose,
  items = [],
  onApplyToInquiry,
  onNavigateToFullOptimizer,
}) => {
  const drumMaster = useDrumMasterList(isOpen);
  const [scheduleLines, setScheduleLines] = useState<ScheduleLine[]>(() => linesFromItems(items));

  useEffect(() => {
    if (isOpen) setScheduleLines(linesFromItems(items));
  }, [isOpen, items]);

  const handleUpdateLine = (id: string, field: 'itemDescription' | 'approxWeightKgKm', value: string | number) => {
    setScheduleLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const handleUpdateDrum = (
    lineId: string,
    drumId: string,
    field: keyof DrumAssignment,
    value: string | number
  ) => {
    setScheduleLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, drums: l.drums.map((d) => (d.id === drumId ? { ...d, [field]: value } : d)) }
          : l
      )
    );
  };

  const handleAddLine = () => {
    setScheduleLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        itemDescription: `Cable line ${prev.length + 1}`,
        approxWeightKgKm: 0,
        drums: [newDrumAssignment()],
      },
    ]);
  };

  const handleAddDrum = (lineId: string) => {
    setScheduleLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, drums: [...l.drums, newDrumAssignment()] } : l))
    );
  };

  const handleDeleteDrum = (lineId: string, drumId: string) => {
    setScheduleLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const next = l.drums.filter((d) => d.id !== drumId);
        return { ...l, drums: next.length ? next : [newDrumAssignment()] };
      })
    );
  };

  const handleDeleteLine = (id: string) => {
    if (scheduleLines.length <= 1) return;
    setScheduleLines((prev) => prev.filter((l) => l.id !== id));
  };

  const calculatedLines = scheduleLines.map((l) => {
    const drumRows = l.drums.map((assignment) => {
      const master = drumMaster.find((d) => d.drumCode === assignment.drumCode) || null;
      const totalMeters = assignment.noOfDrums * assignment.cuttingLengthM;
      const cableWeightKg = cableWeightKgFromCuttingLength(
        assignment.cuttingLengthM,
        l.approxWeightKgKm
      );
      const totalGrossKg =
        cableWeightKg > 0 && assignment.noOfDrums > 0 ? cableWeightKg * assignment.noOfDrums : 0;
      const fillRatioPercent =
        master && master.capacity > 0 ? drumCapacityFillPercent(cableWeightKg, master.capacity) : null;
      const flange = master?.flange || 0;
      const outerWidth = master?.outerWidth || 0;
      const volumePerDrumM3 =
        flange > 0 && outerWidth > 0 ? +(((flange / 1000) * (flange / 1000) * (outerWidth / 1000)).toFixed(2)) : 0;
      return {
        ...assignment,
        master,
        totalMeters,
        cableWeightKg,
        totalGrossKg,
        fillRatioPercent,
        volumePerDrumM3,
        totalVolumeM3: +(volumePerDrumM3 * assignment.noOfDrums).toFixed(2),
      };
    });
    return {
      ...l,
      drumRows,
      totalLineMeters: drumRows.reduce((acc, r) => acc + r.totalMeters, 0),
      totalLineGrossWeightKg: drumRows.reduce((acc, r) => acc + r.totalGrossKg, 0),
      totalLineVolumeM3: +drumRows.reduce((acc, r) => acc + r.totalVolumeM3, 0).toFixed(2),
      totalLineDrums: drumRows.reduce((acc, r) => acc + r.noOfDrums, 0),
    };
  });

  const totalMeters = calculatedLines.reduce((acc, l) => acc + l.totalLineMeters, 0);
  const totalDrums = calculatedLines.reduce((acc, l) => acc + l.totalLineDrums, 0);
  const totalGrossWeightKg = calculatedLines.reduce((acc, l) => acc + l.totalLineGrossWeightKg, 0);
  const totalVolumeM3 = +calculatedLines.reduce((acc, l) => acc + l.totalLineVolumeM3, 0).toFixed(2);

  // Container Packing Calculations
  // 20ft Container: Max Payload 22,000 kg | Vol 28 m³
  const num20ftByWeight = Math.ceil(totalGrossWeightKg / 22000);
  const num20ftByVol = Math.ceil(totalVolumeM3 / 28);
  const num20ftContainers = Math.max(1, Math.max(num20ftByWeight, num20ftByVol));

  // 40ft High Cube Container: Max Payload 26,500 kg | Vol 58 m³
  const num40ftByWeight = Math.ceil(totalGrossWeightKg / 26500);
  const num40ftByVol = Math.ceil(totalVolumeM3 / 58);
  const num40ftContainers = Math.max(1, Math.max(num40ftByWeight, num40ftByVol));

  // Weight utilization
  const weight20ftUtilPercent = Math.min(100, Math.round((totalGrossWeightKg / (num20ftContainers * 22000)) * 100));
  const weight40ftUtilPercent = Math.min(100, Math.round((totalGrossWeightKg / (num40ftContainers * 26500)) * 100));

  const handleApply = () => {
    const summaryStr = `Container Packing Recommendation: ${num20ftContainers}x 20ft Container(s) OR ${num40ftContainers}x 40ft Container(s) | Total ${totalDrums} Drums, ${totalMeters.toLocaleString()}m, ${(totalGrossWeightKg / 1000).toFixed(2)} Metric Tons (${totalVolumeM3} m³ volume).`;
    if (onApplyToInquiry) {
      onApplyToInquiry(summaryStr);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-brand-600 text-white p-4 flex items-center justify-between border-b border-brand-700 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900/40 border border-amber-300/30 flex items-center justify-center text-amber-200">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight flex items-center space-x-2">
                <span>Container Calculation & Drum Packing Optimizer</span>
                <span className="bg-accent-500/30 border border-amber-300/40 text-amber-200 text-[10px] uppercase font-mono px-2 py-0.5 rounded">
                  Logistics Engine
                </span>
              </h3>
              <p className="text-xs text-amber-100 font-medium">
                Calculate container loads (20ft / 40ft HC), drum reel sizes, cutting lengths & gross weights
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-amber-800 text-amber-200 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs flex-1">
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-[11px] text-amber-950 dark:text-amber-100">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Select Drum Master codes per cable line. Multiple drum sizes can be added on the same line. Automatic EWD
              winding/auto-pick remains <span className="font-mono font-bold">CONFIGURATION_REQUIRED</span>. Capacity
              unit is not in Drum List.xlsx — fill % is versus the source capacity number only.
            </p>
          </div>
          {/* Top Logistics & Container Recommendation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 20ft Dry Container Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4 rounded-2xl border border-slate-700 space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                <div className="flex items-center space-x-2">
                  <Box className="h-4 w-4 text-amber-400" />
                  <span className="font-extrabold text-xs">20ft Standard Dry Container</span>
                </div>
                <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-amber-300">
                  Payload 22,000 kg | Vol 28 m³
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Required Containers</span>
                  <p className="font-mono font-extrabold text-2xl text-amber-400 mt-0.5">
                    {num20ftContainers} <span className="text-xs font-semibold text-slate-300">Container(s)</span>
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Payload Weight Utilization</span>
                  <p className="font-mono font-bold text-sm text-emerald-400 mt-0.5">
                    {weight20ftUtilPercent}% <span className="text-[10px] text-slate-400">({(totalGrossWeightKg / 1000).toFixed(1)}t total)</span>
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-accent-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, weight20ftUtilPercent)}%` }}
                />
              </div>
            </div>

            {/* 40ft High Cube Container Card */}
            <div className="bg-gradient-to-br from-blue-950 via-slate-900 to-indigo-950 text-white p-4 rounded-2xl border border-blue-800/60 space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-blue-800/60 pb-2">
                <div className="flex items-center space-x-2">
                  <Truck className="h-4 w-4 text-blue-400" />
                  <span className="font-extrabold text-xs">40ft High Cube (HC) Container</span>
                </div>
                <span className="text-[10px] font-mono bg-blue-900/60 px-2 py-0.5 rounded text-blue-300">
                  Payload 26,500 kg | Vol 58 m³
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Required Containers</span>
                  <p className="font-mono font-extrabold text-2xl text-emerald-400 mt-0.5">
                    {num40ftContainers} <span className="text-xs font-semibold text-slate-300">Container(s)</span>
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Payload Weight Utilization</span>
                  <p className="font-mono font-bold text-sm text-blue-300 mt-0.5">
                    {weight40ftUtilPercent}% <span className="text-[10px] text-slate-400">({totalVolumeM3} m³ vol)</span>
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, weight40ftUtilPercent)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Quick Summary Metrics Banner */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Total Cable Meters</span>
              <span className="font-mono font-extrabold text-sm text-blue-600 dark:text-blue-400">
                {totalMeters.toLocaleString()} M
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Total Reel Count</span>
              <span className="font-mono font-extrabold text-sm text-amber-600 dark:text-amber-400">
                {totalDrums} Reel(s)
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Total Gross Weight</span>
              <span className="font-mono font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                {(totalGrossWeightKg / 1000).toFixed(2)} Metric Tons
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-extrabold text-slate-400 block">Total Volume</span>
              <span className="font-mono font-extrabold text-sm text-purple-600 dark:text-purple-400">
                {totalVolumeM3} m³
              </span>
            </div>
          </div>

          {/* Multi-Drum Size & Cutting Length Schedule Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5 text-xs">
                <Layers className="h-4 w-4 text-amber-500" />
                <span>Multi-Drum Size & Cutting Length Schedule Engine</span>
              </h4>
              <div className="flex items-center gap-2">
                {scheduleLines.length === 1 && (
                  <button
                    type="button"
                    onClick={() => handleAddDrum(scheduleLines[0].id)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center space-x-1"
                  >
                    <Plus className="h-3.5 w-3.5 text-amber-500" />
                    <span>Add drum</span>
                  </button>
                )}
                <button
                  onClick={handleAddLine}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center space-x-1"
                >
                  <Plus className="h-3.5 w-3.5 text-amber-400" />
                  <span>+ Add Cable Line Item</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    {scheduleLines.length > 1 && <th className="p-3 min-w-[180px]">Cable Description</th>}
                    <th className="p-3 min-w-[260px]">Drum Reel Type</th>
                    <th className="p-3 w-24">No. Drums</th>
                    <th className="p-3 w-32">Cutting L. (M)</th>
                    <th className="p-3 w-28">Cable Wt (kg)</th>
                    <th className="p-3 w-32">Total Gross Wt</th>
                    <th className="p-3 w-32">Drum capacity %</th>
                    <th className="p-3 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                  {calculatedLines.map((line) =>
                    line.drumRows.map((drum, drumIndex) => (
                      <tr
                        key={drum.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors align-top"
                      >
                        {drumIndex === 0 && scheduleLines.length > 1 && (
                          <td className="p-3" rowSpan={line.drumRows.length}>
                            <input
                              type="text"
                              value={line.itemDescription}
                              onChange={(e) => handleUpdateLine(line.id, 'itemDescription', e.target.value)}
                              className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 text-xs font-semibold"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddDrum(line.id)}
                              className="mt-2 text-[10px] font-bold text-blue-700 dark:text-blue-300 inline-flex items-center gap-1"
                            >
                              <Plus className="h-3 w-3" />
                              Add drum
                            </button>
                          </td>
                        )}
                        <td className="p-3">
                          <DrumMasterSelect
                            drums={drumMaster}
                            value={drum.drumCode}
                            onChange={(code) => handleUpdateDrum(line.id, drum.id, 'drumCode', code)}
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            min={1}
                            value={drum.noOfDrums}
                            onChange={(e) =>
                              handleUpdateDrum(line.id, drum.id, 'noOfDrums', Math.max(1, Number(e.target.value)))
                            }
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 font-mono font-bold text-amber-600 dark:text-amber-400"
                          />
                        </td>
                        <td className="p-3">
                          <input
                            type="number"
                            min={0}
                            value={drum.cuttingLengthM || ''}
                            onChange={(e) =>
                              handleUpdateDrum(line.id, drum.id, 'cuttingLengthM', Math.max(0, Number(e.target.value)))
                            }
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 font-mono font-extrabold text-blue-600 dark:text-blue-400"
                          />
                        </td>
                        <td className="p-3 font-mono text-slate-700 dark:text-slate-300">
                          {drum.cableWeightKg > 0
                            ? drum.cableWeightKg.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            : '—'}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {drum.totalGrossKg > 0
                            ? `${Math.round(drum.totalGrossKg).toLocaleString()} kg`
                            : '—'}
                        </td>
                        <td className="p-3">
                          {drum.fillRatioPercent == null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                                drum.fillRatioPercent > 95
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
                              {drum.fillRatioPercent}% Capacity
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              line.drumRows.length > 1
                                ? handleDeleteDrum(line.id, drum.id)
                                : handleDeleteLine(line.id)
                            }
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            <span className="font-bold text-slate-800 dark:text-slate-200">Container Recommendation:</span>{' '}
            {num20ftContainers}x 20ft Container(s) OR {num40ftContainers}x 40ft HC Container(s)
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 font-bold text-slate-700 dark:text-slate-200"
            >
              Close
            </button>
            {onApplyToInquiry && (
              <button
                onClick={handleApply}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-md transition-all flex items-center space-x-1.5"
              >
                <Check className="h-4 w-4" />
                <span>Apply Container Plan to Inquiry</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
