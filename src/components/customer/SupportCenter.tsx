import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileCheck,
  FileText,
  Inbox,
  Loader2,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CUSTOMER_HOME_PATH, customerInquiryDetailPath, customerPathForTab } from '../../app/shellRoutes';
import { Badge, Button, Card, Drawer, Input, Select, Textarea } from '../ui';
import { CustomerPageHero } from './CustomerPageHero';
import { SupportChatPanel } from './SupportChatPanel';
import { caseTypeLabel } from '../../domain/supportChat';
import {
  addCustomerServiceAttachment,
  addCustomerServiceComment,
  confirmCustomerServiceResolution,
  createCustomerServiceCase,
  customerServiceAttachmentUrl,
  fetchCaseReferenceInquiries,
  fetchCaseReferenceLines,
  fetchCustomerServiceCase,
  fetchCustomerServiceCases,
  fetchCustomerServiceMeta,
  fetchCustomerServiceSummary,
  requestCustomerServiceReopen,
  resolveCaseReferences,
  type CaseReferenceInquiry,
  type CaseReferenceLine,
  type CustomerServiceCaseDto,
  type CustomerServiceCaseListItem,
  type CustomerServiceMeta,
  type CustomerServiceSummary,
} from '../../services/customerServiceApiService';
import { casePriorityLabel, caseStatusLabel, caseStatusTone, formatSupportDate, supportPageNumbers } from './supportCenterPresentation';

const EMPTY_SUMMARY: CustomerServiceSummary = {
  open: 0,
  inProgress: 0,
  resolved: 0,
  awaitingCustomer: 0,
  closed: 0,
  all: 0,
};

