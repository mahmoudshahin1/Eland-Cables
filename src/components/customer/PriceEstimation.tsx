import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerPortalTab, SystemNotification } from '../../types';
import { CustomerInquiryList } from './CustomerInquiryList';
import { customerInquiryDetailPath } from '../../app/shellRoutes';

interface PriceEstimationProps {
  onNavigateTab: (tab: CustomerPortalTab) => void;
  selectedCableCode?: string;
  onAddNotification?: (notif: SystemNotification) => void;
  initialInquiryId?: string;
  onInitialInquiryConsumed?: () => void;
  initialStatus?: string;
  onInitialStatusConsumed?: () => void;
  initialSearch?: string;
  onInitialSearchConsumed?: () => void;
}

export const PriceEstimation: React.FC<PriceEstimationProps> = ({
  initialInquiryId,
  onInitialInquiryConsumed,
  initialStatus,
  onInitialStatusConsumed,
  initialSearch,
  onInitialSearchConsumed,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (initialInquiryId) {
      navigate(customerInquiryDetailPath(initialInquiryId), { replace: true });
      onInitialInquiryConsumed?.();
    }
  }, [initialInquiryId, navigate, onInitialInquiryConsumed]);

  return (
    <CustomerInquiryList
      initialStatus={initialStatus}
      onInitialStatusConsumed={onInitialStatusConsumed}
      initialSearch={initialSearch}
      onInitialSearchConsumed={onInitialSearchConsumed}
    />
  );
};
