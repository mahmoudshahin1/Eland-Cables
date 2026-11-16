import type { CommercialInquiryDto, CommercialInquiryLineDto } from '../../services/commercialInquiryApiService';
import { displayInquiryNumber, portalLifecycleFromInquiry } from '../../domain/inquiryPortalLifecycle';
import type { InquiryWorkspaceTab } from '../inquiry-quotation/inquiryWorkspaceTabs';

export type CustomerInquiryPresentationTabId =
  | 'lines'
  | 'cutting_drums'
  | 'container_study'
  | 'documents'
  | 'costing'
  | 'activity'
  | 'quotation'
  | 'overview';

export type CustomerInquiryPresentationTab = {
  id: CustomerInquiryPresentationTabId;
  label: string;
  count?: number;
  overflow?: boolean;
};

type WorkspaceTabEntry = { id: InquiryWorkspaceTab; label: string; count?: number };

/** Screenshot tab order; Overview / Quotation stay available in overflow. */
export function customerInquiryPresentationTabs(
  workspaceTabs: WorkspaceTabEntry[]
): CustomerInquiryPresentationTab[] {
  const byId = new Map(workspaceTabs.map((tab) => [tab.id, tab]));
  const tabs: CustomerInquiryPresentationTab[] = [];
  const lines = byId.get('lines');
  if (lines) tabs.push({ id: 'lines', label: 'Cable Lines', count: lines.count });
  if (byId.has('drum_plan') || byId.has('cutting')) {
    tabs.push({ id: 'cutting_drums', label: 'Cutting & Drums' });
  }
  const container = byId.get('container_study');
  if (container) tabs.push({ id: 'container_study', label: 'Container Study' });
  const documents = byId.get('documents');
  if (documents) tabs.push({ id: 'documents', label: 'Documents', count: documents.count });
  const costing = byId.get('costing');
  if (costing) tabs.push({ id: 'costing', label: 'Costing' });
  const activity = byId.get('activity');
  if (activity) tabs.push({ id: 'activity', label: 'Activity' });
  const quotation = byId.get('quotation');
  if (quotation) {
    tabs.push({
      id: 'quotation',
      label: 'Quotation',
      count: quotation.count,
      overflow: !(quotation.count && quotation.count > 0),
    });
  }
  if (byId.has('overview')) {
    tabs.push({ id: 'overview', label: 'Overview', overflow: true });
  }
  return tabs;
}

export function workspaceTabForPresentation(
  id: CustomerInquiryPresentationTabId
): InquiryWorkspaceTab {
  if (id === 'cutting_drums') return 'drum_plan';
  return id;
}

export function presentationTabFromWorkspace(
  tab: InquiryWorkspaceTab
): CustomerInquiryPresentationTabId {
  if (tab === 'drum_plan' || tab === 'cutting') return 'cutting_drums';
  if (tab === 'quotation') return 'quotation';
  if (tab === 'overview') return 'overview';
  if (tab === 'costing') return 'costing';
  if (tab === 'documents') return 'documents';
  if (tab === 'container_study') return 'container_study';
  if (tab === 'activity' || tab === 'audit') return 'activity';
  return 'lines';
}

export function isCustomerCuttingDrumsTab(tab: InquiryWorkspaceTab): boolean {
  return tab === 'drum_plan' || tab === 'cutting';
}

/** V2 Engine bridge kinds mounted by inquiry detail. Never both drums + cutting for customer. */
export type InquiryV2TabBridgeKind = 'costing' | 'cutting' | 'drums' | 'cutting_drums';

/**
 * At most one V2 Engine bridge per presentation tab.
 * Customer Cutting & Drums is a single combined workspace — never drums and cutting together.
 * Internal Drums vs Cutting stay separate tabs.
 */
export function resolveInquiryV2TabBridges(input: {
  isCustomer: boolean;
  tab: InquiryWorkspaceTab;
}): InquiryV2TabBridgeKind[] {
  if (input.isCustomer && isCustomerCuttingDrumsTab(input.tab)) {
    return ['cutting_drums'];
  }
  if (input.tab === 'drum_plan') return ['drums'];
  if (input.tab === 'cutting') return ['cutting'];
  return [];
}

export function inquiryCuttingDrumsWorkspace(input: {
  isCustomer: boolean;
  tab: InquiryWorkspaceTab;
}): {
  showPackingTable: boolean;
  showCuttingWorkbench: boolean;
  v2BridgeTabs: InquiryV2TabBridgeKind[];
} {
  const combined = input.isCustomer && isCustomerCuttingDrumsTab(input.tab);
  return {
    showPackingTable: input.tab === 'drum_plan' || combined,
    showCuttingWorkbench: input.tab === 'cutting' || combined,
    v2BridgeTabs: resolveInquiryV2TabBridges(input),
  };
}

