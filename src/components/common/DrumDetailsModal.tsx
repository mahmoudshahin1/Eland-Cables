import React, { useState, useEffect, useMemo } from 'react';
import { ErpRequestItem, DrumScheduleEntry, DrumSelectionResult } from '../../types';
import { DrumMasterReferencePanel } from './DrumMasterReferencePanel';
import { useDrumMasterList } from './DrumMasterSelect';
import {
  Box,
  X,
  Check,
  Scale,
  Ruler,
  Layers,
  Sliders,
  Plus,
  Trash2,
  Copy,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ArrowRightLeft,
  Info,
} from 'lucide-react';

interface DrumDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ErpRequestItem | null;
  onSaveDrumDetails: (serial: number, updatedDrumDetails: any) => void;
}

interface EditableDrumEntry {
  id: string;
  drumNo: number;
  drumType: string;
  lengthMeters: number;
  grossWeightKg: number;
  netWeightKg: number;
  notes?: string;
  drumMasterCode?: string;
}

export const DRUM_TYPE_OPTIONS = [
  { value: 'Wood Reel 220', label: 'Wood Reel 220 (Ø 2200mm - Heavy Wood)' },
  { value: 'Wood Reel 180', label: 'Wood Reel 180 (Ø 1800mm - Medium Wood)' },
  { value: 'Wood Reel 140', label: 'Wood Reel 140 (Ø 1400mm - Compact Wood)' },
  { value: 'Steel Drum 240', label: 'Steel Drum 240 (Ø 2400mm - Reinforced Steel)' },
  { value: 'Steel Drum 280', label: 'Steel Drum 280 (Ø 2800mm - Heavy Duty Steel)' },
  { value: 'Export Steel Reel 260', label: 'Export Steel Reel 260 (Sealed Export Reel)' },
  { value: 'Plywood Reel 120', label: 'Plywood Reel 120 (Small LV / Control Cables)' },
  { value: 'Coil / Strapped Bundle', label: 'Coil / Strapped Bundle (No Reel)' },
];

