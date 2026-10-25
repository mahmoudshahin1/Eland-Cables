import React from 'react';
import { CommercialInquiryDetail } from '../inquiry-quotation/CommercialInquiryDetail';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface CustomerInquiryDetailProps {
  inquiryId: string;
  onBack: () => void;
}

/** Customer portal inquiry workspace — same 8 tabs as internal; costing content is commercial-facing only. */
export const CustomerInquiryDetail: React.FC<CustomerInquiryDetailProps> = ({ inquiryId, onBack }) => {
  return (
    <ErrorBoundary fallbackTitle="Inquiry Workspace Notice">
      <CommercialInquiryDetail inquiryId={inquiryId} onBack={onBack} portalMode="customer" />
    </ErrorBoundary>
  );
};

