import React, { useMemo } from 'react';
import { FileCheck } from 'lucide-react';
import type { CustomerPortalTab, SalesOrderStatus } from '../../types';
import type { V2InquiryDto } from '../../services/v2InquiryConfigurationApiService';
import { buildTrend } from './CustomerHomeInquiryTrend';

export type CustomerHomeKpiValues = {
  totalInquiries: number;
  quotations: number;
  openOrders: number;
  deliveredOrders: number;
};

type CustomerHomeKpisProps = {
  values: CustomerHomeKpiValues;
  loading?: boolean;
  inquiries?: V2InquiryDto[];
  onNavigateTab: (
    tab: CustomerPortalTab,
    options?: { status?: string; orderStatus?: SalesOrderStatus }
  ) => void;
};

export function CustomerHomeKpis({
  values,
  loading,
  inquiries = [],
  onNavigateTab,
}: CustomerHomeKpisProps) {
  const trend = useMemo(() => buildTrend(inquiries), [inquiries]);

  // Generate SVG path for the sparkline in Total Inquiries
  const sparklineData = useMemo(() => {
    const counts = trend.map((t) => t.count);
    const max = Math.max(...counts, 1);
    const width = 120;
    const height = 45;
    const step = width / Math.max(counts.length - 1, 1);

    const points = counts.map((val, idx) => {
      const x = idx * step;
      // Invert Y so higher counts are closer to top (0)
      const y = height - (val / max) * (height - 10) - 5;
      return { x, y };
    });

    if (points.length === 0) return { pathLine: '', pathArea: '' };

    const pathLine = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');

    const pathArea = `${pathLine} L ${width} ${height} L 0 ${height} Z`;

    return { pathLine, pathArea };
  }, [trend]);

  return (
    <>
      {/* Total Inquiries Card (Brand Gradient + Sparkline) */}
      <button
        type="button"
        onClick={() => onNavigateTab('price_estimation')}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E40AF] via-brand-600 to-[#0F172A] p-6 text-white text-start shadow-sm flex flex-col justify-between min-h-[165px] hover:shadow-md transition-shadow group"
      >
        <span className="text-sm font-medium text-white/80">Total Inquiries</span>
        <p className="font-display text-5xl font-bold tracking-tight text-white leading-none mt-3">
          {loading ? '—' : values.totalInquiries}
        </p>

        {/* Sparkline curve bottom-right */}
        <div className="pointer-events-none absolute bottom-0 end-0 w-32 h-14 overflow-hidden" aria-hidden="true">
          <svg viewBox="0 0 120 45" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="totalInqSparkline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            {sparklineData.pathArea && (
              <path d={sparklineData.pathArea} fill="url(#totalInqSparkline)" />
            )}
            {sparklineData.pathLine && (
              <path
                d={sparklineData.pathLine}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>
      </button>

      {/* Quotations Card (Elevated White Card with Icon) */}
      <button
        type="button"
        onClick={() => onNavigateTab('price_estimation', { status: 'QUOTED' })}
        className="rounded-2xl border border-slate-200/80 bg-white p-6 text-start shadow-sm flex flex-col justify-between min-h-[165px] hover:shadow-md transition-shadow group"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 shrink-0">
            <FileCheck className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium text-slate-500">Quotations</span>
        </div>
        <p className="font-display text-5xl font-bold tracking-tight text-slate-900 leading-none mt-3">
          {loading ? '—' : values.quotations}
        </p>
      </button>
    </>
  );
}
