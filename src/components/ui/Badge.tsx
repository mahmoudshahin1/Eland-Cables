import React from 'react';

/**
 * Design-system Badge + StatusBadge.
 *
 * `Badge` renders a pill in a semantic tone. `StatusBadge` maps a raw
 * domain status string to a tone using the same heuristics already used by
 * `statusTone` in CostingUiPrimitives, so labeling stays consistent.
 */
export type BadgeTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'brand'
  | 'copper'
  | 'aluminium';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-success-50 text-success-500 border-success-100',
  warning: 'bg-warning-50 text-warning-700 border-warning-100',
  error: 'bg-error-50 text-error-600 border-error-100',
  info: 'bg-info-50 text-info-700 border-info-100',
  brand: 'bg-brand-50 text-brand-600 border-brand-200',
  copper: 'bg-orange-50 text-orange-800 border-orange-200',
  aluminium: 'bg-sky-50 text-sky-800 border-sky-200',
};

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', className = '', children }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${toneClasses[tone]} ${className}`}
  >
    {children}
  </span>
);

/** Same classification heuristics as CostingUiPrimitives.statusTone. */
export function statusToTone(status?: string): BadgeTone {
  const s = (status || '').toUpperCase();
  if (['ACTIVE', 'APPROVED', 'READY', 'PASS', 'COMPLETED'].some((x) => s.includes(x))) return 'success';
  if (['PENDING', 'DRAFT', 'UNDER_CREATION', 'UNDER_REVIEW', 'SUBMITTED'].some((x) => s.includes(x)))
    return 'warning';
  if (['BLOCKED', 'REJECTED', 'FAILED', 'EXPIRED', 'INACTIVE', 'NOT_READY'].some((x) => s.includes(x)))
    return 'error';
  return 'neutral';
}

export interface StatusBadgeProps {
  status?: string;
  /** Override the displayed label (defaults to the raw status). */
  label?: React.ReactNode;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, className }) => (
  <Badge tone={statusToTone(status)} className={className}>
    {label ?? status ?? '—'}
  </Badge>
);
