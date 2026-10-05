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
    <section className="customer-home-card h-full min-w-0">
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-800">Recent Inquiries</h2>
        <button type="button" onClick={onViewAll} className="text-xs font-medium text-[#2563EB] hover:underline">
          View All
        </button>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <Loader2 className="h-6 w-6 text-brand-500 animate-spin mb-2" />
          <p className="text-sm font-medium text-slate-600">Loading inquiries…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <AlertCircle className="h-6 w-6 text-amber-600 mb-2" />
          <p className="text-sm font-semibold text-amber-800">{error}</p>
        </div>
      )}

      {!loading && !error && recent.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mb-2 text-slate-400">
            <Inbox className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-700">No inquiries yet.</p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-3 text-xs font-semibold text-[#2563EB] hover:underline"
          >
            New Inquiry
          </button>
        </div>
      )}

      {!loading && !error && recent.length > 0 && (
        <div className="px-2 pb-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left">
            <thead>
              <tr className="text-[11px] font-semibold text-slate-400">
                <th className="px-3 py-2 font-semibold">Inquiry No.</th>
                <th className="px-3 py-2 font-semibold">Created Date</th>
                <th className="px-3 py-2 font-semibold">Cable Type</th>
                <th className="px-3 py-2 font-semibold text-end">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((inquiry) => {
                const line = inquiry.lines[0];
                const cable = line?.cableDescription || inquiry.projectName || '—';
                return (
                  <tr key={inquiry.id} className="border-t border-slate-100">
                    <td className="px-3 py-2.5">
                      <Link
                        to={customerInquiryDetailPath(inquiry.id)}
                        className="font-mono text-sm font-semibold text-[#2563EB] hover:underline"
                      >
                        {inquiry.inquiryNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-slate-500 whitespace-nowrap">
                      {formatInquiryDate(inquiry.inquiryDate || inquiry.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] text-slate-700 truncate max-w-[12rem]" title={cable}>
                      {cable}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${homeStatusClass(
                          inquiry.status
                        )}`}
                      >
                        {mapInquiryStatusLabel(inquiry.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
