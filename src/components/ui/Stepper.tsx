import React from 'react';

/**
 * P1.5-02A — journey stepper contract (Doc 54 §10.6 / Doc 53).
 * Unwired: do not mount on V1 screens from this increment.
 * States are visual only — not a domain status enum.
 */
export type StepperStageState = 'not_started' | 'in_progress' | 'blocked' | 'waiting' | 'complete';

export type StepperStep = {
  id: string;
  label: string;
  state: StepperStageState;
  /** Required before a step may render as complete (Doc 53: never complete without the artifact). */
  hasArtifact?: boolean;
};

export type StepperProps = {
  steps: StepperStep[];
  className?: string;
};

/** Coerce `complete` without an artifact so UI cannot fake a finished stage. */
export function resolveStepperState(step: Pick<StepperStep, 'state' | 'hasArtifact'>): StepperStageState {
  if (step.state === 'complete' && !step.hasArtifact) return 'in_progress';
  return step.state;
}

const STATE_LABEL: Record<StepperStageState, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  waiting: 'Waiting',
  complete: 'Complete',
};

const STATE_CLASS: Record<StepperStageState, string> = {
  not_started: 'border-slate-200 bg-white text-slate-500',
  in_progress: 'border-info-200 bg-info-50 text-info-700',
  blocked: 'border-error-100 bg-error-50 text-error-600',
  waiting: 'border-warning-100 bg-warning-50 text-warning-700',
  complete: 'border-success-100 bg-success-50 text-success-700',
};

export const Stepper: React.FC<StepperProps> = ({ steps, className = '' }) => (
  <ol
    className={`flex flex-col sm:flex-row sm:flex-wrap gap-2 ${className}`.trim()}
    aria-label="Journey stages"
  >
    {steps.map((step, index) => {
      const state = resolveStepperState(step);
      const current = state === 'in_progress' || state === 'blocked' || state === 'waiting';
      return (
        <li key={step.id} className="flex items-center gap-2 min-w-0">
          {index > 0 ? (
            <span className="hidden sm:block text-slate-300 px-1" aria-hidden>
              →
            </span>
          ) : null}
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${STATE_CLASS[state]}`}
            aria-current={current ? 'step' : undefined}
          >
            <span className="font-display text-slate-800">{step.label}</span>
            <span className="font-normal">{STATE_LABEL[state]}</span>
          </div>
        </li>
      );
    })}
  </ol>
);