const TABS: Array<{ id: string; label: string; countKey: keyof CustomerServiceSummary }> = [
  { id: 'all', label: 'All Cases', countKey: 'all' },
  { id: 'open', label: 'Open', countKey: 'open' },
  { id: 'in_progress', label: 'In Progress', countKey: 'inProgress' },
  { id: 'awaiting_customer', label: 'Awaiting Your Response', countKey: 'awaitingCustomer' },
  { id: 'resolved', label: 'Resolved', countKey: 'resolved' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function SupportHero() {
  return (
    <CustomerPageHero
      breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Help & Support' }]}
      title="Help & Support"
      subtitle="Raise a complaint, get technical support, and track your requests."
    />
  );
}

export const SupportCenter: React.FC = () => {
  const { jwtToken } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('new') === '1' ? 'new' : params.get('case') ? 'detail' : 'list';
  const caseId = params.get('case');

  const [meta, setMeta] = useState<CustomerServiceMeta | null>(null);
  const [summary, setSummary] = useState<CustomerServiceSummary>(EMPTY_SUMMARY);
  const [rows, setRows] = useState<CustomerServiceCaseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [tab, setTab] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const [detail, setDetail] = useState<CustomerServiceCaseDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const [inquiries, setInquiries] = useState<CaseReferenceInquiry[]>([]);
  const [lines, setLines] = useState<CaseReferenceLine[]>([]);
  const [related, setRelated] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({
    subject: '',
    description: '',
    categoryId: '',
    priority: 'MEDIUM',
    issueDate: new Date().toISOString().slice(0, 10),
    inquiryId: '',
    inquiryLineId: '',
    caseType: '',
    requestedResolution: '',
    affectedQuantity: '',
    affectedQuantityUom: 'KM',
    affectedLengthMeters: '',
  });
  const [formFile, setFormFile] = useState<File | null>(null);
  const [preferTechnical, setPreferTechnical] = useState(false);

  const openList = () => {
    setParams({});
    setDetail(null);
  };
  const openNew = (technical = false) => {
    setPreferTechnical(technical);
    setParams({ new: '1' });
  };
  const openCase = (id: string) => setParams({ case: id });

  const reloadList = useCallback(async () => {
    if (!jwtToken) {
      setLoading(false);
      setError('Sign in to view your support cases.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [listed, counts] = await Promise.all([
        fetchCustomerServiceCases(jwtToken, {
          tab,
          status: statusFilter || undefined,
          q: search || undefined,
          categoryId: categoryId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          pageSize,
        }),
        fetchCustomerServiceSummary(jwtToken),
      ]);
      setRows(listed.cases);
      setTotal(listed.total);
      setSummary(counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support cases');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [jwtToken, tab, statusFilter, search, categoryId, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    if (!jwtToken) return;
    void fetchCustomerServiceMeta(jwtToken)
      .then(setMeta)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load support master data'));
  }, [jwtToken]);

  useEffect(() => {
    if (view === 'list') void reloadList();
  }, [reloadList, view]);

  useEffect(() => {
    if (!jwtToken || view !== 'detail' || !caseId) return;
    setDetailLoading(true);
    fetchCustomerServiceCase(jwtToken, caseId)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load case'))
      .finally(() => setDetailLoading(false));
  }, [jwtToken, view, caseId]);

  useEffect(() => {
    if (!jwtToken || view !== 'new') return;
    void fetchCaseReferenceInquiries(jwtToken).then(setInquiries).catch(() => setInquiries([]));
  }, [jwtToken, view]);

  useEffect(() => {
    if (!meta || !preferTechnical || form.categoryId) return;
    const technical = meta.categories.find((c) => c.code === 'TECHNICAL_SUPPORT');
    if (technical) setForm((prev) => ({ ...prev, categoryId: technical.id }));
  }, [meta, preferTechnical, form.categoryId]);

  useEffect(() => {
    if (!jwtToken || !form.inquiryId) {
      setLines([]);
      setRelated(null);
      return;
    }
    void fetchCaseReferenceLines(jwtToken, form.inquiryId).then(setLines).catch(() => setLines([]));
    void resolveCaseReferences(jwtToken, form.inquiryId, form.inquiryLineId || undefined)
      .then(setRelated)
      .catch(() => setRelated(null));
  }, [jwtToken, form.inquiryId, form.inquiryLineId]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const relatedCable = related?.cable as { materialNumber?: string; description?: string } | undefined;
  const relatedQuotation = related?.quotation as { quotationNumber?: string } | undefined;
  const relatedOrder = related?.salesOrder as { salesOrderNumber?: string } | undefined;
  const relatedDrum = related?.drum as { drumCode?: string } | undefined;
  const relatedShipment = related?.shipment as { groupCode?: string } | undefined;

  const kpiCards = useMemo(
    () => [
      { key: 'open', label: 'Open Cases', value: summary.open, icon: FileText, wrap: 'bg-blue-50 text-blue-600', tabId: 'open' },
      { key: 'inProgress', label: 'In Progress', value: summary.inProgress, icon: Clock, wrap: 'bg-orange-50 text-orange-500', tabId: 'in_progress' },
      { key: 'resolved', label: 'Resolved', value: summary.resolved, icon: CheckCircle2, wrap: 'bg-emerald-50 text-emerald-600', tabId: 'resolved' },
      { key: 'awaiting', label: 'Awaiting Your Response', value: summary.awaitingCustomer, icon: UserRound, wrap: 'bg-sky-50 text-sky-600', tabId: 'awaiting_customer' },
    ],
    [summary]
  );

  const submitCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwtToken) return;
    setSaving(true);
    setError(null);
    try {
      const attachment = formFile
        ? { fileName: formFile.name, mimeType: formFile.type, contentBase64: await fileToBase64(formFile) }
        : undefined;
      const created = await createCustomerServiceCase(jwtToken, {
        ...form,
        caseType: form.caseType || undefined,
        affectedQuantity: form.affectedQuantity ? Number(form.affectedQuantity) : undefined,
        affectedLengthMeters: form.affectedLengthMeters ? Number(form.affectedLengthMeters) : undefined,
        inquiryLineId: form.inquiryLineId || undefined,
        requestedResolution: form.requestedResolution || undefined,
        attachment,
      });
      openCase(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the case');
    } finally {
      setSaving(false);
    }
  };

  const submitComment = async () => {
    if (!jwtToken || !detail || !comment.trim()) return;
    setSaving(true);
    try {
      const updated = await addCustomerServiceComment(jwtToken, detail.id, comment.trim());
      setDetail(updated);
      setComment('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add comment');
    } finally {
      setSaving(false);
    }
  };

  const submitDetailAttachment = async (file: File) => {
    if (!jwtToken || !detail) return;
    setSaving(true);
    try {
      const updated = await addCustomerServiceAttachment(jwtToken, detail.id, {
        fileName: file.name,
        mimeType: file.type,
        contentBase64: await fileToBase64(file),
      });
      setDetail(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload attachment');
    } finally {
      setSaving(false);
    }
  };

  const runConfirm = async (accepted: boolean) => {
    if (!jwtToken || !detail) return;
    setSaving(true);
    try {
      setDetail(await confirmCustomerServiceResolution(jwtToken, detail.id, accepted));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm resolution');
    } finally {
      setSaving(false);
    }
  };

  const runReopen = async () => {
    if (!jwtToken || !detail) return;
    setSaving(true);
    try {
      setDetail(await requestCustomerServiceReopen(jwtToken, detail.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reopen the case');
    } finally {
      setSaving(false);
    }
  };

  const chatPanel = (
    <SupportChatPanel
      onNewCase={() => openNew(false)}
      onOpenCase={openCase}
      onError={setError}
    />
  );

  return (
    <div className="space-y-5">
      <SupportHero />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {view === 'list' && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_15.5rem] gap-3 items-stretch">
            {kpiCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => {
                    setTab(card.tabId);
                    setPage(1);
                  }}
                  className={`customer-home-card text-start px-4 py-3.5 min-w-0 hover:shadow-[var(--shadow-raised)] transition-shadow ${
                    tab === card.tabId ? 'ring-1 ring-brand-400' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${card.wrap}`}>
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="text-[13px] font-medium text-slate-500 leading-tight">{card.label}</span>
                  </div>
                  <p className="mt-3 text-[28px] leading-none font-bold text-slate-900 tabular-nums">
                    {loading ? '—' : card.value}
                  </p>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => openNew(false)}
              className="col-span-2 xl:col-span-1 min-h-[5.25rem] rounded-2xl bg-[#2F6BFF] hover:bg-[#2563eb] text-white px-4 py-4 flex items-center justify-center gap-2 text-[13px] font-semibold shadow-[0_6px_16px_rgba(47,107,255,0.28)]"
            >
              <Plus className="h-4 w-4" />
              New Complaint / Support Request
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-stretch">
            <div className="min-w-0 space-y-0">
              <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar" role="tablist">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    onClick={() => {
                      setTab(item.id);
                      setPage(1);
                    }}
                    className={`px-3 py-2.5 -mb-px text-[13px] font-semibold border-b-2 whitespace-nowrap ${
                      tab === item.id ? 'border-brand-500 text-brand-500' : 'border-transparent text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    {item.label} ({summary[item.countKey]})
                  </button>
                ))}
              </div>

              <Card flushBody className="overflow-hidden mt-3">
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_9rem_9rem_minmax(12rem,1fr)] gap-2">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setPage(1);
                          setSearch(searchInput.trim());
                        }
                      }}
                      placeholder="Search by case no., subject, inquiry no."
                      className="pl-9 h-10 text-xs"
                      aria-label="Search cases"
                    />
                  </div>
                  <Select
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setPage(1);
                    }}
                    className="text-xs h-10"
                    aria-label="Category"
                  >
                    <option value="">All</option>
                    {(meta?.categories || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                    className="text-xs h-10"
                    aria-label="Status"
                  >
                    <option value="">All</option>
                    {(meta?.statuses || []).map((s) => (
                      <option key={s.code} value={s.code}>
                        {caseStatusLabel(s.code)}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-2 min-w-0">
                    <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="text-xs h-10" aria-label="From" placeholder="From" />
                    <span className="text-slate-400 text-xs shrink-0">→</span>
                    <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="text-xs h-10" aria-label="To" placeholder="To" />
                  </div>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading cases…
                  </div>
                ) : rows.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <Inbox className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No support cases yet</p>
                    <p className="text-xs text-slate-500">Raise a complaint or support request linked to one of your Energya inquiries.</p>
                    <Button variant="primary" size="sm" leadingIcon={Plus} onClick={() => openNew(false)}>
                      New Complaint / Support Request
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">Case No.</th>
                            <th className="px-4 py-2.5 font-semibold">Date</th>
                            <th className="px-4 py-2.5 font-semibold">Subject</th>
                            <th className="px-4 py-2.5 font-semibold">Category</th>
                            <th className="px-4 py-2.5 font-semibold">Related Inquiry</th>
                            <th className="px-4 py-2.5 font-semibold">Status</th>
                            <th className="px-4 py-2.5 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100">
                              <td className="px-4 py-3 font-mono text-xs font-semibold text-brand-500">{row.caseNumber}</td>
                              <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatSupportDate(row.createdAt)}</td>
                              <td className="px-4 py-3 text-slate-800">{row.subject}</td>
                              <td className="px-4 py-3 text-slate-600">{row.categoryName}</td>
                              <td className="px-4 py-3">
                                {row.inquiryId ? (
                                  <Link className="text-brand-500 hover:underline font-medium" to={customerInquiryDetailPath(row.inquiryId)}>
                                    {row.inquiryNumber}
                                  </Link>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <Badge tone={caseStatusTone(row.status)} className="font-medium">{caseStatusLabel(row.status)}</Badge>
                              </td>
                              <td className="px-4 py-3">
                                <div className="relative flex items-center gap-2">
                                  <button type="button" className="text-[13px] font-medium text-slate-600 hover:text-brand-500" onClick={() => openCase(row.id)}>
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
                                    onClick={() => setMenuId(menuId === row.id ? null : row.id)}
                                    aria-label="More actions"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>
                                  {menuId === row.id && (
                                    <div className="absolute mt-8 right-0 z-10 rounded-xl border border-slate-200 bg-white shadow-lg py-1 text-xs">
                                      <button type="button" className="block w-full text-start px-3 py-1.5 hover:bg-slate-50" onClick={() => openCase(row.id)}>
                                        Open case
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="md:hidden divide-y divide-slate-100">
                      {rows.map((row) => (
                        <button key={row.id} type="button" onClick={() => openCase(row.id)} className="w-full text-start px-4 py-3 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-semibold text-brand-700">{row.caseNumber}</span>
                            <Badge tone={caseStatusTone(row.status)}>{caseStatusLabel(row.status)}</Badge>
                          </div>
                          <p className="text-sm font-semibold text-slate-800">{row.subject}</p>
                          <p className="text-xs text-slate-500">
                            {row.categoryName} · {row.inquiryNumber || 'No inquiry'} · {formatSupportDate(row.createdAt)}
                          </p>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
                      <p>
                        Showing {total === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} cases
                      </p>
                      <div className="flex items-center gap-3">
                        <span>Rows per page</span>
                        <Select value={String(pageSize)} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 text-xs w-16">
                          {[5, 10, 25].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </Select>
                        <div className="flex items-center gap-1">
                          {supportPageNumbers(page, pageCount).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setPage(n)}
                              className={`h-7 min-w-7 px-1.5 rounded-full text-[12px] font-semibold ${
                                n === page ? 'bg-brand-500 text-white' : 'text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            </div>
            <div id="support-chat" className="min-h-[32rem] xl:min-h-[36rem]">
              {chatPanel}
            </div>
          </div>
        </>
      )}

      {view === 'new' && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
          <Card className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-brand-800">New Complaint / Support Request</h2>
                <p className="text-xs text-slate-500">Link the case to a real inquiry so Energya can investigate the transaction.</p>
              </div>
              <Button variant="tertiary" size="sm" onClick={openList}>Back to cases</Button>
            </div>
            <form onSubmit={submitCase} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-600 space-y-1 md:col-span-2">
                Subject *
                <Input required value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} className="h-10" />
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1 md:col-span-2">
                Description *
                <Textarea required rows={4} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">
                Case type
                <Select value={form.caseType} onChange={(e) => setForm((p) => ({ ...p, caseType: e.target.value }))} className="h-10">
                  <option value="">Select type</option>
                  {(meta?.caseTypes || [
                    { code: 'COMPLAINT', label: caseTypeLabel('COMPLAINT') },
                    { code: 'TECHNICAL_SUPPORT', label: caseTypeLabel('TECHNICAL_SUPPORT') },
                    { code: 'GENERAL_SUPPORT', label: caseTypeLabel('GENERAL_SUPPORT') },
                    { code: 'INFORMATION_REQUEST', label: caseTypeLabel('INFORMATION_REQUEST') },
                  ]).map((t) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </Select>
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">
                Category *
                <Select required value={form.categoryId} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))} className="h-10">
                  <option value="">Select category</option>
                  {(meta?.categories || []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">
                Priority
                <Select value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} className="h-10">
                  {(meta?.priorities || []).map((p) => (
                    <option key={p.code} value={p.code}>{casePriorityLabel(p.code)}</option>
                  ))}
                </Select>
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">
                Issue date
                <Input type="date" value={form.issueDate} onChange={(e) => setForm((p) => ({ ...p, issueDate: e.target.value }))} className="h-10" />
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">
                Related inquiry *
                <Select required value={form.inquiryId} onChange={(e) => setForm((p) => ({ ...p, inquiryId: e.target.value, inquiryLineId: '' }))} className="h-10">
                  <option value="">Select your inquiry</option>
                  {inquiries.map((inq) => (
                    <option key={inq.id} value={inq.id}>
                      {inq.inquiryNumber}{inq.projectName ? ` — ${inq.projectName}` : ''}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">
                Inquiry line
                <Select value={form.inquiryLineId} onChange={(e) => setForm((p) => ({ ...p, inquiryLineId: e.target.value }))} className="h-10" disabled={!form.inquiryId}>
                  <option value="">All lines / header</option>
                  {lines.map((line) => (
                    <option key={line.id} value={line.id}>
                      Line {line.lineNumber}{line.materialNumber ? ` — ${line.materialNumber}` : ''} {line.cableDescription}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1">
                Requested resolution
                <Select value={form.requestedResolution} onChange={(e) => setForm((p) => ({ ...p, requestedResolution: e.target.value }))} className="h-10">
                  <option value="">Select option</option>
                  {(meta?.requestedResolutions || []).map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </Select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-600 space-y-1">
                  Affected qty
                  <Input value={form.affectedQuantity} onChange={(e) => setForm((p) => ({ ...p, affectedQuantity: e.target.value }))} className="h-10" />
                </label>
                <label className="text-xs font-semibold text-slate-600 space-y-1">
                  UoM
                  <Input value={form.affectedQuantityUom} onChange={(e) => setForm((p) => ({ ...p, affectedQuantityUom: e.target.value }))} className="h-10" />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-600 space-y-1">
                Affected length (m)
                <Input value={form.affectedLengthMeters} onChange={(e) => setForm((p) => ({ ...p, affectedLengthMeters: e.target.value }))} className="h-10" />
              </label>
              <label className="text-xs font-semibold text-slate-600 space-y-1 md:col-span-2">
                Attachment
                <input type="file" className="block text-xs" onChange={(e) => setFormFile(e.target.files?.[0] || null)} />
              </label>
              {related && (
                <div className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 grid sm:grid-cols-2 gap-1">
                  <p>Cable: {relatedCable?.materialNumber || relatedCable?.description || 'Not resolved yet'}</p>
                  <p>Quotation: {relatedQuotation?.quotationNumber || 'None yet'}</p>
                  <p>Sales order: {relatedOrder?.salesOrderNumber || 'None yet'}</p>
                  <p>Drum: {relatedDrum?.drumCode || (related?.drumType as string) || 'None yet'}</p>
                  <p>Shipment: {relatedShipment?.groupCode || 'None yet'}</p>
                </div>
              )}
              <div className="md:col-span-2 flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={openList}>Cancel</Button>
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? 'Submitting…' : 'Submit case'}
                </Button>
              </div>
            </form>
          </Card>
          <div className="min-h-[32rem] hidden xl:block">{chatPanel}</div>
        </div>
      )}

      {view === 'detail' && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
          <div className="space-y-4 min-w-0">
            <Button variant="tertiary" size="sm" leadingIcon={ChevronLeft} onClick={openList}>
              Back to cases
            </Button>
            {detailLoading || !detail ? (
              <Card className="p-8 text-center text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading case…
              </Card>
            ) : (
              <>
                <Card className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-semibold text-brand-600">{detail.caseNumber}</p>
                      <h2 className="text-xl font-bold text-brand-800">{detail.subject}</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {detail.category?.name}
                        {detail.caseType ? ` · ${caseTypeLabel(detail.caseType)}` : ''}
                        {' · '}
                        {casePriorityLabel(detail.priority)} · {formatSupportDate(detail.createdAt)}
                      </p>
                    </div>
                    <Badge tone={caseStatusTone(detail.status)}>{caseStatusLabel(detail.status)}</Badge>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail.description}</p>
                  {(detail.assignedDepartmentLabel || detail.assignedRepresentativeName) && (
                    <p className="text-xs text-slate-500">
                      Assigned to {detail.assignedDepartmentLabel || 'Customer Service'}
                      {detail.assignedRepresentativeName ? ` · ${detail.assignedRepresentativeName}` : ''}
                    </p>
                  )}
                </Card>

                <Card className="p-4 sm:p-5 space-y-2">
                  <h3 className="text-sm font-bold text-slate-800">Related transactions</h3>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    {detail.inquiry && (
                      <Link className="rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50" to={customerInquiryDetailPath(detail.inquiry.id)}>
                        Inquiry {detail.inquiry.inquiryNumber}
                      </Link>
                    )}
                    {detail.inquiryLine && (
                      <div className="rounded-xl border border-slate-100 px-3 py-2 text-slate-600">
                        Line {detail.inquiryLine.lineNumber} · {detail.inquiryLine.materialNumber || detail.inquiryLine.cableDescription}
                      </div>
                    )}
                    {detail.cable && (
                      <div className="rounded-xl border border-slate-100 px-3 py-2 text-slate-600">
                        Cable {detail.cable.materialNumber}
                      </div>
                    )}
                    {detail.quotation && detail.inquiry && (
                      <Link className="rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50" to={customerInquiryDetailPath(detail.inquiry.id)}>
                        Quotation {detail.quotation.quotationNumber}
                      </Link>
                    )}
                    {detail.salesOrder && (
                      <Link className="rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50" to={customerPathForTab('sales_orders')}>
                        Sales order {detail.salesOrder.salesOrderNumber}
                      </Link>
                    )}
                    {detail.shipment && (
                      <Link className="rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50" to={customerPathForTab('shipment_tracking')}>
                        Shipment {detail.shipment.groupCode}
                      </Link>
                    )}
                    {(detail.drum || detail.drumType) && (
                      <div className="rounded-xl border border-slate-100 px-3 py-2 text-slate-600">
                        Drum {detail.drum?.drumCode || detail.drumType}
                      </div>
                    )}
                    {!detail.inquiry && !detail.quotation && !detail.salesOrder && (
                      <p className="text-xs text-slate-500">No related documents are available yet.</p>
                    )}
                  </div>
                </Card>

                {detail.resolution && (
                  <Card className="p-4 sm:p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-800">Resolution</h3>
                    <p className="text-sm text-slate-700">{detail.resolution.resolutionSummary}</p>
                    {detail.status === 'RESOLVED' && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="primary" size="sm" leadingIcon={CheckCircle2} disabled={saving} onClick={() => void runConfirm(true)}>
                          Yes, this is resolved
                        </Button>
                        <Button variant="secondary" size="sm" disabled={saving} onClick={() => void runConfirm(false)}>
                          No, please reopen
                        </Button>
                      </div>
                    )}
                    {(detail.status === 'CLOSED' || detail.status === 'RESOLVED') && (
                      <Button variant="tertiary" size="sm" disabled={saving} onClick={() => void runReopen()}>
                        Request reopen
                      </Button>
                    )}
                  </Card>
                )}

                <Card className="p-4 sm:p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">Timeline</h3>
                  <ol className="space-y-3">
                    {detail.statusHistory.map((event) => (
                      <li key={event.id} className="flex gap-3 text-sm">
                        <FileCheck className="h-4 w-4 mt-0.5 text-brand-500 shrink-0" />
                        <div>
                          <p className="font-semibold text-slate-800">
                            {event.fromStatus ? `${caseStatusLabel(event.fromStatus)} → ` : ''}
                            {caseStatusLabel(event.toStatus)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatSupportDate(event.createdAt)}
                            {event.note ? ` · ${event.note}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                    {detail.comments.map((item) => (
                      <li key={item.id} className="flex gap-3 text-sm">
                        <MessageSquare className="h-4 w-4 mt-0.5 text-slate-400 shrink-0" />
                        <div>
                          <p className="text-slate-800 whitespace-pre-wrap">{item.body}</p>
                          <p className="text-xs text-slate-500">
                            {item.createdByName || 'Customer'} · {formatSupportDate(item.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Textarea
                      rows={3}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a customer comment…"
                      className="flex-1"
                    />
                    <Button variant="primary" size="sm" leadingIcon={Send} disabled={saving || !comment.trim()} onClick={() => void submitComment()}>
                      Add comment
                    </Button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <Paperclip className="h-3.5 w-3.5" />
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void submitDetailAttachment(file);
                      }}
                    />
                  </label>
                  {detail.attachments.length > 0 && (
                    <ul className="text-xs space-y-1">
                      {detail.attachments.map((att) => (
                        <li key={att.id}>
                          <button
                            type="button"
                            className="text-brand-600 hover:underline"
                            onClick={() => {
                              if (!jwtToken) return;
                              void fetch(customerServiceAttachmentUrl(detail.id, att.id), {
                                headers: { Authorization: `Bearer ${jwtToken}` },
                              })
                                .then(async (res) => {
                                  if (!res.ok) throw new Error('Unable to download attachment');
                                  const blob = await res.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = att.fileName;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                })
                                .catch((err) => setError(err instanceof Error ? err.message : 'Download failed'));
                            }}
                          >
                            {att.fileName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}
          </div>
          <div className="min-h-[32rem] hidden xl:block">{chatPanel}</div>
        </div>
      )}

      <button
        type="button"
        className="xl:hidden fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full bg-brand-500 text-white shadow-lg inline-flex items-center justify-center"
        aria-label="Open support chat"
        onClick={() => setChatOpen(true)}
      >
        <MessageCircle className="h-5 w-5" />
      </button>
      <Drawer open={chatOpen} onClose={() => setChatOpen(false)} title="Chat with our Support Team">
        <div className="-m-5">
          <SupportChatPanel compact onNewCase={() => { setChatOpen(false); openNew(false); }} onOpenCase={(id) => { setChatOpen(false); openCase(id); }} onError={setError} />
        </div>
      </Drawer>
    </div>
  );
};
