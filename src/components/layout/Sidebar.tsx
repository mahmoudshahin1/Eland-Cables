import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { PlatformMode, CustomerPortalTab, InternalPortalTab, ModulePermissions } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { customerPathForTab, internalPathForTab, profilePathForUser } from '../../app/shellRoutes';
import { CUSTOMER_HOME_NAV_ITEMS } from '../../app/customerPortalNav';
import { COSTING_NAV_GROUPS, COSTING_SETTINGS_NAV, COSTING_TAB_EVENT, CostingTabNavigation, CostingV3Page, isCostingV3Page, parseCostingTabEvent } from '../costing/v3/costingV3Nav';
import { BrandLogo } from '../BrandLogo';
import { CustomerBrandMark } from './CustomerBrandMark';
import { ENABLE_AI_QUOTATION_ASSISTANT } from '../../config/featureFlags';
import {
  LayoutDashboard,
  Sliders,
  Calculator,
  Box,
  CreditCard,
  Truck,
  Receipt,
  FileCheck,
  FileText,
  Headphones,
  BarChart3,
  Cpu,
  DollarSign,
  FileSpreadsheet,
  Factory,
  Coins,
  FileUp,
  PieChart,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  UserCheck,
  Bot,
  X,
  ShoppingCart,
  Sparkles,
  UserRound,
  LayoutGrid,
  Home,
  FolderOpen,
  LifeBuoy,
  Globe,
} from 'lucide-react';

interface SidebarProps {
  platformMode: PlatformMode;
  activeCustomerTab: CustomerPortalTab;
  activeInternalTab: InternalPortalTab;
  isOpenMobile: boolean;
  setIsOpenMobile: (open: boolean) => void;
  onOpenAiModal?: () => void;
}

const SIDEBAR_COLLAPSED_STORAGE_PREFIX = 'energya.sidebar.collapsed.';

function readCollapsedState(platformMode: PlatformMode): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(`${SIDEBAR_COLLAPSED_STORAGE_PREFIX}${platformMode}`) === '1';
  } catch {
    return false;
  }
}

