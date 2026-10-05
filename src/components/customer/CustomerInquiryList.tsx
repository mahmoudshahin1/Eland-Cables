import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  createCommercialInquiry,
  fetchCommercialInquiries,
  fetchCommercialQuotations,
  type CommercialInquiryDto,
  type CommercialQuotationListDto,
} from '../../services/commercialInquiryApiService';
import { v2QuotationPdfUrl } from '../../services/v2QuotationApiService';
import {
  customerInquiryDetailPath,
  CUSTOMER_HOME_PATH,
} from '../../app/shellRoutes';
import { Badge, Button, Card, Drawer, Input, Select } from '../ui';
import { CustomerPageHero } from './CustomerPageHero';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileCheck,
  FilePlus,
  FileText,
  Filter,
  Inbox,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Send,
} from 'lucide-react';
import {
  buildCustomerInquiryListRow,
  CUSTOMER_CABLE_TYPE_FILTERS,
  CUSTOMER_INQUIRY_STATUS_FILTER_OPTIONS,
  customerFacingInquiryStatusLabel,
  customerFacingInquiryStatusTone,
  customerFacingLineStatusLabel,
  customerInquiryDestination,
  customerInquiryTimelineState,
  exportInquiryListCsv,
  formatCustomerListDate,
  formatCustomerQuantityMeters,
  inquiryMatchesCableTypeFilter,
  lineQuantityMeters,
  sanitizeCustomerQuotationListItem,
  type CustomerInquiryListRow,
  type CustomerInquiryRowAction,
  type CustomerInquiryWorkspaceTab,
  type CustomerQuotationListRow,
} from './customerInquiryListPresentation';

interface CustomerInquiryListProps {
  initialStatus?: string;
  onInitialStatusConsumed?: () => void;
  initialSearch?: string;
  onInitialSearchConsumed?: () => void;
}

type KpiCounts = {
  total: number;
  draft: number;
  inProgress: number;
  submitted: number;
  quoted: number;
};

const EMPTY_KPI: KpiCounts = { total: 0, draft: 0, inProgress: 0, submitted: 0, quoted: 0 };

const IN_PROGRESS_STATUSES = [
  'UNDER_REVIEW',
  'ENGINEERING_REVIEW',
  'ENGINEERING_BLOCKED',
  'READY_FOR_COMMERCIAL',
];

