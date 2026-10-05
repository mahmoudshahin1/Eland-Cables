import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronRight, Sparkles, Hand } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  listDrumCandidatesViaApi,
  optimizeDrumPlanViaApi,
  validateDrumPlanViaApi,
  isDrumPlanApiAborted,
  isDrumPlanApiTimeout,
  type AuthoritativeDrumPlanDto,
  type DrumMasterEngineeringGapDto,
  type EvaluatedDrumCandidateDto,
} from '../../api/drumPlanApi';
import {
  applyAutomaticPlanToCuttingRequirements,
  computeCuttingLengthToleranceBand,
  cuttingLengthRequirementsFromSchedule,
  distinctPositiveCuttingLengths,
  formatSuitableDrumOptionLabel,
  patchDrumScheduleRow,
  planCoversCuttingLengthRequirements,
  resolveManualCandidateListUiState,
  resolveManualFocusRow,
  summarizeUnsuitableReasons,
  totalCableLengthFromDrumSchedule,
  type ManualCandidateFetchFailureKind,
} from '../../domain/drumOptimizationPresentation';
import type { DrumMasterRecord } from '../../types';
import { DrumCuttingScheduleTable, type DrumScheduleRow } from './DrumCuttingScheduleTable';
import { resolveDrumDescription } from '../../services/drumMasterService';
import { evaluateAutoConfirmDrumPlan, evaluateDrumPlanConfirmReadiness, DRUM_PLAN_CONFIRMED_STATUS_LABEL, DRUM_PLAN_NOT_CONFIRMED_STATUS_LABEL } from '../../domain/drumPlanConfirmReadiness';
import { autoConfirmInquiryDrumPlanFromSchedule } from '../../services/confirmInquiryDrumPlanFromSchedule';

export type DrumSelectionMode = 'MANUAL' | 'AUTOMATIC';

/** Panel automatic path — HTTP only. Never runs the local optimization engine. */
export async function requestAutomaticDrumPlanFromPanel(input: {
  cable: { cableDiameterMm: number; approxWeightKgKm: number };
  rows: Array<{ cuttingLengthM?: number | string; noOfDrums?: number | string; numberOfDrums?: number | string }>;
  cableTolerancePercent: number;
  token?: string | null;
  signal?: AbortSignal | null;
}): Promise<AuthoritativeDrumPlanDto> {
  const requirements = cuttingLengthRequirementsFromSchedule(input.rows);
  if (!requirements.length) {
    throw new Error('Enter cutting length and cable tolerance before automatic optimization.');
  }
  const api = await optimizeDrumPlanViaApi(
    {
      cable: input.cable,
      totalOrderLengthM: requirements[0].cuttingLengthM,
      requestedDrumCount: requirements[0].requestedDrumCount,
      requirements: requirements.map((requirement) => ({
        totalOrderLengthM: requirement.cuttingLengthM,
        requestedDrumCount: requirement.requestedDrumCount,
      })),
      cableTolerancePercent: input.cableTolerancePercent,
      drumTolerancePercent: 0,
    },
    { token: input.token, signal: input.signal }
  );
  return api.plan;
}

interface DrumSelectionWorkflowPanelProps {
  cableCode: string;
  cableDescription: string;
  cableDiameterMm: number;
  approxWeightKgKm: number;
  drums: DrumMasterRecord[];
  jwtToken?: string | null;
  rows: DrumScheduleRow[];
  cableTolerancePercent: string;
  onCableToleranceChange: (value: string) => void;
  onRowsChange: (rows: DrumScheduleRow[]) => void;
  onPlanValidityChange: (valid: boolean, plan: AuthoritativeDrumPlanDto | null) => void;
  error: string | null;
  inquiryId?: string | null;
  lineId?: string | null;
  initialLifecycleStatus?: string | null;
  onDrumPlanConfirmed?: () => void;
}

function drumSelectionDebug(message: string, payload?: Record<string, unknown>) {
  try {
    // Dev-only structured diagnostics — no customer PII.
    const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
    if (meta.env?.DEV) {
      console.debug('[drum-selection]', message, payload ?? {});
    }
  } catch {
    /* ignore */
  }
}

