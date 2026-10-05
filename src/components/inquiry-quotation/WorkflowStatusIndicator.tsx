import React, { useEffect, useState } from 'react';
import { readAccessToken } from '../../auth/tokenStorage';
import { fetchWorkflowForInquiry, type WorkflowInstanceSummary } from '../../services/workflowApiService';

interface WorkflowStatusIndicatorProps {
  inquiryId: string;
  className?: string;
}

function formatElapsed(totalSeconds: number | null | undefined): string {
  const seconds = Math.max(0, totalSeconds ?? 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function WorkflowStatusIndicator({ inquiryId, className = '' }: WorkflowStatusIndicatorProps) {
  const [workflow, setWorkflow] = useState<WorkflowInstanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = readAccessToken() || undefined;
        const wf = await fetchWorkflowForInquiry(inquiryId, token);
        if (!cancelled) setWorkflow(wf);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    const timer = window.setInterval(() => setNowTick((n) => n + 1), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [inquiryId]);

  if (error || !workflow || workflow.status !== 'ACTIVE') return null;

  const current = workflow.currentStep?.name ?? workflow.currentStepCode;
  const currentTiming = workflow.stageTimings?.find((s) => s.isCurrent);
  const started = currentTiming?.startedAt || workflow.startedAt;
  const elapsed = currentTiming?.durationSeconds ?? workflow.totalDurationSeconds ?? 0;
  const total = workflow.totalDurationSeconds ?? elapsed;
  const assignee = workflow.openTasks[0]?.assignments[0]?.assigneeRef;
  const stages = (workflow.template?.steps || workflow.stageTimings || [])
    .filter((s) => ('isTerminal' in s ? true : true))
    .slice(0, 14);
  void nowTick;

  return (
    <div
      className={`rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs text-indigo-900 ${className}`}
      title="STANDARD_WORKFLOW status"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">Workflow Status</span>
        <span className="text-indigo-700">Current: {current}</span>
        {started ? (
          <span className="text-indigo-700">
            Started {new Date(started).toLocaleString()}
          </span>
        ) : null}
        <span className="text-indigo-700">Elapsed {formatElapsed(elapsed)}</span>
        <span className="text-indigo-700">Total {formatElapsed(total)}</span>
        {assignee ? <span className="text-indigo-700">Owner: {assignee}</span> : null}
      </div>
      {stages.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {(workflow.template?.steps || []).map((step) => {
            const done = workflow.stageTimings?.some((t) => t.stepCode === step.stepCode && t.completedAt);
            const active = step.stepCode === workflow.currentStepCode;
            return (
              <span
                key={step.stepCode}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  active
                    ? 'border-indigo-500 bg-white text-indigo-800'
                    : done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-indigo-100 bg-white/60 text-indigo-400'
                }`}
              >
                {step.name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
