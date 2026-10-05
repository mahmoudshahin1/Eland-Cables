import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, Package, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  calculateInquiryContainerStudyWorkspace,
  fetchInquiryContainerStudyWorkspace,
  selectInquiryContainerStudyOption,
  type InquiryContainerStudyWorkspaceDto,
} from '../../services/inquiryContainerStudyApiService';
import { groupPhysicalDrumsByInquiryLine } from '../../domain/inquiryContainerStudyPresentation';

interface InquiryContainerStudyPanelProps {
  inquiryId: string;
  isV2Inquiry: boolean;
  onOpenDeliveryInformation?: () => void;
}

function statusClass(status: InquiryContainerStudyWorkspaceDto['options'][number]['allocationStatus']) {
  if (status === 'ALLOCATED') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (status === 'PARTIAL') return 'bg-amber-50 text-amber-800 border-amber-200';
  if (status === 'UNALLOCATED') return 'bg-red-50 text-red-800 border-red-200';
  if (status === 'NOT_READY') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export const InquiryContainerStudyPanel: React.FC<InquiryContainerStudyPanelProps> = ({
  inquiryId,
  onOpenDeliveryInformation,
}) => {
  const { jwtToken } = useAuth();
  const [workspace, setWorkspace] = useState<InquiryContainerStudyWorkspaceDto | null>(null);
  const [region, setRegion] = useState<'Europe' | 'Africa'>('Europe');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!jwtToken) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchInquiryContainerStudyWorkspace(jwtToken, inquiryId, region);
      setWorkspace(next);
      if (next.region) setRegion(next.region);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Container Study.');
    } finally {
      setLoading(false);
    }
  }, [jwtToken, inquiryId, region]);

  useEffect(() => {
    void load();
  }, [load]);

  const runCalculate = async () => {
    if (!jwtToken) return;
    setBusy(true);
    setError(null);
    try {
      const next = await calculateInquiryContainerStudyWorkspace(jwtToken, inquiryId, region);
      setWorkspace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Container calculation failed.');
    } finally {
      setBusy(false);
    }
  };

  const runSelect = async (typeCode: string) => {
    if (!jwtToken) return;
    setBusy(true);
    setError(null);
    try {
      const next = await selectInquiryContainerStudyOption(jwtToken, inquiryId, typeCode, region);
      setWorkspace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Container selection failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-600" />
            Container Study
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">
            Calculate container options from the confirmed physical drum population. Selecting a container does
            not change cutting lengths or drum selection.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
            Region
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value === 'Africa' ? 'Africa' : 'Europe')}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-800 bg-white"
            >
              <option value="Europe">Europe</option>
              <option value="Africa">Africa</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void runCalculate()}
            disabled={busy || loading || Boolean(workspace && !workspace.readiness.ok)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
            Calculate Container Options
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {workspace?.shippingCostFinancial ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <p className="font-bold text-slate-800">Shipping cost</p>
          {workspace.shippingCostFinancial.resolutionCode === 'APPLIED' && workspace.shippingCostFinancial.amount != null ? (
            <p className="mt-1">
              {workspace.shippingCostFinancial.amount} {workspace.shippingCostFinancial.currency} · v
              {workspace.shippingCostFinancial.shippingRateVersion} · {workspace.shippingCostFinancial.deliveryPoint} ·{' '}
              {workspace.shippingCostFinancial.incotermCode} · {workspace.shippingCostFinancial.containerType}
            </p>
          ) : (
            <p className="mt-1 font-semibold">{workspace.shippingCostFinancial.resolutionCode}</p>
          )}
          <p className="mt-1 text-slate-500">Physical packing still runs when shipping cost is not configured.</p>
        </div>
      ) : null}

      {workspace ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-physical-drums-status={(workspace.physicalDrums.length || 0) > 0 ? 'available' : 'missing'}
              className={`inline-flex px-2 py-0.5 rounded-full border font-bold ${
                (workspace.physicalDrums.length || 0) > 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              Physical drums: {(workspace.physicalDrums.length || 0) > 0 ? 'AVAILABLE' : 'NOT AVAILABLE'}
            </span>
            <span
              data-container-study-status={workspace.readiness.ok ? 'ready' : 'not-ready'}
              className={`inline-flex px-2 py-0.5 rounded-full border font-bold ${
                workspace.readiness.ok
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-900 border-amber-200'
              }`}
            >
              Container Study: {workspace.readiness.ok ? 'READY' : 'NOT READY'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">Destination Port</p>
              <p
                data-destination-port-label="true"
                data-destination-configured={workspace.shipmentIdentity?.destinationConfigured ? 'true' : 'false'}
                data-customer-master-destination={
                  workspace.shipmentIdentity?.destinationConfigured ? 'configured' : 'not-configured'
                }
                className={`mt-1 font-bold ${
                  workspace.shipmentIdentity?.destinationConfigured ? 'text-slate-900' : 'text-slate-700'
                }`}
              >
                {workspace.shipmentIdentity?.destinationConfigured
                  ? `[${workspace.shipmentIdentity.destinationPortLabel}]`
                  : workspace.shipmentIdentity?.destinationPortLabel ||
                    'Not configured — shipping cost will be calculated later.'}
              </p>
              {workspace.shipmentIdentity?.destinationConfigured === false &&
              workspace.shipmentIdentity.destinationMessage &&
              workspace.shipmentIdentity.destinationMessage !== workspace.shipmentIdentity.destinationPortLabel ? (
                <p data-destination-port-message="true" className="mt-1 text-slate-600">
                  {workspace.shipmentIdentity.destinationMessage}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">Incoterm</p>
              <p
                data-incoterm-label="true"
                className={`mt-1 font-bold ${
                  workspace.shipmentIdentity?.incotermConfigured ? 'text-slate-900' : 'text-amber-900'
                }`}
              >
                [{workspace.shipmentIdentity?.incotermLabel || 'Select from approved Incoterm Master'}]
              </p>
              {workspace.shipmentIdentity?.incotermMessage ? (
                <p data-incoterm-message="true" className="mt-1 text-amber-900">
                  {workspace.shipmentIdentity.incotermMessage}
                </p>
              ) : !workspace.shipmentIdentity?.incotermConfigured ? (
                <p className="mt-1 text-amber-900">Select from approved Incoterm Master.</p>
              ) : null}
            </div>
          </div>
          {onOpenDeliveryInformation ? (
            <button
              type="button"
              onClick={onOpenDeliveryInformation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-800 font-bold hover:bg-slate-50"
            >
              Open Delivery Information
            </button>
          ) : null}
        </div>
      ) : null}

      {workspace && !workspace.readiness.ok && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 space-y-1">
          <p className="font-bold">Container Study is not ready to calculate</p>
          {workspace.readiness.issues.map((issue) => (
            <p key={`${issue.code}-${issue.message}`}>{issue.message}</p>
          ))}
        </div>
      )}

      {workspace?.incompleteContainerTypes.length ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <p className="font-bold text-slate-800">Incomplete / unapproved container master data</p>
          <p className="mt-1">
            {workspace.incompleteContainerTypes
              .map((type) => `${type.code} (${type.dimensionsStatus || 'INCOMPLETE'})`)
              .join(', ')}
            . These types are shown as Not Ready and are not used in calculation.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <SummaryCard label="Total Drums" value={String(workspace?.summary.totalDrums ?? 0)} />
        <SummaryCard
          label="Total Length"
          value={
            workspace?.summary.totalCuttingLengthM != null
              ? `${workspace.summary.totalCuttingLengthM.toLocaleString()} m`
              : '—'
          }
        />
        <SummaryCard
          label="Total Net Weight"
          value={
            workspace?.summary.totalNetWeightKg != null
              ? `${workspace.summary.totalNetWeightKg.toLocaleString()} kg`
              : 'Not Available'
          }
        />
        <SummaryCard label="Total Volume" value={workspace?.summary.totalVolumeLabel || 'Not Available'} />
        <SummaryCard
          label="Estimated Containers"
          value={
            workspace?.summary.estimatedContainers != null ? String(workspace.summary.estimatedContainers) : '—'
          }
          hint="From calculation result only"
        />
        <SummaryCard
          label="Recommended Option"
          value={workspace?.summary.recommendedTypeCode || '—'}
          hint="Ranked from the calculation result"
        />
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
          Physical drums from current drum plan
        </div>
        {workspace && workspace.physicalDrums.length > 1 ? (
          <div className="px-3 py-2 text-[11px] text-slate-600 border-b border-slate-100 flex flex-wrap gap-2">
            {groupPhysicalDrumsByInquiryLine(workspace.physicalDrums).map((group) => (
              <span
                key={group.inquiryLineId}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold"
              >
                Line {group.inquiryLineNumber ?? '—'}: {group.drumCount} drums ·{' '}
                {group.totalCuttingLengthM.toLocaleString()} m
              </span>
            ))}
          </div>
        ) : null}
        {loading && !workspace ? (
          <p className="p-4 text-slate-500 flex items-center gap-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading physical drums…
          </p>
        ) : (workspace?.physicalDrums.length || 0) === 0 ? (
          <p className="p-4 text-slate-500">No confirmed physical drums are available for this inquiry.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-white text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Line</th>
                <th className="px-3 py-2">Drum</th>
                <th className="px-3 py-2">Instance</th>
                <th className="px-3 py-2 text-right">Cutting length</th>
                <th className="px-3 py-2 text-right">Gross weight</th>
              </tr>
            </thead>
            <tbody>
              {workspace?.physicalDrums.map((drum) => (
                <tr key={drum.physicalDrumKey} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{drum.inquiryLineNumber ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-800" data-drum-code={drum.drumCode}>
                    <div className="font-semibold">{drum.drumDescription || drum.drumLabel || drum.drumCode}</div>
                    {drum.drumDescription ? (
                      <div className="font-mono text-[10px] text-slate-500">{drum.drumCode}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{drum.instanceIndex}</td>
                  <td className="px-3 py-2 text-right font-mono">{drum.cuttingLengthM.toLocaleString()} m</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {drum.grossWeightKg != null ? `${drum.grossWeightKg.toLocaleString()} kg` : 'Not Available'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
          Container options
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[880px]">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Container Type</th>
                <th className="px-3 py-2">Internal Dimensions</th>
                <th className="px-3 py-2">Max Payload</th>
                <th className="px-3 py-2">Volume</th>
                <th className="px-3 py-2">Required Containers</th>
                <th className="px-3 py-2">Utilization</th>
                <th className="px-3 py-2">Allocation Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(workspace?.options || []).map((option) => (
                <tr
                  key={option.typeCode}
                  className={`border-t border-slate-100 ${option.selected ? 'bg-blue-50/40' : 'bg-white'}`}
                >
                  <td className="px-3 py-2.5">
                    <div className="font-bold text-slate-800">{option.description}</div>
                    <div className="font-mono text-slate-500">{option.typeCode}</div>
                    {option.recommended && (
                      <div className="text-[10px] font-bold text-emerald-700 mt-0.5">Recommended</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono">{option.internalDimensionsLabel}</td>
                  <td className="px-3 py-2.5 font-mono">{option.maxPayloadLabel}</td>
                  <td className="px-3 py-2.5">{option.volumeLabel}</td>
                  <td className="px-3 py-2.5 font-mono">{option.requiredContainersLabel}</td>
                  <td className="px-3 py-2.5 font-mono">{option.utilizationLabel}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full border font-bold ${statusClass(option.allocationStatus)}`}>
                      {option.allocationStatus.replace('_', ' ')}
                    </span>
                    {option.notReadyReason ? (
                      <div className="text-[10px] text-slate-500 mt-1">{option.notReadyReason}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {option.selected ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 font-bold">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Selected
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!option.selectable || busy}
                        onClick={() => void runSelect(option.typeCode)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Select
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(workspace?.unallocated.length || 0) > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 space-y-1">
          <p className="font-bold">UNALLOCATED drums</p>
          {workspace?.unallocated.map((item) => (
            <p key={item.physicalDrumKey}>
              {item.physicalDrumKey}: {item.reasonCode} — {item.detail}
            </p>
          ))}
          {workspace?.confirmationBlocked ? (
            <p>Confirmation is blocked until every physical drum is allocated.</p>
          ) : null}
        </div>
      )}

      {workspace?.historicalResultIds.length ? (
        <p className="text-[11px] text-slate-500">
          Historical results remain readable: {workspace.historicalResultIds.join(', ')}
          {workspace.algorithmVersionCode ? ` · ${workspace.algorithmVersionCode}` : ''}
          {workspace.configurationVersion ? ` / ${workspace.configurationVersion}` : ''}
        </p>
      ) : null}
    </div>
  );
};

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-white">
      <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">{label}</p>
      <p className="font-bold text-sm text-slate-900 mt-1">{value}</p>
      {hint ? <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p> : null}
    </div>
  );
}
