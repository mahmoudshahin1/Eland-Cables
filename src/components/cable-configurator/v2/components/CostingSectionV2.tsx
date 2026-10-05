import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../ui/Button';
import { Badge } from '../../../ui/Badge';
import { Calculator, AlertCircle, DollarSign, ShieldAlert } from 'lucide-react';
import {
  calculateV2CostingRun,
  fetchV2CurrentCostingRun,
  previewV2CommercialPricing,
  previewV2CostingRun,
  type V2CostingRunDto,
  type V2CommercialPricingPreviewDto,
} from '../../../../services/v2CostingApiService';
import { DECISION5_STATUS } from '../../../../domain/v2CostingRequestService';

interface CostingSectionV2Props {
  inquiryId?: string;
  lineId?: string;
  jwtToken?: string | null;
  drumPlanConfirmed?: boolean;
  bomGovernanceBlocked?: boolean;
  unresolvedBomConflictCount?: number;
  onCostingUpdated?: () => void;
}

export const CostingSectionV2: React.FC<CostingSectionV2Props> = ({
  inquiryId,
  lineId,
  jwtToken,
  drumPlanConfirmed = false,
  bomGovernanceBlocked = false,
  unresolvedBomConflictCount = 81,
  onCostingUpdated,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<V2CostingRunDto | null>(null);
  const [currentRun, setCurrentRun] = useState<V2CostingRunDto | null>(null);
  const [pricingPreview, setPricingPreview] = useState<V2CommercialPricingPreviewDto | null>(null);

  const canAct = Boolean(jwtToken && inquiryId && lineId && drumPlanConfirmed);

  const refreshCurrent = useCallback(async () => {
    if (!jwtToken || !inquiryId || !lineId) return;
    try {
      const { run } = await fetchV2CurrentCostingRun(jwtToken, inquiryId, lineId);
      setCurrentRun(run);
    } catch {
      setCurrentRun(null);
    }
  }, [jwtToken, inquiryId, lineId]);

  useEffect(() => {
    void refreshCurrent();
  }, [refreshCurrent, drumPlanConfirmed]);

  const handlePreview = async () => {
    if (!canAct || !jwtToken || !inquiryId || !lineId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await previewV2CostingRun(jwtToken, inquiryId, lineId);
      setPreview(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    if (!canAct || !jwtToken || !inquiryId || !lineId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await calculateV2CostingRun(jwtToken, inquiryId, lineId);
      setPreview(result);
      setCurrentRun(result);
      onCostingUpdated?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePricingPreview = async () => {
    if (!jwtToken || !inquiryId || !lineId || !currentRun?.calculationId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await previewV2CommercialPricing(jwtToken, inquiryId, lineId);
      setPricingPreview(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (!drumPlanConfirmed) {
    return (
      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 opacity-60 text-center space-y-2">
        <Calculator className="h-5 w-5 mx-auto text-slate-500" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 font-display">
          Engineering Costing (V2)
        </h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Confirm a drum plan before running V2 costing.
        </p>
      </div>
    );
  }

  const display = preview || currentRun;
  const gateBlocked = bomGovernanceBlocked || display?.status === 'NOT_READY';

  return (
    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
            <Calculator className="h-4 w-4 text-brand-500" />
            Engineering Costing (V2)
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            RAW MATERIAL COST ONLY — NOT SELLING PRICE
          </p>
        </div>
        {display?.lineage && (
          <Badge variant="default">
            Drum v{display.lineage.drumPlanVersionNo}
          </Badge>
        )}
      </div>

      {bomGovernanceBlocked && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-amber-800 text-xs">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Gate 2 — BOM governance blocked.</strong>{' '}
            {unresolvedBomConflictCount} unresolved BOM conflicts (BOM-CONF-*). Costing cannot run on
            authoritative BOM until conflicts are resolved.
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Decision 5:</span>
        <Badge variant="warning">{DECISION5_STATUS.replace(/_/g, ' ')}</Badge>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-error-50 dark:bg-error-950/30 border border-error-200 text-error-700 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {display && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <span className="text-slate-500 block">Status</span>
            <strong>{display.status}</strong>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <span className="text-slate-500 block">Material cost</span>
            <strong>{display.materialCost} {display.currency}</strong>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <span className="text-slate-500 block">BOM v</span>
            <strong>{display.lineage?.bomVersion ?? '—'}</strong>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <span className="text-slate-500 block">Eng rev</span>
            <strong>{display.lineage?.engineeringRevision ?? '—'}</strong>
          </div>
        </div>
      )}

      {display?.blockingReasons && display.blockingReasons.length > 0 && (
        <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-disc pl-4">
          {display.blockingReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={loading || !canAct} onClick={() => void handlePreview()}>
          Preview costing
        </Button>
        <Button
          size="sm"
          disabled={loading || !canAct || gateBlocked}
          onClick={() => void handleCalculate()}
        >
          Calculate &amp; persist
        </Button>
        {currentRun?.calculationId && (
          <Button size="sm" variant="secondary" disabled={loading} onClick={() => void handlePricingPreview()}>
            <DollarSign className="h-3 w-3 mr-1" />
            Commercial pricing preview
          </Button>
        )}
      </div>

      {pricingPreview && (
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs space-y-1">
          <div className="font-semibold text-slate-700 dark:text-slate-300">Commercial pricing (boundary)</div>
          <div>Engineering cost: {pricingPreview.materialCost} {pricingPreview.costingCurrency}</div>
          {pricingPreview.finalSellingPrice != null && (
            <div>Selling price: {pricingPreview.finalSellingPrice} {pricingPreview.pricingCurrency}</div>
          )}
          <div className="text-slate-500">{pricingPreview.boundaryNote}</div>
        </div>
      )}
    </div>
  );
};
