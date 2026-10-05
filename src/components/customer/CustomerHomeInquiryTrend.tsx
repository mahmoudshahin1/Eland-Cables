import React, { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { V2InquiryDto } from '../../services/v2InquiryConfigurationApiService';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'short' });
}

function buildTrend(inquiries: V2InquiryDto[]): Array<{ month: string; count: number }> {
  const now = new Date();
  const buckets = new Map<string, { month: string; count: number; order: number }>();
  for (let i = 7; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthKey(d), { month: monthLabel(d), count: 0, order: 7 - i });
  }
  for (const inquiry of inquiries) {
    const raw = inquiry.inquiryDate || inquiry.createdAt;
    if (!raw) continue;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) continue;
    const key = monthKey(new Date(date.getFullYear(), date.getMonth(), 1));
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
  }
  return [...buckets.values()].sort((a, b) => a.order - b.order).map(({ month, count }) => ({ month, count }));
}

type CustomerHomeInquiryTrendProps = {
  inquiries: V2InquiryDto[];
  loading?: boolean;
};

export function CustomerHomeInquiryTrend({ inquiries, loading }: CustomerHomeInquiryTrendProps) {
  const data = useMemo(() => buildTrend(inquiries), [inquiries]);

  return (
    <section className="customer-home-card h-full min-w-0">
      <div className="px-5 pt-4 pb-1 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-slate-800">Inquiry Trend</h2>
        <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
          Last 8 Months
        </span>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500 py-10 text-center">Loading trend…</p>
      ) : (
        <div className="h-56 w-full min-w-0 px-2 pb-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="customerInquiryTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8eef5" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
                formatter={(value) => [value ?? 0, 'Inquiries']}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#3B82F6"
                strokeWidth={2.5}
                fill="url(#customerInquiryTrendFill)"
                dot={{ r: 3.5, fill: '#3B82F6', stroke: '#fff', strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
