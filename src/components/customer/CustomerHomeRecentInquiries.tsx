import React from 'react';
import { Link } from 'react-router-dom';
import { Inbox, Loader2, AlertCircle } from 'lucide-react';
import { customerInquiryDetailPath } from '../../app/shellRoutes';
import { mapInquiryStatusLabel } from '../../services/customerInquiryJourneyService';
import type { V2InquiryDto } from '../../services/v2InquiryConfigurationApiService';

function formatInquiryDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function homeStatusClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'QUOTED') return 'bg-emerald-100 text-emerald-700';
  if (s === 'DRAFT') return 'bg-slate-100 text-slate-600';
  if (s === 'CANCELLED' || s.includes('CLOSED')) return 'bg-emerald-50 text-emerald-700';
  if (s.includes('ENGINEERING') || s.includes('REVIEW') || s.includes('BLOCK')) return 'bg-amber-100 text-amber-700';
  if (s === 'SUBMITTED' || s === 'READY_FOR_COMMERCIAL') return 'bg-sky-100 text-sky-700';
  return 'bg-blue-100 text-blue-700';
}

type CustomerHomeRecentInquiriesProps = {
  inquiries: V2InquiryDto[];
  loading: boolean;
  error: string | null;
  onViewAll: () => void;
  onCreate: () => void;
};

export function CustomerHomeRecentInquiries({
  inquiries,
  loading,
  error,
  onViewAll,
  onCreate,
}: CustomerHomeRecentInquiriesProps) {
  const recent = inquiries.slice(0, 5);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm flex flex-col justify-between h-full min-w-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="font-display text-base font-semibold text-slate-800">Recent Inquiries</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
        >
          View All
        </button>
      </div>

      {loading && (
        <div className="flex flex-1 flex-col items-center justify-center py-10 px-4 text-center">
          <Loader2 className="h-6 w-6 text-brand-500 animate-spin mb-2" />
          <p className="text-sm font-medium text-slate-600">Loading inquiries…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-1 flex-col items-center justify-center py-10 px-4 text-center">
          <AlertCircle className="h-6 w-6 text-amber-600 mb-2" />
          <p className="text-sm font-semibold text-amber-800">{error}</p>
        </div>
      )}

      {!loading && !error && recent.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center py-10 px-4 text-center">
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-2 text-slate-400">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-700">No inquiries yet.</p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-3 text-xs font-semibold text-brand-600 hover:underline"
          >
            New Inquiry
          </button>
        </div>
      )}

      {!loading && !error && recent.length > 0 && (
        <ul className="divide-y divide-slate-100 flex-1">
          {recent.map((inquiry) => {
            const line = inquiry.lines[0];
            const cable = line?.cableDescription || inquiry.projectName || '—';
            return (
              <li
                key={inquiry.id}
                className="py-3 first:pt-1 last:pb-0 flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-1 h-8 rounded-full bg-slate-200 group-hover:bg-brand-500 transition-colors shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <Link
                      to={customerInquiryDetailPath(inquiry.id)}
                      className="font-mono text-sm font-bold text-slate-900 group-hover:text-brand-600 hover:underline block leading-tight truncate"
                    >
                      {inquiry.inquiryNumber}
                    </Link>
                    <p
                      className="text-xs text-slate-500 truncate max-w-[12rem] sm:max-w-[17rem] lg:max-w-[20rem] mt-1 leading-snug"
                      title={cable}
                    >
                      {cable}
                    </p>
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${homeStatusClass(
                      inquiry.status
                    )}`}
                  >
                    {mapInquiryStatusLabel(inquiry.status)}
                  </span>
                  <p className="text-[11px] text-slate-400 mt-1 leading-none">
                    {formatInquiryDate(inquiry.inquiryDate || inquiry.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