export const DrumSelectionWorkflowPanel: React.FC<DrumSelectionWorkflowPanelProps> = ({
  cableCode,
  cableDescription,
  cableDiameterMm,
  approxWeightKgKm,
  drums,
  jwtToken,
  rows,
  cableTolerancePercent,
  onCableToleranceChange,
  onRowsChange,
  onPlanValidityChange,
  error,
  inquiryId = null,
  lineId = null,
  initialLifecycleStatus = null,
  onDrumPlanConfirmed,
}) => {
  const [mode, setMode] = useState<DrumSelectionMode>('MANUAL');
  const [showUnsuitable, setShowUnsuitable] = useState(false);
  const [showIncomplete, setShowIncomplete] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [engineeringGap, setEngineeringGap] = useState<DrumMasterEngineeringGapDto | null>(null);
  const [candidatesByLength, setCandidatesByLength] = useState<
    Record<
      number,
      {
        suitable: EvaluatedDrumCandidateDto[];
        incomplete: EvaluatedDrumCandidateDto[];
        unsuitable: EvaluatedDrumCandidateDto[];
      }
    >
  >({});
  const [autoPlan, setAutoPlan] = useState<AuthoritativeDrumPlanDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [evaluationComplete, setEvaluationComplete] = useState(false);
  const [fetchFailureKind, setFetchFailureKind] = useState<ManualCandidateFetchFailureKind | null>(null);
  const [fetchFailureMessage, setFetchFailureMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [manualRetryToken, setManualRetryToken] = useState(0);
  const [autoRetryToken, setAutoRetryToken] = useState(0);
  const [planLifecycle, setPlanLifecycle] = useState<string | null>(initialLifecycleStatus);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [technicalPlanValid, setTechnicalPlanValid] = useState<boolean | null>(null);

  const onPlanValidityChangeRef = useRef(onPlanValidityChange);
  const onRowsChangeRef = useRef(onRowsChange);
  const drumsRef = useRef(drums);
  const jwtTokenRef = useRef(jwtToken);
  const lastAutoConfirmAttemptKeyRef = useRef('');
  onPlanValidityChangeRef.current = onPlanValidityChange;
  onRowsChangeRef.current = onRowsChange;
  drumsRef.current = drums;
  jwtTokenRef.current = jwtToken;

  const primaryCutting = useMemo(() => {
    const first = rows.find((r) => Number(r.cuttingLengthM) > 0);
    return first ? Number(first.cuttingLengthM) : 0;
  }, [rows]);

  const cuttingLengths = useMemo(() => distinctPositiveCuttingLengths(rows), [rows]);
  const cuttingLengthsKey = cuttingLengths.join('|');
  const focusRow = useMemo(() => resolveManualFocusRow(rows), [rows]);
  const focusCutting = useMemo(() => {
    const n = Number(focusRow?.cuttingLengthM);
    return Number.isFinite(n) && n > 0 ? n : primaryCutting;
  }, [focusRow, primaryCutting]);
  const focusPack = candidatesByLength[focusCutting];
  const suitable = focusPack?.suitable ?? [];
  const incomplete = focusPack?.incomplete ?? [];
  const unsuitable = focusPack?.unsuitable ?? [];
  const totalLengthM = useMemo(() => totalCableLengthFromDrumSchedule(rows), [rows]);

  const cableTol = Number(cableTolerancePercent);
  const cableToleranceReady =
    cableTolerancePercent !== '' && Number.isFinite(cableTol) && cableTol >= 0;
  const band =
    focusCutting > 0 && cableToleranceReady
      ? computeCuttingLengthToleranceBand(focusCutting, cableTol)
      : null;

  const cableInput = useMemo(
    () => ({
      cableDiameterMm,
      approxWeightKgKm,
    }),
    [cableDiameterMm, approxWeightKgKm]
  );

  const confirmReadiness = useMemo(
    () =>
      evaluateDrumPlanConfirmReadiness({
        lifecycleStatus: planLifecycle,
        rows,
        inquiryId,
        lineId,
      }),
    [planLifecycle, rows, inquiryId, lineId]
  );
  const autoConfirmDecision = useMemo(
    () =>
      evaluateAutoConfirmDrumPlan({
        lifecycleStatus: planLifecycle,
        rows,
        inquiryId,
        lineId,
        technicalPlanValid,
      }),
    [planLifecycle, rows, inquiryId, lineId, technicalPlanValid]
  );
  const planConfirmed = confirmReadiness.confirmed;

  useEffect(() => {
    setPlanLifecycle(initialLifecycleStatus);
    lastAutoConfirmAttemptKeyRef.current = '';
  }, [initialLifecycleStatus, inquiryId, lineId]);

  const handleConfirmDrumPlan = async () => {
    if (planConfirmed || confirming) return;
    if (!jwtToken || !inquiryId || !lineId) {
      return;
    }
    if (!autoConfirmDecision.shouldAutoConfirm) {
      setConfirmError(autoConfirmDecision.issues[0]?.message || null);
      return;
    }
    setConfirming(true);
    setConfirmError(null);
    try {
      const result = await autoConfirmInquiryDrumPlanFromSchedule({
        token: jwtToken,
        inquiryId,
        lineId,
        selectionMethod: mode,
        rows,
        cableTolerancePercent,
        technicalPlanValid,
        lifecycleStatus: planLifecycle,
      });
      if (!result.skipped && result.lifecycleStatus === 'CONFIRMED') {
        setPlanLifecycle(result.lifecycleStatus);
        onDrumPlanConfirmed?.();
      } else if (result.skipped && result.lifecycleStatus === 'CONFIRMED') {
        setPlanLifecycle('CONFIRMED');
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Drum plan could not be confirmed.');
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirmDrumPlanRef = useRef(handleConfirmDrumPlan);
  handleConfirmDrumPlanRef.current = handleConfirmDrumPlan;
  const autoConfirmAttemptKey = [
    inquiryId || '',
    lineId || '',
    String(technicalPlanValid),
    String(autoConfirmDecision.shouldAutoConfirm),
    rows
      .map((row) => `${row.drumCode || ''}:${row.cuttingLengthM}:${row.noOfDrums}`)
      .join('|'),
  ].join('/');

  useEffect(() => {
    if (planConfirmed || confirming) return;
    if (!jwtToken || !inquiryId || !lineId) return;
    if (!autoConfirmDecision.shouldAutoConfirm) return;
    if (lastAutoConfirmAttemptKeyRef.current === autoConfirmAttemptKey) return;
    lastAutoConfirmAttemptKeyRef.current = autoConfirmAttemptKey;
    void handleConfirmDrumPlanRef.current();
  }, [
    autoConfirmAttemptKey,
    autoConfirmDecision.shouldAutoConfirm,
    confirming,
    inquiryId,
    jwtToken,
    lineId,
    planConfirmed,
  ]);

  // Manual candidates: keyed only on stable inputs + explicit retry. Never depend on parent
  // callback identities (those caused indefinite recalculation / busy hang).
  useEffect(() => {
    if (mode !== 'MANUAL') return;

    if (!cuttingLengths.length || !cableToleranceReady) {
      setCandidatesByLength({});
      setEngineeringGap(null);
      setEvaluationComplete(false);
      setBusy(false);
      setFetchFailureKind(null);
      setFetchFailureMessage(null);
      setTechnicalPlanValid(null);
      return;
    }

    const ac = new AbortController();
    let ignore = false;
    setBusy(true);
    setEvaluationComplete(false);
    setFetchFailureKind(null);
    setFetchFailureMessage(null);
    setLocalError(null);

    drumSelectionDebug('manual-candidates:start', {
      cableDiameterMm: cableInput.cableDiameterMm,
      approxWeightKgKm: cableInput.approxWeightKgKm,
      cuttingLengthsM: cuttingLengths,
      cableTolerancePercent: cableTol,
      drumCount: drumsRef.current.length,
    });

    void (async () => {
      try {
        const packs = await Promise.all(
          cuttingLengths.map(async (cuttingLengthM) => {
            const api = await listDrumCandidatesViaApi(
              {
                cable: cableInput,
                cuttingLengthM,
                cableTolerancePercent: cableTol,
              },
              { token: jwtTokenRef.current, signal: ac.signal }
            );
            return { cuttingLengthM, api };
          })
        );
        if (ignore || ac.signal.aborted) return;
        const next: typeof candidatesByLength = {};
        for (const pack of packs) {
          next[pack.cuttingLengthM] = {
            suitable: pack.api.suitable,
            incomplete: pack.api.incomplete || [],
            unsuitable: pack.api.unsuitable,
          };
        }
        setCandidatesByLength(next);
        setEngineeringGap(packs[0]?.api.engineeringGap || null);
        setFetchFailureKind(null);
        setFetchFailureMessage(null);
        drumSelectionDebug('manual-candidates:ok', {
          lengths: cuttingLengths,
          suitableByLength: Object.fromEntries(
            cuttingLengths.map((len) => [len, next[len]?.suitable.length || 0])
          ),
        });
      } catch (err) {
        if (ignore || isDrumPlanApiAborted(err) || ac.signal.aborted) return;
        setCandidatesByLength({});
        setEngineeringGap(null);
        if (isDrumPlanApiTimeout(err)) {
          setFetchFailureKind('timeout');
          setFetchFailureMessage(
            err instanceof Error ? err.message : 'Drum calculation timed out. Retry to continue.'
          );
          drumSelectionDebug('manual-candidates:timeout', {});
        } else {
          setFetchFailureKind('error');
          setFetchFailureMessage(
            err instanceof Error ? err.message : 'Drum candidate evaluation failed.'
          );
          drumSelectionDebug('manual-candidates:failed', {
            message: err instanceof Error ? err.message : 'unknown',
          });
        }
      } finally {
        if (!ignore) {
          setBusy(false);
          setEvaluationComplete(true);
        }
      }
    })();

    return () => {
      ignore = true;
      ac.abort();
    };
  }, [
    mode,
    cuttingLengths,
    cuttingLengthsKey,
    cableToleranceReady,
    cableTol,
    cableInput,
    manualRetryToken,
  ]);

  // Manual plan validation — refs for parent callbacks to avoid effect loops.
  useEffect(() => {
    if (mode !== 'MANUAL') return;

    if (!cableToleranceReady) {
      onPlanValidityChangeRef.current(false, null);
      setTechnicalPlanValid(null);
      return;
    }

    const parsed = rows
      .map((r) => ({
        drumCode: String(r.drumCode || '').trim(),
        numberOfDrums: Number(r.noOfDrums),
        cuttingLengthM: Number(r.cuttingLengthM),
        drumTolerancePercent: Number(r.drumTolerancePercent),
      }))
      .filter(
        (r) =>
          r.drumCode &&
          Number.isFinite(r.numberOfDrums) &&
          r.numberOfDrums > 0 &&
          Number.isFinite(r.cuttingLengthM) &&
          r.cuttingLengthM > 0 &&
          Number.isFinite(r.drumTolerancePercent) &&
          r.drumTolerancePercent >= 0
      );

    if (!parsed.length) {
      onPlanValidityChangeRef.current(false, null);
      setTechnicalPlanValid(null);
      return;
    }

    const ac = new AbortController();
    let ignore = false;
    setTechnicalPlanValid(null);

    void (async () => {
      try {
        let plan: AuthoritativeDrumPlanDto;
        try {
          const api = await validateDrumPlanViaApi(
            {
              cable: cableInput,
              cableTolerancePercent: cableTol,
              rows: parsed,
            },
            { token: jwtTokenRef.current, signal: ac.signal }
          );
          plan = api.plan;
        } catch (err) {
          if (isDrumPlanApiAborted(err) || ac.signal.aborted) return;
          if (!ignore) {
            onPlanValidityChangeRef.current(false, null);
            setTechnicalPlanValid(false);
          }
          return;
        }
        if (ignore || ac.signal.aborted) return;
        setTechnicalPlanValid(plan.isValid);
        if (plan.isValid) setLocalError(null);
        onPlanValidityChangeRef.current(plan.isValid, plan);
      } catch {
        if (!ignore) {
          onPlanValidityChangeRef.current(false, null);
          setTechnicalPlanValid(false);
        }
      }
    })();

    return () => {
      ignore = true;
      ac.abort();
    };
  }, [mode, rows, cableToleranceReady, cableTol, cableInput]);

  const runAutomatic = useCallback(async (signal?: AbortSignal) => {
    const requirements = cuttingLengthRequirementsFromSchedule(rows);
    if (!requirements.length || !cableToleranceReady) {
      setLocalError('Enter cutting length and cable tolerance before automatic optimization.');
      onPlanValidityChangeRef.current(false, null);
      setTechnicalPlanValid(null);
      setAutoPlan(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    setLocalError(null);
    setFetchFailureKind(null);
    setFetchFailureMessage(null);
    drumSelectionDebug('automatic:start', {
      requirements,
      physicalDrums: requirements.reduce((acc, req) => acc + req.requestedDrumCount, 0),
      cableDiameterMm: cableInput.cableDiameterMm,
      approxWeightKgKm: cableInput.approxWeightKgKm,
      cableTolerancePercent: cableTol,
      drumCount: drumsRef.current.length,
    });
    try {
      let plan: AuthoritativeDrumPlanDto;
      try {
        plan = await requestAutomaticDrumPlanFromPanel({
          cable: cableInput,
          rows,
          cableTolerancePercent: cableTol,
          token: jwtTokenRef.current,
          signal,
        });
      } catch (err) {
        if (isDrumPlanApiAborted(err) || signal?.aborted) return;
        const timeout = isDrumPlanApiTimeout(err);
        setAutoPlan(null);
        setFetchFailureKind(timeout ? 'timeout' : 'error');
        const message = err instanceof Error
          ? err.message
          : timeout
            ? 'Automatic optimization timed out. Retry to continue.'
            : 'Automatic optimization failed. Retry to continue.';
        setFetchFailureMessage(message);
        setLocalError(message);
        onPlanValidityChangeRef.current(false, null);
        setTechnicalPlanValid(false);
        drumSelectionDebug(timeout ? 'automatic:timeout' : 'automatic:failed', {
          message,
        });
        return;
      }
      if (signal?.aborted) return;
      if (!planCoversCuttingLengthRequirements(plan, rows)) {
        setAutoPlan(plan);
        onPlanValidityChangeRef.current(false, plan);
        setTechnicalPlanValid(false);
        setLocalError(
          plan.blockingReasons[0] ||
            'Automatic optimization did not cover every cutting-length requirement.'
        );
        drumSelectionDebug('automatic:incomplete-coverage', {
          isValid: plan.isValid,
          lines: plan.lines.length,
        });
        return;
      }
      setAutoPlan(plan);
      onRowsChangeRef.current(applyAutomaticPlanToCuttingRequirements(rows, plan));
      onPlanValidityChangeRef.current(plan.isValid, plan);
      setTechnicalPlanValid(plan.isValid);
      if (plan.isValid) setLocalError(null);
      if (!plan.isValid) {
        setLocalError(plan.blockingReasons[0] || 'Automatic optimization could not build a valid drum plan.');
      }
      drumSelectionDebug('automatic:done', {
        isValid: plan.isValid,
        lines: plan.lines.length,
        blocking: plan.blockingReasons[0] || null,
      });
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [rows, cableToleranceReady, cableTol, cableInput]);

  const runAutomaticRef = useRef(runAutomatic);
  runAutomaticRef.current = runAutomatic;

  // Auto runs only on explicit Automatic Optimization / Retry (autoRetryToken). Never on input churn.
  useEffect(() => {
    if (mode !== 'AUTOMATIC' || autoRetryToken === 0) return;
    const ac = new AbortController();
    void runAutomaticRef.current(ac.signal);
    return () => ac.abort();
  }, [mode, autoRetryToken]);

  const startAutomatic = () => {
    if (planConfirmed) return;
    setMode('AUTOMATIC');
    setAutoRetryToken((n) => n + 1);
  };

  const retryManual = () => setManualRetryToken((n) => n + 1);
  const retryAutomatic = () => setAutoRetryToken((n) => n + 1);

  const applyManualDrum = (code: string) => {
    if (planConfirmed) return;
    const target = resolveManualFocusRow(rows) || rows[0];
    const targetId = target?.id;
    const targetCutting =
      Number(target?.cuttingLengthM) > 0 ? target!.cuttingLengthM : focusCutting || '';
    if (!targetId) {
      onRowsChange([
        {
          id: `pkg-${Date.now()}`,
          drumCode: code,
          noOfDrums: 1,
          cuttingLengthM: targetCutting,
          drumTolerancePercent: '0',
        },
      ]);
      return;
    }
    onRowsChange(
      patchDrumScheduleRow<DrumScheduleRow>(rows, targetId, {
        drumCode: code,
        cuttingLengthM: Number(target.cuttingLengthM) > 0 ? target.cuttingLengthM : targetCutting,
        noOfDrums: target.noOfDrums || 1,
        drumTolerancePercent: target.drumTolerancePercent === '' ? '0' : target.drumTolerancePercent,
      })
    );
  };

  const suitableSelectOptionsForRow = (row: DrumScheduleRow) => {
    if (mode !== 'MANUAL') return null;
    const cuttingM = Number(row.cuttingLengthM);
    if (!(cuttingM > 0) || !cableToleranceReady) {
      return [] as Array<{ drumCode: string; label: string }>;
    }
    if (!evaluationComplete || busy || fetchFailureKind) {
      return [] as Array<{ drumCode: string; label: string }>;
    }
    const pack = candidatesByLength[cuttingM];
    if (!pack) return [] as Array<{ drumCode: string; label: string }>;
    return pack.suitable.map((c) => ({
      drumCode: c.drum.drumCode,
      label: formatSuitableDrumOptionLabel({
        drumCode: c.drum.drumCode,
        drumType: c.drum.drumType || resolveDrumDescription(c.drum as DrumMasterRecord),
        maximumUsableLengthM: c.capacity.maximumUsableLengthMeters,
        requestedLengthM: cuttingM,
        lengthUtilizationPercent: c.lengthUtilizationPercent,
        loadUtilizationPercent: c.loadUtilizationPercent,
      }),
    }));
  };

  const suitableSelectEmptyLabelForRow = (row: DrumScheduleRow) => {
    const cuttingM = Number(row.cuttingLengthM);
    if (!(cuttingM > 0) || !cableToleranceReady) return 'Enter cutting length';
    if (!evaluationComplete || busy) return 'Finding suitable drums...';
    if (fetchFailureKind === 'timeout') return 'Calculation timed out — retry';
    if (fetchFailureKind === 'error') return 'Evaluation failed — retry';
    const pack = candidatesByLength[cuttingM];
    if ((pack?.suitable.length || 0) === 0 && (pack?.incomplete.length || 0) > 0) {
      return 'No suitable drums — incomplete engineering data';
    }
    if ((pack?.suitable.length || 0) === 0) return 'No technically suitable drums found';
    return 'Select suitable drum';
  };

  const selectedDrumCode = String(focusRow?.drumCode || '').trim();
  const selectedEvaluation = useMemo(() => {
    if (!selectedDrumCode || !(focusCutting > 0) || !cableToleranceReady) {
      return { isSuitable: null as boolean | null, reasons: [] as string[] };
    }
    const fromList =
      suitable.find((c) => c.drum.drumCode === selectedDrumCode) ||
      incomplete.find((c) => c.drum.drumCode === selectedDrumCode) ||
      unsuitable.find((c) => c.drum.drumCode === selectedDrumCode);
    if (fromList) {
      return {
        isSuitable: fromList.evaluationStatus === 'SUITABLE',
        reasons: fromList.rejectionReasons?.length ? fromList.rejectionReasons : fromList.reasons,
      };
    }
    const master = drums.find((d) => d.drumCode === selectedDrumCode);
    if (!master) {
      return { isSuitable: false, reasons: [`Drum code ${selectedDrumCode} is not in Drum Master.`] };
    }
    return {
      isSuitable: false,
      reasons: [`Drum ${selectedDrumCode} was not in the evaluated candidate list for this cutting length.`],
    };
  }, [
    selectedDrumCode,
    focusCutting,
    cableToleranceReady,
    suitable,
    incomplete,
    unsuitable,
    drums,
    cableInput,
    cableTol,
  ]);

  const listUiState = resolveManualCandidateListUiState({
    hasCuttingLength: focusCutting > 0,
    cableToleranceReady,
    isCalculating: busy && mode === 'MANUAL',
    evaluationComplete: mode === 'MANUAL' ? evaluationComplete : true,
    suitableCount: suitable.length,
    unsuitableCount: unsuitable.length,
    incompleteCount: incomplete.length,
    fetchFailureKind: mode === 'MANUAL' ? fetchFailureKind : null,
    fetchFailureMessage: mode === 'MANUAL' ? fetchFailureMessage : null,
    selectedDrumCode: mode === 'MANUAL' ? selectedDrumCode : null,
    selectedIsSuitable: mode === 'MANUAL' ? selectedEvaluation.isSuitable : null,
    selectedReasons: selectedEvaluation.reasons,
  });

  const unavailableForSummary = useMemo(
    () => [...incomplete, ...unsuitable],
    [incomplete, unsuitable]
  );
  const unsuitableSummary = useMemo(
    () => summarizeUnsuitableReasons(unavailableForSummary),
    [unavailableForSummary]
  );

  const fmt = (n: number | null | undefined, digits = 1) =>
    n == null || !Number.isFinite(n) ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Cutting Length</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <div className="text-slate-500">Cutting length / drum</div>
            <div className="font-bold text-slate-900 dark:text-white">
              {focusCutting > 0 ? `${focusCutting.toLocaleString()} m` : '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Total Length (m)</div>
            <div className="font-bold text-slate-900 dark:text-white">
              {totalLengthM > 0 ? `${totalLengthM.toLocaleString()} m` : '—'}
            </div>
            <div className="text-[10px] text-slate-500">cutting length × number of drums</div>
          </div>
          <div>
            <div className="text-slate-500">Cable tolerance</div>
            <div className="font-bold text-slate-900 dark:text-white">
              {cableToleranceReady ? `±${cableTol}%` : '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Allowed range</div>
            <div className="font-bold text-slate-900 dark:text-white">
              {band
                ? `${band.minimumAllowedLengthM.toLocaleString()} m – ${band.maximumAllowedLengthM.toLocaleString()} m`
                : '—'}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          {cableCode} · Ø {cableDiameterMm || '—'} mm · {approxWeightKgKm || '—'} kg/km · {cableDescription}
        </p>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">Drum Selection</div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={mode === 'MANUAL' ? 'primary' : 'secondary'}
            size="md"
            disabled={planConfirmed}
            onClick={() => {
              if (planConfirmed) return;
              setMode('MANUAL');
              setBusy(false);
              setLocalError(null);
              setFetchFailureKind(null);
              setFetchFailureMessage(null);
            }}
          >
            <Hand className="h-3.5 w-3.5" />
            Manual Selection
          </Button>
          <Button
            type="button"
            variant={mode === 'AUTOMATIC' ? 'primary' : 'secondary'}
            size="md"
            disabled={planConfirmed || (busy && mode === 'AUTOMATIC')}
            onClick={() => startAutomatic()}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Automatic Optimization
          </Button>
        </div>
      </div>

      <DrumCuttingScheduleTable
        rows={rows}
        drums={drums}
        approxWeightKgKm={approxWeightKgKm}
        cableTolerancePercent={cableTolerancePercent}
        onCableToleranceChange={(value) => {
          if (planConfirmed) return;
          onCableToleranceChange(value);
        }}
        cableDiameterMm={cableDiameterMm}
        suitableSelectOptionsForRow={mode === 'MANUAL' ? suitableSelectOptionsForRow : undefined}
        suitableSelectEmptyLabelForRow={mode === 'MANUAL' ? suitableSelectEmptyLabelForRow : undefined}
        addRowDisabled={planConfirmed}
        disabled={planConfirmed}
        onUpdateRow={(id, patch) => {
          if (planConfirmed) return;
          onRowsChange(patchDrumScheduleRow(rows, id, patch));
        }}
        onAddRow={() => {
          if (planConfirmed) return;
          onRowsChange([
            ...rows,
            {
              id: `pkg-${Date.now()}`,
              drumCode: '',
              noOfDrums: 1,
              cuttingLengthM: '',
              drumTolerancePercent: '0',
            },
          ]);
        }}
        onRemoveRow={(id) => {
          if (planConfirmed) return;
          onRowsChange(rows.length <= 1 ? rows : rows.filter((r) => r.id !== id));
        }}
      />

      {mode === 'MANUAL' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Suitable drums</h4>
            <div className="flex items-center gap-2">
              {listUiState.kind === 'CALCULATING' && (
                <span className="text-[11px] text-slate-500">{listUiState.message}</span>
              )}
              {(listUiState.kind === 'TIMEOUT' || listUiState.kind === 'FAILED') && (
                <Button type="button" size="sm" variant="secondary" onClick={retryManual} disabled={busy}>
                  Retry
                </Button>
              )}
            </div>
          </div>
          <p
            className={
              listUiState.kind === 'SELECTED_VALID'
                ? 'text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold'
                : listUiState.kind === 'SELECTED_INVALID' ||
                    listUiState.kind === 'NONE_SUITABLE' ||
                    listUiState.kind === 'NONE_SUITABLE_WITH_INCOMPLETE' ||
                    listUiState.kind === 'TIMEOUT' ||
                    listUiState.kind === 'FAILED'
                  ? 'text-[11px] text-amber-700 dark:text-amber-300'
                  : 'text-[11px] text-slate-600 dark:text-slate-300'
            }
          >
            {listUiState.message}
            {listUiState.kind === 'SELECTED_INVALID' && listUiState.reason
              ? ` ${listUiState.reason}`
              : ''}
            {listUiState.kind === 'NONE_SUITABLE' && (listUiState.unsuitableCount || 0) > 0
              ? ` (${listUiState.unsuitableCount} fully evaluated — expand reasons below).`
              : ''}
          </p>
          {suitable.length > 0 && evaluationComplete && !busy && !fetchFailureKind ? (
            <ul className="space-y-2">
              {suitable.map((c) => {
                const open = expandedCode === c.drum.drumCode;
                return (
                  <li
                    key={c.drum.drumCode}
                    className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button
                        type="button"
                        className="text-left min-w-0"
                        onClick={() => setExpandedCode(open ? null : c.drum.drumCode)}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          {c.drum.drumCode}
                        </div>
                        <div className="text-[11px] text-slate-500 pl-5">
                          {resolveDrumDescription(c.drum as DrumMasterRecord)}
                        </div>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Suitable
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          disabled={planConfirmed}
                          onClick={() => applyManualDrum(c.drum.drumCode)}
                        >
                          Select
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pl-5">
                      <div>
                        <span className="text-slate-500">Max usable</span>
                        <div className="font-bold">{fmt(c.capacity.maximumUsableLengthMeters, 0)} m</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Requested</span>
                        <div className="font-bold">{fmt(focusCutting, 0)} m</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Length utilization</span>
                        <div className="font-bold">{fmt(c.lengthUtilizationPercent)}%</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Load utilization</span>
                        <div className="font-bold">{fmt(c.loadUtilizationPercent)}%</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Capacity / MaxLoad</span>
                        <div className="font-bold">
                          {fmt(c.drum.capacity, 0)} / {fmt(c.drum.maxWeight, 0)}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Empty weight</span>
                        <div className="font-bold">
                          {c.capacity.emptyDrumNetWeightKg != null
                            ? `${fmt(c.capacity.emptyDrumNetWeightKg)} kg`
                            : 'Pending logistics'}
                        </div>
                      </div>
                    </div>
                    {c.warnings?.length ? (
                      <p className="mt-2 pl-5 text-[11px] text-amber-700 dark:text-amber-300">
                        {c.warnings
                          .map((w) =>
                            /Empty drum weight not configured/i.test(w)
                              ? 'Empty drum weight pending logistics (does not block Add Line).'
                              : w
                          )
                          .join(' · ')}
                      </p>
                    ) : null}
                    {open && (
                      <div className="mt-2 pl-5 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                        <div>Cable weight: {fmt(c.cableWeightKg)} kg</div>
                        <div>
                          Empty drum:{' '}
                          {c.capacity.emptyDrumNetWeightKg != null
                            ? `${fmt(c.capacity.emptyDrumNetWeightKg)} kg`
                            : 'Pending logistics'}
                        </div>
                        <div>Gross loaded: {fmt(c.grossLoadedDrumWeightKg)} kg</div>
                        <div>
                          Windings / layers: {c.capacity.windingsPerLayer ?? '—'} / {c.capacity.layers ?? '—'}
                        </div>
                        <div>
                          Geo / load-limited:{' '}
                          {fmt(c.capacity.geometricalCapacityMeters, 0)} m /{' '}
                          {fmt(c.capacity.loadLimitedCapacityMeters, 0)} m
                        </div>
                        <div className="text-slate-500">{c.decision}</div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {incomplete.length > 0 && (
              <button
                type="button"
                className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 underline"
                onClick={() => setShowIncomplete((v) => !v)}
              >
                {showIncomplete
                  ? 'Hide incomplete drums'
                  : `Show incomplete (${incomplete.length})`}
              </button>
            )}
            <button
              type="button"
              className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 underline"
              onClick={() => setShowUnsuitable((v) => !v)}
            >
              {showUnsuitable
                ? 'Hide unsuitable / Why unavailable'
                : 'Show unsuitable / Why isn’t my drum available?'}
            </button>
          </div>
          {showIncomplete && (
            <div className="space-y-2">
              {engineeringGap && engineeringGap.rootCause === 'MASTER_DATA_COMPLETENESS' && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-[11px] space-y-1">
                  <div className="font-semibold text-amber-900 dark:text-amber-200">
                    Technical Office — master data gap
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    Active drums: {engineeringGap.activeDrumCount}. Clearance populated:{' '}
                    {engineeringGap.populated.clearanceMm}/{engineeringGap.activeDrumCount}. MaxLoad
                    populated: {engineeringGap.populated.maxLoadKg}/{engineeringGap.activeDrumCount}.
                    Empty weight (logistics only): {engineeringGap.populated.emptyDrumNetWeightKg}/
                    {engineeringGap.activeDrumCount}.
                  </div>
                  <div className="text-slate-600 dark:text-slate-300">
                    TO rule: Excel <span className="font-semibold">Capacity</span> maps to MaxLoad (
                    {engineeringGap.capacityUomNote}; Capacity column preserved). Required template
                    columns: {engineeringGap.importTemplateColumns.join(', ')}.
                  </div>
                  <ul className="list-disc pl-4 text-slate-600 dark:text-slate-300">
                    {engineeringGap.minimumMasterDataUpdate.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {incomplete.map((c) => (
                  <li
                    key={c.drum.drumCode}
                    className="rounded-xl border border-amber-200 dark:border-amber-900 p-3 text-[11px]"
                  >
                    <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      {c.drum.drumCode}
                      <span className="font-normal text-amber-700 dark:text-amber-300">
                        · INCOMPLETE_ENGINEERING_DATA
                      </span>
                    </div>
                    <div className="mt-1 text-slate-500">
                      Missing: {(c.missingFields || []).join(', ') || 'engineering fields'}
                      {' · '}clearance {c.drum.clearanceMm ?? 'n/a'} · MaxLoad {c.drum.maxWeight ?? 'n/a'}
                    </div>
                    <ul className="mt-1 list-disc pl-4 text-slate-600 dark:text-slate-300">
                      {(c.rejectionReasons || c.reasons).map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                    <div className="mt-1 text-slate-500">{c.decision}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showUnsuitable && (
            <div className="space-y-2">
              {unsuitableSummary.length > 0 && (
                <ul className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 text-[11px] space-y-1">
                  <li className="font-semibold text-slate-700 dark:text-slate-200">
                    Why isn’t my drum available? (summary)
                  </li>
                  {unsuitableSummary.map((row) => (
                    <li key={row.reason} className="text-slate-600 dark:text-slate-300">
                      {row.count}× — {row.reason}
                    </li>
                  ))}
                </ul>
              )}
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {unsuitable.map((c) => (
                  <li
                    key={c.drum.drumCode}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-[11px]"
                  >
                    <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      {c.drum.drumCode}
                      <span className="font-normal text-slate-500">
                        · UNSUITABLE · usable {c.capacity.maximumUsableLengthMeters ?? 'n/a'} m · req max{' '}
                        {c.diagnostic?.requiredMaximumLengthM ?? '—'} m
                      </span>
                    </div>
                    <ul className="mt-1 list-disc pl-4 text-slate-600 dark:text-slate-300">
                      {(c.rejectionReasons || c.reasons).map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                    <div className="mt-1 text-slate-500">{c.decision}</div>
                  </li>
                ))}
                {evaluationComplete && unsuitable.length === 0 && incomplete.length === 0 && !fetchFailureKind && (
                  <li className="text-[11px] text-slate-500">No unsuitable drums to list for this evaluation.</li>
                )}
                {evaluationComplete && unsuitable.length === 0 && incomplete.length > 0 && !fetchFailureKind && (
                  <li className="text-[11px] text-slate-500">
                    No fully evaluated unsuitable drums — open “Show incomplete” for missing MaxLoad / clearance.
                  </li>
                )}
                {fetchFailureKind && (
                  <li className="text-[11px] text-amber-700 dark:text-amber-300">
                    Candidate list unavailable ({fetchFailureKind}). Use Retry after fixing the issue.
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {mode === 'AUTOMATIC' && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-900 bg-brand-50/40 dark:bg-brand-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Recommended Drum Plan</h4>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy || planConfirmed}
              onClick={() => retryAutomatic()}
            >
              {fetchFailureKind || !autoPlan ? 'Retry' : 'Recalculate'}
            </Button>
          </div>
          {autoPlan?.isValid ? (
            <ul className="space-y-2">
              {autoPlan.lines.map((line) => (
                <li
                  key={`${line.drumCode}-${line.cuttingLengthM}-${line.numberOfDrums}`}
                  className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 text-xs"
                >
                  <div className="font-bold text-slate-900 dark:text-white">
                    {line.numberOfDrums} × {line.drumCode} · {line.cuttingLengthM.toLocaleString()} m per drum
                  </div>
                  <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      Max usable: <span className="font-bold">{fmt(line.maximumUsableLengthM, 0)} m</span>
                    </div>
                    <div>
                      Length util:{' '}
                      <span className="font-bold">{fmt(line.lengthUtilizationPercent)}%</span>
                    </div>
                    <div>
                      Cable wt: <span className="font-bold">{fmt(line.cableWeightKg)} kg</span>
                    </div>
                    <div>
                      Gross:{' '}
                      <span className="font-bold">
                        {fmt(line.grossLoadedDrumWeightKg)} kg
                        {line.emptyDrumNetWeightKg == null ? ' (empty wt n/a)' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="mt-1 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Suitable · {autoPlan.selectionMethod || autoPlan.method}
                  </div>
                </li>
              ))}
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Total: <span className="font-bold">{autoPlan.totalLengthM.toLocaleString()} m</span>
              </p>
              {autoPlan.rankingNotes.length > 0 && (
                <p className="text-[10px] text-slate-500">{autoPlan.rankingNotes[0]}</p>
              )}
            </ul>
          ) : (
            <p className="text-[11px] text-amber-800 dark:text-amber-200">
              {busy
                ? 'Finding suitable drums...'
                : fetchFailureKind === 'timeout'
                  ? fetchFailureMessage || 'Automatic optimization timed out. Retry to continue.'
                  : autoPlan?.blockingReasons?.[0] ||
                    (autoRetryToken === 0
                      ? 'Click Automatic Optimization to run the drum plan. Drums need MaxLoad and clearance (when Ø≤50) configured.'
                      : autoPlan?.outcome === 'NO_SUITABLE_WITH_INCOMPLETE_CANDIDATES'
                        ? 'No suitable automatic plan — some drums have incomplete engineering data (clearance / MaxLoad). Configure Drum Master or use Manual Selection.'
                        : 'No suitable automatic plan — all drums were fully evaluated and rejected. Use Manual Selection or adjust cutting length.')}
            </p>
          )}
        </div>
      )}

      <div
        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2"
        data-drum-plan-status={planConfirmed ? 'CONFIRMED' : 'NOT_CONFIRMED'}
      >
        {planConfirmed ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" />
              {DRUM_PLAN_CONFIRMED_STATUS_LABEL}
            </p>
            <p className="text-[11px] text-slate-500">
              Confirmed plan cannot be edited in place. Create a new version to supersede it.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                {DRUM_PLAN_NOT_CONFIRMED_STATUS_LABEL}
              </p>
              <p className="text-[11px] text-slate-500">
                {confirming
                  ? 'Saving the physical drum plan…'
                  : 'Select a valid cutting length and drum. Container Study requires a CONFIRMED plan.'}
              </p>
            </div>
          </div>
        )}
        {!planConfirmed &&
          autoConfirmDecision.issues.some((issue) => issue.code !== 'SCOPE_REQUIRED') && (
          <p className="text-[11px] text-amber-800 dark:text-amber-200">
            {autoConfirmDecision.issues.find((issue) => issue.code !== 'SCOPE_REQUIRED')?.message}
          </p>
        )}
        {confirmError && <p className="text-error-600 font-semibold text-xs">{confirmError}</p>}
      </div>

      {(error || localError) && (
        <p className="text-error-600 font-semibold text-xs">{error || localError}</p>
      )}
    </div>
  );
};
