import React, { useState } from 'react';
import {
  FileText,
  FileCheck,
  Send,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { FulfillmentType } from '../../services/commercialFulfillmentApiService';

interface VipContractFulfillmentSelectorProps {
  quotationId?: string | null;
  quotationNumber: string;
  versionNo: number;
  totalAmount?: number | string | null;
  currency?: string | null;
  initialFulfillmentType?: FulfillmentType;
  commercialApprovalStatus?: string | null;
  isSubmittedToSales?: boolean;
  canApprove?: boolean;
  onSubmitToSales: (type: FulfillmentType) => Promise<void>;
  onApproveCommercial?: (type: FulfillmentType) => Promise<void>;
  createdOrderId?: string | null;
  createdAgreementId?: string | null;
  isCustomer?: boolean;
}

export const VipContractFulfillmentSelector: React.FC<VipContractFulfillmentSelectorProps> = ({
  quotationId,
  quotationNumber,
  versionNo,
  totalAmount,
  currency = 'USD',
  initialFulfillmentType = 'DIRECT_ORDER',
  commercialApprovalStatus = 'NOT_SUBMITTED',
  isSubmittedToSales = false,
  canApprove = false,
  onSubmitToSales,
  onApproveCommercial,
  createdOrderId,
  createdAgreementId,
  isCustomer = true,
}) => {
  const [selectedType, setSelectedType] = useState<FulfillmentType>(
    initialFulfillmentType || 'DIRECT_ORDER'
  );
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(isSubmittedToSales);
  const [approved, setApproved] = useState(commercialApprovalStatus === 'APPROVED');
  const [feedback, setFeedback] = useState<string | null>(null);

  React.useEffect(() => {
    setSubmitted(Boolean(isSubmittedToSales));
  }, [isSubmittedToSales]);

  React.useEffect(() => {
    setApproved(commercialApprovalStatus === 'APPROVED');
  }, [commercialApprovalStatus]);

  const handleSubmit = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      await onSubmitToSales(selectedType);
      setSubmitted(true);
      setFeedback('Contract submitted to Sales successfully. You will receive an instant notification as soon as the order is released to the Production Floor.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!onApproveCommercial) return;
    setBusy(true);
    setFeedback(null);
    try {
      await onApproveCommercial(selectedType);
      setApproved(true);
      setFeedback('Commercial offer approved and released to the Production Floor successfully.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to approve quotation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-white p-5 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-blue-700 text-white shadow-md shadow-brand-500/20">
            <FileCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 font-display flex items-center gap-2">
              <span>Contract Fulfillment Path & Sign-Off</span>
              {approved ? (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Formally Approved
                </span>
              ) : submitted ? (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Awaiting Sales Approval
                </span>
              ) : null}
            </h3>
            <p className="text-slate-500 text-xs mt-0.5">
              Select the contract fulfillment structure for quotation{' '}
              <span className="font-mono font-bold text-slate-700">
                {quotationNumber} V{versionNo}
              </span>
            </p>
          </div>
        </div>

        {totalAmount != null && (
          <div className="text-right">
            <p className="text-[11px] text-slate-400">Total Offer Amount</p>
            <p className="text-base font-black text-brand-800 font-mono">
              {Number(totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
            </p>
          </div>
        )}
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl text-xs font-semibold ${approved ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-blue-50 text-blue-800 border border-blue-200'}`}>
          {feedback}
        </div>
      )}

      {/* Contract Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Option 1: Direct Sales Order */}
        <div
          onClick={() => (!submitted || !approved) && setSelectedType('DIRECT_ORDER')}
          className={`cursor-pointer rounded-2xl border-2 p-4 transition-all space-y-2 relative ${
            selectedType === 'DIRECT_ORDER'
              ? 'border-brand-600 bg-brand-50/40 shadow-md ring-2 ring-brand-500/15'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${selectedType === 'DIRECT_ORDER' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-xs text-slate-900">Direct Sales Order</p>
                <p className="text-[11px] text-slate-500">Immediate Spot Supply Order</p>
              </div>
            </div>
            <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${selectedType === 'DIRECT_ORDER' ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>
              {selectedType === 'DIRECT_ORDER' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
            </div>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Immediate supply order for the entire inquiry volume in a single delivery batch. Manufacturing and shipment execution commence immediately upon Sales sign-off.
          </p>
          <div className="pt-1 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
            <span>• Immediate Supply</span>
            <span>• Single Delivery Batch</span>
            <span>• Direct Invoicing</span>
          </div>
        </div>

        {/* Option 2: Sales Agreement */}
        <div
          onClick={() => (!submitted || !approved) && setSelectedType('SALES_AGREEMENT')}
          className={`cursor-pointer rounded-2xl border-2 p-4 transition-all space-y-2 relative ${
            selectedType === 'SALES_AGREEMENT'
              ? 'border-blue-600 bg-blue-50/40 shadow-md ring-2 ring-blue-500/15'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${selectedType === 'SALES_AGREEMENT' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                <Building className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold text-xs text-slate-900">Sales Agreement</p>
                <p className="text-[11px] text-slate-500">Annual & Project Framework Contract</p>
              </div>
            </div>
            <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${selectedType === 'SALES_AGREEMENT' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'}`}>
              {selectedType === 'SALES_AGREEMENT' && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
            </div>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Annual or project framework contract with scheduled releases (call-offs) over the agreed contract period with locked-in raw metal rates (LME Cu/Al).
          </p>
          <div className="pt-1 flex items-center gap-2 text-[10px] text-slate-400 font-medium">
            <span>• Scheduled Releases</span>
            <span>• Multiple Batches</span>
            <span>• Locked Metal Pricing</span>
          </div>
        </div>
      </div>

      {/* Action Buttons: Customer Submit vs Sales Approve */}
      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Approval guarantees technical adherence and fixes commercial quotation prices.</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Customer Submit Button */}
          {!submitted && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-600/25 hover:from-brand-700 hover:to-blue-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>
                {busy
                  ? 'Submitting…'
                  : `Submit to Sales as (${selectedType === 'DIRECT_ORDER' ? 'Direct Sales Order' : 'Sales Agreement'})`}
              </span>
            </button>
          )}

          {/* Sales Approve Button (if internal/sales role or testing) */}
          {(canApprove || !isCustomer) && submitted && !approved && (
            <button
              type="button"
              disabled={busy}
              onClick={handleApprove}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{busy ? 'Releasing to Production…' : 'Approve Quotation & Release to Production Floor'}</span>
            </button>
          )}

          {/* Customer waiting notice */}
          {isCustomer && submitted && !approved && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-medium text-amber-800">
              <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>Awaiting Sales sign-off. You will receive an instant notification once released to the Production Floor.</span>
            </div>
          )}

          {/* Links when approved */}
          {approved && createdOrderId && (
            <button
              type="button"
              onClick={() => {
                window.location.href = `/fulfillment/orders?id=${encodeURIComponent(createdOrderId)}`;
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:underline"
            >
              <span>Open Approved Sales Order</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}

          {approved && createdAgreementId && (
            <button
              type="button"
              onClick={() => {
                window.location.href = `/fulfillment/agreements?id=${encodeURIComponent(createdAgreementId)}`;
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:underline"
            >
              <span>Open Approved Agreement</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
