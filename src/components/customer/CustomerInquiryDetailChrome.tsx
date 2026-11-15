import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Banknote,
  Bot,
  Calculator,
  Check,
  ClipboardList,
  Copy,
  Headphones,
  Layers,
  Pencil,
  Ruler,
  Save,
  UserRound,
  Ship,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { CUSTOMER_HOME_PATH, CUSTOMER_INQUIRIES_PATH, customerPathForTab } from '../../app/shellRoutes';
import { Badge, Drawer } from '../ui';
import { WoodenDrumIcon } from '../common/WoodenDrumIcon';
import { SupportChatPanel } from './SupportChatPanel';
import { customerFacingInquiryStatusLabel, customerFacingInquiryStatusTone } from './customerInquiryListPresentation';
import { portalVersionLabel } from '../../domain/inquiryPortalLifecycle';
import {
  calculateInquiryCompleteness,
  customerInquiryBreadcrumbLabel,
  customerInquiryDetailTitle,
  resolveInquiryLifecycleSteps,
} from './customerInquiryDetailPresentation';
import { InquiryLifecycleStepper } from './InquiryLifecycleStepper';
import { InquiryCompletenessGauge } from './InquiryCompletenessGauge';
import type { CommercialInquiryDto } from '../../services/commercialInquiryApiService';

