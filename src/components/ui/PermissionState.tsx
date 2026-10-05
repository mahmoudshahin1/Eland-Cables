import React from 'react';

/**
 * P1.5-02A — denied-access surface (Doc 54 §10.7 / Doc 53).
 * Presentational only — does not call AuthContext or replace AccessRestricted.
 * Unwired: do not mount on V1 screens from this increment.
 */
export type PermissionStateProps = {
  moduleName: string;
  requiredRole?: string;
  userLabel?: string;
  className?: string;
};

export const PermissionState: React.FC<PermissionStateProps> = ({
  moduleName,
  requiredRole,
  userLabel,
  className = '',
}) => (
  <div
    role="status"
    className={`rounded-xl border border-error-100 bg-error-50 px-4 py-5 text-sm text-slate-800 ${className}`.trim()}
  >
    <p className="text-xs font-semibold uppercase tracking-wide text-error-600">Access denied</p>
    <h2 className="mt-1 font-display text-lg font-bold text-slate-900">You cannot open {moduleName}</h2>
    <p className="mt-2 text-xs text-slate-600">
      {userLabel ? `${userLabel} does not have permission for this surface.` : 'This account does not have permission for this surface.'}
      {requiredRole ? ` Required role: ${requiredRole}.` : ' Sign in with an authorized role or request access.'}
    </p>
  </div>
);
