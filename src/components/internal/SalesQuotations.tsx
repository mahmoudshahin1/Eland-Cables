import React from 'react';
import { useLocation } from 'react-router-dom';
import { InquiryQuotationWorkspace } from '../inquiry-quotation/InquiryQuotationWorkspace';
import { SystemNotification } from '../../types';

interface SalesQuotationsProps {
  onAddNotification?: (notif: SystemNotification) => void;
}

export const SalesQuotations: React.FC<SalesQuotationsProps> = ({ onAddNotification }) => {
  const location = useLocation();
  const inquiryId = (location.state as { inquiryId?: string } | null)?.inquiryId;
  return (
    <InquiryQuotationWorkspace
      title="Inquiries & Quotes"
      onAddNotification={onAddNotification}
      initialInquiryId={inquiryId}
    />
  );
};
