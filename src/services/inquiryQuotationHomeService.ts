import { ErpRequestHeader, UserAccount } from '../types';
import { INITIAL_ERP_REQUESTS } from '../data/mockData';

export type IqTransactionKind = 'Inquiry' | 'Quotation';

export interface InquiryQuotationHomeRow {
  id: string;
  sr: number;
  transactionNo: string;
  transactionType: IqTransactionKind;
  date: string;
  version: number;
  status: string;
  referenceNo: string;
  createdBy: string;
  requestedDate: string;
  modifiedDate: string;
  modifiedBy: string;
  totalValue: number;
  currency: string;
  customerName: string;
  source: ErpRequestHeader;
}

export interface IqGridColumn {
  id: keyof InquiryQuotationHomeRow | 'sr';
  label: string;
  width: number;
  visible: boolean;
  align?: 'left' | 'right' | 'center';
  sensitive?: boolean;
}

export const DEFAULT_IQ_GRID_COLUMNS: IqGridColumn[] = [
  { id: 'sr', label: 'SR#', width: 56, visible: true, align: 'center' },
  { id: 'transactionNo', label: 'Inquiry / Quotation No.', width: 160, visible: true },
  { id: 'transactionType', label: 'Type', width: 100, visible: true },
  { id: 'date', label: 'Date', width: 110, visible: true },
  { id: 'version', label: 'Version', width: 80, visible: true, align: 'center' },
  { id: 'status', label: 'Status', width: 140, visible: true },
  { id: 'referenceNo', label: 'Reference #', width: 120, visible: true },
  { id: 'customerName', label: 'Customer', width: 180, visible: true },
  { id: 'createdBy', label: 'Created By', width: 140, visible: true },
  { id: 'requestedDate', label: 'Requested Date', width: 120, visible: true },
  { id: 'modifiedDate', label: 'Modified Date', width: 140, visible: true },
  { id: 'modifiedBy', label: 'Modified By', width: 140, visible: true },
  { id: 'totalValue', label: 'Total Value', width: 120, visible: true, align: 'right', sensitive: true },
  { id: 'currency', label: 'Currency', width: 88, visible: true },
];

export function mapTransactionKind(header: ErpRequestHeader): IqTransactionKind {
  if (header.transactionType === 'Sales Quotation') return 'Quotation';
  return 'Inquiry';
}

export function computeCommercialTotal(header: ErpRequestHeader): number {
  return (header.items || []).reduce((sum, item) => {
    const qty = Number(item.qty) || 0;
    const unit = Number(item.unitPriceUsd) || 0;
    return sum + qty * unit;
  }, 0);
}

export function isElandCustomer(user: UserAccount | null): boolean {
  if (!user || user.userType !== 'customer') return false;
  const blob = `${user.companyName || ''} ${user.email || ''} ${user.userName || ''}`.toLowerCase();
  return blob.includes('eland');
}

export const ELAND_INQUIRY_STATUSES = ['Open', 'Submitted', 'Canceled'] as const;

export function normalizeInquiryStatus(
  headerStatus: string,
  quotationStatus: string | undefined,
  forEland: boolean
): string {
  const raw = (quotationStatus || headerStatus || '').trim();
  const lower = raw.toLowerCase();

  if (forEland) {
    if (lower.includes('cancel')) return 'Canceled';
    if (
      lower.includes('submit') ||
      lower.includes('sent to technical') ||
      lower.includes('technical') ||
      lower.includes('approved') ||
      lower.includes('closed')
    ) {
      return 'Submitted';
    }
    return 'Open';
  }

  if (lower.includes('cancel')) return 'Canceled';
  if (raw === 'Opened') return 'Open';
  if (lower === 'submitted' || raw === 'Submitted') return 'Submitted';
  return raw;
}

export function inquiryStatusFilterOptions(
  user: UserAccount | null,
  rows: InquiryQuotationHomeRow[]
): string[] {
  if (isElandCustomer(user)) return [...ELAND_INQUIRY_STATUSES];
  const base = ['Open', 'Submitted', 'Canceled', 'Sent To Technical'];
  const fromData = rows.map((row) => row.status);
  return Array.from(new Set([...base, ...fromData])).sort((a, b) => a.localeCompare(b));
}

export function toHomeRow(header: ErpRequestHeader, sr: number, user: UserAccount | null = null): InquiryQuotationHomeRow {
  const forEland = isElandCustomer(user);
  return {
    id: header.id,
    sr,
    transactionNo: header.quoteNo || `QT-${header.refNo.replace(/\//g, '')}`,
    transactionType: mapTransactionKind(header),
    date: header.trxDate,
    version: header.versionNo || 1,
    status: normalizeInquiryStatus(header.status, header.quotationStatus, forEland),
    referenceNo: header.refNo,
    createdBy: header.quotationOwner || header.salesAgent,
    requestedDate: header.deliveryDate,
    modifiedDate: header.modifiedDate || header.statusLogs?.[0]?.date || header.trxDate,
    modifiedBy: header.modifiedBy || header.statusLogs?.[0]?.changedBy || header.quotationOwner,
    totalValue: computeCommercialTotal(header),
    currency: header.currency,
    customerName: header.customerName,
    source: header,
  };
}

