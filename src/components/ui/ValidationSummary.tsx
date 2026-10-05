import React from 'react';

/**
 * P1.5-02A — blocked/error summary (Doc 54 §10.7 / Doc 53 §18).
 * Pattern: What happened → Why → What next → Who owns it.
 * Unwired: do not mount on V1 screens from this increment.
 */
export type ValidationSummaryTone = 'error' | 'warning';

export type ValidationSummaryProps = {
  happened: React.ReactNode;
  why: React.ReactNode;
  next: React.ReactNode;
  owner: React.ReactNode;
  tone?: ValidationSummaryTone;
  className?: string;
};

const TONE_CLASS: Record<ValidationSummaryTone, string> = {
  error: 'border-error-100 bg-error-50',
  warning: 'border-warning-100 bg-warning-50',
};

export const ValidationSummary: React.FC<ValidationSummaryProps> = ({
  happened,
  why,
  next,
  owner,
  tone = 'error',
  className = '',
}) => (
  <div
    role="alert"
    className={`rounded-xl border px-4 py-3 text-sm text-slate-800 ${TONE_CLASS[tone]} ${className}`.trim()}
  >
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <div>
        <dt className="font-semibold text-slate-500">What happened</dt>
        <dd className="mt-0.5">{happened}</dd>
      </div>
      <div>
        <dt className="font-semibold text-slate-500">Why</dt>
        <dd className="mt-0.5">{why}</dd>
      </div>
      <div>
        <dt className="font-semibold text-slate-500">What next</dt>
        <dd className="mt-0.5">{next}</dd>
      </div>
      <div>
        <dt className="font-semibold text-slate-500">Owner</dt>
        <dd className="mt-0.5">{owner}</dd>
      </div>
    </dl>
  </div>
);
