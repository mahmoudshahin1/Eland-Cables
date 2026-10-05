import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchV2Inquiry, type V2InquiryDto } from '../../services/v2InquiryConfigurationApiService';
import {
  calculateV2CostingRun,
  fetchV2CurrentCostingRun,
  type V2CostingRunDto,
} from '../../services/v2CostingApiService';
import { CuttingLengthSectionV2 } from '../cable-configurator/v2/components/CuttingLengthSectionV2';
import { DrumSelectionSectionV2 } from '../cable-configurator/v2/components/DrumSelectionSectionV2';
import { parseMasterCableRecordV2 } from '../cable-configurator/v2/services/cableSelectionEngineV2';
import { loadAuthoritativeCableCatalog } from '../../services/masterDataApiService';
import {
  shouldRenderV2EngineChrome,
  snapshotConflictLabel,
  v2EngineSectionsForBridgeTab,
} from '../customer/customerInquiryDetailPresentation';

type V2TabKind = 'costing' | 'cutting' | 'drums' | 'cutting_drums';

interface InquiryV2TabBridgeProps {
  inquiryId: string;
  tab: V2TabKind;
  lineId?: string | null;
  onChanged?: () => void;
}

export const InquiryV2TabBridge: React.FC<InquiryV2TabBridgeProps> = ({
  inquiryId,
  tab,
  lineId,
  onChanged,
}) => {
  const { jwtToken } = useAuth();
  const [inquiry, setInquiry] = useState<V2InquiryDto | null>(null);
  const [costingRun, setCostingRun] = useState<V2CostingRunDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [resolvedCable, setResolvedCable] = useState<ReturnType<typeof parseMasterCableRecordV2> | null>(null);

  const reload = useCallback(async () => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      const inq = await fetchV2Inquiry(jwtToken, inquiryId);
      setInquiry(inq);
      const activeLineId = lineId || inq.lines[0]?.id;
      if (tab === 'costing' && activeLineId) {
        const current = await fetchV2CurrentCostingRun(jwtToken, inquiryId, activeLineId);
        setCostingRun(current.run);
      }
      const activeLine = inq.lines.find((l) => l.id === activeLineId) || inq.lines[0];
      if (activeLine?.materialNumber) {
        const catalog = await loadAuthoritativeCableCatalog(jwtToken);
        const match = catalog.data.find((row) => row.cableCode === activeLine.materialNumber);
        setResolvedCable(match ? parseMasterCableRecordV2(match) : null);
      } else {
        setResolvedCable(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load V2 inquiry context');
    } finally {
      setLoading(false);
    }
  }, [jwtToken, inquiryId, lineId, tab]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeLine = inquiry?.lines.find((l) => l.id === lineId) || inquiry?.lines[0];

  const runV2Costing = async () => {
    if (!jwtToken || !activeLine) return;
    setCalculating(true);
    setError(null);
    try {
      const result = await calculateV2CostingRun(jwtToken, inquiryId, activeLine.id);
      setCostingRun(result);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'V2 costing failed');
    } finally {
      setCalculating(false);
    }
  };

  if (loading) {
    if (tab === 'costing') {
      return (
        <p className="text-xs text-slate-500 flex items-center gap-2 py-2">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading V2 workflow data…
        </p>
      );
    }
    return null;
  }

  if (error) {
    if (tab !== 'costing') return null;
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    );
  }

  if (!inquiry || !activeLine || !shouldRenderV2EngineChrome({ workflowChannel: inquiry.workflowChannel, line: activeLine })) {
    return null;
  }

  const conflict = snapshotConflictLabel(activeLine);
  const snapshot = activeLine.snapshots[0];
  const { showCutting, showDrums } = v2EngineSectionsForBridgeTab(tab);

  return (
    <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-brand-800">
          V2 Engine · Line {activeLine.lineNumber}
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="text-[11px] font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {snapshot && (
        <p className="text-[11px] text-slate-600 font-mono">
          snapshot {snapshot.snapshotId} · {snapshot.flowState} · {snapshot.engineeringStatus}
        </p>
      )}

      {conflict && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{conflict} Conflicts are not auto-resolved.</span>
        </div>
      )}

      {tab === 'costing' && (
        <div className="space-y-3 text-xs">
          {costingRun ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <p className="text-slate-500 text-[10px]">Status</p>
                <p className="font-bold">{costingRun.status}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <p className="text-slate-500 text-[10px]">Material Cost</p>
                <p className="font-bold text-brand-800">
                  {costingRun.materialCost} {costingRun.currency}
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <p className="text-slate-500 text-[10px]">Decision 5</p>
                <p className="font-bold">{costingRun.decision5Status}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                <p className="text-slate-500 text-[10px]">Lineage</p>
                <p className="font-mono text-[10px] truncate">{costingRun.lineage.configurationSnapshotId}</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-600">No V2 costing run persisted for this line yet.</p>
          )}
          {(costingRun?.blockingReasons?.length ?? 0) > 0 && (
            <ul className="space-y-1 text-amber-800">
              {costingRun!.blockingReasons.map((reason) => (
                <li key={reason} className="flex items-start gap-1.5">
                  <span>•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={calculating}
            onClick={() => void runV2Costing()}
            className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
          >
            {calculating ? 'Calculating…' : 'Run V2 Costing'}
          </button>
        </div>
      )}

      {showCutting && (
        <CuttingLengthSectionV2
          resolvedCable={resolvedCable}
          configurationSnapshotId={snapshot?.snapshotId}
          inquiryId={inquiryId}
          lineId={activeLine.id}
          jwtToken={jwtToken}
          onPlanSaved={() => {
            onChanged?.();
            void reload();
          }}
        />
      )}

      {showDrums && resolvedCable && (
        <DrumSelectionSectionV2
          resolvedCable={resolvedCable}
          handoff={null}
          inquiryId={inquiryId}
          lineId={activeLine.id}
          jwtToken={jwtToken}
          onPlanSaved={() => {
            onChanged?.();
            void reload();
          }}
        />
      )}

      {showDrums && !resolvedCable && (
        <p className="text-xs text-slate-600">Map a cable material on this line to run V2 drum selection.</p>
      )}
    </div>
  );
};
