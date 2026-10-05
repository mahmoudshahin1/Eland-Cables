import React, { useEffect, useState } from 'react';
import { CustomerPortalTab, SalesOrderStatus, SystemNotification } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { fetchV2Inquiries, type V2InquiryDto } from '../../services/v2InquiryConfigurationApiService';
import { listCustomerSalesOrders } from '../../services/customerPortalApiService';
import { customerFirstName } from '../../app/customerPortalNav';
import { CustomerHomeHero } from './CustomerHomeHero';
import { CustomerHomeKpis } from './CustomerHomeKpis';
import { CustomerHomeInquiryTrend } from './CustomerHomeInquiryTrend';
import { CustomerHomeRecentInquiries } from './CustomerHomeRecentInquiries';
import { CustomerHomeQuickActions } from './CustomerHomeQuickActions';
import { CustomerHomeAnnouncements } from './CustomerHomeAnnouncements';
import { CustomerHomeProductCategories } from './CustomerHomeProductCategories';

interface CustomerDashboardProps {
  onNavigateTab: (
    tab: CustomerPortalTab,
    options?: { inquiryId?: string; status?: string; orderStatus?: SalesOrderStatus }
  ) => void;
  selectedCableCode?: string;
  notifications?: SystemNotification[];
}

const OPEN_ORDER_STATUSES = new Set(['DRAFT', 'CONFIRMED', 'OPEN']);
const DELIVERED_ORDER_STATUSES = new Set(['DELIVERED']);

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({ onNavigateTab, notifications }) => {
  const { currentUser, jwtToken } = useAuth();
  const [inquiries, setInquiries] = useState<V2InquiryDto[]>([]);
  const [inquiryTotal, setInquiryTotal] = useState(0);
  const [quotedTotal, setQuotedTotal] = useState(0);
  const [openOrders, setOpenOrders] = useState(0);
  const [deliveredOrders, setDeliveredOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const firstName = customerFirstName(currentUser?.fullName);

  useEffect(() => {
    if (!jwtToken) {
      setLoading(false);
      setInquiryTotal(0);
      setQuotedTotal(0);
      setInquiries([]);
      setOpenOrders(0);
      setDeliveredOrders(0);
      setError('Sign in to view your inquiries.');
      return;
    }
    setLoading(true);
    Promise.all([
      fetchV2Inquiries(jwtToken, { pageSize: 50 }),
      fetchV2Inquiries(jwtToken, { pageSize: 1, status: 'QUOTED' }),
      listCustomerSalesOrders(jwtToken).catch(() => []),
    ])
      .then(([inquiryRes, quotedRes, salesOrders]) => {
        setInquiries(inquiryRes.inquiries);
        setInquiryTotal(inquiryRes.total);
        setQuotedTotal(quotedRes.total);
        setOpenOrders(salesOrders.filter((row) => OPEN_ORDER_STATUSES.has(String(row.status || '').toUpperCase())).length);
        setDeliveredOrders(
          salesOrders.filter((row) => DELIVERED_ORDER_STATUSES.has(String(row.status || '').toUpperCase())).length
        );
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load inquiries'))
      .finally(() => setLoading(false));
  }, [jwtToken]);

  return (
    <div className="space-y-6">
      <CustomerHomeHero firstName={firstName} />

      <CustomerHomeKpis
        loading={loading}
        values={{
          totalInquiries: inquiryTotal,
          quotations: quotedTotal,
          openOrders,
          deliveredOrders,
        }}
        onNavigateTab={onNavigateTab}
      />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-2 min-w-0">
          <CustomerHomeInquiryTrend inquiries={inquiries} loading={loading} />
        </div>
        <div className="xl:col-span-3 min-w-0">
          <CustomerHomeRecentInquiries
            inquiries={inquiries}
            loading={loading}
            error={error}
            onViewAll={() => onNavigateTab('price_estimation')}
            onCreate={() => onNavigateTab('price_estimation')}
          />
        </div>
      </div>

      <CustomerHomeQuickActions onNavigateTab={onNavigateTab} />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-3 min-w-0">
          <CustomerHomeProductCategories />
        </div>
        <div className="xl:col-span-2 min-w-0">
          <CustomerHomeAnnouncements
            notifications={notifications}
            onViewAll={() => onNavigateTab('support')}
          />
        </div>
      </div>
    </div>
  );
};
