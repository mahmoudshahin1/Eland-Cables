import React from 'react';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  formatQty,
  integrationIsFutureOnly,
  integrationStatusLabel,
  operationalStatusLabel,
  orderFulfillmentModeLabel,
  orderOriginLabel,
  type TraceabilityStep,
} from '../../services/commercialFulfillmentWorkflow';
import type { FulfillmentExceptionKind } from '../../services/commercialFulfillmentWorkflow';

export function OperationalStatusBadge({ status }: { status?: string | null }) {
  const s = (status || '').toUpperCase();
  let tone: BadgeTone = 'neutral';
  if (s === 'DRAFT') tone = 'warning';
  else if (s === 'CONFIRMED' || s === 'ACTIVE') tone = 'info';
  else if (s === 'COMPLETED') tone = 'success';
  else if (s === 'CANCELLED' || s === 'CANCELED' || s === 'EXPIRED') tone = 'error';
  return <Badge tone={tone}>{operationalStatusLabel(status)}</Badge>;
}

/** D365 / integration — always labelled as future; never implies live sync. */
export function IntegrationFutureBadge({ status }: { status?: string | null }) {
  return (
    <Badge tone="neutral" className="font-mono">
      {integrationStatusLabel(status)}
      {integrationIsFutureOnly(status) ? ' · future' : ''}
    </Badge>
  );
}

export function OriginModeBadges({
  origin,
  mode,
}: {
  origin?: string | null;
  mode?: string | null;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone="brand">{orderOriginLabel(origin)}</Badge>
      <Badge tone="copper">{orderFulfillmentModeLabel(mode)}</Badge>
    </span>
  );
}

export function FulfillmentExceptionAlert({
  title,
  message,
  kind,
}: {
  title: string;
  message: string;
  kind?: FulfillmentExceptionKind;
}) {
  return (
    <div
      role="alert"
      data-exception-kind={kind || 'generic'}
      className="rounded-xl border border-error-100 bg-error-50 px-3 py-2.5 text-xs text-error-600 space-y-0.5"
    >
      <p className="font-bold">{title}</p>
      <p className="text-error-600/90">{message}</p>
    </div>
  );
}

export function TraceabilityRail({ steps, title = 'Traceability' }: { steps: TraceabilityStep[]; title?: string }) {
  if (!steps.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
      <p className="text-xs font-bold text-slate-800">{title}</p>
      <ol className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="text-slate-500 min-w-[7.5rem]">{step.label}</span>
            <span className={`font-mono ${step.muted ? 'text-slate-400' : 'text-slate-800'}`}>{step.value}</span>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-slate-400">
        Configuration / engineering / BOM / costing shown read-only from document snapshots.
      </p>
    </div>
  );
}

export function QtyCell({
  value,
  uom,
}: {
  value: number | string | null | undefined;
  uom?: string | null;
}) {
  return <span className="font-mono tabular-nums">{formatQty(value, uom)}</span>;
}

interface ConfirmCreateDialogProps {
  open: boolean;
  title: string;
  summary: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmCreateDialog({
  open,
  title,
  summary,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: ConfirmCreateDialogProps) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      widthClassName="max-w-md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-700 space-y-2">{summary}</div>
      <p className="text-[11px] text-slate-500">
        Creates an EPC document only. D365 posting remains NOT_IMPLEMENTED / NOT_SENT.
      </p>
    </Modal>
  );
}

export function DrumCuttingSummary({
  cuttingLengthMeters,
  numberOfCuts,
  drumType,
  drumQuantity,
  availableStockQuantity,
}: {
  cuttingLengthMeters?: number | string | null;
  numberOfCuts?: number | null;
  drumType?: string | null;
  drumQuantity?: number | string | null;
  availableStockQuantity?: number | string | null;
}) {
  const parts = [
    cuttingLengthMeters != null && cuttingLengthMeters !== '' ? `Cut ${cuttingLengthMeters} m` : null,
    numberOfCuts != null ? `${numberOfCuts} cuts` : null,
    drumType ? `Drum ${drumType}` : null,
    drumQuantity != null && drumQuantity !== '' ? `×${drumQuantity}` : null,
    availableStockQuantity != null && availableStockQuantity !== ''
      ? `Stock snap ${availableStockQuantity}`
      : null,
  ].filter(Boolean);
  if (!parts.length) return <span className="text-slate-400">—</span>;
  return <span className="text-slate-700">{parts.join(' · ')}</span>;
}

/** Inline reason when an action is unavailable — never silently disable without this. */
export function DisabledActionHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
      {children}
    </p>
  );
}
