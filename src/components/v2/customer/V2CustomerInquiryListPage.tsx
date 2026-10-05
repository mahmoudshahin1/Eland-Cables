import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { v2CustomerInquiryDetailPath } from '../../../app/shellRoutes';
import {
  createCommercialInquiry,
  fetchCommercialInquiries,
  type CommercialInquiryDto,
} from '../../../services/commercialInquiryApiService';
import { V2CustomerInquiryListView } from './V2CustomerInquiryViews';
import {
  buildCustomerCreateInquiryInput,
  buildCustomerInquiryListQuery,
  classifyCustomerInquiryError,
} from './v2CustomerInquiryPresentation';

export function V2CustomerInquiryListPage() {
  const { jwtToken, currentUser } = useAuth();
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'empty' | 'error' | 'unauthorized' | 'forbidden'
  >('loading');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [createError, setCreateError] = useState<string>();
  const [rows, setRows] = useState<CommercialInquiryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [projectName, setProjectName] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [creating, setCreating] = useState(false);
  const pageSize = 25;

  const load = useCallback(async () => {
    if (!jwtToken) {
      setLoadState('unauthorized');
      return;
    }
    setLoadState('loading');
    setErrorMessage(undefined);
    try {
      const query = buildCustomerInquiryListQuery({
        q: appliedSearch,
        status: appliedStatus,
        page,
        pageSize,
      });
      const result = await fetchCommercialInquiries(jwtToken, query);
      setRows(result.inquiries);
      setTotal(result.total);
      setLoadState(result.inquiries.length ? 'ready' : 'empty');
    } catch (err) {
      const kind = classifyCustomerInquiryError(err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load inquiries');
      setLoadState(kind === 'error' ? 'error' : kind);
    }
  }, [jwtToken, appliedSearch, appliedStatus, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    if (!jwtToken) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      const inquiry = await createCommercialInquiry(
        jwtToken,
        buildCustomerCreateInquiryInput({
          companyName: currentUser?.companyName,
          fullName: currentUser?.fullName,
          projectName,
          customerReference,
        })
      );
      navigate(v2CustomerInquiryDetailPath(inquiry.id));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create inquiry');
    } finally {
      setCreating(false);
    }
  };

  return (
    <V2CustomerInquiryListView
      loadState={loadState}
      errorMessage={errorMessage}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      search={search}
      status={status}
      creating={creating}
      createError={createError}
      projectName={projectName}
      customerReference={customerReference}
      onSearchChange={setSearch}
      onStatusChange={setStatus}
      onApplyFilters={() => {
        setPage(1);
        setAppliedSearch(search);
        setAppliedStatus(status);
      }}
      onPageChange={setPage}
      onProjectNameChange={setProjectName}
      onCustomerReferenceChange={setCustomerReference}
      onCreate={() => void onCreate()}
    />
  );
}
