import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  V2_CUSTOMER_INQUIRIES_PATH,
  v2CustomerInquiryDetailPath,
} from '../../../app/shellRoutes';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  PermissionState,
  Select,
  StatCard,
  StatusBadge,
  Stepper,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../../ui';
import type { CommercialInquiryDto } from '../../../services/commercialInquiryApiService';
import {
  customerInquiryJourneySteps,
  customerInquiryListRow,
  customerSafeLineSummary,
  formatCustomerInquiryDate,
  formatInquiryProcessLabel,
  readInquiryProcessCode,
} from './v2CustomerInquiryPresentation';
import { formatInquiryStatus } from '../../../services/commercialInquiryApiService';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'unauthorized' | 'forbidden' | 'not_found';

function LoadingState({ label }: { label: string }) {
  return (
    <p className="text-sm text-slate-600" aria-live="polite" aria-busy="true">
      {label}
    </p>
  );
}

export function V2CustomerDashboardView(props: {
  greetingName: string;
  loadState: LoadState;
  errorMessage?: string;
  total: number;
  draftTotal: number;
  submittedTotal: number;
  quotedTotal: number;
  recent: CommercialInquiryDto[];
  onCreate?: () => void;
  creating?: boolean;
}) {
  if (props.loadState === 'unauthorized') {
    return <PermissionState moduleName="Customer dashboard" requiredRole="customer" />;
  }
  if (props.loadState === 'forbidden') {
    return <PermissionState moduleName="Customer dashboard" requiredRole="customer" />;
  }
  if (props.loadState === 'error') {
    return (
      <ErrorState
        kind="error"
        title="Unable to load your inquiries"
        message={props.errorMessage || 'The inquiry service did not return your dashboard data.'}
        next="Retry, or open Current version if the problem continues. Owner: Energya commercial support."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back${props.greetingName ? `, ${props.greetingName}` : ''}. Track inquiries Energya is processing for your account.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" type="button" onClick={props.onCreate} disabled={props.creating}>
              {props.creating ? 'Creating…' : 'New Inquiry'}
            </Button>
            <Link
              to={V2_CUSTOMER_INQUIRIES_PATH}
              className="inline-flex items-center rounded-lg border border-brand-300 bg-white px-3.5 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              My Inquiries
            </Link>
          </div>
        }
      />

      {props.loadState === 'loading' ? (
        <LoadingState label="Loading your inquiries…" />
      ) : (
        <>
          <section aria-label="Inquiry summary" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard label="My inquiries" value={props.total} />
            <StatCard label="Draft" value={props.draftTotal} />
            <StatCard label="Submitted" value={props.submittedTotal} />
            <StatCard label="Quoted" value={props.quotedTotal} />
          </section>

          {props.recent.length === 0 ? (
            <EmptyState
              title="No inquiries yet"
              hint="Create an inquiry to start configuration, cutting, and quotation with Energya."
            />
          ) : (
            <Card title="Recent inquiries" subtitle="Your most recently updated inquiries.">
              <ul className="divide-y divide-slate-100">
                {props.recent.map((inquiry) => {
                  const row = customerInquiryListRow(inquiry);
                  return (
                    <li key={inquiry.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center gap-2">
                      <Link
                        to={v2CustomerInquiryDetailPath(inquiry.id)}
                        className="font-mono text-sm font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded"
                      >
                        {row.inquiryNumber}
                      </Link>
                      <StatusBadge status={row.status} label={row.statusLabel} />
                      <Badge tone="info">{row.processLabel}</Badge>
                      <span className="text-xs text-slate-500 ms-auto">{row.date}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export function V2CustomerInquiryListView(props: {
  loadState: LoadState;
  errorMessage?: string;
  rows: CommercialInquiryDto[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  status: string;
  creating: boolean;
  createError?: string;
  projectName: string;
  customerReference: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onApplyFilters: () => void;
  onPageChange: (page: number) => void;
  onProjectNameChange: (value: string) => void;
  onCustomerReferenceChange: (value: string) => void;
  onCreate: () => void;
}) {
  const pageCount = Math.max(1, Math.ceil(props.total / props.pageSize));
  const rows = useMemo(() => props.rows.map(customerInquiryListRow), [props.rows]);

  if (props.loadState === 'unauthorized') {
    return <PermissionState moduleName="My Inquiries" requiredRole="customer" />;
  }
  if (props.loadState === 'forbidden') {
    return <PermissionState moduleName="My Inquiries" requiredRole="customer" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Inquiries"
        description="Inquiries for your account. Process is assigned by Energya and cannot be selected here."
      />

      <Card title="New Inquiry" subtitle="Energya assigns VIP Fast Track or Standard after create. You do not choose the process.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Project name" htmlFor="v2-inq-project" hint="Optional">
            <Input
              id="v2-inq-project"
              value={props.projectName}
              onChange={(e) => props.onProjectNameChange(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Your reference" htmlFor="v2-inq-ref" hint="Optional">
            <Input
              id="v2-inq-ref"
              value={props.customerReference}
              onChange={(e) => props.onCustomerReferenceChange(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="mt-4">
          <Button variant="primary" type="button" onClick={props.onCreate} disabled={props.creating}>
            {props.creating ? 'Creating…' : 'New Inquiry'}
          </Button>
        </div>
        {props.createError ? (
          <div className="mt-3">
            <ErrorState
              kind="error"
              title="Unable to create inquiry"
              message={props.createError}
              next="Check that you are signed in as a customer, then try again."
            />
          </div>
        ) : null}
      </Card>

      <form
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          props.onApplyFilters();
        }}
      >
        <Field label="Search" htmlFor="v2-inq-search">
          <Input
            id="v2-inq-search"
            value={props.search}
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder="Inquiry number, project, or reference"
          />
        </Field>
        <Field label="Status" htmlFor="v2-inq-status">
          <Select id="v2-inq-status" value={props.status} onChange={(e) => props.onStatusChange(e.target.value)}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="ENGINEERING_REVIEW">Engineering review</option>
            <option value="QUOTED">Quoted</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button variant="secondary" type="submit">
            Apply filters
          </Button>
        </div>
      </form>

      {props.loadState === 'loading' ? <LoadingState label="Loading inquiries…" /> : null}

      {props.loadState === 'error' ? (
        <ErrorState
          kind="error"
          title="Unable to load inquiries"
          message={props.errorMessage || 'The inquiry list request failed.'}
          next="Retry filters, or return to the dashboard. Owner: Energya commercial support."
        />
      ) : null}

      {props.loadState === 'empty' || (props.loadState === 'ready' && rows.length === 0) ? (
        <EmptyState title="No inquiries match" hint="Create an inquiry or clear filters." />
      ) : null}

      {props.loadState === 'ready' && rows.length > 0 ? (
        <>
          <Table>
            <THead>
              <Tr>
                <Th>Inquiry number</Th>
                <Th>Date</Th>
                <Th>Status</Th>
                <Th>Process</Th>
                <Th>Summary</Th>
                <Th>Lines</Th>
                <Th>Commercial state</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Link
                      to={v2CustomerInquiryDetailPath(row.id)}
                      className="font-mono font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded"
                    >
                      {row.inquiryNumber}
                    </Link>
                  </Td>
                  <Td>{row.date}</Td>
                  <Td>
                    <StatusBadge status={row.status} label={row.statusLabel} />
                  </Td>
                  <Td>
                    <Badge tone="info">{row.processLabel}</Badge>
                  </Td>
                  <Td>{row.summary}</Td>
                  <Td>{row.lineCount}</Td>
                  <Td>{row.commercialState}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <p>
              Showing {rows.length} of {props.total} · Page {props.page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={props.page <= 1}
                onClick={() => props.onPageChange(props.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={props.page >= pageCount}
                onClick={() => props.onPageChange(props.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function V2CustomerInquiryDetailView(props: {
  loadState: LoadState;
  errorMessage?: string;
  inquiry: CommercialInquiryDto | null;
}) {
  if (props.loadState === 'loading') {
    return <LoadingState label="Loading inquiry…" />;
  }
  if (props.loadState === 'unauthorized') {
    return <PermissionState moduleName="Inquiry" requiredRole="customer" />;
  }
  if (props.loadState === 'forbidden') {
    return (
      <PermissionState
        moduleName="this inquiry"
        requiredRole="own-account customer"
        userLabel="Your account"
      />
    );
  }
  if (props.loadState === 'not_found') {
    return (
      <ErrorState
        kind="error"
        title="Inquiry not found"
        message={props.errorMessage || 'No inquiry exists for this link, or it is not visible to your account.'}
        next="Return to My Inquiries and open a row from your list."
      />
    );
  }
  if (props.loadState === 'error') {
    return (
      <ErrorState
        kind="error"
        title="Unable to open inquiry"
        message={props.errorMessage || 'The inquiry request failed.'}
        next="Retry from My Inquiries. Owner: Energya commercial support."
      />
    );
  }

  const inquiry = props.inquiry;
  if (!inquiry) {
    return <EmptyState title="Inquiry not available" hint="Return to My Inquiries." />;
  }

  const processCode = readInquiryProcessCode(inquiry);
  const lines = (inquiry.lines || []).map(customerSafeLineSummary);
  const steps = customerInquiryJourneySteps(inquiry);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={V2_CUSTOMER_INQUIRIES_PATH}
          className="text-sm font-semibold text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded"
        >
          Back to My Inquiries
        </Link>
      </div>

      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inquiry</p>
        <h1 className="font-display text-2xl font-bold text-slate-900">{inquiry.inquiryNumber}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={inquiry.status} label={formatInquiryStatus(inquiry.status)} />
          <Badge tone="info">
            <span className="sr-only">Process (read-only): </span>
            {formatInquiryProcessLabel(processCode)}
          </Badge>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-slate-500">Date</dt>
            <dd>{formatCustomerInquiryDate(inquiry.inquiryDate)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">Project</dt>
            <dd>{inquiry.projectName || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">Your reference</dt>
            <dd>{inquiry.customerReference || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">Currency</dt>
            <dd>{inquiry.currency || '—'}</dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="v2-inq-journey-heading" className="space-y-2">
        <h2 id="v2-inq-journey-heading" className="font-display text-lg font-bold text-slate-900">
          Journey
        </h2>
        <p className="text-sm text-slate-600">
          Cable → configure → cutting → drum → shipment → submit. Energya assigns process automatically.
        </p>
        <Stepper steps={steps} />
      </section>

      <section aria-labelledby="v2-inq-overview-heading">
        <h2 id="v2-inq-overview-heading" className="font-display text-lg font-bold text-slate-900 mb-3">
          Overview
        </h2>
        <Card>
          <p className="text-sm text-slate-700">
            {inquiry.notes || inquiry.projectName || 'This inquiry is saved. Configuration, cutting, drums, shipment, quotation, and commitment will mount on this workspace in later increments.'}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Incoterm {inquiry.incoterms || '—'} · Delivery {inquiry.deliveryTerms || '—'}
          </p>
        </Card>
      </section>

      <section aria-labelledby="v2-inq-lines-heading">
        <h2 id="v2-inq-lines-heading" className="font-display text-lg font-bold text-slate-900 mb-3">
          Inquiry lines
        </h2>
        {lines.length === 0 ? (
          <EmptyState
            title="No cable lines yet"
            hint="Cable configuration will add lines in a later increment."
          />
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Line</Th>
                <Th>Description</Th>
                <Th>Quantity</Th>
                <Th>Length (m)</Th>
              </Tr>
            </THead>
            <TBody>
              {lines.map((line) => (
                <Tr key={line.id}>
                  <Td>{line.lineNumber}</Td>
                  <Td>{line.description}</Td>
                  <Td>{line.quantity}</Td>
                  <Td>{line.lengthMeters}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      <section aria-labelledby="v2-inq-next-heading" className="space-y-3">
        <h2 id="v2-inq-next-heading" className="font-display text-lg font-bold text-slate-900">
          Workspace
        </h2>
        <Card>
          <p className="text-sm text-slate-700">
            Continue this inquiry in the customer workspace: search an existing cable, configure, set cutting and drum
            plans, then submit for automatic quotation processing.
          </p>
        </Card>
      </section>
    </div>
  );
}