/** Packing host gets the single V2 bridge whenever packing is visible. */
export function shouldMountInquiryV2BridgeInPacking(workspace: {
  showPackingTable: boolean;
  v2BridgeTabs: InquiryV2TabBridgeKind[];
}): boolean {
  return workspace.showPackingTable && workspace.v2BridgeTabs.length > 0;
}

/** Cutting host gets the V2 bridge only when packing is not shown (internal Cutting tab). */
export function shouldMountInquiryV2BridgeInCutting(workspace: {
  showPackingTable: boolean;
  showCuttingWorkbench: boolean;
  v2BridgeTabs: InquiryV2TabBridgeKind[];
}): boolean {
  return !workspace.showPackingTable && workspace.showCuttingWorkbench && workspace.v2BridgeTabs.length > 0;
}

export function v2EngineSectionsForBridgeTab(tab: InquiryV2TabBridgeKind): {
  showCosting: boolean;
  showCutting: boolean;
  showDrums: boolean;
} {
  return {
    showCosting: tab === 'costing',
    showCutting: tab === 'cutting' || tab === 'cutting_drums',
    showDrums: tab === 'drums' || tab === 'cutting_drums',
  };
}

export function lineHasV2SnapshotLineage(
  line:
    | {
        v2CurrentSnapshotId?: string | null;
        snapshots?: unknown[] | null;
      }
    | null
    | undefined
): boolean {
  if (!line) return false;
  if (line.v2CurrentSnapshotId) return true;
  return Array.isArray(line.snapshots) && line.snapshots.length > 0;
}

/** V2 Engine chrome requires persisted snapshot lineage — not workflowChannel alone. */
export function shouldRenderV2EngineChrome(input: {
  workflowChannel?: string | null;
  line?: {
    v2CurrentSnapshotId?: string | null;
    snapshots?: unknown[] | null;
  } | null;
}): boolean {
  void input.workflowChannel;
  return lineHasV2SnapshotLineage(input.line);
}

export function snapshotConflictLabel(line: {
  snapshots?: Array<{
    bomGovernanceBlocked?: boolean;
    unresolvedBomConflictCount?: number;
  }> | null;
}): string | null {
  const snap = line.snapshots?.[0];
  if (!snap) return null;
  if (snap.bomGovernanceBlocked || snap.unresolvedBomConflictCount > 0) {
    return `BOM governance blocked — ${snap.unresolvedBomConflictCount} unresolved conflict(s) (incl. BOM 81 when applicable).`;
  }
  return null;
}

export function customerInquiryDetailTitle(
  inquiry: Pick<CommercialInquiryDto, 'inquiryNumber' | 'status'> & { commercialMetadata?: unknown }
): string {
  const number = displayInquiryNumber(inquiry) || '—';
  return portalLifecycleFromInquiry(inquiry) === 'OPEN' ? `New Inquiry / ${number}` : `Inquiry / ${number}`;
}

export function customerInquiryBreadcrumbLabel(status?: string | null): string {
  return (status || '').toUpperCase() === 'DRAFT' ? 'New Inquiry' : 'Inquiry';
}

function payloadText(payload: Record<string, unknown> | null | undefined, key: string): string {
  if (!payload) return '';
  const value = payload[key];
  if (value == null || value === '') return '';
  return String(value).trim();
}

export function customerCableTypeLabel(line: CommercialInquiryLineDto): string {
  const payload = line.configurationPayload as Record<string, unknown> | undefined;
  const fromPayload =
    payloadText(payload, 'cableType') ||
    payloadText(payload, 'family') ||
    payloadText(payload, 'application') ||
    payloadText(payload, 'type');
  if (fromPayload) return fromPayload;
  const desc = line.cableDescription || '';
  if (/instrument/i.test(desc)) return 'Instrumentation';
  if (/control/i.test(desc)) return 'Control Cable';
  if (/power/i.test(desc)) return 'Power Cable';
  if (/\bLV\b/i.test(desc)) return 'LV Cable';
  if (/\bMV\b/i.test(desc)) return 'MV Cable';
  return '—';
}

export function customerCoresSizeLabel(line: CommercialInquiryLineDto): string {
  const payload = line.configurationPayload as Record<string, unknown> | undefined;
  const cores = payloadText(payload, 'cores') || payloadText(payload, 'numberOfCores');
  const size =
    payloadText(payload, 'conductorSize') ||
    payloadText(payload, 'size') ||
    payloadText(payload, 'crossSection');
  if (cores && size) {
    const coresLabel = /c/i.test(cores) ? cores : `${cores}C`;
    return /mm/i.test(size) ? `${coresLabel} x ${size}` : `${coresLabel} x ${size} mm²`;
  }
  const desc = line.cableDescription || '';
  const match =
    desc.match(/(\d+\s*[Cc])\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm[²2])?/i) ||
    desc.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*mm/i);
  if (match) {
    const coresPart = /c/i.test(match[1]) ? match[1].replace(/\s+/g, '') : `${match[1]}C`;
    const unit = match[3] ? (match[3].toLowerCase().includes('mm') ? ' mm²' : '') : ' mm²';
    return `${coresPart} x ${match[2]}${unit}`;
  }
  return '—';
}

