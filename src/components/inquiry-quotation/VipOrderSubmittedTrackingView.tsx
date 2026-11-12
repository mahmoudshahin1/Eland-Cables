import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CommercialInquiryDto } from '../../services/commercialInquiryApiService';
import { V2QuotationDto } from '../../services/v2QuotationApiService';

interface VipOrderSubmittedTrackingViewProps {
  inquiry: CommercialInquiryDto;
  quotation?: V2QuotationDto | null;
  onToggleTechnicalDetails?: () => void;
  showTechnicalDetails?: boolean;
}

export const VipOrderSubmittedTrackingView: React.FC<VipOrderSubmittedTrackingViewProps> = ({
  onToggleTechnicalDetails,
  showTechnicalDetails = false,
}) => {
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
      </div>
    </div>
  );
};
