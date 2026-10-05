import React, { useCallback, useEffect, useState } from 'react';
import { CableRecordV2 } from '../types';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { Package, CheckCircle2, AlertCircle, Sparkles, Hand } from 'lucide-react';
import type { DrumSelectionHandoffDto } from '../../../../services/v2CuttingLengthApiService';
import {
  confirmV2DrumPlan,
  createDraftV2DrumPlan,
  fetchV2CurrentDrumPlan,
  fetchV2DrumSelectionCandidates,
  fetchV2DrumSelectionContext,
  previewV2DrumPlan,
  validateV2DrumPlan,
  type V2DrumPlanDto,
} from '../../../../services/v2DrumPlanApiService';

export const V2_DRUM_AUTOMATIC_CONTROL_LABEL = 'Automatic Drum Selection';
export const V2_DRUM_MANUAL_CONTROL_LABEL = 'Manual Drum Selection';

type DrumUiMode = 'AUTOMATIC' | 'MANUAL';

type CandidateRow = {
  drum?: { drumCode?: string };
  evaluationStatus?: string;
};

type CandidateGroups = {
  suitable?: CandidateRow[];
  incomplete?: CandidateRow[];
  unsuitable?: CandidateRow[];
};

interface DrumSelectionSectionV2Props {
  resolvedCable: CableRecordV2;
  handoff: DrumSelectionHandoffDto | null;
  inquiryId?: string;
  lineId?: string;
  jwtToken?: string | null;
  onPlanSaved?: () => void;
  onDrumPlanConfirmed?: (confirmed: boolean) => void;
}

function drumCodeOf(row: CandidateRow): string {
  return String(row.drum?.drumCode || '').trim();
}

