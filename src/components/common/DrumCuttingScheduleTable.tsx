import React from 'react';
import { Plus, Trash2, AlertCircle, AlertTriangle, Info, Sparkles } from 'lucide-react';
import { DrumMasterRecord } from '../../types';
import { computeDrumScheduleRowMetrics, computeCableOrderLengthRange } from '../../domain/inquiryDrumSchedule';
import {
  calculateDrumCapacity,
  lengthUtilizationPercent,
  loadUtilizationPercent,
  cableWeightOnDrumKg,
  floorToNearest10,
} from '../../domain/drumCapacityCalculator';
import { DrumMasterSelect } from './DrumMasterSelect';

export interface DrumScheduleRow {
  id: string;
  drumCode: string;
  noOfDrums: number | string;
  cuttingLengthM: number | string;
  drumTolerancePercent: number | string;
}

export interface DrumScheduleSelectOption {
  drumCode: string;
  label: string;
}

interface DrumCuttingScheduleTableProps {
  rows: DrumScheduleRow[];
  drums: DrumMasterRecord[];
  approxWeightKgKm: number;
  cableTolerancePercent: number | string;
  onCableToleranceChange: (value: string) => void;
  showCableDescription?: boolean;
  cableDescription?: string;
  /** Outside diameter (mm) — enables native length/load utilization metrics. */
  cableDiameterMm?: number;
  /** Suitable-candidate options from the native capacity engine (manual mode). */
  suitableSelectOptions?: DrumScheduleSelectOption[] | null;
  /** Per-row suitable options (each line uses its own cutting length). */
  suitableSelectOptionsForRow?: (row: DrumScheduleRow) => DrumScheduleSelectOption[] | null;
  /** Placeholder when suitableSelectOptions is an empty/non-null list. */
  suitableSelectEmptyLabel?: string;
  suitableSelectEmptyLabelForRow?: (row: DrumScheduleRow) => string;
  /** Disable Add Drum Line until a valid Drum Plan exists. */
  addRowDisabled?: boolean;
  disabled?: boolean;
  onUpdateRow: (id: string, patch: Partial<DrumScheduleRow>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
}

export function DrumCuttingScheduleTable({
  rows,
  drums,
  approxWeightKgKm,
  cableTolerancePercent,
  onCableToleranceChange,
  showCableDescription = false,
  cableDescription = '',
  cableDiameterMm,
  suitableSelectOptions = null,
  suitableSelectOptionsForRow,
  suitableSelectEmptyLabel = 'Select suitable drum',
  suitableSelectEmptyLabelForRow,
  addRowDisabled = false,
  disabled = false,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}: DrumCuttingScheduleTableProps) {
  const totalNominalM = rows.reduce((acc, row) => {
    const drumsCount = Number(row.noOfDrums);
    const cuttingM = Number(row.cuttingLengthM);
    if (!Number.isFinite(drumsCount) || !Number.isFinite(cuttingM) || drumsCount <= 0 || cuttingM <= 0) {
      return acc;
    }
    return acc + drumsCount * cuttingM;
  }, 0);
  const cableTolerance = Number(cableTolerancePercent);
  const orderRange =
    totalNominalM > 0 && Number.isFinite(cableTolerance) && cableTolerance >= 0
      ? computeCableOrderLengthRange(totalNominalM, cableTolerance)
      : null;

  const maxFeasibleAcrossAllDrums = React.useMemo(() => {
    if (
      !cableDiameterMm ||
      cableDiameterMm <= 0 ||
      !approxWeightKgKm ||
      approxWeightKgKm <= 0 ||
      !drums ||
      drums.length === 0
    ) {
      return null;
    }
    let maxLen = 0;
    let bestDrumCode = '';
    for (const d of drums) {
      if (d.isActive === false) continue;
      const cap = calculateDrumCapacity(
        {
          drumCode: d.drumCode,
          flange: d.flange,
          barrel: d.barrel,
          innerWidth: d.innerWidth,
          clearanceMm: d.clearanceMm ?? null,
          maxLoadKg: d.maxWeight ?? null,
          emptyDrumNetWeightKg: d.emptyDrumNetWeightKg ?? null,
        },
        { cableDiameterMm, approxWeightKgKm }
      );
      if (cap.status === 'OK' && cap.maximumUsableLengthMeters && cap.maximumUsableLengthMeters > maxLen) {
        maxLen = cap.maximumUsableLengthMeters;
        bestDrumCode = d.drumCode;
      }
    }
    return maxLen > 0 ? { maxLen, bestDrumCode } : null;
  }, [cableDiameterMm, approxWeightKgKm, drums]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h4 className="font-bold text-slate-900 dark:text-white text-sm">
            Multi-Drum Cutting Schedule Lines
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Define distinct drum sizes, drum quantities, cutting lengths, and drum tolerances per line.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRow}
          disabled={addRowDisabled || disabled}
          title={addRowDisabled ? 'Complete a valid Drum Plan before adding another line.' : undefined}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow flex items-center gap-1.5 self-start disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Drum Line
        </button>
      </div>

      {maxFeasibleAcrossAllDrums && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 text-xs text-blue-900 dark:text-blue-200">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>
              <strong>Cable Engineering Limit:</strong> Maximum feasible single-drum cutting length is{' '}
              <span className="font-extrabold text-blue-700 dark:text-blue-300">
                {maxFeasibleAcrossAllDrums.maxLen.toLocaleString()} m
              </span>{' '}
              (based on Ø {cableDiameterMm} mm and {approxWeightKgKm.toLocaleString()} kg/km).
            </span>
          </div>
          <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
            Lengths above this will exceed drum payload or volumetric capacity.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Cable Tolerance <span className="text-red-500">*</span>
          </span>
          <div className="relative w-36">
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              required
              value={cableTolerancePercent}
              disabled={disabled}
              onChange={(e) => onCableToleranceChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-3 pr-7 py-2 font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400 shadow-xs focus:ring-2 focus:ring-indigo-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="absolute right-2.5 top-2.5 text-xs font-bold text-indigo-500 pointer-events-none">%</span>
          </div>
        </label>
        {orderRange && (
          <div className="text-[11px] text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-slate-100">Total Length (m):</span>{' '}
            {totalNominalM.toLocaleString()} m
            <span className="text-slate-500"> (cutting length × number of drums)</span>
            {' · '}
            [{orderRange.minM.toLocaleString()} m – {orderRange.maxM.toLocaleString()} m] with cable
            tolerance
          </div>
        )}
      </div>

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <table className="min-w-[1240px] w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
              <th className="p-3 w-10 text-center">#</th>
              {showCableDescription && <th className="p-3 min-w-[180px]">Cable Description</th>}
              <th className="p-3 min-w-[260px]">Drum Type &amp; Specs</th>
              <th className="p-3 w-32 min-w-[110px]">No. of Drums</th>
              <th className="p-3 w-72 min-w-[240px]">Cutting Length / Drum</th>
              <th className="p-3 w-36 min-w-[130px]">
                Drum Tolerance <span className="text-red-500">*</span>
              </th>
              <th className="p-3 w-28 min-w-[100px]">Max usable (m)</th>
              <th className="p-3 w-28 min-w-[95px]">Length util %</th>
              <th className="p-3 w-28 min-w-[95px]">Load util %</th>
              <th className="p-3 w-36 min-w-[130px]">Nominal Line (m)</th>
              <th className="p-3 w-36 min-w-[130px]">Total Line Wt (kg)</th>
              <th className="p-3 text-center w-16">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
            {rows.map((row, index) => {
              const cuttingM = Number(row.cuttingLengthM);
              const drumCount = Number(row.noOfDrums);
              const drumTolerance = Number(row.drumTolerancePercent);
              const master = drums.find((d) => d.drumCode === row.drumCode) || null;
              const metrics =
                Number.isFinite(cuttingM) &&
                cuttingM > 0 &&
                Number.isFinite(drumCount) &&
                drumCount > 0 &&
                Number.isFinite(drumTolerance) &&
                drumTolerance >= 0
                  ? computeDrumScheduleRowMetrics(
                      {
                        noOfDrums: drumCount,
                        cuttingLengthM: cuttingM,
                        drumTolerancePercent: drumTolerance,
                      },
                      approxWeightKgKm,
                      master?.capacity
                    )
                  : null;

              const capacity =
                master &&
                cableDiameterMm != null &&
                Number.isFinite(cableDiameterMm) &&
                cableDiameterMm > 0 &&
                Number.isFinite(cuttingM) &&
                cuttingM > 0
                  ? calculateDrumCapacity(
                      {
                        drumCode: master.drumCode,
                        flange: master.flange,
                        barrel: master.barrel,
                        innerWidth: master.innerWidth,
                        clearanceMm: master.clearanceMm ?? null,
                        maxLoadKg: master.maxWeight ?? null,
                        emptyDrumNetWeightKg: master.emptyDrumNetWeightKg ?? null,
                      },
                      { cableDiameterMm, approxWeightKgKm }
                    )
                  : null;

              const lengthUtil =
                capacity?.status === 'OK' && capacity.maximumUsableLengthMeters != null
                  ? lengthUtilizationPercent(cuttingM, capacity.maximumUsableLengthMeters)
                  : null;
              const cableKg =
                capacity?.cableWeightPerMeter != null
                  ? cableWeightOnDrumKg(cuttingM, capacity.cableWeightPerMeter)
                  : null;
              const loadUtil =
                cableKg != null && capacity?.permittedCablePayloadKg != null
                  ? loadUtilizationPercent(cableKg, capacity.permittedCablePayloadKg)
                  : null;

              const rowMaxM = capacity?.maximumUsableLengthMeters ?? maxFeasibleAcrossAllDrums?.maxLen ?? null;
              const isCriticalOverload = Boolean(rowMaxM && cuttingM > rowMaxM * 1.15);
              const isMildOverload = Boolean(rowMaxM && cuttingM > rowMaxM && cuttingM <= rowMaxM * 1.15);

              // Auto-split proposal if critical overload
              const currentTotalM = (drumCount > 0 ? drumCount : 1) * (cuttingM > 0 ? cuttingM : 0);
              const targetDrums =
                rowMaxM && rowMaxM > 0 ? Math.max(drumCount + 1, Math.ceil(currentTotalM / rowMaxM)) : 2;
              const targetCuttingM =
                rowMaxM && rowMaxM > 0
                  ? floorToNearest10(Math.floor(currentTotalM / targetDrums)) ||
                    Math.floor(currentTotalM / targetDrums)
                  : 0;

              return (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors align-top"
                >
                  <td className="p-3 font-bold text-blue-600 dark:text-blue-400 text-center">{index + 1}</td>
                  {showCableDescription && (
                    <td className="p-3 text-slate-700 dark:text-slate-300 font-semibold">{cableDescription}</td>
                  )}
                  <td className="p-3">
                    <DrumMasterSelect
                      drums={drums}
                      value={row.drumCode}
                      disabled={disabled}
                      onChange={(code) => onUpdateRow(row.id, { drumCode: code })}
                      showSpecification={false}
                      options={
                        suitableSelectOptionsForRow ? suitableSelectOptionsForRow(row) : suitableSelectOptions
                      }
                      emptyLabel={
                        suitableSelectEmptyLabelForRow
                          ? suitableSelectEmptyLabelForRow(row)
                          : suitableSelectEmptyLabel
                      }
                    />
                  </td>
                  <td className="p-3">
                    <div className="relative min-w-[90px]">
                      <input
                        type="number"
                        min={1}
                        value={row.noOfDrums}
                        disabled={disabled}
                        onChange={(e) => onUpdateRow(row.id, { noOfDrums: e.target.value })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-center text-sm font-mono font-bold text-amber-600 dark:text-amber-400 shadow-xs focus:ring-2 focus:ring-amber-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="1"
                      />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="relative min-w-[180px]">
                      <input
                        type="number"
                        min={1}
                        value={row.cuttingLengthM}
                        disabled={disabled}
                        onChange={(e) => onUpdateRow(row.id, { cuttingLengthM: e.target.value })}
                        className={`w-full bg-white dark:bg-slate-900 border rounded-xl pl-3 pr-8 py-2 text-sm font-mono font-black shadow-xs transition-all focus:outline-none focus:ring-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          isCriticalOverload
                            ? 'border-red-500 text-red-600 dark:text-red-400 bg-red-50/40 dark:bg-red-950/20 focus:ring-red-400'
                            : isMildOverload
                            ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20 focus:ring-amber-400'
                            : 'border-slate-300 dark:border-slate-700 text-blue-600 dark:text-blue-400 focus:ring-blue-400'
                        }`}
                        placeholder="e.g. 1000"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 pointer-events-none">m</span>
                    </div>
                    {isCriticalOverload && rowMaxM && (
                      <div className="mt-2 p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-[11px] text-red-700 dark:text-red-300 space-y-1.5 animate-fade-in">
                        <div className="flex items-start gap-1.5 font-bold leading-tight">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                          <span>Exceeds max drum capacity ({rowMaxM.toLocaleString()} m).</span>
                        </div>
                        {approxWeightKgKm > 0 && (
                          <p className="text-[10px] text-red-600/90 dark:text-red-400/90 leading-tight">
                            Cable weight ({Math.round((cuttingM * approxWeightKgKm) / 1000).toLocaleString()} kg) exceeds safe drum payload.
                          </p>
                        )}
                        {targetCuttingM > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateRow(row.id, {
                                noOfDrums: targetDrums,
                                cuttingLengthM: targetCuttingM,
                              });
                            }}
                            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3" />
                            Auto-split into {targetDrums} drums ({targetCuttingM.toLocaleString()} m each)
                          </button>
                        )}
                      </div>
                    )}
                    {isMildOverload && rowMaxM && (
                      <div className="mt-2 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-200 animate-fade-in">
                        <div className="flex items-start gap-1.5 font-semibold leading-tight">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                          <span>
                            Slightly exceeds standard capacity ({rowMaxM.toLocaleString()} m). Requires heavy-duty packaging confirmation.
                          </span>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="relative min-w-[100px]">
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        required
                        value={row.drumTolerancePercent}
                        disabled={disabled}
                        onChange={(e) => onUpdateRow(row.id, { drumTolerancePercent: e.target.value })}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl pl-3 pr-7 py-2 text-sm font-mono font-bold text-amber-600 dark:text-amber-400 shadow-xs focus:ring-2 focus:ring-amber-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0"
                      />
                      <span className="absolute right-2.5 top-2.5 text-xs font-bold text-amber-500 pointer-events-none">%</span>
                    </div>
                  </td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                    {capacity?.maximumUsableLengthMeters != null
                      ? `${capacity.maximumUsableLengthMeters.toLocaleString()} m`
                      : '—'}
                  </td>
                  <td className="p-3">
                    {lengthUtil == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-bold">{lengthUtil.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="p-3">
                    {loadUtil == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-bold">{loadUtil.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                    {metrics ? (
                      <>
                        {metrics.nominalLineM.toLocaleString()} m
                        <span className="block text-[10px] font-normal text-slate-500">
                          [{metrics.minLineM.toLocaleString()} m – {metrics.maxLineM.toLocaleString()} m]
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">
                    {metrics && metrics.totalLineWeightKg > 0 ? (
                      <>
                        {Math.round(metrics.totalLineWeightKg).toLocaleString()} kg
                        <span className="block text-[10px] text-slate-500">
                          ({Math.round(metrics.cableWeightPerDrumKg).toLocaleString()} kg/drum)
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.id)}
                      disabled={disabled || rows.length <= 1}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {approxWeightKgKm > 0 ? (
        <p className="text-[10px] text-slate-400">
          Cable weight = cutting length (m) × approx weight ({approxWeightKgKm.toLocaleString()} kg/km) ÷ 1000.
          Length / load utilization use native drum capacity (geo + MaxLoad), not Excel Capacity UOM.
          Drum tolerance applies to nominal line length; cable tolerance applies to the full order length.
        </p>
      ) : (
        <p className="text-[10px] text-amber-600">
          Approx weight (kg/km) not configured for this cable — weight and utilization cannot be calculated.
        </p>
      )}
    </div>
  );
}

