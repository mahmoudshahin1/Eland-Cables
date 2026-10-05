import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  CommercialInquiryDto,
  fetchCommercialInquiries,
  fetchInquiryFieldDefinitions,
  formatInquiryStatus,
  inquiryEstimatedValue,
  InquiryListQuery,
} from '../../services/commercialInquiryApiService';
import {
  INQUIRY_LIST_COLUMNS,
  applyPlatformFieldOverrides,
  loadListColumnPreference,
  saveListColumnPreference,
  visibleFieldsForUser,
} from '../../services/inquiryFieldManifest';
import { StatCard } from '../ui/StatCard';
import { StatusBadge } from '../ui/Badge';

interface CommercialInquiryListProps {
  onOpen: (id: string) => void;
  onNew: () => void;
  refreshKey?: number;
  initialStatus?: string;
  onInitialStatusConsumed?: () => void;
}

export const CommercialInquiryList: React.FC<CommercialInquiryListProps> = ({
  onOpen,
  onNew,
  refreshKey = 0,
  initialStatus,
  onInitialStatusConsumed,
}) => {
  const { jwtToken, currentUser, hasPermission } = useAuth();
  const isCustomer = currentUser?.userType === 'customer';
  const canCreate = isCustomer || hasPermission('salesQuotations');
  const canExport = hasPermission('salesQuotations') || hasPermission('reportsAnalytics') || isCustomer;

  const [rows, setRows] = useState<CommercialInquiryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [kpiCounts, setKpiCounts] = useState({
    open: 0,
    submitted: 0,
    underReview: 0,
    closed: 0,
  });

  const prefUserId = currentUser?.id;
  const [columnPref, setColumnPref] = useState(() => loadListColumnPreference(prefUserId));
  const [platformListFields, setPlatformListFields] = useState(INQUIRY_LIST_COLUMNS);
  const [filters, setFilters] = useState<InquiryListQuery>({
    q: '',
    status: initialStatus || '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'updatedAt',
    sortDir: 'desc',
  });

  useEffect(() => {
    setColumnPref(loadListColumnPreference(prefUserId));
  }, [prefUserId]);

  useEffect(() => {
    if (!jwtToken) {
      setPlatformListFields(INQUIRY_LIST_COLUMNS);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const defs = await fetchInquiryFieldDefinitions(jwtToken);
        if (cancelled) return;
        setPlatformListFields(applyPlatformFieldOverrides(INQUIRY_LIST_COLUMNS, defs.fields || []));
      } catch {
        if (!cancelled) setPlatformListFields(INQUIRY_LIST_COLUMNS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  useEffect(() => {
    if (initialStatus) {
      setPage(1);
      setFilters((prev) => ({ ...prev, status: initialStatus }));
      onInitialStatusConsumed?.();
    }
  }, [initialStatus, onInitialStatusConsumed]);

  const visibleColumns = useMemo(
    () => visibleFieldsForUser(platformListFields, columnPref, isCustomer),
    [platformListFields, columnPref, isCustomer]
  );

  // Fetch KPI counts across all user inquiries
  const loadKpis = useCallback(async () => {
    if (!jwtToken) return;
    try {
      const allRes = await fetchCommercialInquiries(jwtToken, { pageSize: 200 });
      const all = allRes.inquiries || [];
      const openCount = all.filter((i) => i.status === 'DRAFT').length;
      const subCount = all.filter((i) => i.status === 'SUBMITTED').length;
      const revCount = all.filter((i) => i.status === 'UNDER_REVIEW').length;
      const closedCount = all.filter(
        (i) => i.status === 'CLOSED' || i.status === 'CANCELLED' || i.status === 'QUOTED'
      ).length;
      setKpiCounts({
        open: openCount,
        submitted: subCount,
        underReview: revCount,
        closed: closedCount,
      });
    } catch {
      // Non-critical KPI fallback
    }
  }, [jwtToken]);

  const load = useCallback(async () => {
    if (!jwtToken) {
      setError('Sign in to load commercial inquiries.');
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCommercialInquiries(jwtToken, {
        ...filters,
        page,
        pageSize,
        status: filters.status || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      });
      setRows(result.inquiries);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  }, [jwtToken, filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    void loadKpis();
  }, [loadKpis, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const handleKpiFilter = (targetStatus: string) => {
    setPage(1);
    setFilters((prev) => ({
      ...prev,
      status: prev.status === targetStatus ? '' : targetStatus,
    }));
  };

  const cellValue = (inquiry: CommercialInquiryDto, fieldId: string): string => {
    switch (fieldId) {
      case 'inquiryNumber':
        return inquiry.inquiryNumber;
      case 'versionNo':
        return `V${inquiry.versionNo || 1}`;
      case 'inquiryDate':
        return new Date(inquiry.inquiryDate).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      case 'customerReference':
        return inquiry.customerReference || '—';
      case 'customerName':
        return inquiry.customerName;
      case 'projectName':
        return inquiry.projectName || '—';
      case 'salesAgent':
        return inquiry.salesAgent || '—';
      case 'status':
        return formatInquiryStatus(inquiry.status);
      case 'currency':
        return inquiry.currency;
      case 'requestedDeliveryDate':
        return inquiry.requestedDeliveryDate
          ? new Date(inquiry.requestedDeliveryDate).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : '—';
      case 'quotationOwner':
        return inquiry.quotationOwner || inquiry.createdBy || '—';
      case 'lineCount':
        return String(inquiry.lines?.length || 0);
      case 'estimatedValue': {
        const value = inquiryEstimatedValue(inquiry);
        return value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
      }
      case 'updatedAt':
        return inquiry.updatedAt
          ? new Date(inquiry.updatedAt).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : '—';
      case 'modifiedBy':
        return inquiry.modifiedBy || inquiry.createdBy || '—';
      default:
        return '—';
    }
  };

  const exportCsv = () => {
    const header = visibleColumns.map((c) => c.label).join(',');
    const body = rows
      .map((row) =>
        visibleColumns
          .map((c) => `"${cellValue(row, c.id).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'commercial-inquiries.csv';
    a.click();
  };

  return (
    <div className="space-y-5">
      {/* 1. Header with Title, Subtitle, and Primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-brand-800 tracking-tight font-display">
            {isCustomer ? 'My Inquiries' : 'Commercial Inquiries'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track and manage all your commercial inquiries
          </p>
        </div>

        {canCreate && (
          <button
            onClick={onNew}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-sm transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>New Inquiry</span>
          </button>
        )}
      </div>

      {/* 2. KPI Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <StatCard
          icon={FileText}
          label="Open Inquiries"
          value={kpiCounts.open}
          onViewAll={() => handleKpiFilter('DRAFT')}
          viewAllLabel="View all"
          selected={filters.status === 'DRAFT'}
        />
        <StatCard
          icon={Send}
          label="Submitted"
          value={kpiCounts.submitted}
          onViewAll={() => handleKpiFilter('SUBMITTED')}
          viewAllLabel="View all"
          selected={filters.status === 'SUBMITTED'}
        />
        <StatCard
          icon={Clock}
          label="Under Review"
          value={kpiCounts.underReview}
          onViewAll={() => handleKpiFilter('UNDER_REVIEW')}
          viewAllLabel="View all"
          selected={filters.status === 'UNDER_REVIEW'}
        />
        <StatCard
          icon={CheckCircle2}
          label="Closed"
          value={kpiCounts.closed}
          onViewAll={() => handleKpiFilter('CLOSED')}
          viewAllLabel="View all"
          selected={filters.status === 'CLOSED'}
        />
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filters.q || ''}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({ ...prev, q: e.target.value }));
              }}
              placeholder="Search by inquiry no., ref, project, customer…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>

          {/* Status Dropdown */}
          <div className="w-full lg:w-44">
            <select
              value={filters.status || ''}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({ ...prev, status: e.target.value }));
              }}
              className="w-full py-2 px-3 rounded-xl border border-slate-200 text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Open</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="QUOTED">Quotation Generated</option>
              <option value="CANCELLED">Canceled</option>
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({ ...prev, dateFrom: e.target.value }));
              }}
              className="py-2 px-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
              title="From date"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => {
                setPage(1);
                setFilters((prev) => ({ ...prev, dateTo: e.target.value }));
              }}
              className="py-2 px-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
              title="To date"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            {canExport && (
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Export</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowColumns((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                showColumns
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
            </button>
          </div>
        </div>

        {/* Column Customization Drawer */}
        {showColumns && (
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800">Column visibility (personal view)</p>
              <button
                type="button"
                onClick={() => {
                  const next = {
                    visibleFieldIds: platformListFields.filter((f) => f.defaultVisible).map((f) => f.id),
                  };
                  setColumnPref(next);
                  saveListColumnPreference(next, prefUserId);
                }}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Reset to Default
              </button>
            </div>

            <div className="flex flex-wrap gap-4">
              {platformListFields.filter((c) => {
                if (isCustomer && (c.systemProtected || c.customerVisible === false)) return false;
                return true;
              }).map((col) => (
                <label key={col.id} className="flex items-center gap-1.5 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={columnPref.visibleFieldIds.includes(col.id)}
                    onChange={() => {
                      setColumnPref((prev) => {
                        const exists = prev.visibleFieldIds.includes(col.id);
                        const visibleFieldIds = exists
                          ? prev.visibleFieldIds.filter((id) => id !== col.id)
                          : [...prev.visibleFieldIds, col.id];
                        const next = { visibleFieldIds };
                        saveListColumnPreference(next, prefUserId);
                        return next;
                      });
                    }}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Inquiry Register Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {/* Desktop Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-slate-600 font-bold border-b border-slate-200 uppercase text-[11px] tracking-wider">
              <tr>
                {visibleColumns.map((col) => (
                  <th key={col.id} className="px-4 py-3.5 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="py-12 text-center text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                      <span>Loading inquiries…</span>
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} className="py-12 text-center text-slate-500">
                    <p className="font-semibold text-slate-700">No inquiries found.</p>
                    <p className="text-slate-400 text-xs mt-1">
                      {filters.q || filters.status
                        ? 'Try clearing your search or status filters.'
                        : 'Create your first commercial inquiry to get started.'}
                    </p>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onOpen(row.id)}
                    className={`cursor-pointer transition-colors hover:bg-blue-50/40 ${
                      selectedId === row.id ? 'bg-blue-50/60' : ''
                    }`}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.id} className="px-4 py-3.5 whitespace-nowrap">
                        {col.id === 'status' ? (
                          <StatusBadge status={row.status} label={formatInquiryStatus(row.status)} />
                        ) : col.id === 'inquiryNumber' ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpen(row.id);
                            }}
                            className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            title={`Open ${row.inquiryNumber}`}
                          >
                            {row.inquiryNumber}
                            {row.versionNo ? ` - V${row.versionNo}` : ''}
                          </button>
                        ) : col.id === 'customerReference' ? (
                          <span className="font-mono font-medium text-slate-700">
                            {cellValue(row, col.id)}
                          </span>
                        ) : (
                          <span className="text-slate-700 font-medium">{cellValue(row, col.id)}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(row.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        title="View Details"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 5. Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 text-xs text-slate-600 bg-slate-50/40">
          <div>
            Showing {total > 0 ? (page - 1) * pageSize + 1 : 0} to{' '}
            {Math.min(page * pageSize, total)} of {total} inquiries
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none font-medium transition-colors"
              >
                ‹
              </button>
              <span className="px-2 font-semibold text-slate-800">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none font-medium transition-colors"
              >
                ›
              </button>
            </div>

            <div className="flex items-center gap-1 text-slate-500">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="py-1 px-2 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:outline-none"
              >
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
