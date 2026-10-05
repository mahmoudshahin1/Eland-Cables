import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote,
  Bot,
  Calculator,
  ClipboardList,
  Headphones,
  Layers,
  Ruler,
  Save,
  UserRound,
} from 'lucide-react';
import { CUSTOMER_HOME_PATH, CUSTOMER_INQUIRIES_PATH, customerPathForTab } from '../../app/shellRoutes';
import { Badge, Drawer } from '../ui';
import { CustomerPageHero } from './CustomerPageHero';
import { WoodenDrumIcon } from '../ui/icons';
import { SupportChatPanel } from './SupportChatPanel';
import { customerFacingInquiryStatusLabel, customerFacingInquiryStatusTone } from './customerInquiryListPresentation';
import {
  customerInquiryBreadcrumbLabel,
  customerInquiryDetailTitle,
} from './customerInquiryDetailPresentation';
import type { CommercialInquiryDto } from '../../services/commercialInquiryApiService';

export function CustomerInquiryDetailHero({
  inquiry,
  actions,
}: {
  inquiry: CommercialInquiryDto;
  actions?: React.ReactNode;
}) {
  return (
    <CustomerPageHero
      breadcrumbs={[
        { label: 'Home', to: CUSTOMER_HOME_PATH },
        { label: 'My Inquiries', to: CUSTOMER_INQUIRIES_PATH },
        { label: customerInquiryBreadcrumbLabel(inquiry.status) },
      ]}
      title={customerInquiryDetailTitle(inquiry)}
      titleAccessory={
        <Badge tone={customerFacingInquiryStatusTone(inquiry.status)}>
          {customerFacingInquiryStatusLabel(inquiry.status)}
        </Badge>
      }
      subtitle="Provide your cable requirements and we will prepare a technical and commercial offer."
      actions={actions}
    />
  );
}

export function CustomerInquiryPrimaryActions({
  isEditable,
  canCalculate,
  canSubmit,
  savingHeader,
  costingLoading,
  hasLines,
  onSave,
  onCalculate,
  onSubmit,
  extra,
}: {
  isEditable: boolean;
  canCalculate: boolean;
  canSubmit: boolean;
  savingHeader: boolean;
  costingLoading: boolean;
  hasLines: boolean;
  onSave: () => void;
  onCalculate: () => void;
  onSubmit: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isEditable && (
        <button
          type="button"
          onClick={onSave}
          disabled={savingHeader}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5 text-slate-500" />
          {savingHeader ? 'Saving…' : 'Save Draft'}
        </button>
      )}
      {isEditable && canCalculate && (
        <button
          type="button"
          onClick={onCalculate}
          disabled={costingLoading || !hasLines}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[13px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Calculator className="h-3.5 w-3.5 text-slate-500" />
          {costingLoading ? 'Processing…' : 'Calculate'}
        </button>
      )}
      {canSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold bg-[#2F6BFF] hover:bg-[#2563eb] text-white shadow-[0_6px_16px_rgba(47,107,255,0.28)]"
        >
          Submit Inquiry
        </button>
      )}
      {extra}
    </div>
  );
}

export function CustomerInquirySummaryRail({
  inquiry,
  lineCount,
  totalQuantityMeters,
}: {
  inquiry: CommercialInquiryDto;
  lineCount: number;
  totalQuantityMeters: number;
}) {
  const rows = [
    { label: 'Customer', value: inquiry.customerName || '—' },
    { label: 'Project', value: inquiry.projectName || '—' },
    { label: 'Currency', value: inquiry.currency || '—' },
    { label: 'No. of Lines', value: String(lineCount) },
    {
      label: 'Total Quantity',
      value: `${Math.round(totalQuantityMeters).toLocaleString('en-GB')} m`,
    },
    { label: 'Status', value: customerFacingInquiryStatusLabel(inquiry.status), status: true },
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)] overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-100">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
          <ClipboardList className="h-3.5 w-3.5" />
        </span>
        <h2 className="text-sm font-bold font-display text-brand-800">Inquiry Summary</h2>
      </div>
      <dl className="px-4 py-3 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 text-[13px]">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className={`text-right font-semibold ${row.status ? 'text-slate-500 italic' : 'text-slate-800'}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CustomerInquiryAssistanceRail({
  chatOpen,
  chatChannel,
  onOpenChat,
  onCloseChat,
}: {
  chatOpen: boolean;
  chatChannel: 'AI_ASSISTANT' | 'ENGINEER';
  onOpenChat: (channel: 'AI_ASSISTANT' | 'ENGINEER') => void;
  onCloseChat: () => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)] p-4">
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 rounded-full bg-sky-50 text-sky-700 flex items-center justify-center shrink-0">
            <Headphones className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold font-display text-slate-900">Need Assistance?</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Chat with our AI Assistant or speak with a Technical Office Engineer.
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => onOpenChat('AI_ASSISTANT')}
            className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg bg-[#2F6BFF] hover:bg-[#2563eb] text-white text-[13px] font-semibold"
          >
            <Bot className="h-3.5 w-3.5" />
            Chat with AI Assistant
          </button>
          <button
            type="button"
            onClick={() => onOpenChat('ENGINEER')}
            className="w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg border border-slate-200 bg-white text-slate-700 text-[13px] font-semibold hover:bg-slate-50"
          >
            <UserRound className="h-3.5 w-3.5" />
            Talk to an Engineer
          </button>
        </div>
      </section>
      <Drawer open={chatOpen} onClose={onCloseChat} title="Chat with our Support Team">
        <div className="-m-5">
          <SupportChatPanel
            compact
            initialChannel={chatChannel}
            onNewCase={() => {
              onCloseChat();
              navigate(`${customerPathForTab('support')}?new=1`);
            }}
            onOpenCase={(id) => {
              onCloseChat();
              navigate(`${customerPathForTab('support')}?case=${encodeURIComponent(id)}`);
            }}
          />
        </div>
      </Drawer>
    </>
  );
}

export function CustomerInquiryFooterKpis({
  totalLines,
  totalDrums,
  totalLength,
  estimatedValueLabel,
}: {
  totalLines: number;
  totalDrums: number;
  totalLength: number;
  estimatedValueLabel: string | null;
}) {
  const cards = [
    {
      label: 'Total Lines',
      value: String(totalLines),
      icon: Layers,
      wrap: 'bg-sky-50 text-sky-700',
      helper: null as string | null,
    },
    {
      label: 'Total Drums',
      value: String(totalDrums),
      icon: WoodenDrumIcon,
      wrap: 'bg-slate-100 text-slate-600',
      helper: null,
    },
    {
      label: 'Total Length (m)',
      value: Math.round(totalLength).toLocaleString('en-GB'),
      icon: Ruler,
      wrap: 'bg-indigo-50 text-indigo-700',
      helper: null,
    },
    {
      label: 'Estimated Value',
      value: estimatedValueLabel || '—',
      icon: Banknote,
      wrap: 'bg-amber-50 text-amber-700',
      helper: estimatedValueLabel ? null : 'Shown when a selling price is available',
    },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-[var(--shadow-card)] min-w-0"
          >
            <div className="flex items-center gap-2 text-slate-500">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${card.wrap}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[12px] font-medium">{card.label}</span>
            </div>
            <p className="mt-2 text-[22px] leading-none font-bold text-brand-800 tabular-nums">{card.value}</p>
            {card.helper ? <p className="mt-1 text-[10px] text-slate-400">{card.helper}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
