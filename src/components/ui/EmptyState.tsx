import React from 'react';

/**
 * P1.5-02A — empty collection/workspace (Doc 54 §10.10).
 * Unwired: do not replace CostingEmptyState or mount on V1 screens from this increment.
 */
export type EmptyStateProps = {
  title: string;
  hint?: React.ReactNode;
  className?: string;
};

export const EmptyState: React.FC<EmptyStateProps> = ({ title, hint, className = '' }) => (
  <div
    className={`py-12 text-center border border-dashed border-slate-200 rounded-xl bg-white ${className}`.trim()}
  >
    <p className="text-sm font-semibold text-slate-700">{title}</p>
    {hint ? <p className="text-xs text-slate-500 mt-1">{hint}</p> : null}
  </div>
);
