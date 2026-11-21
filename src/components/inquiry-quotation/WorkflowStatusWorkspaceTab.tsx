import React, { useEffect, useState, useMemo } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  User,
  GitBranch,
  RotateCcw,
  RefreshCw,
  Info,
} from 'lucide-react';
import {
  fetchWorkflowForInquiry,
  submitWorkflowPoValidation,
  transitionWorkflowInstance,
  type WorkflowInstanceSummary,
  type WorkflowStageTimingSummary,
  type WorkflowEventSummary,
} from '../../services/workflowApiService';
import { clarificationAdvanceCode, forwardStageAction, stageOwnerLabel } from '../../domain/standardInquiryV2';
import { readAccessToken } from '../../auth/tokenStorage';

export interface WorkflowStatusWorkspaceTabProps {
  inquiryId: string;
  inquiryNumber: string;
  isCustomer?: boolean;
  jwtToken?: string;
  onSelectTab?: (tab: string) => void;
}

function formatElapsed(totalSeconds: number | null | undefined): string {
  const seconds = Math.max(0, totalSeconds ?? 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function WorkflowStatusWorkspaceTab({
  inquiryId,
  inquiryNumber,
  isCustomer,
  jwtToken,
  onSelectTab,
}: WorkflowStatusWorkspaceTabProps) {
  const [workflow, setWorkflow] = useState<WorkflowInstanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [poNumber, setPoNumber] = useState('');
  const [poDate, setPoDate] = useState('');
  const [poDocumentRef, setPoDocumentRef] = useState('');
  const [poValue, setPoValue] = useState('');
  const [poCurrency, setPoCurrency] = useState('USD');
  const [poQuantity, setPoQuantity] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [foxValidated, setFoxValidated] = useState(false);
  const [changeKind, setChangeKind] = useState<'NONE' | 'PRICE' | 'TECHNICAL'>('NONE');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = jwtToken || readAccessToken() || undefined;
      const wf = await fetchWorkflowForInquiry(inquiryId, token);
      setWorkflow(wf);
    } catch (err) {
      setError((err as Error).message || 'Failed to load workflow status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => setNowTick((n) => n + 1), 15000);
    return () => window.clearInterval(timer);
  }, [inquiryId, jwtToken]);

  const currentStageTiming = useMemo(
    () => workflow?.stageTimings?.find((s) => s.isCurrent),
    [workflow?.stageTimings, nowTick]
  );

  const elapsedSeconds = useMemo(() => {
    if (!currentStageTiming?.startedAt) return workflow?.totalDurationSeconds ?? 0;
    const started = new Date(currentStageTiming.startedAt).getTime();
    return Math.max(0, Math.round((Date.now() - started) / 1000));
  }, [currentStageTiming?.startedAt, workflow?.totalDurationSeconds, nowTick]);

  const changeRequests = useMemo(() => {
    return (workflow?.events || []).filter((e: WorkflowEventSummary) => {
      const p = (e.payloadJson || {}) as Record<string, unknown>;
      const code = String(p.transitionCode || '');
      return code.startsWith('RETURN_') || p.taskResult === 'RETURNED';
    });
  }, [workflow?.events]);

  if (loading && !workflow) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        <RefreshCw className="h-5 w-5 animate-spin mx-auto text-indigo-500 mb-2" />
        <p>Loading workflow status and stage timings…</p>
      </div>
    );
  }

  if (error && !workflow) {
    return (
      <div className="p-6 m-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-amber-800">Workflow Instance Not Found</h4>
          <p className="mt-1 text-amber-700">
            {error || 'No active workflow instance is linked to this inquiry.'}
          </p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="mt-3 px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentStepName = workflow?.currentStep?.name || workflow?.currentStepCode || 'Submitted';
  const assigneeRole =
    currentStageTiming?.owner ||
    workflow?.openTasks?.[0]?.assignments?.[0]?.assigneeRef ||
    'Unassigned';
  const startedAt = currentStageTiming?.startedAt || workflow?.startedAt;

  return (
    <div className="p-4 sm:p-6 space-y-6 text-xs text-slate-700 font-sans">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Workflow Status & Lifecycle Tracking
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200">
              {workflow?.templateCode || 'Not started'}
            </span>
          </div>
          <p className="text-slate-500 text-[11px] mt-0.5">
            Real-time lifecycle tracking, stage durations, and multi-department governance for{' '}
            <span className="font-mono font-semibold text-slate-700">{inquiryNumber}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors shadow-xs"
          title="Refresh workflow data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Section A: Current Status Card */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/70 via-white to-blue-50/40 p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
              Current Stage
            </span>
            <div className="flex items-center gap-2.5">
              <span className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                {currentStepName}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-600 text-white shadow-xs">
                {workflow?.status || 'ACTIVE'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-slate-600 pt-1">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-slate-400" />
                <span>Current Owner: </span>
                <strong className="text-slate-800 font-semibold">{assigneeRole}</strong>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>Entered Stage: </span>
                <span className="text-slate-800">{formatDateTime(startedAt)}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-center shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Elapsed in Stage
              </span>
              <span className="text-sm font-black font-mono text-indigo-700">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center shadow-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Total Elapsed
              </span>
              <span className="text-sm font-black font-mono text-slate-800">
                {formatElapsed(workflow?.totalDurationSeconds ?? elapsedSeconds)}
              </span>
            </div>
          </div>
        </div>

        {/* Steps Progress Badges */}
        {workflow?.template?.steps && workflow.template.steps.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-indigo-100 flex flex-wrap gap-1.5">
            {workflow.template.steps.map((step) => {
              const isCompleted = workflow.stageTimings?.some(
                (t) => t.stepCode === step.stepCode && t.completedAt
              );
              const isActive = step.stepCode === workflow.currentStepCode;
              return (
                <span
                  key={step.stepCode}
                  className={`inline-flex flex-col rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    isActive
                      ? 'border border-indigo-600 bg-indigo-600 text-white font-bold shadow-xs'
                      : isCompleted
                        ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border border-slate-200 bg-white/70 text-slate-400'
                  }`}
                >
                  <span>
                    {isCompleted ? '✓ ' : ''}
                    {step.name}
                  </span>
                  {stageOwnerLabel(step.stepCode) && (
                    <span className={`text-[9px] font-semibold ${isActive ? 'text-indigo-100' : 'opacity-80'}`}>
                      {stageOwnerLabel(step.stepCode)}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {workflow && !isCustomer && workflow.currentStepCode === 'PO_VALIDATION' && (
        <form
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!workflow) return;
            const token = jwtToken || readAccessToken() || undefined;
            setActionBusy(true);
            setActionError(null);
            void submitWorkflowPoValidation(
              workflow.id,
              {
                customerPoNumber: poNumber.trim(),
                customerPoDate: poDate,
                customerPoDocumentRef: poDocumentRef.trim() || undefined,
                poValue: Number(poValue),
                poCurrency: poCurrency.trim() || 'USD',
                poQuantity: Number(poQuantity),
                notes: poNotes.trim() || undefined,
              },
              token
            )
              .then(async (result) => {
                if (!result.matched && result.reason) setActionError(result.reason);
                await loadData();
              })
              .catch((err: Error) => setActionError(err.message))
              .finally(() => setActionBusy(false));
          }}
        >
          <h3 className="text-sm font-bold text-slate-800">Customer purchase order</h3>
          <p className="text-xs text-slate-500">
            Match the PO number, date, value, and quantity to the issued quotation. A date after validity, or a value or quantity mismatch, returns the PO to the customer.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">
              PO number
              <input required value={poNumber} onChange={(e) => setPoNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              PO date
              <input required type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Attachment id
              <input value={poDocumentRef} onChange={(e) => setPoDocumentRef(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Existing inquiry attachment id" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Currency
              <input value={poCurrency} onChange={(e) => setPoCurrency(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              PO value
              <input required type="number" step="0.01" value={poValue} onChange={(e) => setPoValue(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              PO quantity
              <input required type="number" step="0.001" value={poQuantity} onChange={(e) => setPoQuantity(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">
            Notes
            <textarea value={poNotes} onChange={(e) => setPoNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
          </label>
          {actionError && <p className="text-xs font-semibold text-rose-700">{actionError}</p>}
          <button type="submit" disabled={actionBusy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {actionBusy ? 'Checking PO…' : 'Validate purchase order'}
          </button>
        </form>
      )}

      {workflow && !isCustomer && workflow.currentStepCode === 'FINANCIAL_RELEASE' && (
        <form
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!workflow) return;
            const token = jwtToken || readAccessToken() || undefined;
            setActionBusy(true);
            setActionError(null);
            void transitionWorkflowInstance(
              workflow.id,
              { transitionCode: 'TO_TECHNICAL_RELEASE', taskResult: 'APPROVED', foxOrderValidated: true },
              token
            )
              .then(() => loadData())
              .catch((err: Error) => setActionError(err.message))
              .finally(() => setActionBusy(false));
          }}
        >
          <h3 className="text-sm font-bold text-slate-800">Financial release</h3>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={foxValidated} onChange={(e) => setFoxValidated(e.target.checked)} />
            FOX order number is validated
          </label>
          {actionError && <p className="text-xs font-semibold text-rose-700">{actionError}</p>}
          <button type="submit" disabled={actionBusy || !foxValidated} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Approve financial release
          </button>
        </form>
      )}

      {workflow && !isCustomer && forwardStageAction(workflow.currentStepCode) && (
        <form
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!workflow) return;
            const action = forwardStageAction(workflow.currentStepCode);
            if (!action) return;
            const token = jwtToken || readAccessToken() || undefined;
            setActionBusy(true);
            setActionError(null);
            void transitionWorkflowInstance(workflow.id, { transitionCode: action.transitionCode }, token)
              .then(() => loadData())
              .catch((err: Error) => setActionError(err.message))
              .finally(() => setActionBusy(false));
          }}
        >
          <h3 className="text-sm font-bold text-slate-800">Stage action</h3>
          <p className="text-xs text-slate-500">
            {stageOwnerLabel(workflow.currentStepCode)} moves this inquiry to the next stage.
          </p>
          {actionError && <p className="text-xs font-semibold text-rose-700">{actionError}</p>}
          <button type="submit" disabled={actionBusy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {actionBusy ? 'Moving…' : forwardStageAction(workflow.currentStepCode)?.label}
          </button>
        </form>
      )}

      {workflow && !isCustomer && clarificationAdvanceCode(workflow.currentStepCode) && (
        <form
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!workflow) return;
            const token = jwtToken || readAccessToken() || undefined;
            const transitionCode = clarificationAdvanceCode(workflow.currentStepCode);
            if (!transitionCode) return;
            setActionBusy(true);
            setActionError(null);
            void transitionWorkflowInstance(workflow.id, { transitionCode }, token)
              .then(() => loadData())
              .catch((err: Error) => setActionError(err.message))
              .finally(() => setActionBusy(false));
          }}
        >
          <h3 className="text-sm font-bold text-slate-800">Clarification</h3>
          <p className="text-xs text-slate-500">Send this change request to the owning stage, then wait for the response.</p>
          {actionError && <p className="text-xs font-semibold text-rose-700">{actionError}</p>}
          <button type="submit" disabled={actionBusy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {actionBusy ? 'Sending…' : 'Continue clarification'}
          </button>
        </form>
      )}

      {workflow && !isCustomer && (workflow.currentStepCode.endsWith('_RESPONSE') || workflow.currentStepCode === 'CUSTOMER_RESPONSE') && workflow.currentStepCode !== 'CUSTOMER_RESPONSE' && workflow.currentStepCode !== 'CUSTOMER_DECISION_RESPONSE' && workflow.currentStepCode !== 'PO_VALIDATION_RESPONSE' && (
        <form
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!workflow) return;
            const token = jwtToken || readAccessToken() || undefined;
            const transitionCode = `${workflow.currentStepCode.slice(0, -'_RESPONSE'.length)}_RESPONDED`;
            setActionBusy(true);
            setActionError(null);
            void transitionWorkflowInstance(
              workflow.id,
              { transitionCode, taskResult: 'RESPONDED', changeKind },
              token
            )
              .then(() => loadData())
              .catch((err: Error) => setActionError(err.message))
              .finally(() => setActionBusy(false));
          }}
        >
          <h3 className="text-sm font-bold text-slate-800">Close change request</h3>
          <label className="text-xs font-semibold text-slate-600">
            What changed
            <select value={changeKind} onChange={(e) => setChangeKind(e.target.value as 'NONE' | 'PRICE' | 'TECHNICAL')} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="NONE">No downstream rerun</option>
              <option value="PRICE">Price only — costing stays closed</option>
              <option value="TECHNICAL">Technical — costing onward must be redone</option>
            </select>
          </label>
          {actionError && <p className="text-xs font-semibold text-rose-700">{actionError}</p>}
          <button type="submit" disabled={actionBusy} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Send response
          </button>
        </form>
      )}

      {/* Section B: Stage Timings History Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-600" />
            <h3 className="font-bold text-slate-800 text-xs">
              Stage History & Durations
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            Recorded via server-side <code className="font-mono text-slate-700">WorkflowStageTiming</code>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-4">Stage / Department</th>
                <th className="py-2.5 px-4">Responsible Actor</th>
                <th className="py-2.5 px-4">Entry Date & Time</th>
                <th className="py-2.5 px-4">Exit / Response Date</th>
                <th className="py-2.5 px-4 text-right">Stage Duration</th>
                <th className="py-2.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {(!workflow?.stageTimings || workflow.stageTimings.length === 0) ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No stage timings recorded yet for this inquiry.
                  </td>
                </tr>
              ) : (
                workflow.stageTimings.map((timing: WorkflowStageTimingSummary) => {
                  const isCurrent = timing.isCurrent || (timing.stepCode === workflow.currentStepCode && !timing.completedAt);
                  const duration = isCurrent
                    ? elapsedSeconds
                    : timing.durationSeconds ?? 0;
                  return (
                    <tr
                      key={timing.id || timing.stepCode}
                      className={isCurrent ? 'bg-indigo-50/40 font-medium' : 'hover:bg-slate-50/60'}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {isCurrent ? (
                            <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                          ) : timing.completedAt ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-slate-300" />
                          )}
                          <span className={isCurrent ? 'font-bold text-indigo-900' : 'text-slate-800'}>
                            {timing.name || timing.stepCode}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        {timing.owner || (isCurrent ? assigneeRole : '—')}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {formatDateTime(timing.startedAt)}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {timing.completedAt ? formatDateTime(timing.completedAt) : (
                          <span className="italic text-indigo-600 font-medium">In Progress…</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                        {formatElapsed(duration)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isCurrent ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            Current
                          </span>
                        ) : timing.completedAt ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Completed
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Explicit Operational Notice: First-Opened Limitation */}
        <div className="p-3.5 bg-amber-50/70 border-t border-amber-200/70 text-amber-900 text-[11px] flex items-start gap-2.5">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Operational Notice:</strong> The system precisely records server timestamps for stage entry and stage completion to the second.
            Timestamp recording for <em>&quot;first opened/inspected&quot;</em> is currently pending database schema enhancement and scheduled for a future update.
          </p>
        </div>
      </div>

      {/* Section C: Change Requests History */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-slate-600" />
            <h3 className="font-bold text-slate-800 text-xs">
              Change Requests History
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Filtered from <code className="font-mono text-slate-600">WorkflowEvent</code> (RETURN_* only)
          </span>
        </div>

        {changeRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <RotateCcw className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
            <p className="font-semibold text-slate-700">No change requests recorded for this inquiry yet</p>
            <p className="text-slate-400 text-[11px] mt-0.5">
              When any department returns the inquiry for technical or pricing revisions, reason details and notes will be recorded here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {changeRequests.map((cr) => {
              const payload = (cr.payloadJson || {}) as Record<string, unknown>;
              return (
                <div
                  key={cr.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-900">
                        {String(payload.transitionCode || 'RETURN')}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        ({cr.fromStepCode} → {cr.toStepCode})
                      </span>
                    </div>
                    {payload.reason && (
                      <p className="text-slate-700 mt-1 font-medium">
                        Reason: {String(payload.reason)}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Requested by <strong className="text-slate-700">{cr.actorName || 'User'}</strong>
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-500">
                    {formatDateTime(cr.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section D: Link to Full Audit Trail */}
      {onSelectTab && (
        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 text-xs">
          <span className="text-slate-500">
            For comprehensive activity logs, audit events, and administrative trail:
          </span>
          <button
            type="button"
            onClick={() => onSelectTab('audit')}
            className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
          >
            <span>View full audit trail</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

