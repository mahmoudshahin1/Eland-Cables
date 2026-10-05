import React, { useCallback, useState, useEffect } from 'react';
import { SystemNotification } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { CommercialInquiryList } from './CommercialInquiryList';
import { CommercialInquiryDetail } from './CommercialInquiryDetail';
import {
  createCommercialInquiry,
  CommercialInquiryDto,
} from '../../services/commercialInquiryApiService';

interface InquiryQuotationWorkspaceProps {
  title?: string;
  onAddNotification?: (notif: SystemNotification) => void;
  initialInquiryId?: string;
  onInitialInquiryConsumed?: () => void;
  initialStatus?: string;
  onInitialStatusConsumed?: () => void;
}

export const InquiryQuotationWorkspace: React.FC<InquiryQuotationWorkspaceProps> = ({
  onAddNotification,
  initialInquiryId,
  onInitialInquiryConsumed,
  initialStatus,
  onInitialStatusConsumed,
}) => {
  const { jwtToken, currentUser } = useAuth();
  const [screen, setScreen] = useState<'home' | 'detail'>(initialInquiryId ? 'detail' : 'home');
  const [openId, setOpenId] = useState<string | undefined>(initialInquiryId);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (initialInquiryId) {
      setOpenId(initialInquiryId);
      setScreen('detail');
      onInitialInquiryConsumed?.();
    }
  }, [initialInquiryId, onInitialInquiryConsumed]);

  const handleNew = async () => {
    if (!jwtToken) {
      onAddNotification?.({
        id: `notif-${Date.now()}`,
        title: 'Sign in required',
        message: 'Please sign in with your portal credentials to create a persisted commercial inquiry.',
        timestamp: new Date().toLocaleString(),
        read: false,
        type: 'system',
      });
      return;
    }
    try {
      const inquiry = await createCommercialInquiry(jwtToken, {
        customerName: currentUser?.companyName || currentUser?.fullName || undefined,
        contactPerson: currentUser?.fullName || undefined,
        projectName: 'New Commercial Inquiry',
        currency: 'USD',
        notes: 'Created from Commercial Inquiries workspace.',
      });
      setOpenId(inquiry.id);
      setScreen('detail');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      onAddNotification?.({
        id: `notif-${Date.now()}`,
        title: 'Create inquiry failed',
        message: err instanceof Error ? err.message : 'Unable to create inquiry',
        timestamp: new Date().toLocaleString(),
        read: false,
        type: 'system',
      });
    }
  };

  const handleInquiryChanged = useCallback((inquiry: CommercialInquiryDto) => {
    setOpenId(inquiry.id);
    setRefreshKey((k) => k + 1);
  }, []);

  if (screen === 'home') {
    return (
      <CommercialInquiryList
        refreshKey={refreshKey}
        initialStatus={initialStatus}
        onInitialStatusConsumed={onInitialStatusConsumed}
        onOpen={(id) => {
          setOpenId(id);
          setScreen('detail');
        }}
        onNew={() => void handleNew()}
      />
    );
  }

  if (!openId) {
    return null;
  }

  return (
    <CommercialInquiryDetail
      inquiryId={openId}
      portalMode="internal"
      onBack={() => {
        setScreen('home');
        setRefreshKey((k) => k + 1);
      }}
      onInquiryChanged={handleInquiryChanged}
      onAddNotification={onAddNotification}
    />
  );
};
