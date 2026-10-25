import React from 'react';
import {
  CheckCircle2,
  Package,
  Calculator,
  FileCheck2,
  Send,
  Zap,
  ChevronRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { InquiryWorkspaceTab } from './inquiryWorkspaceTabs';

export interface VipJourneyStep {
  id: string;
  tabKey: InquiryWorkspaceTab;
  stepNumber: number;
  title: string;
  subtitle: string;
  badge: string;
  completed: boolean;
  active: boolean;
}

interface VipFastTrackJourneyBarProps {
  currentTab: InquiryWorkspaceTab;
  onSelectTab: (tab: InquiryWorkspaceTab) => void;
  onInstantCalculate: () => void;
  onNextStep: () => void;
  calculating?: boolean;
  autoSaveStatus?: 'saved' | 'saving' | 'error' | null;
  lastAutoSavedTime?: string | null;
  lineCount: number;
  drumCount: number;
  containerType?: string | null;
  isCostCalculated: boolean;
  hasQuotation: boolean;
  isSubmittedToSales: boolean;
  fulfillmentType?: 'DIRECT_ORDER' | 'SALES_AGREEMENT' | null;
  isCustomer?: boolean;
}

export const VipFastTrackJourneyBar: React.FC<VipFastTrackJourneyBarProps> = ({
  currentTab,
  onSelectTab,
  onInstantCalculate,
  onNextStep,
  calculating = false,
  autoSaveStatus = 'saved',
  lastAutoSavedTime,
  lineCount,
  drumCount,
  containerType,
  isCostCalculated,
  hasQuotation,
  isSubmittedToSales,
  fulfillmentType,
  isCustomer = false,
}) => {
  const isLinesActive = currentTab === 'lines';
  const isDrumsActive = currentTab === 'drum_plan' || currentTab === 'cutting';
  const isContainerActive = currentTab === 'container_study';
  const isCostingActive = currentTab === 'costing';
  const isDocumentsActive = currentTab === 'documents';
  const isQuotationActive = currentTab === 'quotation';

  const steps: VipJourneyStep[] = [
    {
      id: 'step-1',
      tabKey: 'lines',
      stepNumber: 1,
      title: 'Cables & Specs',
      subtitle: 'Dimensions & Quantities',
      badge: lineCount > 0 ? `${lineCount} Cables` : 'Add Cable',
      completed: lineCount > 0,
      active: isLinesActive,
    },
    {
      id: 'step-2',
      tabKey: 'drum_plan',
      stepNumber: 2,
      title: 'Cutting & Drums',
      subtitle: 'Reel Allocation',
      badge: drumCount > 0 ? `${drumCount} Drums` : 'Auto Schedule',
      completed: drumCount > 0,
      active: isDrumsActive,
    },
    {
      id: 'step-3',
      tabKey: 'container_study',
      stepNumber: 3,
      title: 'Container Study',
      subtitle: 'Sea Freight Loading',
      badge: containerType || '40HQ / 20STD',
      completed: Boolean(containerType || drumCount > 0),
      active: isContainerActive,
    },
    {
      id: 'step-4',
      tabKey: 'costing',
      stepNumber: 4,
      title: 'Instant Costing',
      subtitle: 'Raw Metals & Logistics',
      badge: isCostCalculated ? 'Calculated ✓' : 'Ready to Calc',
      completed: isCostCalculated,
      active: isCostingActive,
    },
    {
      id: 'step-5',
      tabKey: 'documents',
      stepNumber: 5,
      title: 'Commercial Offer',
      subtitle: 'Formal Quotation Specs',
      badge: hasQuotation ? 'Ready to Review ✓' : 'Drafting Offer',
      completed: hasQuotation,
      active: isDocumentsActive,
    },
    {
      id: 'step-6',
      tabKey: 'quotation',
      stepNumber: 6,
      title: 'Submit & Contract',
      subtitle: 'Sales Order Sign-off',
      badge: isSubmittedToSales
        ? fulfillmentType === 'DIRECT_ORDER'
          ? 'Direct SO Sent'
          : 'Agreement Sent'
        : 'Select Contract',
      completed: isSubmittedToSales,
      active: isQuotationActive,
    },
  ];

  return (
    <div className="rounded-2xl border-2 border-brand-200/80 bg-gradient-to-r from-brand-50/60 via-white to-blue-50/50 p-4 shadow-sm space-y-3">
      {/* Top Banner Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-blue-700 text-white shadow-md shadow-brand-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-brand-950 tracking-tight font-display">
                VIP Fast-Track Order Journey
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                <CheckCircle2 className="h-3 w-3" /> Zero Roadblocks
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Direct cable and container inputs — auto-saved in real-time with instant commercial pricing.
            </p>
          </div>
        </div>

        {/* Right side controls: Auto-Save pill + 1-Click Instant Action */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-save Status Pill */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
              autoSaveStatus === 'saving'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {autoSaveStatus === 'saving' ? (
              <>
                <Clock className="h-3 w-3 animate-spin text-amber-600" />
                <span>Auto-saving…</span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>
                  ✓ Auto-saved {lastAutoSavedTime ? `(${lastAutoSavedTime})` : ''}
                </span>
              </>
            )}
          </div>

          {/* Instant 1-Click Fast-Track Button */}
          <button
            type="button"
            onClick={onInstantCalculate}
            disabled={calculating || lineCount === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-brand-600/25 hover:from-brand-700 hover:to-blue-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Instant calculation for raw materials, manufacturing and freight"
          >
            <Zap className={`h-3.5 w-3.5 ${calculating ? 'animate-bounce' : ''}`} />
            <span>
              {calculating ? 'Calculating & Preparing Offer…' : '⚡ Instant Costing & Commercial Offer'}
            </span>
          </button>

          {/* Next Step Button */}
          <button
            type="button"
            onClick={onNextStep}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <span>Next Step</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 6 Steps Progress Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
        {steps.map((s) => {
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectTab(s.tabKey)}
              className={`group flex flex-col justify-between rounded-xl border p-2.5 text-left transition-all ${
                s.active
                  ? 'border-brand-500 bg-brand-50/80 shadow-sm ring-2 ring-brand-400/20'
                  : s.completed
                    ? 'border-emerald-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30'
                    : 'border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    s.active
                      ? 'bg-brand-600 text-white'
                      : s.completed
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {s.completed ? '✓' : s.stepNumber}
                </span>
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                    s.completed
                      ? 'bg-emerald-100/80 text-emerald-800'
                      : s.active
                        ? 'bg-brand-100 text-brand-800'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {s.badge}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-xs text-slate-900 truncate">{s.title}</p>
                <p className="text-[10px] text-slate-500 truncate">{s.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