export function filterHeadersForUser(
  headers: ErpRequestHeader[],
  user: UserAccount | null
): ErpRequestHeader[] {
  if (!user) return headers;
  if (user.userType === 'customer') {
    const company = (user.companyName || user.fullName || '').toLowerCase();
    const matched = headers.filter((r) => {
      const cName = (r.customerName || '').toLowerCase();
      const contact = (r.contactPerson || '').toLowerCase();
      return cName.includes(company) || company.includes(cName) || contact.includes(company);
    });
    if (matched.length > 0) return matched;
    const demoStatuses: Array<{ status: ErpRequestHeader['status']; quotationStatus?: ErpRequestHeader['quotationStatus'] }> = [
      { status: 'Opened' },
      { status: 'Opened', quotationStatus: 'Sent To Technical' },
      { status: 'Closed' },
    ];
    return headers.slice(0, 3).map((r, index) => ({
      ...r,
      customerName: user.companyName || 'My Customer Account',
      status: demoStatuses[index]?.status ?? r.status,
      quotationStatus: demoStatuses[index]?.quotationStatus ?? r.quotationStatus,
    }));
  }
  const isManagerOrAdmin =
    user.role.toLowerCase().includes('admin') ||
    user.role.toLowerCase().includes('manager') ||
    user.role.toLowerCase().includes('head');
  if (!isManagerOrAdmin) {
    const name = (user.fullName || '').toLowerCase();
    const matched = headers.filter((r) => {
      const sAgent = (r.salesAgent || '').toLowerCase();
      const qOwner = (r.quotationOwner || '').toLowerCase();
      return sAgent.includes(name) || name.includes(sAgent) || qOwner.includes(name);
    });
    if (matched.length > 0) return matched;
    return headers.filter((_, i) => i % 2 === 0);
  }
  return headers;
}

/** Build home rows from a supplied header list (shared workspace state). */
export function listInquiriesAndQuotationsFromHeaders(
  headers: ErpRequestHeader[],
  user: UserAccount | null
): InquiryQuotationListItem[] {
  const scoped = filterHeadersForUser(headers, user);
  return scoped.map((h, i) => toHomeRow(h, i + 1, user));
}

/** List-row DTO used by the Home grid. Seed may change; this shape should not. */
export type InquiryQuotationListItem = InquiryQuotationHomeRow;
export type InquiryQuotationTransactionType = IqTransactionKind;

/**
 * Application-service boundary for the Home register.
 * Today: maps prototype seed. Tomorrow: GET /api/commercial-transactions.
 * Home UI must call this — not INITIAL_ERP_REQUESTS.
 */
export function listInquiriesAndQuotations(user: UserAccount | null): InquiryQuotationListItem[] {
  const headers = filterHeadersForUser(getInquiryQuotationSeed(), user);
  return headers.map((h, i) => toHomeRow(h, i + 1, user));
}

function getInquiryQuotationSeed(): ErpRequestHeader[] {
  return INITIAL_ERP_REQUESTS;
}

export interface IqHomeFilters {
  search: string;
  status: string;
  customer: string;
  currency: string;
  createdBy: string;
  version: string;
  dateFrom: string;
  dateTo: string;
  transactionType: string;
}

export function applyHomeFilters(rows: InquiryQuotationHomeRow[], filters: IqHomeFilters): InquiryQuotationHomeRow[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (q) {
      const blob = `${row.transactionNo} ${row.referenceNo} ${row.customerName} ${row.createdBy} ${row.status}`.toLowerCase();
      if (!blob.includes(q)) return false;
    }
    if (filters.status && filters.status !== 'ALL' && row.status !== filters.status) return false;
    if (filters.customer && !row.customerName.toLowerCase().includes(filters.customer.toLowerCase())) return false;
    if (filters.currency && filters.currency !== 'ALL' && row.currency !== filters.currency) return false;
    if (filters.createdBy && !row.createdBy.toLowerCase().includes(filters.createdBy.toLowerCase())) return false;
    if (filters.version && String(row.version) !== filters.version) return false;
    if (filters.transactionType && filters.transactionType !== 'ALL' && row.transactionType !== filters.transactionType) {
      return false;
    }
    if (filters.dateFrom && row.date < filters.dateFrom) return false;
    if (filters.dateTo && row.date > filters.dateTo) return false;
    return true;
  });
}

export function sortHomeRows(
  rows: InquiryQuotationHomeRow[],
  sortKey: keyof InquiryQuotationHomeRow,
  dir: 'asc' | 'desc'
): InquiryQuotationHomeRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av;
    return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });
  return copy.map((row, i) => ({ ...row, sr: i + 1 }));
}

export function rowsToCsv(rows: InquiryQuotationHomeRow[], columns: IqGridColumn[]): string {
  const cols = columns.filter((c) => c.visible && c.id !== 'source');
  const header = cols.map((c) => c.label).join(',');
  const body = rows
    .map((row) =>
      cols
        .map((c) => {
          const v = row[c.id as keyof InquiryQuotationHomeRow];
          const s = String(v ?? '');
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');
  return `${header}\n${body}`;
}
