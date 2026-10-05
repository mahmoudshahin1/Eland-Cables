import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DrumMasterRecord } from '../../types';
import { computeDrumScheduleRowMetrics, computeCableOrderLengthRange } from '../../domain/inquiryDrumSchedule';
import { calculateDrumCapacity, lengthUtilizationPercent, loadUtilizationPercent, cableWeightOnDrumKg } from '../../domain/drumCapacityCalculator';
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
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow flex items-center gap-1.5 self-start disabled:opacity-40 disabled:pointer-events-none"
        >
          <Plus className="h-4 w-4" />
          Add Drum Line
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
        <label className="block space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Cable Tolerance <span className="text-red-500">*</span>
          </span>
          <div className="relative w-28">
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              required
              value={cableTolerancePercent}
              disabled={disabled}
              onChange={(e) => onCableToleranceChange(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold text-indigo-600 dark:text-indigo-400 pr-6"
            />
            <span className="absolute right-2 top-2.5 text-[10px] font-bold text-indigo-500">%</span>
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
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
              <th className="p-3 w-10">#</th>
              {showCableDescription && <th className="p-3 min-w-[180px]">Cable Description</th>}
              <th className="p-3 min-w-[240px]">Drum Type &amp; Specs</th>
              <th className="p-3 w-24">No. of Drums</th>
              <th className="p-3 w-36">Cutting Length / Drum</th>
              <th className="p-3 w-28">
                Drum Tolerance <span className="text-red-500">*</span>
              </th>
              <th className="p-3 w-28">Max usable (m)</th>
              <th className="p-3 w-28">Length util %</th>
              <th className="p-3 w-28">Load util %</th>
              <th className="p-3 w-36">Nominal Line (m)</th>
              <th className="p-3 w-36">Total Line Wt (kg)</th>
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

              return (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors align-top"
                >
                  <td className="p-3 font-bold text-blue-600 dark:text-blue-400">{index + 1}</td>
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
                    <input
                      type="number"
                      min={1}
                      value={row.noOfDrums}
                      disabled={disabled}
                      onChange={(e) => onUpdateRow(row.id, { noOfDrums: e.target.value })}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono font-bold text-amber-600 dark:text-amber-400 text-center"
                    />
                  </td>
                  <td className="p-3">
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        value={row.cuttingLengthM}
                        disabled={disabled}
                        onChange={(e) => onUpdateRow(row.id, { cuttingLengthM: e.target.value })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-mono font-extrabold text-blue-600 dark:text-blue-400 pr-7"
                      />
                      <span className="absolute right-2 top-2.5 text-[10px] text-slate-400 font-bold">m</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        required
                        value={row.drumTolerancePercent}
                        disabled={disabled}
                        onChange={(e) => onUpdateRow(row.id, { drumTolerancePercent: e.target.value })}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2 font-bold text-amber-600 dark:text-amber-400 pr-6"
                      />
                      <span className="absolute right-2 top-2.5 text-[10px] font-bold text-amber-500">%</span>
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
