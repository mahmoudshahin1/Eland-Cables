import React from 'react';
import { CommercialInquiryDetail } from '../inquiry-quotation/CommercialInquiryDetail';

interface CustomerInquiryDetailProps {
  inquiryId: string;
  onBack: () => void;
}

/** Customer portal inquiry workspace — same 8 tabs as internal; costing content is commercial-facing only. */
export const CustomerInquiryDetail: React.FC<CustomerInquiryDetailProps> = ({ inquiryId, onBack }) => {
  return <CommercialInquiryDetail inquiryId={inquiryId} onBack={onBack} portalMode="customer" />;
};
