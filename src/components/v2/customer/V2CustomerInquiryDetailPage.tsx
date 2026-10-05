import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { V2_CUSTOMER_INQUIRIES_PATH } from '../../../app/shellRoutes';
import {
  fetchCommercialInquiry,
  type CommercialInquiryDto,
} from '../../../services/commercialInquiryApiService';
import { CommercialInquiryDetail } from '../../inquiry-quotation/CommercialInquiryDetail';
import { Stepper } from '../../ui';
import { V2CustomerInquiryDetailView } from './V2CustomerInquiryViews';
import {
  classifyCustomerInquiryError,
  customerInquiryJourneySteps,
} from './v2CustomerInquiryPresentation';

export function V2CustomerInquiryDetailPage() {
  const { jwtToken } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'empty' | 'error' | 'unauthorized' | 'forbidden' | 'not_found'
  >('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [inquiry, setInquiry] = useState<CommercialInquiryDto | null>(null);

  const load = useCallback(async () => {
    if (!jwtToken) {
      setLoadState('unauthorized');
      return;
    }
    if (!id) {
      setLoadState('not_found');
      setErrorMessage('Inquiry id is missing from the URL.');
      return;
    }
    setLoadState('loading');
    setErrorMessage(undefined);
    try {
      const record = await fetchCommercialInquiry(jwtToken, id);
      setInquiry(record);
      setLoadState('ready');
    } catch (err) {
      setInquiry(null);
      const kind = classifyCustomerInquiryError(err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to open inquiry');
      setLoadState(kind);
    }
  }, [jwtToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === 'ready' && inquiry && id) {
    return (
      <div className="space-y-4">
        <section aria-label="Inquiry journey" className="rounded-2xl border border-slate-200 bg-white p-4">
          <Stepper steps={customerInquiryJourneySteps(inquiry)} />
        </section>
        <CommercialInquiryDetail
          inquiryId={id}
          portalMode="customer"
          onBack={() => navigate(V2_CUSTOMER_INQUIRIES_PATH)}
          onInquiryChanged={setInquiry}
        />
      </div>
    );
  }

  return (
    <V2CustomerInquiryDetailView loadState={loadState} errorMessage={errorMessage} inquiry={inquiry} />
  );
}
