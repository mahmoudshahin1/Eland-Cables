import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronDown, CircleHelp, LogOut, Menu, UserRound } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { INTERNAL_HOME_PATH, profilePathForUser } from '../../../app/shellRoutes';
import {
  COSTING_PAGE_TITLES,
  COSTING_SETTINGS_NAV,
  COSTING_TAB_EVENT,
  CostingTabNavigation,
  CostingV3Page,
  costingBreadcrumb,
  isCostingV3Page,
  parseCostingTabEvent,
} from './costingV3Nav';
import { useCostingWorkspaceData } from './useCostingWorkspaceData';
import { PanelIntent } from './panels/types';
import { DashboardPanel } from './panels/DashboardPanel';
import { RawMaterialsPanel } from './panels/RawMaterialsPanel';
import { RawMaterialPricesPanel } from './panels/RawMaterialPricesPanel';
import { BomPanel } from './panels/BomPanel';
import { CurrenciesPanel } from './panels/CurrenciesPanel';
import { ExchangeRatesPanel } from './panels/ExchangeRatesPanel';
import { MetalClassificationPanel } from './panels/MetalClassificationPanel';
import { MetalCostComponentsPanel } from './panels/MetalCostComponentsPanel';
import { MarketMetalPricingPanel } from './panels/MarketMetalPricingPanel';
import { ScrapRulesPanel } from './panels/ScrapRulesPanel';
import { BulkImportPanel } from './panels/BulkImportPanel';
import { ValidationPanel } from './panels/ValidationPanel';
import { ReadinessWorkbenchPanel } from './panels/ReadinessWorkbenchPanel';
import { ProductionReadinessPanel } from './panels/ProductionReadinessPanel';
import { AuditPanel } from './panels/AuditPanel';
import { SettingsPanel } from './panels/SettingsPanel';
import { PricingRulesPanel } from './panels/PricingRulesPanel';

type Props = {
  token: string | null;
  lang?: 'en' | 'ar';
};

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'EC';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const CostingWorkspaceShell: React.FC<Props> = ({ token, lang = 'en' }) => {
  const rtl = lang === 'ar';
  const { currentUser, logout } = useAuth();
  const [page, setPage] = useState<CostingV3Page>('dashboard');
  const [intent, setIntent] = useState<PanelIntent | undefined>();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { data, loading, error, refresh, setError } = useCostingWorkspaceData(token);

  const displayName = currentUser?.fullName || 'Costing Admin';
  const displayRole = currentUser?.department || currentUser?.role || 'Costing Manager';
  const initials = userInitials(displayName);

  const notificationCount = useMemo(() => {
    const d = data.dashboard;
    if (!d) return 0;
    return (d.rawMaterialPrices.pendingApproval ?? 0) + (d.bom.pendingApproval ?? 0) + (d.scrapRules.underCreation ?? 0);
  }, [data.dashboard]);

  useEffect(() => {
    if (!showUserMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [showUserMenu]);

  const go = (next: CostingV3Page, nextIntent?: PanelIntent) => {
    setPage(next);
    setIntent(nextIntent);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url.toString());
    window.dispatchEvent(
      new CustomEvent<CostingTabNavigation>(COSTING_TAB_EVENT, { detail: { page: next, intent: nextIntent } })
    );
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'bom_bulk') {
      setPage('bulk_import');
      setIntent({ bulkKind: 'boms' });
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'bulk_import');
      window.history.replaceState({}, '', url.toString());
      return;
    }
    if (isCostingV3Page(tab)) setPage(tab);
  }, []);

  useEffect(() => {
    const onTab = (event: Event) => {
      const nav = parseCostingTabEvent((event as CustomEvent).detail);
      if (!nav) return;
      setPage(nav.page);
      if (nav.intent) setIntent(nav.intent);
    };
    window.addEventListener(COSTING_TAB_EVENT, onTab as EventListener);
    return () => window.removeEventListener(COSTING_TAB_EVENT, onTab as EventListener);
  }, []);

  const panelProps = {
    token,
    lang,
    data,
    loading,
    refresh,
    setError,
    onNavigate: go,
    intent,
    onIntentConsumed: () => setIntent(undefined),
  };

  return (
    <div className={`min-h-screen bg-brand-surface flex flex-col ${rtl ? 'rtl' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
      <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open menu"
            onClick={() => window.dispatchEvent(new Event('energya-toggle-mobile-sidebar'))}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">{COSTING_PAGE_TITLES[page]}</h1>
            <p className="text-[11px] text-slate-400 truncate">{costingBreadcrumb(page)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            className="relative p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label="Notifications"
            title="Pending approvals and validations"
            onClick={() => go('validation')}
          >
            <Bell className="h-5 w-5" strokeWidth={1.75} />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hidden sm:block"
            aria-label="Help"
            title="Costing configuration help"
          >
            <CircleHelp className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setShowUserMenu((open) => !open)}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50"
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
              title="Account menu"
            >
              <span className="h-9 w-9 rounded-full bg-brand-700 text-white text-sm font-bold inline-flex items-center justify-center">
                {initials}
              </span>
              <span className="text-left leading-tight hidden md:block">
                <span className="block text-sm font-bold text-slate-800">{displayName}</span>
                <span className="block text-[11px] text-slate-400">{displayRole}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400 hidden md:block" />
            </button>
            {showUserMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 text-sm"
              >
                {currentUser && (
                  <Link
                    to={profilePathForUser(currentUser)}
                    role="menuitem"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700"
                  >
                    <UserRound className="h-4 w-4" />
                    Profile
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    go(COSTING_SETTINGS_NAV.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700"
                >
                  Settings
                </button>
                <Link
                  to={INTERNAL_HOME_PATH}
                  role="menuitem"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700"
                >
                  Administration home
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowUserMenu(false);
                    void logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-slate-700 hover:text-red-600"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 lg:p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}
        {page === 'dashboard' && <DashboardPanel {...panelProps} />}
        {page === 'readiness' && <ReadinessWorkbenchPanel {...panelProps} />}
        {page === 'production_readiness' && <ProductionReadinessPanel {...panelProps} />}
        {page === 'raw_materials' && <RawMaterialsPanel {...panelProps} />}
        {page === 'raw_material_prices' && <RawMaterialPricesPanel {...panelProps} />}
        {page === 'bom' && <BomPanel {...panelProps} />}
        {page === 'currencies' && <CurrenciesPanel {...panelProps} />}
        {page === 'exchange_rates' && <ExchangeRatesPanel {...panelProps} />}
        {page === 'metal_classification' && <MetalClassificationPanel {...panelProps} />}
        {page === 'metal_cost_components' && <MetalCostComponentsPanel {...panelProps} />}
        {page === 'market_metal_pricing' && <MarketMetalPricingPanel {...panelProps} />}
        {page === 'scrap_rules' && <ScrapRulesPanel {...panelProps} />}
        {page === 'bulk_import' && <BulkImportPanel {...panelProps} />}
        {page === 'validation' && <ValidationPanel {...panelProps} />}
        {page === 'audit' && <AuditPanel {...panelProps} />}
        {page === 'pricing_rules' && <PricingRulesPanel {...panelProps} />}
        {page === 'settings' && <SettingsPanel {...panelProps} />}
      </div>

      <footer className="py-3 text-center text-[11px] text-slate-400 border-t border-slate-200 bg-white">
        © {new Date().getFullYear()} Energya Cables. All rights reserved.
      </footer>
    </div>
  );
};