export const DrumSelectionSectionV2: React.FC<DrumSelectionSectionV2Props> = ({
  resolvedCable,
  handoff,
  inquiryId,
  lineId,
  jwtToken,
  onPlanSaved,
  onDrumPlanConfirmed,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiMode, setUiMode] = useState<DrumUiMode>('AUTOMATIC');
  const [preview, setPreview] = useState<{ isValid: boolean; lineCount: number; method: DrumUiMode } | null>(
    null
  );
  const [drumPlan, setDrumPlan] = useState<V2DrumPlanDto | null>(null);
  const [contextHandoff, setContextHandoff] = useState<DrumSelectionHandoffDto | null>(handoff);
  const [candidates, setCandidates] = useState<CandidateGroups | null>(null);
  const [selectedDrumCode, setSelectedDrumCode] = useState<string | null>(null);

  const canAct = Boolean(jwtToken && inquiryId && lineId && contextHandoff?.drumHandoffReady);
  const confirmed = drumPlan?.lifecycleStatus === 'CONFIRMED';

  useEffect(() => {
    if (!jwtToken || !inquiryId || !lineId) return;
    void fetchV2DrumSelectionContext(jwtToken, inquiryId, lineId)
      .then((ctx: { handoff: DrumSelectionHandoffDto }) => setContextHandoff(ctx.handoff))
      .catch(() => undefined);
    void fetchV2CurrentDrumPlan(jwtToken, inquiryId, lineId)
      .then((plan) => {
        setDrumPlan(plan);
        if (plan?.selectionMethod === 'MANUAL' || plan?.selectionMethod === 'AUTOMATIC') {
          setUiMode(plan.selectionMethod);
        }
      })
      .catch(() => undefined);
  }, [jwtToken, inquiryId, lineId, handoff]);

  const loadManualCandidates = useCallback(async () => {
    if (!canAct || !jwtToken || !inquiryId || !lineId) return;
    setLoading(true);
    setError(null);
    try {
      const result = (await fetchV2DrumSelectionCandidates(jwtToken, inquiryId, lineId)) as {
        candidates?: CandidateGroups;
      };
      setCandidates(result.candidates || { suitable: [], incomplete: [], unsuitable: [] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canAct, jwtToken, inquiryId, lineId]);

  useEffect(() => {
    if (uiMode === 'MANUAL' && !confirmed) {
      void loadManualCandidates();
    }
  }, [uiMode, confirmed, loadManualCandidates]);

  const manualRows = () => {
    if (!selectedDrumCode || !contextHandoff) return [];
    return [
      {
        drumCode: selectedDrumCode,
        numberOfDrums: Math.max(1, contextHandoff.requestedDrumCount || 1),
        cuttingLengthM: contextHandoff.cuttingLengthMeters,
      },
    ];
  };

  const runPreview = useCallback(async () => {
    if (!canAct || !jwtToken || !inquiryId || !lineId) return;
    if (uiMode === 'MANUAL' && !selectedDrumCode) {
      setError('Select an existing drum for Manual Drum Selection.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await previewV2DrumPlan(jwtToken, inquiryId, lineId, {
        selectionMethod: uiMode,
        ...(uiMode === 'MANUAL' ? { rows: manualRows() } : {}),
      });
      setPreview({ isValid: result.plan.isValid, lineCount: result.plan.lines.length, method: uiMode });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canAct, jwtToken, inquiryId, lineId, uiMode, selectedDrumCode, contextHandoff]);

  const handleCreateDraft = async () => {
    if (!canAct || !jwtToken || !inquiryId || !lineId) return;
    if (uiMode === 'MANUAL' && !selectedDrumCode) {
      setError('Select an existing drum for Manual Drum Selection.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await createDraftV2DrumPlan(jwtToken, inquiryId, lineId, {
        selectionMethod: uiMode,
        ...(uiMode === 'MANUAL' ? { rows: manualRows() } : {}),
      });
      setDrumPlan(result.drumPlan);
      onPlanSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!drumPlan || !jwtToken || !inquiryId || !lineId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await validateV2DrumPlan(jwtToken, inquiryId, lineId, drumPlan.planId);
      setDrumPlan(result.drumPlan);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    onDrumPlanConfirmed?.(drumPlan?.lifecycleStatus === 'CONFIRMED');
  }, [drumPlan?.lifecycleStatus, onDrumPlanConfirmed]);

  const handleConfirm = async () => {
    if (!drumPlan || !jwtToken || !inquiryId || !lineId) return;
    if (confirmed) return;
    setLoading(true);
    setError(null);
    try {
      let current = drumPlan;
      if (current.lifecycleStatus === 'DRAFT') {
        const validated = await validateV2DrumPlan(jwtToken, inquiryId, lineId, current.planId);
        current = validated.drumPlan;
        setDrumPlan(current);
        if (current.validationStatus === 'ERROR') {
          setError('Drum plan has unresolved validation errors and cannot be confirmed.');
          return;
        }
      }
      const result = await confirmV2DrumPlan(jwtToken, inquiryId, lineId, current.planId);
      setDrumPlan(result.drumPlan);
      onPlanSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!contextHandoff?.drumHandoffReady) {
    return (
      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 opacity-60 text-center space-y-2">
        <Package className="h-5 w-5 mx-auto text-slate-500" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 font-display">
          Drum Selection & Packaging Plan
        </h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Save a cutting length plan first — drum selection requires a valid handoff from the cutting plan.
        </p>
      </div>
    );
  }

  const suitable = candidates?.suitable || [];

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
            <Package className="h-4 w-4 text-brand-500" />
            Drum Selection & Packaging Plan
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            {resolvedCable.cableCode} · {contextHandoff.cuttingLengthMeters} m total · Ø{' '}
            {contextHandoff.cableDiameterMm} mm
          </p>
        </div>
        {drumPlan && (
          <Badge variant={drumPlan.lifecycleStatus === 'CONFIRMED' ? 'success' : 'default'}>
            {drumPlan.lifecycleStatus} · {drumPlan.selectionMethod} · v{drumPlan.versionNo}
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Drum selection method">
        <Button
          type="button"
          size="sm"
          variant={uiMode === 'AUTOMATIC' ? 'primary' : 'secondary'}
          disabled={loading || confirmed}
          onClick={() => setUiMode('AUTOMATIC')}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          {V2_DRUM_AUTOMATIC_CONTROL_LABEL}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={uiMode === 'MANUAL' ? 'primary' : 'secondary'}
          disabled={loading || confirmed}
          onClick={() => setUiMode('MANUAL')}
        >
          <Hand className="h-3.5 w-3.5 mr-1" />
          {V2_DRUM_MANUAL_CONTROL_LABEL}
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-error-50 dark:bg-error-950/30 border border-error-200 text-error-700 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {uiMode === 'AUTOMATIC' && !confirmed && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Automatic: calculate using existing Drum Master engineering data, review the draft, then confirm.
        </p>
      )}

      {uiMode === 'MANUAL' && !confirmed && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Manual: select an existing Drum Master code, review the draft, then confirm.
          </p>
          <label className="block text-xs font-semibold text-slate-700" htmlFor="v2-manual-drum-code">
            Existing drum
          </label>
          <select
            id="v2-manual-drum-code"
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
            value={selectedDrumCode || ''}
            disabled={loading}
            onChange={(e) => setSelectedDrumCode(e.target.value || null)}
          >
            <option value="">Select a suitable drum…</option>
            {suitable.map((row) => {
              const code = drumCodeOf(row);
              return (
                <option key={code} value={code}>
                  {code}
                </option>
              );
            })}
          </select>
          {suitable.length === 0 && candidates && (
            <p className="text-xs text-amber-800">
              No suitable drums for this cutting length. Adjust cutting or review Drum Master engineering data.
            </p>
          )}
        </div>
      )}

      {drumPlan ? (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-500 block">Validation</span>
              <strong>{drumPlan.validationStatus}</strong>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-500 block">Drums</span>
              <strong>{drumPlan.drumCount}</strong>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-500 block">Scheduled</span>
              <strong>{drumPlan.totalPlannedLengthM} m</strong>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-500 block">Remainder</span>
              <strong>{drumPlan.remainderLengthM} m</strong>
            </div>
          </div>
          {drumPlan.lines.length > 0 && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-1 pr-2">Drum</th>
                  <th className="py-1 pr-2">Qty</th>
                  <th className="py-1 pr-2">Cut (m)</th>
                  <th className="py-1">Planned (m)</th>
                </tr>
              </thead>
              <tbody>
                {drumPlan.lines.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-2 font-mono">{l.drumCode}</td>
                    <td className="py-1 pr-2">{l.numberOfDrums}</td>
                    <td className="py-1 pr-2">{l.cuttingLengthM}</td>
                    <td className="py-1">{l.plannedCableLengthM}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap gap-2">
            {drumPlan.lifecycleStatus === 'DRAFT' && (
              <Button size="sm" variant="secondary" onClick={handleValidate} disabled={loading || confirmed}>
                Validate plan
              </Button>
            )}
            {(drumPlan.lifecycleStatus === 'DRAFT' || drumPlan.lifecycleStatus === 'VALIDATED') &&
              drumPlan.validationStatus !== 'ERROR' && (
                <Button size="sm" onClick={() => void handleConfirm()} disabled={loading || confirmed}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Confirm Drum Plan
                </Button>
              )}
            {confirmed && (
              <p className="text-xs text-emerald-800 self-center">
                Drum Plan: CONFIRMED. Confirmed plan cannot be edited in place.
              </p>
            )}
            {!confirmed && drumPlan.selectionMethod !== uiMode && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void runPreview()} disabled={!canAct || loading}>
                  Review {uiMode === 'AUTOMATIC' ? 'automatic' : 'manual'} plan
                </Button>
                <Button size="sm" onClick={() => void handleCreateDraft()} disabled={!canAct || loading}>
                  Save new draft ({uiMode === 'AUTOMATIC' ? 'automatic' : 'manual'})
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {preview && (
            <p className="text-xs text-slate-500">
              Preview ({preview.method}): {preview.lineCount} line(s) · {preview.isValid ? 'valid' : 'invalid / incomplete'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void runPreview()} disabled={!canAct || loading}>
              Review {uiMode === 'AUTOMATIC' ? 'automatic' : 'manual'} plan
            </Button>
            <Button size="sm" onClick={() => void handleCreateDraft()} disabled={!canAct || loading}>
              Save draft ({uiMode === 'AUTOMATIC' ? 'automatic' : 'manual'})
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