function writeCollapsedState(platformMode: PlatformMode, collapsed: boolean) {
  try {
    window.localStorage.setItem(`${SIDEBAR_COLLAPSED_STORAGE_PREFIX}${platformMode}`, collapsed ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

export const Sidebar: React.FC<SidebarProps> = ({
  platformMode,
  activeCustomerTab,
  activeInternalTab,
  isOpenMobile,
  setIsOpenMobile,
  onOpenAiModal,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => readCollapsedState(platformMode));
  const [costingPage, setCostingPage] = useState<CostingV3Page>('dashboard');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(COSTING_NAV_GROUPS.map((g) => [g.title, g.defaultOpen !== false]))
  );
  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const costingNavy = platformMode === 'internal' && activeInternalTab === 'costing_pricing';
  const customerChrome = platformMode === 'customer';
  const quotedNavActive =
    activeCustomerTab === 'price_estimation' &&
    Boolean((location.state as { status?: string } | null)?.status === 'QUOTED');

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      writeCollapsedState(platformMode, next);
      return next;
    });
  };

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (isCostingV3Page(tab)) setCostingPage(tab);
    const onTab = (event: Event) => {
      const nav = parseCostingTabEvent((event as CustomEvent).detail);
      if (nav) setCostingPage(nav.page);
    };
    window.addEventListener(COSTING_TAB_EVENT, onTab as EventListener);
    return () => window.removeEventListener(COSTING_TAB_EVENT, onTab as EventListener);
  }, [activeInternalTab]);

  const customerNavIcons: Record<(typeof CUSTOMER_HOME_NAV_ITEMS)[number]['id'], React.ElementType> = {
    home: Home,
    products: LayoutGrid,
    my_inquiries: FolderOpen,
    quotations: FileCheck,
    orders: ShoppingCart,
    documents: FileText,
    support: LifeBuoy,
  };

  // Internal Portal Navigation Items mapped to permission claims.
  // `group` is presentation-only: it organizes the SAME items into labeled
  // sections. Destinations, permissionKeys, order, labels and badges are unchanged.
  const internalNavItems: {
    id: InternalPortalTab;
    label: string;
    icon: React.ElementType;
    permissionKey: keyof ModulePermissions;
    badge?: string;
    group: string;
  }[] = [
    { id: 'overview', label: 'Internal Dashboard', icon: BarChart3, permissionKey: 'overview', group: 'Overview' },
    { id: 'technical_office', label: 'Technical Office', icon: Cpu, permissionKey: 'technicalOffice', group: 'Engineering' },
    { id: 'cable_configurator', label: 'Cable Parameters', icon: Sliders, permissionKey: 'technicalOffice', group: 'Engineering' },
    { id: 'costing_pricing', label: 'Costing Configuration', icon: DollarSign, permissionKey: 'costingPricing', group: 'Commercial' },
    { id: 'sales_quotations', label: 'Sales Quotations', icon: FileSpreadsheet, permissionKey: 'salesQuotations', badge: '12 Open', group: 'Commercial' },
    { id: 'sales_orders', label: 'Sales Orders', icon: ShoppingCart, permissionKey: 'salesQuotations', badge: 'Open/Invoiced', group: 'Commercial' },
    { id: 'orders_production', label: 'Production Monitoring', icon: Factory, permissionKey: 'ordersProduction', group: 'Operations' },
    { id: 'shipments_logistics' as any, label: 'Logistics & Dispatch', icon: Truck, permissionKey: 'ordersProduction', group: 'Operations' },
    { id: 'finance_collections', label: 'Finance & Collections', icon: Coins, permissionKey: 'financeCollections', group: 'Finance' },
    { id: 'master_data', label: 'Master Data', icon: FileUp, permissionKey: 'masterData', group: 'Administration' },
    { id: 'reports_analytics', label: 'Power BI Analytics', icon: PieChart, permissionKey: 'reportsAnalytics', group: 'Administration' },
    { id: 'user_management', label: 'Administration', icon: Users, permissionKey: 'userManagement', group: 'Administration' },
  ];

  // Filter internal items based on user's authorized access claims (Cable Configurator and Overview always accessible)
  const authorizedInternalNavItems = internalNavItems.filter(
    (item) => item.id === 'cable_configurator' || item.permissionKey === 'overview' || hasPermission(item.permissionKey)
  );

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      {/* Main Sidebar Wrapper */}
      <aside
        className={`fixed top-0 bottom-0 start-0 z-40 transition-all duration-300 ease-in-out flex flex-col lg:static lg:z-auto lg:min-h-screen ${
          isOpenMobile ? 'translate-x-0 w-64 rtl:-translate-x-0' : '-translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0'
        } ${
          customerChrome
            ? `${isCollapsed ? 'lg:w-20' : 'lg:w-[13.75rem]'} bg-[#071E3A] text-white shadow-[4px_0_24px_rgba(7,30,58,0.28)]`
            : `${isCollapsed ? 'lg:w-20' : 'lg:w-64'} bg-gradient-to-b from-brand-800 to-brand-900 text-white border-e border-brand-900/60 shadow-[4px_0_24px_rgba(10,31,66,0.18)]`
        }`}
      >
        {customerChrome ? (
          <div className={`pt-5 pb-2 ${isCollapsed ? 'px-2' : 'px-3'}`}>
            <div className={`flex items-center pb-3 ${isCollapsed ? 'justify-center' : 'justify-between gap-2 px-2'}`}>
              <CustomerBrandMark
                showName={false}
                onDark
                logoClassName={isCollapsed ? 'h-11 max-w-[2.75rem]' : 'h-[4.35rem] max-h-[4.35rem] max-w-[7.5rem]'}
              />
              <button
                onClick={() => setIsOpenMobile(false)}
                className="lg:hidden p-1.5 rounded-lg text-white/80 hover:text-white bg-white/10 shrink-0"
                title="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
              className="hidden lg:flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold transition-all text-white/70 hover:text-white bg-white/10 hover:bg-white/15"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
              ) : (
                <div className="flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
                  <span>Collapse</span>
                </div>
              )}
            </button>
          </div>
        ) : (
          <>
            <div className={`flex p-4 border-b border-white/10 lg:hidden ${isCollapsed ? 'justify-center' : ''}`}>
              <BrandLogo className={isCollapsed ? 'h-7' : 'h-9'} onDark />
            </div>
            <div className="flex items-center justify-between p-4 border-b border-white/10 lg:hidden">
              <span className="font-display font-extrabold text-sm text-white">
                Navigation Menu
              </span>
              <button
                onClick={() => setIsOpenMobile(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </>
        )}

        {platformMode !== 'customer' && (
        <div className="p-3 border-b border-white/10 bg-brand-900/40">
          {costingNavy ? (
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
              <div className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center shrink-0 shadow-sm">
                <DollarSign className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              {!isCollapsed && (
                <p className="font-display text-[13px] font-extrabold text-white leading-tight tracking-wide uppercase">
                  Production Costing
                </p>
              )}
            </div>
          ) : !isCollapsed ? (
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-sm shrink-0 ${
                  platformMode === 'customer'
                    ? 'bg-white/15 text-white'
                    : 'bg-accent-600 text-white'
                }`}
              >
                {currentUser?.fullName ? currentUser.fullName.charAt(0) : 'E'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-sm truncate text-white">
                  {currentUser?.fullName || (platformMode === 'customer' ? 'Customer' : 'Energya User')}
                </p>
                <div className="flex items-center gap-1 text-[10px] font-medium truncate text-white/70">
                  <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span className="truncate">
                    {currentUser?.role || 'Guest'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-sm ${
                  'bg-accent-500 text-white'
                }`}
                title={currentUser?.fullName || 'User'}
              >
                {currentUser?.fullName ? currentUser.fullName.charAt(0) : 'E'}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Sidebar Nav Links Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 no-scrollbar">
          {!isCollapsed && platformMode !== 'customer' && !costingNavy && (
            <div className="px-2 py-1 flex items-center justify-between text-[11px] font-extrabold uppercase text-white/40">
              <span>Authorized Modules</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                {`${authorizedInternalNavItems.length} Allowed`}
              </span>
            </div>
          )}

          {/* CUSTOMER PORTAL ITEMS */}
          {customerChrome &&
            CUSTOMER_HOME_NAV_ITEMS.map((item) => {
              const Icon = customerNavIcons[item.id];
              const path = customerPathForTab(item.tab);
              const isQuotedItem = item.id === 'quotations';
              const isInquiryList = item.id === 'my_inquiries';
              const active =
                !item.suppressActive &&
                (isQuotedItem
                  ? quotedNavActive
                  : isInquiryList
                    ? activeCustomerTab === 'price_estimation' && !quotedNavActive
                    : activeCustomerTab === item.tab);
              const go = () => {
                navigate(path, { state: item.navState || {} });
                setIsOpenMobile(false);
              };
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={go}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={`group w-full flex items-center ${
                    isCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
                  } py-[0.7rem] rounded-xl text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-[#2F6BFF] text-white shadow-[0_6px_16px_rgba(47,107,255,0.35)]'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-white' : 'text-white/70 group-hover:text-white'}`} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}

          {platformMode === 'internal' && costingNavy && (
            <>
              {COSTING_NAV_GROUPS.map((group, gi) => {
                const expanded = expandedGroups[group.title] !== false;
                return (
                  <div key={group.title || `g-${gi}`} className={gi > 0 ? 'mt-1' : ''}>
                    {!isCollapsed && group.title && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedGroups((prev) => ({ ...prev, [group.title]: !expanded }))
                        }
                        className="w-full px-3 pt-2.5 pb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-white/50 font-bold hover:text-white/70"
                      >
                        <span>{group.title}</span>
                        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                    {(expanded || isCollapsed) &&
                      group.items.map((item) => {
                        const Icon = item.icon;
                        const active = costingPage === item.id;
                        return (
                          <button
                            key={item.navKey}
                            type="button"
                            title={item.label}
                            onClick={() => {
                              setCostingPage(item.id);
                              const url = new URL(window.location.href);
                              url.searchParams.set('tab', item.id);
                              window.history.replaceState({}, '', url.toString());
                              window.dispatchEvent(
                                new CustomEvent<CostingTabNavigation>(COSTING_TAB_EVENT, {
                                  detail: { page: item.id, intent: item.intent },
                                })
                              );
                              setIsOpenMobile(false);
                            }}
                            className={`w-full flex items-center ${
                              isCollapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
                            } py-2 text-[13px] font-medium transition-colors border-s-4 ${
                              active
                                ? 'bg-brand-500/40 text-white border-accent-400'
                                : 'text-white/80 hover:bg-white/10 hover:text-white border-transparent'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {!isCollapsed && <span className="truncate text-left">{item.label}</span>}
                          </button>
                        );
                      })}
                  </div>
                );
              })}
              {!isCollapsed && (
                <button
                  type="button"
                  title={COSTING_SETTINGS_NAV.label}
                  onClick={() => {
                    setCostingPage(COSTING_SETTINGS_NAV.id);
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', COSTING_SETTINGS_NAV.id);
                    window.history.replaceState({}, '', url.toString());
                    window.dispatchEvent(
                      new CustomEvent<CostingTabNavigation>(COSTING_TAB_EVENT, {
                        detail: { page: COSTING_SETTINGS_NAV.id },
                      })
                    );
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 mt-3 text-[12px] font-medium text-white/60 hover:text-white hover:bg-white/10 border-s-4 border-transparent ${
                    costingPage === 'settings' ? 'bg-brand-500/40 text-white border-accent-400' : ''
                  }`}
                >
                  <COSTING_SETTINGS_NAV.icon className="h-4 w-4 shrink-0" />
                  <span>{COSTING_SETTINGS_NAV.label}</span>
                </button>
              )}
            </>
          )}

          {platformMode === 'internal' &&
            !costingNavy &&
            authorizedInternalNavItems.map((item, idx) => {
              const Icon = item.icon;
              const path = internalPathForTab(item.id);
              const showGroupHeader =
                !isCollapsed && (idx === 0 || authorizedInternalNavItems[idx - 1].group !== item.group);
              return (
                <div key={item.id}>
                {showGroupHeader && (
                  <div className="px-2 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-white/35">
                    {item.group}
                  </div>
                )}
                <NavLink
                  to={path}
                  end={path === '/internal'}
                  onClick={() => {
                    setIsOpenMobile(item.id === 'costing_pricing' ? isOpenMobile : false);
                  }}
                  title={item.label}
                  className={({ isActive }) =>
                    `group relative w-full flex items-center ${
                      isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                    } py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && !isCollapsed && (
                        <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-accent-500" aria-hidden />
                      )}
                      <div className="flex items-center gap-3 truncate">
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent-400' : 'text-white/60 group-hover:text-white'}`} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {!isCollapsed && item.badge && (
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
                </div>
              );
            })}

          {platformMode === 'internal' && !costingNavy && (
            <NavLink
              to="/v2"
              onClick={() => setIsOpenMobile(false)}
              title="V2 Platform"
              className={({ isActive }) =>
                `group relative w-full flex items-center ${
                  isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                } py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !isCollapsed && (
                    <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-accent-500" aria-hidden />
                  )}
                  <div className="flex items-center gap-3 truncate">
                    <LayoutGrid className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent-400' : 'text-white/60 group-hover:text-white'}`} />
                    {!isCollapsed && <span className="truncate">V2 Platform</span>}
                  </div>
                </>
              )}
            </NavLink>
          )}

          {currentUser && !costingNavy && platformMode !== 'customer' && (
            <NavLink
              to={profilePathForUser(currentUser)}
              onClick={() => setIsOpenMobile(false)}
              title="Profile"
              className={({ isActive }) =>
                `w-full flex items-center ${
                  isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                } py-2.5 rounded-xl text-sm font-bold transition-all ${
                  platformMode === 'customer'
                    ? isActive
                      ? 'bg-white text-brand-800 shadow-sm'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                    : costingNavy
                      ? isActive
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                      : isActive
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <div className="flex items-center gap-3 truncate">
                  <UserRound
                    className={`h-4 w-4 shrink-0 ${
                      platformMode === 'customer'
                        ? isActive
                          ? 'text-accent-500'
                          : 'text-white/70'
                        : isActive || costingNavy
                          ? 'text-white'
                          : 'text-white/60'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate">Profile</span>}
                </div>
              )}
            </NavLink>
          )}
        </div>

        {/* Customer tagline / Internal AI Copilot & Collapse Toggle Footer */}
        <div
          className={`p-3 space-y-2 ${
            customerChrome
              ? `relative overflow-hidden ${isCollapsed ? 'px-3 pb-4 pt-3' : 'pt-8 pb-6 px-5'}`
              : 'border-t border-white/10 bg-brand-900/60'
          }`}
        >
          {customerChrome && !isCollapsed && (
            <div className="relative min-h-[5.5rem]">
              <Globe
                className="pointer-events-none absolute -start-2 bottom-0 h-28 w-28 text-white/[0.07]"
                strokeWidth={1.15}
                aria-hidden
              />
              <p className="relative pt-8 text-[12px] font-medium leading-snug text-white/80">
                Building a Stronger,
                <br />
                Safer World
              </p>
              <span className="relative mt-2.5 block h-[3px] w-9 rounded-full bg-[#E85D04]" aria-hidden />
            </div>
          )}
          {ENABLE_AI_QUOTATION_ASSISTANT && onOpenAiModal && !costingNavy && !customerChrome && (
            <button
              onClick={onOpenAiModal}
              title="AI Cable Engineering Copilot"
              className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-white text-[12px] font-semibold bg-brand-600 hover:bg-brand-500 transition-colors"
            >
              <Bot className="h-4 w-4 text-brand-100 shrink-0" />
              {!isCollapsed && <span>AI Copilot</span>}
            </button>
          )}

          {!customerChrome && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
              className="hidden lg:flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold transition-all text-white/70 hover:text-white bg-white/10 hover:bg-white/15"
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 rtl:-scale-x-100" />
              ) : (
                <div className="flex items-center gap-2">
                  <ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />
                  <span>Collapse</span>
                </div>
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
