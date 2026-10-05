import React, { useState } from 'react';
import { CableRecordV2 } from '../types';
import { CustomerPortalTab } from '../../../../types';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { Input, Select } from '../../../ui/Form';
import {
  Ruler,
  Scale,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { persistV2CuttingLengthPlan, previewV2CuttingLengthPlan } from '../../../../services/v2CuttingLengthApiService';
import type { DrumSelectionHandoffDto } from '../../../../services/v2CuttingLengthApiService';
import {
  computeDirectedToleranceBounds,
  type CuttingLengthToleranceMode,
} from '../../../../domain/cuttingLengthTolerance';

const TOLERANCE_MODE_OPTIONS: { label: string; mode: CuttingLengthToleranceMode }[] = [
  { label: 'None (exact length)', mode: 'NONE' },
  { label: 'Positive (+ only)', mode: 'POSITIVE' },
  { label: 'Negative (− only)', mode: 'NEGATIVE' },
  { label: 'Symmetric (±)', mode: 'SYMMETRIC' },
];

const TOLERANCE_PERCENT_OPTIONS = [0.5, 1, 2];

interface CuttingLengthSectionV2Props {
  resolvedCable: CableRecordV2 | null;
  onNavigateTab?: (tab: CustomerPortalTab) => void;
  configurationSnapshotId?: string;
  inquiryId?: string;
  lineId?: string;
  jwtToken?: string | null;
  onPlanSaved?: () => void;
  onHandoffReady?: (handoff: DrumSelectionHandoffDto) => void;
}

export const CuttingLengthSectionV2: React.FC<CuttingLengthSectionV2Props> = ({
  resolvedCable,
  onNavigateTab,
  configurationSnapshotId,
  inquiryId,
  lineId,
  jwtToken,
  onPlanSaved,
  onHandoffReady,
}) => {
  const [nominalLengthM, setNominalLengthM] = useState<number>(500);
  const [toleranceMode, setToleranceMode] = useState<CuttingLengthToleranceMode>('SYMMETRIC');
  const [tolerancePercent, setTolerancePercent] = useState<number>(1);
  const [requestedDrumCount, setRequestedDrumCount] = useState<number>(1);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [validationStatus, setValidationStatus] = useState<string | null>(null);
  const [handoffPreview, setHandoffPreview] = useState<DrumSelectionHandoffDto | null>(null);
  const [previewing, setPreviewing] = useState(false);

  if (!resolvedCable) {
    return (
      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 opacity-60 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
          <Ruler className="h-5 w-5" />
        </div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 font-display">
          Cutting Length & Production Drum Assignment
        </h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Unlocks automatically once a valid approved cable master record is resolved above.
        </p>
      </div>
    );
  }

  const netWeightKg = (resolvedCable.approxWeightKgKm * nominalLengthM) / 1000;
  const bounds = computeDirectedToleranceBounds({
    nominalLengthM,
    mode: toleranceMode,
    positivePercent: tolerancePercent,
    negativePercent: tolerancePercent,
  });
  const minLengthM = bounds.minLengthM;
  const maxLengthM = bounds.maxLengthM;
  const canSave = Boolean(jwtToken && inquiryId && lineId && configurationSnapshotId);

  const cuttingInput = () => ({
    configurationSnapshotId,
    nominalLengthM,
    toleranceMode,
    tolerancePercent: toleranceMode === 'NONE' ? 0 : tolerancePercent,
    positiveTolerancePercent: toleranceMode === 'NEGATIVE' || toleranceMode === 'NONE' ? 0 : tolerancePercent,
    negativeTolerancePercent: toleranceMode === 'POSITIVE' || toleranceMode === 'NONE' ? 0 : tolerancePercent,
    requestedDrumCount,
    notes: notes.trim() || undefined,
  });

  const handlePreviewPlan = async () => {
    if (!canSave || !jwtToken || !inquiryId || !lineId) {
      setSaveError('Sign in and save a configuration snapshot before previewing cutting length.');
      return;
    }
    setPreviewing(true);
    setSaveError(null);
    try {
      const result = await previewV2CuttingLengthPlan(jwtToken, inquiryId, lineId, cuttingInput());
      setValidationStatus(result.validation.validationStatus);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSavePlan = async (addRequirement = false) => {
    if (!canSave || !jwtToken || !inquiryId || !lineId) {
      setSaveError('Save configuration snapshot on the server before persisting cutting length.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const result = await persistV2CuttingLengthPlan(jwtToken, inquiryId, lineId, {
        configurationSnapshotId,
        nominalLengthM,
        toleranceMode,
        tolerancePercent: toleranceMode === 'NONE' ? 0 : tolerancePercent,
        positiveTolerancePercent: toleranceMode === 'NEGATIVE' || toleranceMode === 'NONE' ? 0 : tolerancePercent,
        negativeTolerancePercent: toleranceMode === 'POSITIVE' || toleranceMode === 'NONE' ? 0 : tolerancePercent,
        requestedDrumCount,
        addRequirement,
        notes: notes.trim() || undefined,
      });
      setSavedPlanId(result.plan.planId);
      setValidationStatus(result.plan.validationStatus);
      setHandoffPreview(result.handoff);
      onHandoffReady?.(result.handoff);
      onPlanSaved?.();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-brand-500/30 dark:border-brand-500/20 shadow-sm space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-brand-500 text-white shrink-0 shadow-xs">
            <Ruler className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900 dark:text-white font-display">
              Cutting Length & Logistics Packaging
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure production length for resolved Material #{resolvedCable.materialNumber}
              {configurationSnapshotId ? ` · snapshot ${configurationSnapshotId.slice(0, 12)}…` : ''}.
            </p>
          </div>
        </div>

        <Badge tone="brand" className="self-start sm:self-auto font-bold py-1 px-2.5">
          Step 5: Persist Cutting Plan
        </Badge>
      </div>

      {!canSave && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Sign in and save a configuration snapshot on the server before persisting cutting length.
            localStorage draft items are cache-only and not authoritative.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
            <span>Nominal Cutting Length (m)</span>
            <span className="font-mono text-brand-600 dark:text-brand-400">{nominalLengthM} m</span>
          </label>
          <Input
            type="number"
            min={50}
            max={5000}
            step={50}
            value={nominalLengthM}
            onChange={(e) => setNominalLengthM(Math.max(10, parseInt(e.target.value, 10) || 500))}
          />
          <div className="flex gap-1 pt-1">
            {[250, 500, 1000, 2000].map((len) => (
              <button
                key={len}
                type="button"
                onClick={() => setNominalLengthM(len)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${
                  nominalLengthM === len
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-brand-50'
                }`}
              >
                {len}m
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Tolerance direction
          </label>
          <Select
            value={toleranceMode}
            onChange={(e) => setToleranceMode(e.target.value as CuttingLengthToleranceMode)}
          >
            {TOLERANCE_MODE_OPTIONS.map((opt) => (
              <option key={opt.mode} value={opt.mode}>
                {opt.label}
              </option>
            ))}
          </Select>
          {toleranceMode !== 'NONE' && (
            <Select
              value={String(tolerancePercent)}
              onChange={(e) => setTolerancePercent(Number(e.target.value))}
            >
              {TOLERANCE_PERCENT_OPTIONS.map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </Select>
          )}
          <p className="text-[10px] text-slate-500">
            Range: {minLengthM} – {maxLengthM} m
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Requested number of drums
          </label>
          <Input
            type="number"
            min={1}
            step={1}
            value={requestedDrumCount}
            onChange={(e) => setRequestedDrumCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
          <p className="text-[10px] text-slate-500">
            Does not change drum type. Selects {requestedDrumCount} physical drum(s) of the length above.
          </p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Notes</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Special requirements (optional)"
          />
        </div>

        <div className="p-3 bg-brand-50/60 dark:bg-brand-950/40 rounded-xl border border-brand-200 dark:border-brand-900/60 flex flex-col justify-between sm:col-span-2 lg:col-span-4">
          <span className="text-[10px] font-bold uppercase text-brand-700 dark:text-brand-300 flex items-center gap-1">
            <Scale className="h-3.5 w-3.5" />
            Estimated net cable weight (no drum tare)
          </span>
          <p className="text-base font-bold text-brand-900 dark:text-brand-100 font-mono">
            {netWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg
          </p>
        </div>
      </div>

      {(savedPlanId || validationStatus) && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
          <p className="font-semibold flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            Plan saved: {savedPlanId} · {validationStatus}
          </p>
          {handoffPreview && (
            <p className="text-emerald-800">
              Drum handoff ready: {handoffPreview.drumHandoffReady ? 'yes' : 'no'} · Ø{' '}
              {handoffPreview.cableDiameterMm ?? '—'} mm · {handoffPreview.cableWeightKgKm ?? '—'} kg/km
            </p>
          )}
        </div>
      )}

      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{saveError}</div>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>Cutting plans are versioned and linked to the configuration snapshot.</span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            variant="secondary"
            size="md"
            onClick={() => void handlePreviewPlan()}
            disabled={previewing || saving || !canSave}
            className="w-full sm:w-auto"
          >
            {previewing ? 'Previewing…' : 'Preview (server)'}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => void handleSavePlan(false)}
            disabled={saving || !canSave}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? 'Saving…' : 'Save cutting length plan'}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => void handleSavePlan(true)}
            disabled={saving || !canSave}
            className="w-full sm:w-auto"
          >
            Add another cutting length
          </Button>

          {onNavigateTab && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => onNavigateTab('price_estimation')}
              trailingIcon={ArrowRight}
            >
              View Inquiries
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