export function customerLineQuantityMeters(line: CommercialInquiryLineDto): number {
  const length = Number(line.requestedLengthMeters);
  if (Number.isFinite(length) && length > 0) return length;
  const cutting = Number(line.cuttingLengthMeters);
  const drums = Number(line.requestedQuantity);
  if (Number.isFinite(cutting) && cutting > 0 && Number.isFinite(drums) && drums > 0) {
    return cutting * drums;
  }
  return Number.isFinite(length) ? length : 0;
}

export function customerLineUnitLabel(line: CommercialInquiryLineDto): string {
  const uom = String(line.quantityUom || '').trim();
  if (!uom) return 'm';
  if (uom.toUpperCase() === 'M' || uom.toUpperCase() === 'METER' || uom.toUpperCase() === 'METRE') return 'm';
  return uom;
}

export const CUSTOMER_PRICE_BASIS_OPTIONS = ['LME'] as const;

export interface InquiryCompletenessResult {
  percentage: number;
  filledCount: number;
  totalCount: number;
  label: string;
}

export function calculateInquiryCompleteness(
  inquiry: Pick<CommercialInquiryDto, 'lines' | 'projectName' | 'commercialMetadata'> | null | undefined,
  headerForm?: {
    customerName?: string;
    projectName?: string;
    requiredQuotationDate?: string;
    destinationCountry?: string;
    destinationPort?: string;
    copperPriceRate?: number | string | null;
    aluminiumPriceRate?: number | string | null;
  } | null
): InquiryCompletenessResult {
  const totalCount = 6;
  let filledCount = 0;

  // 1. Customer information
  if (headerForm?.customerName?.trim() || inquiry?.commercialMetadata) filledCount++;

  // 2. Project Name
  if (headerForm?.projectName?.trim() || inquiry?.projectName?.trim()) filledCount++;

  // 3. Required Quotation Date
  if (headerForm?.requiredQuotationDate?.trim()) filledCount++;

  // 4. Delivery Destination (Country or Port)
  if (headerForm?.destinationCountry?.trim() || headerForm?.destinationPort?.trim()) filledCount++;

  // 5. Pricing / Currency configuration
  if (headerForm?.copperPriceRate != null || headerForm?.aluminiumPriceRate != null) filledCount++;

  // 6. Cable Lines
  if (Array.isArray(inquiry?.lines) && inquiry.lines.length > 0) filledCount++;

  const percentage = Math.round((filledCount / totalCount) * 100);
  return {
    percentage,
    filledCount,
    totalCount,
    label: `${filledCount} of ${totalCount} required`,
  };
}

export type LifecycleStepState = 'complete' | 'current' | 'upcoming';

export interface InquiryLifecycleStepItem {
  id: string;
  label: string;
  state: LifecycleStepState;
}

export function resolveInquiryLifecycleSteps(
  inquiry: Pick<CommercialInquiryDto, 'status' | 'commercialMetadata'> | null | undefined
): InquiryLifecycleStepItem[] {
  const lifecycle = inquiry ? portalLifecycleFromInquiry(inquiry) : 'OPEN';
  const rawStatus = (inquiry?.status || '').toUpperCase();
  const isOrder =
    rawStatus === 'ORDER_CREATED' ||
    rawStatus === 'CONVERTED' ||
    rawStatus === 'WON';

  let activeIndex = 0; // 0 = Draft, 1 = Submitted, 2 = Approved, 3 = Order
  if (isOrder) {
    activeIndex = 3;
  } else if (
    lifecycle === 'ACCEPTED' ||
    rawStatus === 'APPROVED' ||
    rawStatus === 'ACCEPTED' ||
    rawStatus === 'CLOSED'
  ) {
    activeIndex = 2;
  } else if (
    lifecycle === 'NOT_SUBMITTED' ||
    rawStatus === 'SUBMITTED' ||
    rawStatus === 'QUOTED' ||
    Boolean((inquiry?.commercialMetadata as Record<string, unknown> | undefined)?.submittedToSales)
  ) {
    activeIndex = 1;
  } else {
    activeIndex = 0;
  }

  const stepLabels = ['Draft', 'Submitted', 'Approved', 'Order'];
  return stepLabels.map((label, idx) => ({
    id: label.toLowerCase(),
    label,
    state: idx < activeIndex ? 'complete' : idx === activeIndex ? 'current' : 'upcoming',
  }));
}