export function CustomerInquiryDetailHero({
  inquiry,
  actions,
  totalContractValueSlot,
  headerForm,
}: {
  inquiry: CommercialInquiryDto;
  actions?: React.ReactNode;
  totalContractValueSlot?: React.ReactNode;
  totalContractValuePlacement?: 'titleAccessory' | 'actions';
  headerForm?: any;
}) {
  const lifecycleSteps = resolveInquiryLifecycleSteps(inquiry);
  const completeness = calculateInquiryCompleteness(inquiry, headerForm);

  return (
    <section
      aria-label="Inquiry Header Hero"
      className="card relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#102447] via-[#163261] to-[#1d4fa1] text-white p-6 sm:p-7 shadow-lg border border-brand-900/40 select-none"
    >
      {/* Real Cable Asset Background Texture */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1/3 bg-cover bg-right opacity-15 mix-blend-luminosity pointer-events-none rounded-r-2xl"
        style={{ backgroundImage: "url('/login-cables.jpg')" }}
        aria-hidden="true"
      />

      {/* Slow decorative rotating SVG geometric ring */}
      <svg
        aria-hidden="true"
        width="160"
        height="160"
        viewBox="0 0 100 100"
        className="absolute right-40 -top-10 opacity-10 pointer-events-none motion-safe:animate-spin duration-[25s]"
      >
        <circle cx="50" cy="50" r="46" fill="none" stroke="#fff" strokeWidth="3" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="#fff" strokeWidth="3" />
        <circle cx="50" cy="50" r="14" fill="none" stroke="#fff" strokeWidth="3" />
      </svg>

      <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-white/70">
            <Link to={CUSTOMER_HOME_PATH} className="hover:text-white transition-colors">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <Link to={CUSTOMER_INQUIRIES_PATH} className="hover:text-white transition-colors">
              My Inquiries
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-white font-semibold">{customerInquiryBreadcrumbLabel(inquiry.status)}</span>
          </nav>

          {/* Title & Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-white">
              {customerInquiryDetailTitle(inquiry)}
            </h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white font-mono align-middle">
              {portalVersionLabel(inquiry.versionNo)}
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-white font-sans align-middle">
              {customerFacingInquiryStatusLabel(inquiry.status, inquiry.commercialMetadata)}
            </span>
          </div>

          {/* Subtitle */}
          <p className="text-xs sm:text-sm text-white/85 leading-relaxed font-normal">
            Provide your cable requirements and we will prepare a technical and commercial offer.
          </p>

          {/* Embedded Action Toolbar */}
          {actions && <div className="pt-2">{actions}</div>}
        </div>

        {/* Right Stepper + Completeness Gauge */}
        <div className="flex flex-wrap items-center gap-6 sm:gap-8 self-start xl:self-center bg-white/5 backdrop-blur-xs p-4 sm:p-5 rounded-xl border border-white/10 shadow-inner">
          <InquiryLifecycleStepper steps={lifecycleSteps} />
          <div className="h-10 w-px bg-white/20 hidden sm:block" aria-hidden="true" />
          <InquiryCompletenessGauge completeness={completeness} />
          {totalContractValueSlot && (
            <div className="sm:border-l sm:border-white/20 sm:pl-6">{totalContractValueSlot}</div>
          )}
        </div>
      </div>
    </section>
  );
}

const heroButtonBaseClass =
  'inline-flex items-center gap-1.5 h-9 sm:h-10 px-3.5 sm:px-4 rounded-xl text-xs sm:text-[13px] font-semibold transition-all focus:outline-none focus:ring-2 disabled:opacity-40 disabled:cursor-not-allowed select-none';

const heroEditButtonClass = `${heroButtonBaseClass} bg-white text-slate-900 hover:bg-slate-100 focus:ring-white/40 shadow-xs font-bold`;

const heroGhostButtonClass = `${heroButtonBaseClass} bg-white/15 text-white hover:bg-white/25 border border-white/20 focus:ring-white/30`;

const heroCalculateButtonClass = `${heroButtonBaseClass} bg-[#f04e30] text-white hover:bg-[#e03e20] focus:ring-red-400 shadow-md shadow-[#f04e30]/30 font-bold`;

const heroApproveButtonClass = `${heroButtonBaseClass} bg-[#1d4fa1] text-white hover:bg-[#163f85] border border-blue-400/40 focus:ring-blue-400 shadow-md shadow-[#1d4fa1]/30 font-bold`;

export function CustomerInquiryPrimaryActions({
  canEdit,
  canSave,
  canCalculate,
  canApprove,
  canCancel,
  canCopy,
  canCreateRevision,
  canDiscardRevision,
  calculateLabel,
  savingHeader,
  costingLoading,
  hasLines,
  onEdit,
  onSave,
  onCalculate,
  onApprove,
  onCancel,
  onCopy,
  onCreateRevision,
  onDiscardRevision,
}: {
  canEdit: boolean;
  canSave: boolean;
  canCalculate: boolean;
  canApprove: boolean;
  canCancel: boolean;
  canCopy: boolean;
  canCreateRevision?: boolean;
  canDiscardRevision?: boolean;
  calculateLabel?: string;
  savingHeader: boolean;
  costingLoading: boolean;
  hasLines: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCalculate: () => void;
  onApprove: () => void;
  onCancel: () => void;
  onCopy: () => void;
  onCreateRevision?: () => void;
  onDiscardRevision?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Inquiry actions">
      {canCreateRevision ? (
        <button type="button" className={heroGhostButtonClass} onClick={onCreateRevision}>
          <Pencil className="h-3.5 w-3.5" />
          <span>Create Revision</span>
        </button>
      ) : (
        <button type="button" className={heroEditButtonClass} onClick={onEdit} disabled={!canEdit}>
          <Pencil className="h-3.5 w-3.5 text-slate-700" />
          <span>Edit</span>
        </button>
      )}
      <button type="button" className={heroGhostButtonClass} onClick={onSave} disabled={!canSave || savingHeader}>
        <Save className="h-3.5 w-3.5" />
        <span>{savingHeader ? 'Saving…' : 'Save'}</span>
      </button>
      <button
        type="button"
        className={heroCalculateButtonClass}
        onClick={onCalculate}
        disabled={!canCalculate || costingLoading || !hasLines}
      >
        <Calculator className="h-3.5 w-3.5 text-white/95" />
        <span>{costingLoading ? 'Processing…' : calculateLabel || 'Calculate'}</span>
      </button>
      <button type="button" className={heroApproveButtonClass} onClick={onApprove} disabled={!canApprove}>
        <Check className="h-3.5 w-3.5" />
        <span>Approve</span>
      </button>
      <button type="button" className={heroGhostButtonClass} onClick={onCancel} disabled={!canCancel}>
        <XCircle className="h-3.5 w-3.5" />
        <span>Cancel</span>
      </button>
      {canDiscardRevision ? (
        <button type="button" className={heroGhostButtonClass} onClick={onDiscardRevision}>
          <span>Discard Revision</span>
        </button>
      ) : null}
      <button type="button" className={heroGhostButtonClass} onClick={onCopy} disabled={!canCopy}>
        <Copy className="h-3.5 w-3.5" />
        <span>Copy</span>
      </button>
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
  freightCostLabel,
  grandTotalLabel,
  totalsPending,
  incoterm,
  destination,
  containerType,
}: {
  totalLines: number;
  totalDrums: number;
  totalLength: number;
  estimatedValueLabel: string | null;
  freightCostLabel?: string | null;
  grandTotalLabel?: string | null;
  totalsPending?: boolean;
  incoterm?: string | null;
  destination?: string | null;
  containerType?: string | null;
}) {
  const showFreightBreakdown = Boolean(freightCostLabel && grandTotalLabel);
  const pendingNote = totalsPending ? 'Recalculate to update totals' : null;

  const cards = [
    {
      label: 'Total Lines',
      value: String(totalLines),
      icon: Layers,
      wrap: 'bg-sky-50 text-sky-700',
      helper: null as string | null,
      isGrandTotal: false,
    },
    {
      label: 'Total Drums',
      value: String(totalDrums),
      icon: WoodenDrumIcon,
      wrap: 'bg-slate-100 text-slate-600',
      helper: null,
      isGrandTotal: false,
    },
    {
      label: 'Total Length (m)',
      value: Math.round(totalLength).toLocaleString('en-GB'),
      icon: Ruler,
      wrap: 'bg-indigo-50 text-indigo-700',
      helper: null,
      isGrandTotal: false,
    },
    {
      label: showFreightBreakdown ? 'Products Subtotal' : 'Estimated Value',
      value: estimatedValueLabel || '—',
      icon: Banknote,
      wrap: 'bg-amber-50 text-amber-700',
      helper: pendingNote
        ? pendingNote
        : showFreightBreakdown
          ? 'Ex-Works / Cable value'
          : estimatedValueLabel
            ? null
            : 'Shown when a selling price is available',
      isGrandTotal: false,
    },
    ...(showFreightBreakdown
      ? [
          {
            label: `Sea Freight (${containerType || '20STD'})`,
            value: freightCostLabel || '—',
            icon: Ship,
            wrap: 'bg-blue-50 text-blue-700',
            helper: pendingNote || (destination ? `To ${destination}` : 'Container shipping'),
            isGrandTotal: false,
          },
          {
            label: `Grand Total (${incoterm || 'DAP'})`,
            value: grandTotalLabel || '—',
            icon: Sparkles,
            wrap: 'bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/30',
            helper: pendingNote || 'All Inclusive: Products + Freight',
            isGrandTotal: true,
          },
        ]
      : []),
  ];

  return (
    <div
      className={`grid gap-3.5 ${
        showFreightBreakdown
          ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-[minmax(100px,0.7fr)_minmax(100px,0.7fr)_minmax(120px,0.9fr)_minmax(180px,1.4fr)_minmax(150px,1.1fr)_minmax(200px,1.5fr)]'
          : 'grid-cols-2 xl:grid-cols-4'
      }`}
    >
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm min-w-0 transition-colors ${
              card.isGrandTotal ? 'bg-gradient-to-b from-white to-emerald-50/50 border-emerald-300' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 text-slate-500">
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${card.wrap}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={`text-[12px] font-semibold leading-tight text-slate-600 ${card.isGrandTotal ? 'font-bold text-emerald-950' : ''}`}>
                {card.label}
              </span>
            </div>
            <p className={`mt-2.5 text-xl leading-tight font-display font-bold tabular-nums whitespace-nowrap ${
              card.isGrandTotal ? 'text-emerald-900 font-black' : 'text-brand-800'
            }`}>
              {card.value}
            </p>
            {card.helper ? (
              <p className={`mt-1 text-[11px] break-words ${card.isGrandTotal ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                {card.helper}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
