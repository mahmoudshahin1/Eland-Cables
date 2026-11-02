import React, { useState } from 'react';
import {
  MessageSquare,
  PhoneCall,
  Mail,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Headphones,
} from 'lucide-react';
import { CommercialInquiryDto } from '../../services/commercialInquiryApiService';
import { V2QuotationDto } from '../../services/v2QuotationApiService';

interface VipOrderSubmittedTrackingViewProps {
  inquiry: CommercialInquiryDto;
  quotation?: V2QuotationDto | null;
  onToggleTechnicalDetails?: () => void;
  showTechnicalDetails?: boolean;
}

export const VipOrderSubmittedTrackingView: React.FC<VipOrderSubmittedTrackingViewProps> = ({
  inquiry,
  quotation,
  onToggleTechnicalDetails,
  showTechnicalDetails = false,
}) => {
  const [showContactModal, setShowContactModal] = useState(false);
  const quoteNumber = quotation?.quotationNumber || inquiry.quotations?.[0]?.quotationNumber || inquiry.inquiryNumber;
  const changeRequestSubject = `Change request for ${quoteNumber}`;
  const changeRequestBody = `Please review my requested change for inquiry ${inquiry.inquiryNumber} and quotation ${quoteNumber}.`;

  return (
    <div className="space-y-5 animate-fade-in font-sans">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onToggleTechnicalDetails && (
          <button
            type="button"
            onClick={onToggleTechnicalDetails}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            title={showTechnicalDetails ? 'Hide Workspace Details' : 'View Workspace Details'}
          >
            <span>{showTechnicalDetails ? 'Hide Details' : 'Workspace Details'}</span>
            {showTechnicalDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowContactModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors cursor-pointer"
        >
          <MessageSquare className="h-4 w-4" />
          <span>Request a Change</span>
        </button>
      </div>

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
                href={`mailto:sales@energya.com?subject=${encodeURIComponent(changeRequestSubject)}&body=${encodeURIComponent(changeRequestBody)}`}
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