async function countByStatus(token: string, status?: string): Promise<number> {
  const result = await fetchCommercialInquiries(token, {
    page: 1,
    pageSize: 1,
    status,
  });
  return result.total;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const CustomerInquiryList: React.FC<CustomerInquiryListProps> = ({
  initialStatus,
  onInitialStatusConsumed,
  initialSearch,
  onInitialSearchConsumed,
}) => {
  const { jwtToken, currentUser } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<CustomerInquiryWorkspaceTab>(
    initialStatus === 'QUOTED' ? 'quotations' : 'inquiries'
  );
  const [rows, setRows] = useState<CommercialInquiryDto[]>([]);
  const [quotations, setQuotations] = useState<CommercialQuotationListDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(
    initialStatus && initialStatus !== 'QUOTED' ? initialStatus : initialStatus === 'QUOTED' ? 'QUOTED' : ''
  );
  const [searchInput, setSearchInput] = useState(initialSearch || '');
  const [search, setSearch] = useState(initialSearch || '');
  const [cableType, setCableType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kpi, setKpi] = useState<KpiCounts>(EMPTY_KPI);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialStatus === undefined) return;
    if (initialStatus === 'QUOTED') {
      setTab('quotations');
      setStatusFilter('QUOTED');
    } else if (initialStatus) {
      setTab('inquiries');
      setStatusFilter(initialStatus);
    }
    setPage(1);
    onInitialStatusConsumed?.();
  }, [initialStatus, onInitialStatusConsumed]);

  useEffect(() => {
    if (initialSearch === undefined) return;
    setSearchInput(initialSearch);
    setSearch(initialSearch);
    onInitialSearchConsumed?.();
  }, [initialSearch, onInitialSearchConsumed]);

  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput.trim()), 280);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuId(null);
    };
    window.addEventListener('mousedown', onPointer);
    return () => window.removeEventListener('mousedown', onPointer);
  }, []);

  const loadKpis = useCallback(async () => {
    if (!jwtToken) {
      setKpi(EMPTY_KPI);
      return;
    }
    try {
      const [totalCount, draft, submitted, quoted, ...inProgressParts] = await Promise.all([
        countByStatus(jwtToken),
        countByStatus(jwtToken, 'DRAFT'),
        countByStatus(jwtToken, 'SUBMITTED'),
        countByStatus(jwtToken, 'QUOTED'),
        ...IN_PROGRESS_STATUSES.map((status) => countByStatus(jwtToken, status)),
      ]);
      setKpi({
        total: totalCount,
        draft,
        submitted,
        quoted,
        inProgress: inProgressParts.reduce((sum, n) => sum + n, 0),
      });
    } catch {
      setKpi(EMPTY_KPI);
    }
  }, [jwtToken]);

  const reload = useCallback(async () => {
    if (!jwtToken) {
      setLoading(false);
      setError('Sign in to view your inquiries.');
      setRows([]);
      setQuotations([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (tab === 'quotations') {
        try {
          const listed = await fetchCommercialQuotations(jwtToken, {
            q: search || undefined,
            isCurrent: true,
          });
          setQuotations(listed.quotations || []);
          setRows([]);
          setTotal((listed.quotations || []).length);
        } catch {
          const quoted = await fetchCommercialInquiries(jwtToken, {
            page: 1,
            pageSize: 50,
            status: 'QUOTED',
            q: search || undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            sortBy: 'updatedAt',
            sortDir: 'desc',
          });
          setQuotations(
            (quoted.inquiries || []).flatMap((item) =>
              (item.quotations || [])
                .filter((quotation) => quotation.id && quotation.quotationNumber)
                .map((quotation) => ({
                  id: quotation.id as string,
                  quotationNumber: quotation.quotationNumber as string,
                  inquiryId: item.id,
                  status: quotation.status || item.status,
                  inquiry: {
                    id: item.id,
                    inquiryNumber: item.inquiryNumber,
                    projectName: item.projectName,
                    customerReference: item.customerReference,
                    status: item.status,
                  },
                }))
            )
          );
          setRows([]);
          setTotal(quoted.total);
        }
      } else {
        const result = await fetchCommercialInquiries(jwtToken, {
          page,
          pageSize,
          status: statusFilter || undefined,
          q: search || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          sortBy: 'updatedAt',
          sortDir: 'desc',
        });
        setRows(result.inquiries);
        setTotal(result.total);
        setQuotations([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inquiries');
      setRows([]);
      setQuotations([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [jwtToken, tab, page, pageSize, statusFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis]);

  const inquiryRows: CustomerInquiryListRow[] = useMemo(() => {
    return rows
      .filter((inquiry) => inquiryMatchesCableTypeFilter(inquiry, cableType))
      .map(buildCustomerInquiryListRow);
  }, [rows, cableType]);

  const quotationRows: CustomerQuotationListRow[] = useMemo(() => {
    return quotations.map(sanitizeCustomerQuotationListItem);
  }, [quotations]);

  const expandedInquiry = rows.find((row) => row.id === expandedId) || null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const filtersActive = Boolean(statusFilter || searchInput || cableType || dateFrom || dateTo);

  const openInquiry = (id: string) => navigate(customerInquiryDetailPath(id));

  const handleCreate = async () => {
    if (!jwtToken) return;
    setCreating(true);
    setError(null);
    try {
      const inquiry = await createCommercialInquiry(jwtToken, {
        customerName: currentUser?.companyName || currentUser?.fullName || undefined,
        contactPerson: currentUser?.fullName || undefined,
        projectName: 'Customer Cable Inquiry',
        currency: 'USD',
        notes: 'Created from customer inquiry workspace.',
      });
      navigate(customerInquiryDetailPath(inquiry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create inquiry');
    } finally {
      setCreating(false);
    }
  };

  const handleKpi = (bucket: keyof KpiCounts) => {
    setPage(1);
    setSelectedIds(new Set());
    setExpandedId(null);
    if (bucket === 'total') {
      setTab('inquiries');
      setStatusFilter('');
    } else if (bucket === 'draft') {
      setTab('inquiries');
      setStatusFilter('DRAFT');
    } else if (bucket === 'submitted') {
      setTab('inquiries');
      setStatusFilter('SUBMITTED');
    } else if (bucket === 'quoted') {
      setTab('quotations');
      setStatusFilter('QUOTED');
    } else if (bucket === 'inProgress') {
      setTab('inquiries');
      setStatusFilter('ENGINEERING_REVIEW');
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('');
    setCableType('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
    setFilterDrawerOpen(false);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleIds = tab === 'inquiries' ? inquiryRows.map((row) => row.id) : quotationRows.map((row) => row.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const handleExport = () => {
    if (tab === 'quotations') {
      const selected = quotationRows.filter((row) => selectedIds.size === 0 || selectedIds.has(row.id));
      const header = 'Quotation No.,Inquiry No.,Project,Issued,Valid Until,Status,Total';
      const body = selected
        .map((row) =>
          [row.quotationNumber, row.inquiryNumber, row.projectName, row.issuedDate, row.validUntil, row.statusLabel, row.totalLabel]
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');
      downloadCsv('customer-quotations.csv', `${header}\n${body}`);
      return;
    }
    const source = selectedIds.size > 0 ? inquiryRows.filter((row) => selectedIds.has(row.id)) : inquiryRows;
    downloadCsv('customer-inquiries.csv', exportInquiryListCsv(source));
  };

  const downloadQuotationPdf = async (inquiryId: string) => {
    if (!jwtToken) return;
    try {
      const url = v2QuotationPdfUrl(inquiryId);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${jwtToken}` } });
      if (!res.ok) {
        setError('Quotation PDF is not available yet.');
        return;
      }
      const bytes = await res.blob();
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setError('Unable to download quotation.');
    }
  };

  const runAction = (action: CustomerInquiryRowAction, inquiryId: string) => {
    setMenuId(null);
    if (action === 'view' || action === 'continue' || action === 'view_quotation') {
      openInquiry(inquiryId);
      return;
    }
    if (action === 'download_pdf') void downloadQuotationPdf(inquiryId);
  };

  const filterControls = (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_9rem_9rem_minmax(0,1.1fr)] gap-2">
      <div className="relative">
        <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchInput}
          onChange={(e) => {
            setPage(1);
            setSearchInput(e.target.value);
          }}
          placeholder="Search by Inquiry No., Product, Customer Reference…"
          className="ps-9 text-xs h-10"
        />
      </div>
      <Select
        value={statusFilter === 'UNDER_REVIEW' ? 'ENGINEERING_REVIEW' : statusFilter}
        onChange={(e) => {
          setPage(1);
          setStatusFilter(e.target.value);
        }}
        className="text-xs h-10"
        aria-label="Status"
      >
        {CUSTOMER_INQUIRY_STATUS_FILTER_OPTIONS.map((option) => (
          <option key={option.value || 'all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Select
        value={cableType}
        onChange={(e) => {
          setPage(1);
          setCableType(e.target.value);
        }}
        className="text-xs h-10"
        aria-label="Cable Type"
      >
        {CUSTOMER_CABLE_TYPE_FILTERS.map((option) => (
          <option key={option.value || 'all-type'} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <div className="flex items-center gap-2 min-w-0">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
          className="text-xs h-10"
          aria-label="From date"
        />
        <span className="text-slate-400 text-xs shrink-0">→</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
          className="text-xs h-10"
          aria-label="To date"
        />
      </div>
    </div>
  );

  const kpiCards: Array<{
    key: keyof KpiCounts;
    label: string;
    value: number;
    icon: typeof FileText;
    className: string;
  }> = [
    { key: 'total', label: 'Total Inquiries', value: kpi.total, icon: FileText, className: 'bg-slate-50 border-slate-200' },
    { key: 'draft', label: 'Draft', value: kpi.draft, icon: FilePlus, className: 'bg-emerald-50/80 border-emerald-100' },
    { key: 'inProgress', label: 'In Progress', value: kpi.inProgress, icon: Send, className: 'bg-sky-50/80 border-sky-100' },
    { key: 'submitted', label: 'Submitted', value: kpi.submitted, icon: FileCheck, className: 'bg-amber-50/80 border-amber-100' },
    { key: 'quoted', label: 'Converted to Quotation', value: kpi.quoted, icon: FileText, className: 'bg-violet-50/80 border-violet-100' },
  ];

  return (
    <div className="space-y-4">
      <CustomerPageHero
        breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Inquiry / Quotation' }]}
        title="Inquiry / Quotation"
        subtitle="Create new inquiries, track your quotations and request updates."
      />

      <div className="min-w-0 overflow-hidden space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1 border-b border-slate-200" role="tablist">
              {(['inquiries', 'quotations'] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    setPage(1);
                    setSelectedIds(new Set());
                    setExpandedId(null);
                    if (id === 'quotations') setStatusFilter('QUOTED');
                    if (id === 'inquiries' && statusFilter === 'QUOTED') setStatusFilter('');
                  }}
                  className={`px-3 py-2.5 -mb-px text-sm font-semibold border-b-2 ${
                    tab === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {id === 'inquiries' ? 'Inquiries' : 'Quotations'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="lg:hidden"
                variant="secondary"
                size="sm"
                leadingIcon={Filter}
                onClick={() => setFilterDrawerOpen(true)}
              >
                Filters
              </Button>
              <Button variant="primary" size="sm" leadingIcon={Plus} disabled={creating} onClick={() => void handleCreate()}>
                {creating ? 'Creating…' : 'New Inquiry'}
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={Download} onClick={handleExport}>
                Export
              </Button>
            </div>
          </div>

          <Card className="hidden lg:block" flushBody>
            <div className="p-3">{filterControls}</div>
            {filtersActive ? (
              <div className="px-3 pb-3 flex justify-end">
                <Button variant="tertiary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            ) : null}
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              const selected =
                (card.key === 'draft' && statusFilter === 'DRAFT') ||
                (card.key === 'submitted' && statusFilter === 'SUBMITTED') ||
                (card.key === 'quoted' && tab === 'quotations') ||
                (card.key === 'inProgress' && statusFilter === 'ENGINEERING_REVIEW') ||
                (card.key === 'total' && tab === 'inquiries' && !statusFilter);
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => handleKpi(card.key)}
                  className={`text-start rounded-xl border px-3 py-3 shadow-[var(--shadow-card)] ${card.className} ${
                    selected ? 'ring-1 ring-brand-400' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] font-semibold">{card.label}</span>
                  </div>
                  <p className="mt-2 text-xl font-bold font-display text-brand-800">{card.value}</p>
                </button>
              );
            })}
          </div>

          {error && !loading && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <Card flushBody className="overflow-hidden">
            {loading && (
              <div className="flex flex-col items-center py-14 text-slate-500">
                <Loader2 className="h-7 w-7 animate-spin mb-2 text-brand-500" />
                <p className="text-sm">{tab === 'quotations' ? 'Loading quotations…' : 'Loading inquiries…'}</p>
              </div>
            )}

            {!loading && tab === 'inquiries' && inquiryRows.length === 0 && (
              <div className="py-14 px-4 text-center">
                <div className="mx-auto h-11 w-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <Inbox className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800">No inquiries yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {filtersActive
                    ? 'Try clearing your search or status filters.'
                    : 'Start your first cable inquiry and our team will guide you through the process.'}
                </p>
                {!filtersActive && (
                  <Button className="mt-4" variant="primary" size="sm" leadingIcon={Plus} onClick={() => void handleCreate()}>
                    New Inquiry
                  </Button>
                )}
              </div>
            )}

            {!loading && tab === 'quotations' && quotationRows.length === 0 && (
              <div className="py-14 px-4 text-center">
                <p className="text-sm font-semibold text-slate-800">No quotations available yet.</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Quotations will appear here once your inquiry has completed the required process.
                </p>
              </div>
            )}

            {!loading && tab === 'inquiries' && inquiryRows.length > 0 && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[860px]">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wide text-[11px]">
                      <tr>
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => {
                              if (allSelected) setSelectedIds(new Set());
                              else setSelectedIds(new Set(visibleIds));
                            }}
                            aria-label="Select all inquiries on this page"
                          />
                        </th>
                        <th className="px-3 py-3">Inquiry No.</th>
                        <th className="px-3 py-3">Created Date</th>
                        <th className="px-3 py-3">Project Name / Reference</th>
                        <th className="px-3 py-3">Cable Type</th>
                        <th className="px-3 py-3">Application</th>
                        <th className="px-3 py-3">Quantity</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Last Updated</th>
                        <th className="px-3 py-3 text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inquiryRows.map((row) => {
                        const inquiry = rows.find((item) => item.id === row.id);
                        return (
                          <React.Fragment key={row.id}>
                            <tr className={`hover:bg-brand-50/40 ${expandedId === row.id ? 'bg-brand-50/30' : ''}`}>
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(row.id)}
                                  onChange={() => toggleSelected(row.id)}
                                  aria-label={`Select ${row.inquiryNumber}`}
                                />
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <button
                                  type="button"
                                  className="font-mono font-semibold text-brand-700 hover:underline"
                                  onClick={() => setExpandedId((id) => (id === row.id ? null : row.id))}
                                >
                                  {row.inquiryNumber}
                                </button>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap text-slate-600">{row.createdDate}</td>
                              <td className="px-3 py-3 text-slate-700 max-w-[12rem] truncate" title={row.projectName}>
                                {row.projectName}
                              </td>
                              <td className="px-3 py-3 text-slate-700">{row.cableType}</td>
                              <td className="px-3 py-3">{row.application}</td>
                              <td className="px-3 py-3 whitespace-nowrap">{row.quantityLabel}</td>
                              <td className="px-3 py-3">
                                <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap text-slate-500">{row.lastUpdated}</td>
                              <td className="px-3 py-3">
                                <RowActions
                                  actions={row.actions}
                                  open={menuId === row.id}
                                  menuRef={menuId === row.id ? menuRef : undefined}
                                  onView={() => openInquiry(row.id)}
                                  onToggleMenu={() => setMenuId((id) => (id === row.id ? null : row.id))}
                                  onAction={(action) => runAction(action, row.id)}
                                />
                              </td>
                            </tr>
                            {expandedId === row.id && inquiry ? (
                              <tr>
                                <td colSpan={10} className="bg-slate-50/70 p-0">
                                  <InquiryExpandPanel inquiry={inquiry} onOpen={() => openInquiry(inquiry.id)} />
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <ul className="md:hidden divide-y divide-slate-100">
                  {inquiryRows.map((row) => (
                    <li key={row.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelected(row.id)}
                          />
                          <button
                            type="button"
                            className="font-mono font-semibold text-brand-700"
                            onClick={() => openInquiry(row.id)}
                          >
                            {row.inquiryNumber}
                          </button>
                        </label>
                        <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                      </div>
                      <p className="text-sm text-slate-800 truncate">{row.projectName}</p>
                      <p className="text-xs text-slate-500">
                        {row.cableType} · {row.application} · {row.quantityLabel}
                      </p>
                      <p className="text-xs text-slate-400">Updated {row.lastUpdated}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <Button variant="secondary" size="sm" leadingIcon={Eye} onClick={() => openInquiry(row.id)}>
                          View
                        </Button>
                        {row.actions.includes('continue') && (
                          <Button variant="tertiary" size="sm" onClick={() => openInquiry(row.id)}>
                            Continue
                          </Button>
                        )}
                        {row.actions.includes('view_quotation') && (
                          <Button variant="tertiary" size="sm" onClick={() => openInquiry(row.id)}>
                            Quotation
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!loading && tab === 'quotations' && quotationRows.length > 0 && (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wide text-[11px]">
                      <tr>
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => {
                              if (allSelected) setSelectedIds(new Set());
                              else setSelectedIds(new Set(visibleIds));
                            }}
                            aria-label="Select all quotations on this page"
                          />
                        </th>
                        <th className="px-3 py-3">Quotation No.</th>
                        <th className="px-3 py-3">Inquiry No.</th>
                        <th className="px-3 py-3">Project</th>
                        <th className="px-3 py-3">Issued</th>
                        <th className="px-3 py-3">Valid Until</th>
                        <th className="px-3 py-3">Total</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3 text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quotationRows.map((row) => (
                        <tr key={row.id} className="hover:bg-brand-50/40">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(row.id)}
                              onChange={() => toggleSelected(row.id)}
                            />
                          </td>
                          <td className="px-3 py-3 font-mono font-semibold text-brand-700">{row.quotationNumber}</td>
                          <td className="px-3 py-3 font-mono">{row.inquiryNumber}</td>
                          <td className="px-3 py-3 text-slate-700">{row.projectName}</td>
                          <td className="px-3 py-3 whitespace-nowrap">{row.issuedDate}</td>
                          <td className="px-3 py-3 whitespace-nowrap">{row.validUntil}</td>
                          <td className="px-3 py-3 whitespace-nowrap">{row.totalLabel}</td>
                          <td className="px-3 py-3">
                            <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              <IconButton label="View quotation" onClick={() => openInquiry(row.inquiryId)}>
                                <Eye className="h-4 w-4" />
                              </IconButton>
                              <IconButton label="Download quotation" onClick={() => void downloadQuotationPdf(row.inquiryId)}>
                                <Download className="h-4 w-4" />
                              </IconButton>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="md:hidden divide-y divide-slate-100">
                  {quotationRows.map((row) => (
                    <li key={row.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono font-semibold text-brand-700">{row.quotationNumber}</p>
                        <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                      </div>
                      <p className="text-sm text-slate-800">{row.projectName}</p>
                      <p className="text-xs text-slate-500">
                        {row.inquiryNumber} · {row.totalLabel}
                      </p>
                      <div className="flex gap-2 pt-1">
                        <Button variant="secondary" size="sm" onClick={() => openInquiry(row.inquiryId)}>
                          View
                        </Button>
                        <Button variant="tertiary" size="sm" onClick={() => void downloadQuotationPdf(row.inquiryId)}>
                          Download
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!loading && (tab === 'inquiries' ? inquiryRows.length > 0 : quotationRows.length > 0) && (
              <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                <p>
                  {tab === 'quotations'
                    ? `Showing ${quotationRows.length} quotation${quotationRows.length === 1 ? '' : 's'}`
                    : `Showing ${(page - 1) * pageSize + 1} to ${Math.min(page * pageSize, total)} of ${total} inquiries`}
                </p>
                {tab === 'inquiries' && (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5">
                      Rows per page
                      <select
                        value={pageSize}
                        onChange={(e) => {
                          setPage(1);
                          setPageSize(Number(e.target.value));
                        }}
                        className="border border-slate-200 rounded-md px-1.5 py-1 text-xs"
                      >
                        {[5, 10, 25].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md border border-slate-200 disabled:opacity-40"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4 mx-auto" />
                      </button>
                      <span className="min-w-[2.5rem] text-center font-semibold text-brand-700">{page}</span>
                      <button
                        type="button"
                        className="h-7 w-7 rounded-md border border-slate-200 disabled:opacity-40"
                        disabled={page >= pageCount}
                        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-4 w-4 mx-auto" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

      <Drawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        title="Filters"
        footer={
          <div className="flex w-full justify-between gap-2">
            <Button variant="tertiary" size="sm" onClick={clearFilters}>
              Clear
            </Button>
            <Button variant="primary" size="sm" onClick={() => setFilterDrawerOpen(false)}>
              Apply
            </Button>
          </div>
        }
      >
        {filterControls}
      </Drawer>
    </div>
  );
};

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-700"
    >
      {children}
    </button>
  );
}

function RowActions({
  actions,
  open,
  menuRef,
  onView,
  onToggleMenu,
  onAction,
}: {
  actions: CustomerInquiryRowAction[];
  open: boolean;
  menuRef?: React.Ref<HTMLDivElement>;
  onView: () => void;
  onToggleMenu: () => void;
  onAction: (action: CustomerInquiryRowAction) => void;
}) {
  const extra = actions.filter((action) => action !== 'view');
  return (
    <div className="relative flex justify-end gap-0.5" ref={menuRef}>
      <IconButton label="View inquiry" onClick={onView}>
        <Eye className="h-4 w-4" />
      </IconButton>
      {extra.length > 0 && (
        <>
          <IconButton label="More actions" onClick={onToggleMenu}>
            <MoreHorizontal className="h-4 w-4" />
          </IconButton>
          {open && (
            <div className="absolute end-0 top-9 z-20 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {extra.includes('continue') && (
                <button type="button" className="w-full text-start px-3 py-2 text-xs hover:bg-slate-50" onClick={() => onAction('continue')}>
                  Continue Inquiry
                </button>
              )}
              {extra.includes('view_quotation') && (
                <button type="button" className="w-full text-start px-3 py-2 text-xs hover:bg-slate-50" onClick={() => onAction('view_quotation')}>
                  View Quotation
                </button>
              )}
              {extra.includes('download_pdf') && (
                <button type="button" className="w-full text-start px-3 py-2 text-xs hover:bg-slate-50" onClick={() => onAction('download_pdf')}>
                  Download PDF
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InquiryExpandPanel({
  inquiry,
  onOpen,
}: {
  inquiry: CommercialInquiryDto;
  onOpen: () => void;
}) {
  const timeline = customerInquiryTimelineState(inquiry.status);
  const lines = inquiry.lines || [];
  const canEdit = inquiry.status === 'DRAFT';
  const destination = customerInquiryDestination(inquiry);
  const quotation = inquiry.quotations?.[0];

  return (
    <div className="m-3 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-brand-600 shrink-0" />
          <p className="font-mono font-bold text-brand-800">{inquiry.inquiryNumber}</p>
          <Badge tone={customerFacingInquiryStatusTone(inquiry.status)}>
            {customerFacingInquiryStatusLabel(inquiry.status)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="secondary" size="sm" onClick={onOpen}>
              Edit
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onOpen}>
            Open
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        <ExpandField label="Project Name" value={inquiry.projectName || '—'} />
        <ExpandField label="Customer Reference" value={inquiry.customerReference || '—'} />
        <ExpandField label="Destination" value={destination} />
        <ExpandField label="Required Quotation Date" value={formatCustomerListDate(inquiry.requestedDeliveryDate)} />
        <ExpandField label="Remarks" value={inquiry.notes || '—'} className="sm:col-span-2" />
      </div>

      <ol className="flex flex-wrap items-center gap-2 text-[11px]">
        {timeline.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 && <span className="text-slate-300">—</span>}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${
                step.state === 'complete'
                  ? 'bg-brand-50 text-brand-700'
                  : step.state === 'current'
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {quotation?.quotationNumber ? (
        <p className="text-xs text-slate-600">
          Quotation <span className="font-mono font-semibold">{quotation.quotationNumber}</span>
        </p>
      ) : null}

      <div>
        <p className="text-xs font-bold text-slate-700 mb-2">Cable Items ({lines.length})</p>
        {lines.length === 0 ? (
          <p className="text-xs text-slate-500">No cable lines yet. Open the inquiry to add a cable configuration.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-start py-1.5 pr-3 font-semibold">#</th>
                  <th className="text-start py-1.5 pr-3 font-semibold">Product Description</th>
                  <th className="text-start py-1.5 pr-3 font-semibold">Quantity</th>
                  <th className="text-start py-1.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3">{line.lineNumber}</td>
                    <td className="py-2 pr-3 text-slate-800">{line.cableDescription || '—'}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatCustomerQuantityMeters(lineQuantityMeters(line))}</td>
                    <td className="py-2">
                      <Badge tone={customerFacingInquiryStatusTone(line.status || 'DRAFT')}>
                        {customerFacingLineStatusLabel(line.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandField({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-slate-400">{label}</p>
      <p className="text-slate-800 font-medium mt-0.5">{value}</p>
    </div>
  );
}
