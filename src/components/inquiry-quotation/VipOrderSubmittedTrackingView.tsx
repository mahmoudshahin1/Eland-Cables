import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Factory,
  MessageSquare,
  PhoneCall,
  Mail,
  Search,
  ArrowRight,
  FileText,
  ChevronDown,
  ChevronUp,
  Package,
  ShieldCheck,
  Sparkles,
  Headphones,
  Compass,
  Eye,
} from 'lucide-react';
import { CommercialInquiryDto } from '../../services/commercialInquiryApiService';
import { V2QuotationDto } from '../../services/v2QuotationApiService';
import { FulfillmentType } from '../../services/commercialFulfillmentApiService';
import { VipCommercialOfferDocumentViewer } from './VipCommercialOfferDocumentViewer';

interface VipOrderSubmittedTrackingViewProps {
  inquiry: CommercialInquiryDto;
  quotation?: V2QuotationDto | null;
  jwtToken?: string | null;
  preferredContainerType?: string | null;
  onExploreCables: () => void;
  onViewQuotationPdf?: () => void;
  onToggleTechnicalDetails?: () => void;
  showTechnicalDetails?: boolean;
}

export const VipOrderSubmittedTrackingView: React.FC<VipOrderSubmittedTrackingViewProps> = ({
  inquiry,
  quotation,
  jwtToken,
  preferredContainerType = '40HQ',
  onExploreCables,
  onViewQuotationPdf,
  onToggleTechnicalDetails,
  showTechnicalDetails = false,
}) => {
  const [showContactModal, setShowContactModal] = useState(false);
  const [showCommercialOfferModal, setShowCommercialOfferModal] = useState(false);

  const meta = (inquiry.commercialMetadata || {}) as Record<string, unknown>;
  const fulfillmentType = (meta.requestedFulfillmentType as FulfillmentType) || quotation?.fulfillmentType || 'DIRECT_ORDER';
  const fulfillmentLabel = fulfillmentType === 'DIRECT_ORDER' ? 'Direct Sales Order' : 'Sales Agreement';
  const isApprovedBySales = meta.commercialApprovalStatus === 'APPROVED' || quotation?.commercialApprovalStatus === 'APPROVED';
  const isReleasedToProduction = meta.productionStatus === 'RELEASED_TO_PRODUCTION' || isApprovedBySales;

  const quoteNumber = quotation?.quotationNumber || inquiry.quotations?.[0]?.quotationNumber || inquiry.inquiryNumber;
  const quoteAmount = quotation?.sellingPrice || inquiry.commercialProductsTotal;
  const currency = inquiry.currency || 'USD';
  const submittedAt = meta.submittedToSalesAt
    ? new Date(meta.submittedToSalesAt as string).toLocaleString()
    : 'Recently';
  const releasedAt = meta.releasedToProductionAt
    ? new Date(meta.releasedToProductionAt as string).toLocaleString()
    : null;

  return (
    <div className="space-y-5 animate-fade-in font-sans">
      {/* 1. Main Celebration & Status Banner */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-50/90 via-white to-blue-50/70 p-6 sm:p-7 shadow-lg shadow-emerald-500/5">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-emerald-200/30 blur-2xl pointer-events-none" />
        <div className="absolute right-20 -bottom-10 h-36 w-36 rounded-full bg-blue-200/25 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-md ${
              isReleasedToProduction
                ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-emerald-600/30'
                : 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-blue-600/30'
            }`}>
              {isReleasedToProduction ? (
                <Factory className="h-7 w-7 animate-pulse" />
              ) : (
                <CheckCircle2 className="h-7 w-7" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wider ${
                  isReleasedToProduction
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-900 border border-amber-300'
                }`}>
                  {isReleasedToProduction ? (
                    <>
                      <Factory className="h-3 w-3" />
                      In Production
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3" />
                      Awaiting Sales Sign-Off
                    </>
                  )}
                </span>
                <span className="font-mono text-xs font-bold text-slate-500">
                  {inquiry.inquiryNumber} · {quoteNumber}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-slate-900 font-display tracking-tight">
                {isReleasedToProduction
                  ? 'Your Order Has Been Released to Production!'
                  : 'Order & Contract Request Received by Sales!'}
              </h2>

              <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                {isReleasedToProduction ? (
                  <>
                    Sales has officially approved your contract for <strong className="text-slate-900">{fulfillmentLabel}</strong>. 
                    Your cables have been scheduled and dispatched to the <strong className="text-emerald-700 font-bold">Production Floor</strong> for manufacturing, cutting, and drum packaging.
                  </>
                ) : (
                  <>
                    Your request for <strong className="text-slate-900">{fulfillmentLabel}</strong> has been transmitted to the Sales team. 
                    As soon as Sales confirms commercial sign-off and releases the order to the <strong className="text-brand-700 font-bold">Production Floor</strong>, you will receive an instant notification here.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Quick Metrics Badge */}
          {quoteAmount != null && (
            <div className="shrink-0 rounded-2xl border border-slate-200/90 bg-white/90 backdrop-blur-xs p-4 text-left sm:text-right shadow-xs min-w-[180px]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Contract Value</p>
              <p className="text-xl font-black text-brand-900 font-mono mt-0.5">
                {Number(quoteAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Fulfillment: <span className="font-bold text-slate-800">{fulfillmentLabel}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Interactive Real-Time 5-Stage Production Timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-900 font-display">
              Live Order &amp; Production Journey
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">Real-time status synced</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          {/* Stage 1: Contract Submitted */}
          <div className="relative rounded-xl border-2 border-emerald-400 bg-emerald-50/60 p-3.5 space-y-1.5 transition-all">
            <div className="flex items-center justify-between">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold shadow-xs">
                ✓
              </span>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                Submitted
              </span>
            </div>
            <p className="font-bold text-xs text-slate-900">1. Contract Selected</p>
            <p className="text-[11px] text-slate-500">
              {fulfillmentLabel} submitted by customer on {submittedAt}.
            </p>
          </div>

          {/* Stage 2: Sales Sign-Off */}
          <div className={`relative rounded-xl border-2 p-3.5 space-y-1.5 transition-all ${
            isApprovedBySales
              ? 'border-emerald-400 bg-emerald-50/60'
              : 'border-blue-400 bg-blue-50/50 shadow-sm ring-2 ring-blue-400/20'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shadow-xs ${
                isApprovedBySales ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white animate-pulse'
              }`}>
                {isApprovedBySales ? '✓' : '2'}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isApprovedBySales
                  ? 'text-emerald-800 bg-emerald-100'
                  : 'text-blue-800 bg-blue-100'
              }`}>
                {isApprovedBySales ? 'Approved' : 'In Review'}
              </span>
            </div>
            <p className="font-bold text-xs text-slate-900">2. Sales Sign-Off</p>
            <p className="text-[11px] text-slate-500">
              {isApprovedBySales
                ? 'Commercial terms and metal price rates signed off.'
                : 'Commercial management reviewing pricing and dispatch schedule.'}
            </p>
          </div>

          {/* Stage 3: Released to Production Floor */}
          <div className={`relative rounded-xl border-2 p-3.5 space-y-1.5 transition-all ${
            isReleasedToProduction
              ? 'border-emerald-500 bg-emerald-50/80 shadow-md ring-2 ring-emerald-400/30'
              : 'border-slate-200 bg-slate-50/60 opacity-80'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shadow-xs ${
                isReleasedToProduction ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {isReleasedToProduction ? '✓' : '3'}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isReleasedToProduction
                  ? 'text-emerald-800 bg-emerald-100'
                  : 'text-slate-600 bg-slate-100'
              }`}>
                {isReleasedToProduction ? 'Production Floor 🏭' : 'Upcoming'}
              </span>
            </div>
            <p className="font-bold text-xs text-slate-900">3. Production Floor</p>
            <p className="text-[11px] text-slate-500">
              {isReleasedToProduction
                ? `Job cards released to cable manufacturing plant (${releasedAt || 'Today'}).`
                : 'Awaiting Sales approval to release manufacturing job cards.'}
            </p>
          </div>

          {/* Stage 4: Drum Cutting & Testing */}
          <div className="relative rounded-xl border-2 border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5 opacity-70">
            <div className="flex items-center justify-between">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-bold">
                4
              </span>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                Scheduled
              </span>
            </div>
            <p className="font-bold text-xs text-slate-900">4. Cutting & Testing</p>
            <p className="text-[11px] text-slate-500">
              High-voltage routine test & drum spooling per cutting schedule.
            </p>
          </div>

          {/* Stage 5: Container Staging & Dispatch */}
          <div className="relative rounded-xl border-2 border-slate-200 bg-slate-50/60 p-3.5 space-y-1.5 opacity-70">
            <div className="flex items-center justify-between">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-bold">
                5
              </span>
              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                Logistics
              </span>
            </div>
            <p className="font-bold text-xs text-slate-900">5. Container & Dispatch</p>
            <p className="text-[11px] text-slate-500">
              Container stuffing, customs documentation, and bill of lading dispatch.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Help, Assistance & Next Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card A: Browse More Cables / New Inquiry */}
        <div className="rounded-2xl border-2 border-brand-200 bg-gradient-to-br from-brand-50/50 to-white p-5 space-y-3 shadow-xs hover:border-brand-400 transition-all flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-slate-900 font-display">
                  Explore More Cables
                </h4>
                <p className="text-[11px] text-slate-500">Continuous Inquiry &amp; Project Sizing</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Have another project or need additional cross-sections? Browse the Energya cable catalog and configure other cables while this order is being prepared.
            </p>
          </div>

          <button
            type="button"
            onClick={onExploreCables}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <Search className="h-4 w-4" />
            <span>Browse Cables Catalog &amp; New Inquiry</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Card B: Dedicated Help / Assistance & Live Sales Manager */}
        <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 to-white p-5 space-y-3 shadow-xs hover:border-blue-400 transition-all flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                <Headphones className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-slate-900 font-display">
                  Help &amp; Support
                </h4>
                <p className="text-[11px] text-slate-500">Dedicated Account Manager</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Need assistance with contract sign-off, payment schedule, or expedited delivery? Connect directly with your commercial account manager.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowContactModal(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Contact Sales Management</span>
          </button>
        </div>

        {/* Card C: Quotation Document & Official Specs */}
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 space-y-3 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-white shadow-xs">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-slate-900 font-display">
                  Official Commercial Offer
                </h4>
                <p className="text-[11px] text-slate-500 font-mono">Quotation {quoteNumber}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Review and print the formal signed commercial offer document containing unit rates, delivery port terms, and raw metal pricing indices.
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCommercialOfferModal(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 px-3 py-2.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Eye className="h-4 w-4 shrink-0" />
              <span>View Commercial Offer</span>
            </button>

            {onToggleTechnicalDetails && (
              <button
                type="button"
                onClick={onToggleTechnicalDetails}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                title={showTechnicalDetails ? 'Hide Workspace Details' : 'View Workspace Details'}
              >
                <span>{showTechnicalDetails ? 'Hide Details' : 'Workspace Details'}</span>
                {showTechnicalDetails ? (
                  <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Commercial Offer & TDS Modal Dialog */}
      {showCommercialOfferModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 sm:px-7 py-3.5 border-b border-slate-200 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-brand-600 text-white shadow-xs">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 font-display">
                    Official Commercial Offer &amp; Technical Data Sheet (TDS)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Quotation: {quoteNumber} · Inquiry: {inquiry.inquiryNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCommercialOfferModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors font-bold text-base cursor-pointer"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: VipCommercialOfferDocumentViewer */}
            <div className="p-4 sm:p-6 overflow-y-auto">
              <VipCommercialOfferDocumentViewer
                inquiry={inquiry}
                quotation={quotation}
                jwtToken={jwtToken ?? null}
                preferredContainerType={preferredContainerType}
              />
            </div>
          </div>
        </div>
      )}

      {/* Contact Sales Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-5 text-xs">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-blue-100 text-blue-700">
                  <Headphones className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 font-display">
                    Sales &amp; Support Assistance
                  </h3>
                  <p className="text-slate-500 text-[11px]">Energya Cables Commercial Management</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 rounded-2xl bg-slate-50 p-4 border border-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">Assigned Manager:</span>
                <span className="font-bold text-slate-900">Eng. Mohamed Ahmed</span>
              </div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500">Department:</span>
                <span className="font-semibold text-slate-800">Export &amp; VIP Commercial Sales</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Order Ref:</span>
                <span className="font-mono font-bold text-brand-700">{quoteNumber}</span>
              </div>
            </div>

            <div className="space-y-2">
              <a
                href="mailto:sales@energya.com?subject=Inquiry%20Contract%20Support"
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 font-medium transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <span>Email: sales@energya.com</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </a>

              <a
                href="tel:+20227558000"
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-800 font-medium transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <PhoneCall className="h-4 w-4 text-emerald-600" />
                  <span>Direct Hotline: +20 2 2755 8000</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </a>
            </div>

            <button
              type="button"
              onClick={() => setShowContactModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
