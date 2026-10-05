import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { v2CustomerInquiryDetailPath } from '../../../app/shellRoutes';
import {
  createCommercialInquiry,
  fetchCommercialInquiries,
  type CommercialInquiryDto,
} from '../../../services/commercialInquiryApiService';
import { V2CustomerDashboardView } from './V2CustomerInquiryViews';
import {
  buildCustomerCreateInquiryInput,
  classifyCustomerInquiryError,
} from './v2CustomerInquiryPresentation';

export function V2CustomerDashboardPage() {
  const { jwtToken, currentUser } = useAuth();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'empty' | 'error' | 'unauthorized' | 'forbidden'
  >('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [total, setTotal] = useState(0);
  const [draftTotal, setDraftTotal] = useState(0);
  const [submittedTotal, setSubmittedTotal] = useState(0);
  const [quotedTotal, setQuotedTotal] = useState(0);
  const [recent, setRecent] = useState<CommercialInquiryDto[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!jwtToken) {
      setLoadState('unauthorized');
      return;
    }
    setLoadState('loading');
    setErrorMessage(undefined);
    try {
      const [recentRes, draftRes, submittedRes, quotedRes] = await Promise.all([
        fetchCommercialInquiries(jwtToken, { page: 1, pageSize: 5, sortBy: 'updatedAt', sortDir: 'desc' }),
        fetchCommercialInquiries(jwtToken, { page: 1, pageSize: 1, status: 'DRAFT' }),
        fetchCommercialInquiries(jwtToken, { page: 1, pageSize: 1, status: 'SUBMITTED' }),
        fetchCommercialInquiries(jwtToken, { page: 1, pageSize: 1, status: 'QUOTED' }),
      ]);
      setRecent(recentRes.inquiries);
      setTotal(recentRes.total);
      setDraftTotal(draftRes.total);
      setSubmittedTotal(submittedRes.total);
      setQuotedTotal(quotedRes.total);
      setLoadState(recentRes.inquiries.length ? 'ready' : 'empty');
    } catch (err) {
      const kind = classifyCustomerInquiryError(err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load dashboard');
      setLoadState(kind === 'error' ? 'error' : kind);
    }
  }, [jwtToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    if (!jwtToken) return;
    setCreating(true);
    try {
      const inquiry = await createCommercialInquiry(
        jwtToken,
        buildCustomerCreateInquiryInput({
          companyName: currentUser?.companyName,
          fullName: currentUser?.fullName,
        })
      );
      navigate(v2CustomerInquiryDetailPath(inquiry.id));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to create inquiry');
      setLoadState('error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <V2CustomerDashboardView
      greetingName={currentUser?.fullName || currentUser?.companyName || ''}
      loadState={loadState}
      errorMessage={errorMessage}
      total={total}
      draftTotal={draftTotal}
      submittedTotal={submittedTotal}
      quotedTotal={quotedTotal}
      recent={recent}
      onCreate={() => void onCreate()}
      creating={creating}
    />
  );
}
