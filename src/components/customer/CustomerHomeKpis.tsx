import React from 'react';
import { FileCheck, FileText, Package, Truck } from 'lucide-react';
import type { CustomerPortalTab, SalesOrderStatus } from '../../types';

export type CustomerHomeKpiValues = {
  totalInquiries: number;
  quotations: number;
  openOrders: number;
  deliveredOrders: number;
};

type CustomerHomeKpisProps = {
  values: CustomerHomeKpiValues;
  loading?: boolean;
  onNavigateTab: (
    tab: CustomerPortalTab,
    options?: { status?: string; orderStatus?: SalesOrderStatus }
  ) => void;
};

const CARDS: Array<{
  key: string;
  label: string;
  icon: typeof FileText;
  iconWrap: string;
  tab: CustomerPortalTab;
  status?: string;
  orderStatus?: SalesOrderStatus;
  valueKey: keyof CustomerHomeKpiValues;
}> = [
  {
    key: 'inquiries',
    label: 'Total Inquiries',
    icon: FileText,
    iconWrap: 'bg-blue-50 text-blue-600',
    tab: 'price_estimation',
    valueKey: 'totalInquiries',
  },
  {
    key: 'quotations',
    label: 'Quotations',
    icon: FileCheck,
    iconWrap: 'bg-emerald-50 text-emerald-600',
    tab: 'price_estimation',
    status: 'QUOTED',
    valueKey: 'quotations',
  },
  {
    key: 'open-orders',
    label: 'Open Orders',
    icon: Package,
    iconWrap: 'bg-orange-50 text-orange-500',
    tab: 'sales_orders',
    orderStatus: 'Open',
    valueKey: 'openOrders',
  },
  {
    key: 'delivered-orders',
    label: 'Delivered Orders',
    icon: Truck,
    iconWrap: 'bg-emerald-50 text-emerald-600',
    tab: 'sales_orders',
    orderStatus: 'Delivered',
    valueKey: 'deliveredOrders',
  },
];

export function CustomerHomeKpis({ values, loading, onNavigateTab }: CustomerHomeKpisProps) {
  return (
    <section aria-label="Account summary" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {CARDS.map((card) => {
        const Icon = card.icon;
        const value = loading ? '—' : values[card.valueKey];
        return (
          <button
            key={card.key}
            type="button"
            onClick={() =>
              onNavigateTab(card.tab, {
                status: card.status,
                orderStatus: card.orderStatus,
              })
            }
            className="customer-home-card text-start px-4 py-4 min-w-0 hover:shadow-[var(--shadow-raised)] transition-shadow"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${card.iconWrap}`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="text-[13px] font-medium text-slate-500 leading-tight">{card.label}</span>
            </div>
            <p className="mt-3 text-[28px] leading-none font-bold text-slate-900 tabular-nums">{value}</p>
          </button>
        );
      })}
    </section>
  );
}
