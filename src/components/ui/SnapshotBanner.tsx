import React from 'react';

/**
 * P1.5-02A — immutable artifact banner (Doc 54 §10.7 / Doc 53 §17).
 * Unwired: do not mount on V1 screens from this increment.
 */
export type SnapshotLifecycle = 'current' | 'historical' | 'superseded';

export type SnapshotBannerProps = {
  artifactType: string;
  artifactId: string;
  version?: string | number;
  source?: string;
  createdAt?: string;
  createdBy?: string;
  lifecycle: SnapshotLifecycle;
  successorLabel?: string;
  lockedValues?: React.ReactNode;
  className?: string;
};

const LIFECYCLE_LABEL: Record<SnapshotLifecycle, string> = {
  current: 'Current',
  historical: 'Historical',
  superseded: 'Superseded',
};

export function snapshotBannerFreezeCopy(createdAt?: string, source?: string): string {
  const when = createdAt ? `Frozen on ${createdAt}` : 'Frozen';
  const from = source ? ` from ${source}` : '';
  return `${when}${from}. Changing Customer Master or live rates does not change this document.`;
}

export const SnapshotBanner: React.FC<SnapshotBannerProps> = ({
  artifactType,
  artifactId,
  version,
  source,
  createdAt,
  createdBy,
  lifecycle,
  successorLabel,
  lockedValues,
  className = '',
}) => {
  const freezeCopy = snapshotBannerFreezeCopy(createdAt, source);
  return (
    <aside
      className={`rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-slate-800 ${className}`.trim()}
      aria-label="Snapshot"
    >
      <p className="font-display font-semibold text-brand-800">
        {artifactType} <span className="font-mono font-normal text-xs">{artifactId}</span>
      </p>
      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
        {version != null ? (
          <div>
            <dt className="font-semibold text-slate-500">Version</dt>
            <dd>{String(version)}</dd>
          </div>
        ) : null}
        {source ? (
          <div>
            <dt className="font-semibold text-slate-500">Source</dt>
            <dd>{source}</dd>
          </div>
        ) : null}
        {createdBy ? (
          <div>
            <dt className="font-semibold text-slate-500">Created by</dt>
            <dd>{createdBy}</dd>
          </div>
        ) : null}
        {createdAt ? (
          <div>
            <dt className="font-semibold text-slate-500">Created at</dt>
            <dd>{createdAt}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold text-slate-500">Lifecycle</dt>
          <dd>
            {LIFECYCLE_LABEL[lifecycle]}
            {lifecycle === 'superseded' && successorLabel ? ` — open ${successorLabel}` : null}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-slate-600">{freezeCopy}</p>
      {lockedValues ? (
        <div className="mt-2 text-xs">
          <p className="font-semibold text-slate-500">Locked values</p>
          <div className="mt-1 text-slate-700">{lockedValues}</div>
        </div>
      ) : null}
    </aside>
  );
};
