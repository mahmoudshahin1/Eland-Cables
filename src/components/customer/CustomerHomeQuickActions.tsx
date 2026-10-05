import React from 'react';
import { ClipboardList, FileCheck, FileText, Plus, ShoppingCart } from 'lucide-react';
import type { CustomerPortalTab } from '../../types';

type QuickAction = {
  id: string;
  label: string;
  hint: string;
  icon: React.ElementType;
  tab: CustomerPortalTab;
  status?: string;
  iconClass: string;
};

const ACTIONS: QuickAction[] = [
  {
    id: 'new',
    label: 'New Inquiry',
    hint: 'Start a new cable inquiry',
    icon: Plus,
    tab: 'price_estimation',
    iconClass: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'inquiries',
    label: 'My Inquiries',
    hint: 'Track your inquiries',
    icon: ClipboardList,
    tab: 'price_estimation',
    iconClass: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'quotations',
    label: 'Quotations',
    hint: 'View your quotations',
    icon: FileCheck,
    tab: 'price_estimation',
    status: 'QUOTED',
    iconClass: 'bg-violet-50 text-violet-600',
  },
  {
    id: 'orders',
    label: 'Orders',
    hint: 'Track order status',
    icon: ShoppingCart,
    tab: 'sales_orders',
    iconClass: 'bg-orange-50 text-orange-500',
  },
  {
    id: 'documents',
    label: 'Documents',
    hint: 'Access technical documents',
    icon: FileText,
    tab: 'tds_library',
    iconClass: 'bg-sky-50 text-sky-600',
  },
];

type CustomerHomeQuickActionsProps = {
  onNavigateTab: (tab: CustomerPortalTab, options?: { status?: string }) => void;
};

export function CustomerHomeQuickActions({ onNavigateTab }: CustomerHomeQuickActionsProps) {
  return (
    <section aria-label="Quick actions">
      <h2 className="text-[15px] font-semibold text-slate-800 mb-3">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onNavigateTab(action.tab, action.status ? { status: action.status } : undefined)}
            className="customer-home-card flex items-center gap-3 text-start px-4 py-4 min-w-0 hover:shadow-[var(--shadow-raised)] transition-shadow"
            >
              <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl shrink-0 ${action.iconClass}`}>
                <Icon className="h-5 w-5" strokeWidth={1.85} />
              </span>
              <span className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 leading-tight">{action.label}</p>
                <p className="mt-0.5 text-[12px] text-slate-500 leading-snug">{action.hint}</p>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
