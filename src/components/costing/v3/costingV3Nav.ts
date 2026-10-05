import {
  LayoutDashboard,
  Coins,
  ArrowLeftRight,
  Package,
  DollarSign,
  Layers3,
  Percent,
  Gem,
  Upload,
  ClipboardCheck,
  History,
  Settings,
  Component,
  Plus,
  FileSpreadsheet,
  FileText,
  Eye,
  CheckCircle,
  ShieldCheck,
  BadgeCheck,
  LucideIcon,
} from 'lucide-react';
import { PanelIntent } from './panels/types';

export type CostingV3Page =
  | 'dashboard'
  | 'readiness'
  | 'production_readiness'
  | 'currencies'
  | 'exchange_rates'
  | 'raw_materials'
  | 'raw_material_prices'
  | 'bom'
  | 'scrap_rules'
  | 'metal_classification'
  | 'metal_cost_components'
  | 'market_metal_pricing'
  | 'bulk_import'
  | 'validation'
  | 'audit'
  | 'pricing_rules'
  | 'settings';

export type CostingNavItem = {
  /** Unique key for sidebar highlighting when multiple items share the same page. */
  navKey: string;
  id: CostingV3Page;
  label: string;
  icon: LucideIcon;
  intent?: PanelIntent;
};

export type CostingNavGroup = {
  title: string;
  items: CostingNavItem[];
  defaultOpen?: boolean;
};

export type CostingTabNavigation = {
  page: CostingV3Page;
  intent?: PanelIntent;
};

/** Grouped costing workspace navigation (matches production mockup). */
export const COSTING_NAV_GROUPS: CostingNavGroup[] = [
  {
    title: 'COSTING',
    defaultOpen: true,
    items: [
      { navKey: 'dashboard', id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { navKey: 'readiness', id: 'readiness', label: 'Costing Readiness', icon: ShieldCheck },
      { navKey: 'production_readiness', id: 'production_readiness', label: 'Production Readiness', icon: BadgeCheck },
    ],
  },
  {
    title: 'CURRENCY & FX',
    defaultOpen: true,
    items: [
      { navKey: 'currencies', id: 'currencies', label: 'Currency Master', icon: Coins },
      { navKey: 'exchange_rates', id: 'exchange_rates', label: 'Exchange Rates', icon: ArrowLeftRight },
    ],
  },
  {
    title: 'RAW MATERIALS',
    defaultOpen: true,
    items: [
      { navKey: 'raw_materials', id: 'raw_materials', label: 'Raw Material Master', icon: Package },
      { navKey: 'metal_classification', id: 'metal_classification', label: 'Metal Classification', icon: Gem },
      { navKey: 'raw_material_prices', id: 'raw_material_prices', label: 'Raw Material Prices', icon: DollarSign },
      { navKey: 'market_metal_pricing', id: 'market_metal_pricing', label: 'Market Metal Pricing', icon: DollarSign },
      { navKey: 'metal_cost_components', id: 'metal_cost_components', label: 'Metal Cost Components', icon: Component },
    ],
  },
  {
    title: 'CABLE BOM',
    defaultOpen: true,
    items: [
      { navKey: 'bom_explorer', id: 'bom', label: 'BOM Explorer', icon: Layers3 },
      { navKey: 'bom_add', id: 'bom', label: 'Add BOM Line', icon: Plus, intent: { action: 'add' } },
      { navKey: 'bom_bulk', id: 'bulk_import', label: 'Bulk Upload / Update', icon: FileSpreadsheet, intent: { bulkKind: 'boms' } },
    ],
  },
  {
    title: 'SCRAP RULES',
    defaultOpen: true,
    items: [{ navKey: 'scrap_rules', id: 'scrap_rules', label: 'Scrap Rules', icon: Percent }],
  },
  {
    title: 'COMMERCIAL PRICING',
    defaultOpen: true,
    items: [{ navKey: 'pricing_rules', id: 'pricing_rules', label: 'Pricing Rules', icon: Percent }],
  },
  {
    title: 'BULK DATA MANAGEMENT',
    defaultOpen: false,
    items: [
      { navKey: 'bulk_templates', id: 'bulk_import', label: 'Templates', icon: FileText, intent: { bulkStep: 1 } },
      { navKey: 'bulk_upload', id: 'bulk_import', label: 'Upload', icon: Upload, intent: { bulkStep: 2 } },
      { navKey: 'bulk_validate', id: 'bulk_import', label: 'Validation', icon: ClipboardCheck, intent: { bulkStep: 3 } },
      { navKey: 'bulk_preview', id: 'bulk_import', label: 'Preview', icon: Eye, intent: { bulkStep: 4 } },
      { navKey: 'bulk_apply', id: 'bulk_import', label: 'Apply', icon: CheckCircle, intent: { bulkStep: 6 } },
    ],
  },
  {
    title: 'VALIDATION & AUDIT',
    defaultOpen: true,
    items: [
      { navKey: 'validation', id: 'validation', label: 'Validation', icon: ClipboardCheck },
      { navKey: 'audit', id: 'audit', label: 'Audit Trail', icon: History },
    ],
  },
];

export const COSTING_NAV: CostingNavItem[] = COSTING_NAV_GROUPS.flatMap((g) => g.items);

/** Settings kept accessible but outside primary nav groups. */
export const COSTING_SETTINGS_NAV: CostingNavItem = {
  navKey: 'settings',
  id: 'settings',
  label: 'Settings',
  icon: Settings,
};

export const COSTING_PAGE_TITLES: Record<CostingV3Page, string> = {
  dashboard: 'Costing Dashboard',
  readiness: 'Costing Readiness',
  production_readiness: 'Production Readiness',
  currencies: 'Currency Master',
  exchange_rates: 'Exchange Rates',
  raw_materials: 'Raw Material Master',
  raw_material_prices: 'Raw Material Prices',
  bom: 'BOM Explorer',
  scrap_rules: 'Scrap Rules',
  metal_classification: 'Metal Classification',
  metal_cost_components: 'Metal Cost Components',
  market_metal_pricing: 'Market Metal Pricing',
  bulk_import: 'Bulk Data Management',
  validation: 'Validation',
  audit: 'Audit Trail',
  pricing_rules: 'Pricing Rules',
  settings: 'Settings',
};

export const COSTING_TAB_EVENT = 'energya-costing-tab';

export function isCostingV3Page(value: string | null): value is CostingV3Page {
  return Boolean(
    value &&
      (COSTING_NAV.some((item) => item.id === value) || value === COSTING_SETTINGS_NAV.id)
  );
}

export function costingBreadcrumb(page: CostingV3Page): string {
  return `Costing / ${COSTING_PAGE_TITLES[page]}`;
}

export function parseCostingTabEvent(detail: unknown): CostingTabNavigation | null {
  if (typeof detail === 'string' && isCostingV3Page(detail)) {
    return { page: detail };
  }
  if (detail && typeof detail === 'object' && 'page' in detail) {
    const page = (detail as CostingTabNavigation).page;
    if (isCostingV3Page(page)) {
      return { page, intent: (detail as CostingTabNavigation).intent };
    }
  }
  return null;
}