export const DrumDetailsModal: React.FC<DrumDetailsModalProps> = ({
  isOpen,
  onClose,
  item,
  onSaveDrumDetails,
}) => {
  // Convert requested qty to meters if unit is KM
  const qtyInMeters = item ? (item.uom === 'KM' ? Math.round(item.qty * 1000) : Math.round(item.qty)) : 0;

  const weightFromBom = Boolean(item?.bomDetails?.grossWeightKgKm);
  // Cable gross weight per meter (from BOM or prototype fallback to 2.15 kg/m — do not spread this default)
  const cableWeightPerMeter =
    item?.bomDetails?.grossWeightKgKm ? item.bomDetails.grossWeightKgKm / 1000 : 2.15;

  // Estimate drum tare weight based on type
  const getTareWeightForType = (type: string) => {
    if (type.includes('Wood 220')) return 350;
    if (type.includes('Wood 180')) return 250;
    if (type.includes('Wood 140')) return 160;
    if (type.includes('Steel 240')) return 550;
    if (type.includes('Steel 280')) return 750;
    if (type.includes('Export')) return 600;
    if (type.includes('Plywood')) return 80;
    return 200; // default tare
  };

  // State for drums schedule list
  const [drums, setDrums] = useState<EditableDrumEntry[]>([]);
  const [activeDrumId, setActiveDrumId] = useState<string>('');
  const [linkMessage, setLinkMessage] = useState<string>('');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [splitLength, setSplitLength] = useState<number>(
    Math.round(qtyInMeters / 2) || 1000
  );
  const ewdMaster = useDrumMasterList(isOpen);
  useEffect(() => {
    if (item?.drumDetails?.drumsList && item.drumDetails.drumsList.length > 0) {
      const initialDrums: EditableDrumEntry[] = item.drumDetails.drumsList.map((d, index) => {
        const netW = d.netWeightKg || Math.round(d.lengthMeters * cableWeightPerMeter);
        const grossW = d.grossWeightKg || netW + getTareWeightForType(d.drumType);
        return {
          id: `drum-${Date.now()}-${index}-${Math.random()}`,
          drumNo: index + 1,
          drumType: d.drumType || 'Wood Reel 220',
          lengthMeters: d.lengthMeters || 1000,
          grossWeightKg: grossW,
          netWeightKg: netW,
          notes: d.notes || `Drum #${index + 1}`,
          drumMasterCode: d.drumMasterCode,
        };
      });
      setDrums(initialDrums);
      setActiveDrumId(initialDrums[0]?.id || '');
    } else {
      // Default auto-split into drums of 1000m or 500m
      const defaultNo = Math.max(1, Math.ceil(qtyInMeters / 1000));
      const defaultLen = Math.round(qtyInMeters / defaultNo);
      const initialDrums: EditableDrumEntry[] = Array.from({ length: defaultNo }).map((_, i) => {
        const netW = Math.round(defaultLen * cableWeightPerMeter);
        const grossW = netW + 300; // 300kg drum reel
        return {
          id: `drum-init-${i}-${Date.now()}`,
          drumNo: i + 1,
          drumType: 'Wood Reel 220',
          lengthMeters: defaultLen,
          grossWeightKg: grossW,
          netWeightKg: netW,
          notes: `Standard Segment #${i + 1}`,
        };
      });
      setDrums(initialDrums);
      setActiveDrumId(initialDrums[0]?.id || '');
    }
  }, [item]);

  const totalScheduledMeters = useMemo(() => {
    return drums.reduce((sum, d) => sum + (Number(d.lengthMeters) || 0), 0);
  }, [drums]);

  const totalGrossWeightKg = useMemo(() => {
    return drums.reduce((sum, d) => sum + (Number(d.grossWeightKg) || 0), 0);
  }, [drums]);

  const totalNetWeightKg = useMemo(() => {
    return drums.reduce((sum, d) => sum + (Number(d.netWeightKg) || 0), 0);
  }, [drums]);

  const totalScheduledKm = +(totalScheduledMeters / 1000).toFixed(3);
  const lengthDifference = totalScheduledMeters - qtyInMeters;

  // Drum Type distribution summary
  const drumTypeSummary = useMemo(() => {
    const counts: { [type: string]: number } = {};
    drums.forEach((d) => {
      counts[d.drumType] = (counts[d.drumType] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => `${count}x ${type}`);
  }, [drums]);

  // Handlers for dynamic drum list editing
  const handleUpdateDrumRow = (id: string, field: keyof EditableDrumEntry, value: any) => {
    setDrums((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          const updated = { ...d, [field]: value };
          // Auto-recalculate estimated weights if length or drumType changes
          if (field === 'lengthMeters' || field === 'drumType') {
            const newLen = field === 'lengthMeters' ? Number(value) || 0 : d.lengthMeters;
            const newType = field === 'drumType' ? String(value) : d.drumType;
            const estimatedNet = Math.round(newLen * cableWeightPerMeter);
            const estimatedTare = getTareWeightForType(newType);
            updated.netWeightKg = estimatedNet;
            updated.grossWeightKg = estimatedNet + estimatedTare;
          }
          return updated;
        }
        return d;
      })
    );
  };

  const handleAddDrumRow = (customLength?: number, customType?: string) => {
    const newNo = drums.length + 1;
    const len = customLength !== undefined ? customLength : 500;
    const type = customType || (drums.length > 0 ? drums[drums.length - 1].drumType : 'Wood Reel 220');
    const netW = Math.round(len * cableWeightPerMeter);
    const grossW = netW + getTareWeightForType(type);

    const newEntry: EditableDrumEntry = {
      id: `drum-custom-${Date.now()}-${Math.random()}`,
      drumNo: newNo,
      drumType: type,
      lengthMeters: len,
      grossWeightKg: grossW,
      netWeightKg: netW,
      notes: `Segment #${newNo}`,
      drumMasterCode: drums.length > 0 ? drums[drums.length - 1].drumMasterCode : undefined,
    };

    setDrums((prev) => [...prev, newEntry]);
  };

  const handleAddRemainingLength = () => {
    const remaining = qtyInMeters - totalScheduledMeters;
    if (remaining <= 0) return;
    handleAddDrumRow(remaining);
  };

  const handleDuplicateRow = (id: string) => {
    const target = drums.find((d) => d.id === id);
    if (!target) return;
    const newEntry: EditableDrumEntry = {
      ...target,
      id: `drum-dup-${Date.now()}-${Math.random()}`,
      drumNo: drums.length + 1,
      notes: `${target.notes || 'Drum'} (Copy)`,
    };
    setDrums((prev) => renumberDrums([...prev, newEntry]));
  };

  const handleDeleteRow = (id: string) => {
    if (drums.length <= 1) {
      alert('At least one drum schedule row is required.');
      return;
    }
    setDrums((prev) => renumberDrums(prev.filter((d) => d.id !== id)));
  };

  const renumberDrums = (list: EditableDrumEntry[]) => {
    return list.map((item, idx) => ({ ...item, drumNo: idx + 1 }));
  };

  // Bulk Equal Split Generator
  const handleApplyEqualSplit = () => {
    if (splitCount < 1) return;
    const perDrumLength = Math.round(qtyInMeters / splitCount);
    const newDrums: EditableDrumEntry[] = Array.from({ length: splitCount }).map((_, i) => {
      // Last drum absorbs rounding remainder
      const len = i === splitCount - 1 ? qtyInMeters - perDrumLength * (splitCount - 1) : perDrumLength;
      const type = 'Wood Reel 220';
      const netW = Math.round(len * cableWeightPerMeter);
      const grossW = netW + getTareWeightForType(type);
      return {
        id: `drum-split-${i}-${Date.now()}`,
        drumNo: i + 1,
        drumType: type,
        lengthMeters: len,
        grossWeightKg: grossW,
        netWeightKg: netW,
        notes: `Split ${i + 1}/${splitCount}`,
      };
    });
    setDrums(newDrums);
  };

  const handleSave = () => {
    const cleanDrumsList: DrumScheduleEntry[] = drums.map((d, idx) => ({
      drumNo: idx + 1,
      drumType: d.drumType,
      lengthMeters: Number(d.lengthMeters) || 0,
      grossWeightKg: Number(d.grossWeightKg) || 0,
      netWeightKg: Number(d.netWeightKg) || 0,
      notes: d.notes || '',
      drumMasterCode: d.drumMasterCode || undefined,
    }));

    const primaryDrumType = drums[0]?.drumType || 'Wood Reel 220';
    const avgCuttingLength = Math.round(totalScheduledMeters / drums.length);
    const avgGrossWeight = Math.round(totalGrossWeightKg / drums.length);
    const avgNetWeight = Math.round(totalNetWeightKg / drums.length);

    const updatedDetails = {
      drumType: primaryDrumType,
      noOfDrums: drums.length,
      cuttingLengthMeters: avgCuttingLength,
      totalLengthKm: totalScheduledKm,
      grossWeightPerDrumKg: avgGrossWeight,
      netWeightPerDrumKg: avgNetWeight,
      drumsList: cleanDrumsList,
    };

    if (!item) return;
    onSaveDrumDetails(item.serial, updatedDetails);
    onClose();
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar */}
        <div className="bg-brand-600 text-white p-4 flex items-center justify-between border-b border-brand-700 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight">
                Multi-Drum Packing & Cutting Schedule
              </h3>
              <p className="text-xs text-blue-200 font-medium">
                Line #{item.serial}: <span className="font-mono font-bold text-amber-300">{item.itemCode}</span> ({item.cableCode || item.itemDescription})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-blue-800 text-slate-300 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Main Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Top Cable Overview & Tolerance Metrics Banner */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Cable Description Card */}
            <div className="md:col-span-5 bg-slate-50 dark:bg-slate-800/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-2">
              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider block">
                  Cable Specification
                </span>
                <p className="font-bold text-xs text-slate-900 dark:text-white mt-1 leading-snug">
                  {item.itemDescription}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500">Requested Qty:</span>
                <span className="font-mono font-extrabold text-sm text-blue-600 dark:text-blue-400">
                  {item.qty} {item.uom} ({qtyInMeters.toLocaleString()} Meters)
                </span>
              </div>
            </div>

            {/* Live Metrics & Tolerance Status */}
            <div className="md:col-span-7 bg-slate-950 text-white p-4 rounded-2xl border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block">
                  Scheduled Length
                </span>
                <p className="font-mono font-extrabold text-base text-emerald-400 mt-0.5">
                  {totalScheduledMeters.toLocaleString()} M
                </p>
                <span className="text-[10px] text-slate-400 font-mono">({totalScheduledKm} KM)</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block">
                  Total Drums
                </span>
                <p className="font-mono font-extrabold text-base text-amber-400 mt-0.5">
                  {drums.length} Reel(s)
                </p>
                <span className="text-[10px] text-slate-400 font-mono">
                  {drumTypeSummary.slice(0, 2).join(', ')}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block">
                  Gross / Net Wt.
                </span>
                <p className="font-mono font-bold text-xs text-slate-200 mt-0.5">
                  {(totalGrossWeightKg / 1000).toFixed(2)}t / {(totalNetWeightKg / 1000).toFixed(2)}t
                </p>
                <span className="text-[10px] text-slate-400">Total Weight</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-extrabold text-slate-400 block mb-1">
                  Qty Variance
                </span>
                {lengthDifference === 0 ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold text-[11px]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Exact Match</span>
                  </span>
                ) : lengthDifference > 0 ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-700 font-bold text-[11px]">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>+{lengthDifference} M Overage</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-700 font-bold text-[11px]">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{lengthDifference} M Shortage</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {!weightFromBom && (
            <div className="flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Line has no BOM gross weight. This modal still uses the prototype 2.15 kg/m estimate for net/gross
                display only. That fallback is not an ENERGYA engineering value and is not used to auto-select EWD drums.
              </span>
            </div>
          )}

          <DrumMasterReferencePanel
            drums={ewdMaster}
            prototypeDrumType={drums.find((d) => d.id === activeDrumId)?.drumType || drums[0]?.drumType}
            linkedCode={drums.find((d) => d.id === activeDrumId)?.drumMasterCode}
            onLink={(code, result: DrumSelectionResult) => {
              if (result.blockingReasons.length) {
                setLinkMessage(result.blockingReasons[0]);
                return;
              }
              const targetId = activeDrumId || drums[0]?.id;
              if (!targetId) return;
              setDrums((prev) =>
                prev.map((d) => (d.id === targetId ? { ...d, drumMasterCode: result.selectedDrum?.drumCode || code } : d))
              );
              setLinkMessage(
                `Linked ${result.selectedDrum?.drumCode} to drum #${drums.find((d) => d.id === targetId)?.drumNo}. Prototype reel type unchanged.`
              );
            }}
            onClear={() => {
              const targetId = activeDrumId || drums[0]?.id;
              if (!targetId) return;
              setDrums((prev) => prev.map((d) => (d.id === targetId ? { ...d, drumMasterCode: undefined } : d)));
              setLinkMessage('Cleared EWD Drum Master link for the selected schedule row.');
            }}
          />
          {linkMessage ? <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{linkMessage}</p> : null}

          {/* Quick Schedule Generator Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">Auto Split Tools:</span>
              <div className="flex items-center space-x-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-300 dark:border-slate-700">
                <span className="text-[11px] font-bold text-slate-500 pl-2">Split into</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={splitCount}
                  onChange={(e) => setSplitCount(Math.max(1, Number(e.target.value)))}
                  className="w-12 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-1 font-bold text-center outline-none"
                />
                <span className="text-[11px] font-bold text-slate-500 pr-1">Drums</span>
                <button
                  onClick={handleApplyEqualSplit}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors"
                >
                  Generate Equal Drums
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              {qtyInMeters > totalScheduledMeters && (
                <button
                  onClick={handleAddRemainingLength}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all flex items-center space-x-1 shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ Fill Remaining ({qtyInMeters - totalScheduledMeters} M)</span>
                </button>
              )}

              <button
                onClick={() => handleAddDrumRow()}
                className="px-3.5 py-1.5 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-all flex items-center space-x-1.5 shadow-sm"
              >
                <Plus className="h-3.5 w-3.5 text-amber-400" />
                <span>+ Add Drum Row</span>
              </button>
            </div>
          </div>

          {/* Interactive Multi-Drum Reel Schedule Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5 text-xs">
                <Sliders className="h-4 w-4 text-blue-600" />
                <span>Individual Drum Schedule (Mix & Match Reel Sizes & Lengths)</span>
              </h4>
              <span className="text-[11px] text-slate-400 italic">
                * Edit drum reel type, cutting length, and weights directly per drum row
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <th className="p-3 w-14 text-center">Drum #</th>
                    <th className="p-3 min-w-[210px]">Drum Reel Size & Type</th>
                    <th className="p-3 min-w-[110px]">EWD ref</th>
                    <th className="p-3 w-36">Cutting Length (M)</th>
                    <th className="p-3 w-32">Gross Wt (kg)</th>
                    <th className="p-3 w-32">Net Wt (kg)</th>
                    <th className="p-3 min-w-[150px]">Marking / Notes</th>
                    <th className="p-3 text-center w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                  {drums.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setActiveDrumId(d.id)}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer ${
                        activeDrumId === d.id ? 'bg-blue-50/80 dark:bg-blue-950/30' : ''
                      }`}
                    >
                      {/* Drum Number */}
                      <td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400 font-mono">
                        #{d.drumNo}
                      </td>

                      {/* Drum Type Selector */}
                      <td className="p-3">
                        <select
                          value={d.drumType}
                          onChange={(e) => handleUpdateDrumRow(d.id, 'drumType', e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {DRUM_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {d.drumMasterCode || '—'}
                      </td>

                      {/* Cutting Length */}
                      <td className="p-3">
                        <div className="relative">
                          <input
                            type="number"
                            min={1}
                            value={d.lengthMeters}
                            onChange={(e) =>
                              handleUpdateDrumRow(d.id, 'lengthMeters', Math.max(0, Number(e.target.value)))
                            }
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-mono font-extrabold text-emerald-600 dark:text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <span className="absolute right-3 top-2.5 text-[10px] text-slate-400 font-bold">
                            M
                          </span>
                        </div>
                      </td>

                      {/* Gross Weight */}
                      <td className="p-3">
                        <input
                          type="number"
                          value={d.grossWeightKg}
                          onChange={(e) =>
                            handleUpdateDrumRow(d.id, 'grossWeightKg', Number(e.target.value))
                          }
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-mono font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>

                      {/* Net Weight */}
                      <td className="p-3">
                        <input
                          type="number"
                          value={d.netWeightKg}
                          onChange={(e) =>
                            handleUpdateDrumRow(d.id, 'netWeightKg', Number(e.target.value))
                          }
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 font-mono text-slate-600 dark:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>

                      {/* Notes / Tag Marking */}
                      <td className="p-3">
                        <input
                          type="text"
                          value={d.notes || ''}
                          onChange={(e) => handleUpdateDrumRow(d.id, 'notes', e.target.value)}
                          placeholder="e.g. Substation A Reel"
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>

                      {/* Action buttons */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleDuplicateRow(d.id)}
                            title="Duplicate Drum Row"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRow(d.id)}
                            title="Delete Drum Row"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center space-x-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Total {drums.length} Drum(s) Scheduled
            </span>
            <span>•</span>
            <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
              {totalScheduledKm} KM Total
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-bold text-slate-700 dark:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-md transition-all flex items-center space-x-1.5"
            >
              <Check className="h-4 w-4" />
              <span>Save Multi-Drum Schedule</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
