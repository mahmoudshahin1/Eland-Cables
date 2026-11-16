import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { V2InquiryDto } from '../../services/v2InquiryConfigurationApiService';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', { month: 'short' });
}

export function buildTrend(inquiries: V2InquiryDto[]): Array<{ month: string; count: number }> {
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

  // Derive dynamic Y-axis maximum from data
  const maxCount = useMemo(() => {
    const highest = Math.max(...data.map((d) => d.count), 0);
    if (highest === 0) return 28;
    return Math.ceil(highest / 7) * 7;
  }, [data]);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm flex flex-col justify-between h-full min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display text-base font-semibold text-slate-800">Inquiry Trend</h2>
        <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          Last 8 Months
        </span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <p className="text-sm text-slate-400">Loading trend…</p>
        </div>
      ) : (
        <div className="flex-1 w-full min-w-0 min-h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 25, right: 12, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="latestBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" />
                  <stop offset="100%" stopColor="#1D4ED8" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: '#64748B', fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, maxCount]}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: '#e2e8f0' }}
                formatter={(value) => [value ?? 0, 'Inquiries']}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} minPointSize={4}>
                {data.map((_, index) => {
                  const isLatest = index === data.length - 1;
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={isLatest ? 'url(#latestBarGradient)' : '#DBEAFE'}
                    />
                  );
                })}
                <LabelList
                  dataKey="count"
                  content={(props: any) => {
                    const { x, y, width, value, index } = props;
                    if (index !== data.length - 1 || value === undefined || value === null) return null;
                    return (
                      <g transform={`translate(${x + width / 2}, ${y - 12})`}>
                        <rect x="-14" y="-18" width="28" height="18" rx="4" fill="#071E3A" />
                        <polygon points="-4,0 4,0 0,4" fill="#071E3A" />
                        <text
                          x="0"
                          y="-6"
                          fill="#FFFFFF"
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="bold"
                        >
                          {value}
                        </text>
                      </g>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
