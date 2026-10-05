import React from 'react';

/**
 * P1.5-02A — honest error / stub (Doc 54 §10.7).
 * `not_implemented` / `not_connected` never impersonate success or live data.
 * Unwired: do not mount on V1 screens from this increment.
 */
export type ErrorStateKind = 'error' | 'not_implemented' | 'not_connected';

export type ErrorStateProps = {
  title: string;
  message?: React.ReactNode;
  next?: React.ReactNode;
  kind?: ErrorStateKind;
  className?: string;
};

const KIND_CLASS: Record<ErrorStateKind, string> = {
  error: 'border-error-100 bg-error-50',
  not_implemented: 'border-warning-100 bg-warning-50',
  not_connected: 'border-info-100 bg-info-50',
};

const KIND_LABEL: Record<ErrorStateKind, string> = {
  error: 'Error',
  not_implemented: 'NOT_IMPLEMENTED',
  not_connected: 'NOT_CONNECTED',
};

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  message,
  next,
  kind = 'error',
  className = '',
}) => (
  <div
    role="alert"
    className={`rounded-xl border px-4 py-4 text-sm text-slate-800 ${KIND_CLASS[kind]} ${className}`.trim()}
  >
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{KIND_LABEL[kind]}</p>
    <h2 className="mt-1 font-display font-bold text-slate-900">{title}</h2>
    {message ? <p className="mt-1 text-xs text-slate-600">{message}</p> : null}
    {next ? (
      <p className="mt-2 text-xs">
        <span className="font-semibold text-slate-500">What next: </span>
        {next}
      </p>
    ) : null}
  </div>
);
