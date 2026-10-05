export type InquiryWorkspaceTab =
  | 'overview'
  | 'lines'
  | 'costing'
  | 'drum_plan'
  | 'cutting'
  | 'container_study'
  | 'documents'
  | 'quotation'
  | 'activity'
  | 'technical_offer'
  | 'notes'
  | 'history'
  | 'audit';

export const CANONICAL_INTERNAL_TABS: InquiryWorkspaceTab[] = [
  'overview',
  'lines',
  'costing',
  'drum_plan',
  'cutting',
  'container_study',
  'documents',
  'quotation',
  'activity',
];

/** Customer portal uses the same inquiry workspace shell as internal users. */
export const CUSTOMER_PORTAL_TABS: InquiryWorkspaceTab[] = [...CANONICAL_INTERNAL_TABS];

const TAB_LABELS: Record<InquiryWorkspaceTab, string> = {
  overview: 'Overview',
  lines: 'Cables',
  costing: 'Costing',
  drum_plan: 'Drums',
  cutting: 'Cutting',
  container_study: 'Container Study',
  documents: 'Documents',
  quotation: 'Quotation',
  activity: 'Activity',
  technical_offer: 'Technical Offer',
  notes: 'Notes',
  history: 'History',
  audit: 'Audit Trail',
};

export interface InquiryTabCounts {
  lineCount: number;
  documentCount: number;
  quotationCount: number;
  technicalOfferCount?: number;
  notesCount?: number;
  historyCount?: number;
  activityCount?: number;
}

export function resolveInquiryWorkspaceTabs(input: {
  isCustomer: boolean;
  canViewCosting: boolean;
  canViewExtendedInternal: boolean;
  counts: InquiryTabCounts;
}): { id: InquiryWorkspaceTab; label: string; count?: number }[] {
  const base = input.isCustomer
    ? CUSTOMER_PORTAL_TABS
    : CANONICAL_INTERNAL_TABS.filter((tab) => {
        if (tab === 'costing' && !input.canViewCosting) return false;
        return true;
      });

  const tabs = [...base];
  if (!input.isCustomer && input.canViewExtendedInternal) {
    tabs.push('technical_offer', 'notes', 'history', 'audit');
  }

  return tabs.map((id) => {
    const entry: { id: InquiryWorkspaceTab; label: string; count?: number } = {
      id,
      label: TAB_LABELS[id],
    };
    if (id === 'lines') entry.count = input.counts.lineCount;
    if (id === 'documents') entry.count = input.counts.documentCount;
    if (id === 'quotation') entry.count = input.counts.quotationCount;
    if (id === 'technical_offer') entry.count = input.counts.technicalOfferCount;
    if (id === 'notes') entry.count = input.counts.notesCount;
    if (id === 'history') entry.count = input.counts.historyCount;
    if (id === 'activity') entry.count = input.counts.activityCount;
    return entry;
  });
}

export function normalizeInquiryTab(
  tab: InquiryWorkspaceTab,
  allowed: InquiryWorkspaceTab[]
): InquiryWorkspaceTab {
  if (allowed.includes(tab)) return tab;
  return allowed[0] ?? 'overview';
}
