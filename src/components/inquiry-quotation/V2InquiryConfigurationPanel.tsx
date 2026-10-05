import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  createV2Inquiry,
  fetchV2Inquiries,
  fetchV2Inquiry,
  type V2InquiryDto,
} from '../../services/v2InquiryConfigurationApiService';
import { StatusBadge } from '../ui/Badge';
import { FileText, Plus, RefreshCw } from 'lucide-react';

interface V2InquiryConfigurationPanelProps {
  inquiryId?: string;
  onInquirySelected?: (inquiry: V2InquiryDto) => void;
  internalView?: boolean;
  refreshKey?: number;
}

export const V2InquiryConfigurationPanel: React.FC<V2InquiryConfigurationPanelProps> = ({
  inquiryId,
  onInquirySelected,
  internalView = false,
  refreshKey = 0,
}) => {
  const { jwtToken } = useAuth();
  const [rows, setRows] = useState<V2InquiryDto[]>([]);
  const [selected, setSelected] = useState<V2InquiryDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      if (inquiryId) {
        const inquiry = await fetchV2Inquiry(jwtToken, inquiryId);
        setSelected(inquiry);
        onInquirySelected?.(inquiry);
      } else {
        const result = await fetchV2Inquiries(jwtToken, { pageSize: 25 });
        setRows(result.inquiries);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [jwtToken, inquiryId, onInquirySelected, refreshKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      const inquiry = await createV2Inquiry(jwtToken, {
        projectName: 'V2 Cable Configuration Inquiry',
      });
      setSelected(inquiry);
      onInquirySelected?.(inquiry);
      if (internalView) await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!jwtToken) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Sign in to start a V2 inquiry. Submitted inquiry data is persisted on the server — not in localStorage.
      </div>
    );
  }

  if (selected || inquiryId) {
    const inquiry = selected;
    if (!inquiry) {
      return <p className="text-sm text-slate-500">Loading inquiry…</p>;
    }
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">V2 Inquiry</p>
            <p className="font-mono text-sm font-semibold text-slate-900">{inquiry.inquiryNumber}</p>
          </div>
          <StatusBadge status={inquiry.status} label={inquiry.status.replace(/_/g, ' ')} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <div>Customer: {inquiry.customerName}</div>
          <div>Lines: {inquiry.lines.length}</div>
          <div>Channel: {inquiry.workflowChannel || 'V2_CONFIGURATION'}</div>
          <div>Updated: {new Date(inquiry.updatedAt).toLocaleString()}</div>
        </div>
        {inquiry.lines.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Configuration lines</p>
            {inquiry.lines.map((line) => {
              const snap = line.snapshots[0];
              return (
                <div key={line.id} className="rounded border border-slate-100 p-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">Line {line.lineNumber}</span>
                    <span>{line.cableAuthorityStatus}</span>
                  </div>
                  <p className="text-slate-600 mt-1">{line.cableDescription}</p>
                  {snap && (
                    <p className="text-slate-500 mt-1 font-mono">
                      snapshot {snap.snapshotId} · {snap.flowState} · {snap.engineeringStatus}
                    </p>
                  )}
                  {line.currentCuttingPlan ? (
                    <p className="text-slate-600 mt-1 font-mono">
                      cutting {line.currentCuttingPlan.planId} · {line.currentCuttingPlan.validationStatus} ·{' '}
                      {line.currentCuttingPlan.nominalLengthM} m ±{line.currentCuttingPlan.tolerancePercent}%
                    </p>
                  ) : (
                    <p className="text-amber-700 mt-1">No cutting plan saved yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => void reload()}
          className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
        >
          <RefreshCw className="h-3 w-3" /> Refresh from server
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <FileText className="h-4 w-4" />
          {internalView ? 'V2 Inquiries (internal)' : 'My V2 Inquiries'}
        </div>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> New inquiry
        </button>
      </div>
      {loading && <p className="text-xs text-slate-500">Loading…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {rows.length === 0 && !loading ? (
        <p className="text-xs text-slate-500">No V2 inquiries yet. Create one to persist configuration on the server.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between py-2 text-left text-xs hover:bg-slate-50"
                onClick={() => {
                  setSelected(row);
                  onInquirySelected?.(row);
                }}
              >
                <span className="font-mono font-medium">{row.inquiryNumber}</span>
                <StatusBadge status={row.status} label={row.status.replace(/_/g, ' ')} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
