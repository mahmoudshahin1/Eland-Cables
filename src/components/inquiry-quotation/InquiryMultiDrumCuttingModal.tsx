import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Info,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import {
  CommercialInquiryLineDto,
  resolveInquiryLineTotalLengthMeters,
} from '../../services/commercialInquiryApiService';
import {
  InquiryDrumSchedule,
  InquiryDrumScheduleRow,
  computeCableOrderLengthRange,
  computeDrumScheduleRowMetrics,
  parseInquiryDrumSchedule,
} from '../../domain/inquiryDrumSchedule';
import { useDrumMasterList } from '../common/DrumMasterSelect';
import { resolveDrumDescription } from '../../services/drumMasterService';
import { WoodenDrumIcon } from '../ui/icons';

export interface InquiryMultiDrumCuttingModalProps {
  isOpen: boolean;
  onClose: () => void;
  line: CommercialInquiryLineDto;
  onSave: (payload: {
    requestedQuantity: number;
    requestedLengthMeters: number;
    cuttingLengthMeters?: number;
    drumType?: string;
    cableTolerancePercent?: number;
    drumSchedule?: InquiryDrumSchedule;
  }) => Promise<void>;
}

export const InquiryMultiDrumCuttingModal: React.FC<InquiryMultiDrumCuttingModalProps> = ({
  isOpen,
  onClose,
  line,
  onSave,
}) => {
  const drumMaster = useDrumMasterList(true);
  const existingSchedule = useMemo(() => parseInquiryDrumSchedule(line.drumSchedule), [line.drumSchedule]);

  const [cableTolerance, setCableTolerance] = useState<number>(() => {
    if (existingSchedule?.cableTolerancePercent != null) {
      return existingSchedule.cableTolerancePercent;
    }
    const tol = Number(line.cableTolerancePercent);
    return Number.isFinite(tol) && tol >= 0 ? tol : 1;
  });

  const [rows, setRows] = useState<InquiryDrumScheduleRow[]>(() => {
    if (existingSchedule && existingSchedule.rows.length > 0) {
      return existingSchedule.rows;
    }
    const defaultDrumCode = drumMaster[0]?.drumCode || 'EWD630-0';
    const qty = Number(line.requestedQuantity) > 0 ? Number(line.requestedQuantity) : 1;
    const cut = Number(line.cuttingLengthMeters) > 0 ? Number(line.cuttingLengthMeters) : 500;
    return [
      {
        drumCode: line.drumType || defaultDrumCode,
        noOfDrums: qty,
        cuttingLengthM: cut,
        drumTolerancePercent: 1,
      },
    ];
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Approximate cable weight kg/km from configuration or standard density
  const approxWeightKgKm = useMemo(() => {
    const payloadWeight = Number(line.configurationPayload?.approxWeightKgKm);
    if (Number.isFinite(payloadWeight) && payloadWeight > 0) return payloadWeight;
    // Estimate based on specs or fallback
    return 1450;
  }, [line.configurationPayload]);

  // Aggregate metrics
  const aggregatedTotalLengthMeters = useMemo(() => {
    return rows.reduce((sum, r) => {
      const d = Number(r.noOfDrums) || 0;
      const c = Number(r.cuttingLengthM) || 0;
      return sum + d * c;
    }, 0);
  }, [rows]);

  const aggregatedTotalDrums = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.noOfDrums) || 0), 0);
  }, [rows]);

  const orderLengthRange = useMemo(() => {
    return computeCableOrderLengthRange(aggregatedTotalLengthMeters, cableTolerance);
  }, [aggregatedTotalLengthMeters, cableTolerance]);

  if (!isOpen) return null;

  const handleAddRow = () => {
    const defaultDrumCode = drumMaster[0]?.drumCode || 'EWD630-0';
    setRows((prev) => [
      ...prev,
      {
        drumCode: defaultDrumCode,
        noOfDrums: 1,
        cuttingLengthM: 500,
        drumTolerancePercent: 1,
      },
    ]);
  };

  const handleUpdateRow = (index: number, patch: Partial<InquiryDrumScheduleRow>) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const handleDeleteRow = (index: number) => {
    if (rows.length <= 1) {
      setError('Schedule must contain at least one cutting row.');
      return;
    }
    setError(null);
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (aggregatedTotalLengthMeters <= 0) {
      setError('Total scheduled length must be greater than zero.');
      return;
    }

    setSaving(true);
    setError(null);

    const primaryDrumType = rows.map((r) => r.drumCode).filter(Boolean).join(' + ');
    const primaryCuttingM = rows.length === 1 ? rows[0].cuttingLengthM : undefined;

    const scheduleData: InquiryDrumSchedule = {
      cableTolerancePercent: Math.max(0, cableTolerance),
      rows: rows.map((r) => ({
        drumCode: r.drumCode,
        noOfDrums: Math.max(1, Number(r.noOfDrums) || 1),
        cuttingLengthM: Math.max(1, Number(r.cuttingLengthM) || 100),
        drumTolerancePercent: Math.max(0, Number(r.drumTolerancePercent) || 0),
      })),
    };

    try {
      await onSave({
        requestedQuantity: aggregatedTotalDrums,
        requestedLengthMeters: aggregatedTotalLengthMeters,
        cuttingLengthMeters: primaryCuttingM,
        drumType: primaryDrumType,
        cableTolerancePercent: cableTolerance,
        drumSchedule: scheduleData,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
              <WoodenDrumIcon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-brand-800">
                  Cutting Schedule & Multi-Drum Configuration
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                  Line #{line.lineNumber}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-700 mt-0.5">
                {line.materialNumber ? (
                  <span className="font-mono text-blue-600 mr-1.5 font-bold">
                    {line.materialNumber}
                  </span>
                ) : null}
                {line.cableDescription}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cable Tolerance & Order Range Banner */}
        <div className="p-5 border-b border-slate-100 bg-white grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Cable Tolerance (%)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="15"
                step="0.5"
                value={cableTolerance}
                onChange={(e) => setCableTolerance(Math.max(0, Number(e.target.value) || 0))}
                className="w-24 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
              />
              <span className="text-xs font-semibold text-slate-500">± % standard</span>
            </div>
          </div>

          <div className="md:col-span-2 p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs">
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <Info className="h-4 w-4 text-blue-600 shrink-0" />
              <span>Order Length Range with Tolerance:</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-blue-800">
              <span>
                Nominal: <strong className="font-bold">{aggregatedTotalLengthMeters.toLocaleString()} m</strong>
              </span>
              <span>•</span>
              <span>
                Range: [<strong>{orderLengthRange.minM.toLocaleString()} m</strong> –{' '}
                <strong>{orderLengthRange.maxM.toLocaleString()} m</strong>]
              </span>
            </div>
          </div>
        </div>

        {/* Schedule Table */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Multi-Drum Cutting Schedule Rows
            </h4>
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs border border-blue-200 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Schedule Row</span>
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="p-2.5 text-center w-10">#</th>
                    <th className="p-2.5 min-w-[180px]">Drum Type & Specs</th>
                    <th className="p-2.5 w-24">No. of Drums</th>
                    <th className="p-2.5 w-28">Cutting Length (m)</th>
                    <th className="p-2.5 w-24">Tolerance (±%)</th>
                    <th className="p-2.5 w-20 text-center">Fill %</th>
                    <th className="p-2.5 text-right w-28">Nominal Line (m)</th>
                    <th className="p-2.5 text-right w-28">Total Weight (kg)</th>
                    <th className="p-2.5 text-center w-12">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, index) => {
                    const matchedDrum = drumMaster.find((d) => d.drumCode === row.drumCode);
                    const drumCapacityKg = matchedDrum ? Number(matchedDrum.capacity) || 650 : 650;
                    const metrics = computeDrumScheduleRowMetrics(row, approxWeightKgKm, drumCapacityKg);

                    return (
                      <tr key={index} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-2.5 text-center font-bold text-slate-500 font-mono">
                          {index + 1}
                        </td>
                        <td className="p-2.5">
                          <select
                            value={row.drumCode}
                            onChange={(e) => handleUpdateRow(index, { drumCode: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                          >
                            {drumMaster.map((d) => (
                              <option key={d.id} value={d.drumCode}>
                                {d.drumCode} · {resolveDrumDescription(d)}
                              </option>
                            ))}
                            {!drumMaster.some((d) => d.drumCode === row.drumCode) && (
                              <option value={row.drumCode}>{row.drumCode}</option>
                            )}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            value={row.noOfDrums}
                            onChange={(e) =>
                              handleUpdateRow(index, {
                                noOfDrums: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            step="50"
                            value={row.cuttingLengthM}
                            onChange={(e) =>
                              handleUpdateRow(index, {
                                cuttingLengthM: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="0"
                            max="10"
                            step="0.5"
                            value={row.drumTolerancePercent}
                            onChange={(e) =>
                              handleUpdateRow(index, {
                                drumTolerancePercent: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              metrics.fillPercent != null && metrics.fillPercent > 100
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {metrics.fillPercent != null ? `${metrics.fillPercent}%` : '—'}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-brand-800">
                          {metrics.nominalLineM.toLocaleString()} m
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-700">
                          {metrics.totalLineWeightKg.toLocaleString()} kg
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            disabled={rows.length <= 1}
                            onClick={() => handleDeleteRow(index)}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Delete Schedule Row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-800 text-xs">
                  <tr>
                    <td colSpan={2} className="p-3 text-right">
                      Aggregated Schedule Totals:
                    </td>
                    <td className="p-3 font-mono text-blue-700">
                      {aggregatedTotalDrums} drums
                    </td>
                    <td colSpan={3} className="p-3 text-right text-slate-500 font-normal">
                      Authoritative Total Length:
                    </td>
                    <td className="p-3 text-right font-mono text-blue-700 font-bold text-sm">
                      {aggregatedTotalLengthMeters.toLocaleString()} m
                    </td>
                    <td colSpan={2} className="p-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Mathematical Formula Footnote */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
            <Scale className="h-4 w-4 text-slate-400 shrink-0" />
            <span>
              <strong>Total Length Calculation:</strong> Total Length = &Sigma;(No. of Drums &times; Cutting Length per Drum) ={' '}
              <strong className="text-brand-800 font-mono">{aggregatedTotalLengthMeters.toLocaleString()} meters</strong> across{' '}
              <strong className="text-brand-800 font-mono">{aggregatedTotalDrums} drums</strong>.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddRow}
              className="px-4 py-2 rounded-xl border border-blue-200 bg-white text-blue-700 font-bold text-xs hover:bg-blue-50 transition-colors"
            >
              + Add Line
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saving ? 'Saving Schedule…' : 'Save Schedule'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
