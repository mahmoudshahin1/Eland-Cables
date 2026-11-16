import React from 'react';
import { FileCheck, FileText, FolderOpen, Plus } from 'lucide-react';
import type { CustomerPortalTab } from '../../types';

type QuickAction = {
  id: string;
  label: string;
  hint: string;
  icon: React.ElementType;
  tab: CustomerPortalTab;
  status?: string;
};

const ACTIONS: QuickAction[] = [
  {
    id: 'new',
    label: 'New Inquiry',
    hint: 'Start a new cable inquiry',
    icon: Plus,
    tab: 'price_estimation',
  },
  {
    id: 'inquiries',
    label: 'My Inquiries',
    hint: 'Track your inquiries',
    icon: FolderOpen,
    tab: 'price_estimation',
  },
  {
    id: 'quotations',
    label: 'Quotations',
    hint: 'View your quotations',
    icon: FileCheck,
    tab: 'price_estimation',
    status: 'QUOTED',
  },
  {
    id: 'documents',
    label: 'Documents',
    hint: 'Access technical documents',
    icon: FileText,
    tab: 'tds_library',
  },
];

type CustomerHomeQuickActionsProps = {
  onNavigateTab: (tab: CustomerPortalTab, options?: { status?: string }) => void;
};

export function CustomerHomeQuickActions({ onNavigateTab }: CustomerHomeQuickActionsProps) {
  return (
    <section aria-label="Quick actions" className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm flex flex-col justify-between h-full min-w-0">
      <h2 className="font-display text-base font-semibold text-slate-800 mb-3.5">Quick Actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onNavigateTab(action.tab, action.status ? { status: action.status } : undefined)}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/40 p-3 text-start transition-colors hover:border-brand-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shrink-0 shadow-xs">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 leading-tight truncate">{action.label}</p>
                <p className="mt-0.5 text-xs text-slate-500 leading-snug truncate">{action.hint}</p>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
