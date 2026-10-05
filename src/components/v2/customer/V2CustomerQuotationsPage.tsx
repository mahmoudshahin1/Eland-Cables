import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { v2CustomerInquiryDetailPath } from '../../../app/shellRoutes';
import {
  fetchCommercialInquiries,
  formatInquiryStatus,
  type CommercialInquiryDto,
} from '../../../services/commercialInquiryApiService';
import { Card, EmptyState, ErrorState, PageHeader, PermissionState, StatusBadge, Table, TBody, Td, Th, THead, Tr } from '../../ui';
import { classifyCustomerInquiryError, customerInquiryListRow } from './v2CustomerInquiryPresentation';

export function V2CustomerQuotationsPage() {
  const { jwtToken } = useAuth();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'empty' | 'error' | 'unauthorized' | 'forbidden'>(
    'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string>();
  const [rows, setRows] = useState<CommercialInquiryDto[]>([]);

  const load = useCallback(async () => {
    if (!jwtToken) {
      setLoadState('unauthorized');
      return;
    }
    setLoadState('loading');
    setErrorMessage(undefined);
    try {
      const listed = await fetchCommercialInquiries(jwtToken, {
        page: 1,
        pageSize: 50,
        sortBy: 'updatedAt',
        sortDir: 'desc',
      });
      const quoted = listed.inquiries.filter((inquiry) => {
        if (inquiry.status === 'QUOTED') return true;
        return (inquiry.quotations || []).some((q) => Boolean(q.quotationNumber));
      });
      setRows(quoted);
      setLoadState(quoted.length ? 'ready' : 'empty');
    } catch (err) {
      setLoadState(classifyCustomerInquiryError(err) === 'error' ? 'error' : classifyCustomerInquiryError(err));
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load quotations');
    }
  }, [jwtToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadState === 'unauthorized' || loadState === 'forbidden') {
    return <PermissionState moduleName="Quotations" requiredRole="customer" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quotations"
        description="Issued and in-progress quotations for your account. Internal cost build-up is not shown."
      />
      {loadState === 'loading' ? (
        <p className="text-sm text-slate-600" aria-live="polite">
          Loading quotations…
        </p>
      ) : null}
      {loadState === 'error' ? (
        <ErrorState
          kind="error"
          title="Unable to load quotations"
          message={errorMessage || 'The quotation list request failed.'}
          next="Retry from the dashboard. Owner: Energya commercial support."
        />
      ) : null}
      {loadState === 'empty' ? (
        <EmptyState
          title="No quotations yet"
          hint="Submit an inquiry for quotation. After Energya issues it, the quotation appears here."
        />
      ) : null}
      {loadState === 'ready' ? (
        <Card>
          <Table>
            <THead>
              <Tr>
                <Th>Inquiry</Th>
                <Th>Quotation</Th>
                <Th>Status</Th>
                <Th>Date</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((inquiry) => {
                const row = customerInquiryListRow(inquiry);
                return (
                  <Tr key={inquiry.id}>
                    <Td>
                      <Link
                        to={v2CustomerInquiryDetailPath(inquiry.id)}
                        className="font-mono font-semibold text-brand-700 hover:underline"
                      >
                        {row.inquiryNumber}
                      </Link>
                    </Td>
                    <Td>{row.commercialState}</Td>
                    <Td>
                      <StatusBadge status={inquiry.status} label={formatInquiryStatus(inquiry.status)} />
                    </Td>
                    <Td>{row.date}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
