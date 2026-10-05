/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { PlatformMode, CustomerPortalTab, InternalPortalTab, SystemNotification, SalesOrderStatus } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import LoginPage from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { LOGIN_PATHS, UNIFIED_LOGIN_PATH, platformModeForUser } from './auth/loginRoutes';
import {
  customerPathForTab,
  customerTabFromPath,
  customerInquiryIdFromPath,
  customerInquiryDetailPath,
  firstAuthorizedInternalTab,
  INTERNAL_TAB_PERMISSION,
  internalPathForTab,
  internalTabFromPath,
  isProfilePath,
  resolveAuthenticatedShellKind,
  resolveShellNavigation,
} from './app/shellRoutes';
import { V2Shell } from './components/v2/V2Shell';
import { V2CustomerProductShell } from './components/v2/V2CustomerProductShell';
import { V2InternalProductShell } from './components/v2/V2InternalProductShell';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';
import { AccessRestricted } from './components/common/AccessRestricted';
import { MobileBottomNav } from './components/ui/MobileBottomNav';
import { LayoutDashboard, Calculator, Menu as MenuIcon, FileCheck, ShoppingCart } from 'lucide-react';

import { CustomerDashboard } from './components/customer/CustomerDashboard';
import { CustomerInquiryDetail } from './components/customer/CustomerInquiryDetail';
import { CableConfiguratorHub } from './components/cable-configurator/CableConfiguratorHub';
import { DrumOptimizer } from './components/customer/DrumOptimizer';
import { PriceEstimation } from './components/customer/PriceEstimation';
import { CustomerStatement } from './components/customer/CustomerStatement';
import { ShipmentTracker } from './components/customer/ShipmentTracker';
import { TdsDocumentLibrary } from './components/customer/TdsDocumentLibrary';
import { SupportCenter } from './components/customer/SupportCenter';
import { CustomerProductsPage } from './components/customer/CustomerProductsPage';
import { ElandProcessFlowDiagram } from './components/customer/ElandProcessFlowDiagram';
import { SalesOrders } from './components/common/SalesOrders';
import { CommercialFulfillmentWorkspace } from './components/fulfillment/CommercialFulfillmentWorkspace';

import { InternalDashboard } from './components/internal/InternalDashboard';
import { TechnicalOffice } from './components/internal/TechnicalOffice';
import { CostingHub } from './components/internal/CostingHub';
import { ProductionMonitoring } from './components/internal/ProductionMonitoring';
import { SalesQuotations } from './components/internal/SalesQuotations';
import { FinanceCollections } from './components/internal/FinanceCollections';
import { AdministrationHub } from './components/internal/AdministrationHub';
import { MasterDataHub } from './components/internal/MasterDataHub';
import { ReportsAnalytics } from './components/internal/ReportsAnalytics';

import { AiAssistantWidget } from './components/ai/AiAssistantWidget';
import { ENABLE_AI_QUOTATION_ASSISTANT } from './config/featureFlags';
import { UserProfilePage } from './components/profile/UserProfilePage';

type CustomerNavState = {
  inquiryId?: string;
  status?: string;
  orderStatus?: SalesOrderStatus;
  q?: string;
};

function CustomerPortalPages({
  selectedCableCode,
  onAddNotification,
  notifications,
}: {
  selectedCableCode: string;
  onAddNotification: (notif: SystemNotification) => void;
  notifications?: SystemNotification[];
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const customerTab = customerTabFromPath(location.pathname) ?? 'dashboard';
  const inquiryDetailId = customerInquiryIdFromPath(location.pathname);
  const [pendingInquiryId, setPendingInquiryId] = useState<string | undefined>();
  const [pendingInquiryStatus, setPendingInquiryStatus] = useState<string | undefined>();
  const [pendingOrderStatus, setPendingOrderStatus] = useState<SalesOrderStatus | undefined>();
  const [pendingSearch, setPendingSearch] = useState<string | undefined>();

  useEffect(() => {
    const state = (location.state || {}) as CustomerNavState;
    if (state.inquiryId) setPendingInquiryId(state.inquiryId);
    setPendingInquiryStatus(typeof state.status === 'string' ? state.status : '');
    setPendingOrderStatus(state.orderStatus);
    setPendingSearch(typeof state.q === 'string' ? state.q : undefined);
  }, [location.key, location.state]);

  const goCustomerTab = (tab: CustomerPortalTab, options?: CustomerNavState) => {
    navigate(customerPathForTab(tab), { state: options });
  };

  return (
    <>
      {inquiryDetailId ? (
        <CustomerInquiryDetail
          inquiryId={inquiryDetailId}
          onBack={() => navigate(customerPathForTab('price_estimation'))}
        />
      ) : (
        <>
      {customerTab === 'dashboard' && (
        <CustomerDashboard
          onNavigateTab={goCustomerTab}
          selectedCableCode={selectedCableCode}
          notifications={notifications}
        />
      )}
      {customerTab === 'products' && <CustomerProductsPage />}
      {(customerTab === 'process' || customerTab === 'journey') && (
        <ElandProcessFlowDiagram
          onSelectStep={(stepNumber) => {
            if (stepNumber === 9) {
              goCustomerTab('support');
            } else {
              goCustomerTab('price_estimation');
            }
          }}
        />
      )}
      {customerTab === 'drum_optimizer' && <DrumOptimizer onNavigateTab={goCustomerTab} />}
      {customerTab === 'price_estimation' && (
        <PriceEstimation
          onNavigateTab={goCustomerTab}
          selectedCableCode={selectedCableCode}
          onAddNotification={onAddNotification}
          initialInquiryId={pendingInquiryId}
          initialStatus={pendingInquiryStatus}
          initialSearch={pendingSearch}
          onInitialInquiryConsumed={() => setPendingInquiryId(undefined)}
          onInitialStatusConsumed={() => setPendingInquiryStatus(undefined)}
          onInitialSearchConsumed={() => setPendingSearch(undefined)}
        />
      )}
      {customerTab === 'sales_orders' && (
        <SalesOrders defaultStatusFilter={pendingOrderStatus || 'All'} />
      )}
      {(customerTab === 'statement' || customerTab === 'invoices') && <CustomerStatement />}
      {customerTab === 'shipment_tracking' && <ShipmentTracker />}
      {customerTab === 'tds_library' && <TdsDocumentLibrary />}
      {customerTab === 'support' && <SupportCenter />}
        </>
      )}
    </>
  );
}

function InternalPortalPages({
  onAddNotification,
  onSetGeneratedCableCode,
}: {
  onAddNotification: (notif: SystemNotification) => void;
  onSetGeneratedCableCode: (code: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const internalTab = internalTabFromPath(location.pathname) ?? 'overview';

  const goInternalTab = (tab: InternalPortalTab) => {
    navigate(internalPathForTab(tab));
  };

  return (
    <>
      {(internalTab === 'overview') &&
        (hasPermission('overview') ? (
          <InternalDashboard onNavigateTab={goInternalTab} />
        ) : (
          <AccessRestricted moduleName="Internal Overview Dashboard" />
        ))}

      {internalTab === 'technical_office' &&
        (hasPermission('technicalOffice') ? (
          <TechnicalOffice />
        ) : (
          <AccessRestricted moduleName="Technical Office & Cable Specs" />
        ))}

      {internalTab === 'cable_configurator' && (
        <CableConfiguratorHub
          onNavigateTab={(tab) => {
            if (tab === 'price_estimation') {
              goInternalTab('sales_quotations');
            }
          }}
          onSetGeneratedCableCode={onSetGeneratedCableCode}
        />
      )}

      {internalTab === 'costing_pricing' &&
        (hasPermission('costingPricing') ? (
          <CostingHub />
        ) : (
          <AccessRestricted moduleName="Costing Configuration" />
        ))}

      {internalTab === 'orders_production' &&
        (hasPermission('ordersProduction') ? (
          <ProductionMonitoring />
        ) : (
          <AccessRestricted moduleName="Production & Orders Monitoring" />
        ))}

      {internalTab === 'shipments_logistics' &&
        (hasPermission('ordersProduction') ? (
          <ProductionMonitoring />
        ) : (
          <AccessRestricted moduleName="Logistics & Dispatch" />
        ))}

      {internalTab === 'sales_quotations' &&
        (hasPermission('salesQuotations') ? (
          <SalesQuotations onAddNotification={onAddNotification} />
        ) : (
          <AccessRestricted moduleName="Sales & CRM Quotations" />
        ))}

      {internalTab === 'sales_orders' &&
        (hasPermission('salesQuotations') ? (
          <CommercialFulfillmentWorkspace />
        ) : (
          <AccessRestricted moduleName="Sales Orders Management" />
        ))}

      {internalTab === 'finance_collections' &&
        (hasPermission('financeCollections') ? (
          <FinanceCollections />
        ) : (
          <AccessRestricted moduleName="Finance & Collections Ledger" />
        ))}

      {internalTab === 'user_management' &&
        (hasPermission('userManagement') ? (
          <AdministrationHub />
        ) : (
          <AccessRestricted moduleName="User Security & RBAC Administration" />
        ))}

      {internalTab === 'master_data' &&
        (hasPermission('masterData') ? (
          <MasterDataHub />
        ) : (
          <AccessRestricted moduleName="Master Data Excel Import" />
        ))}

      {internalTab === 'reports_analytics' &&
        (hasPermission('reportsAnalytics') ? (
          <ReportsAnalytics />
        ) : (
          <AccessRestricted moduleName="Reports & Power BI Analytics" />
        ))}
    </>
  );
}

/**
 * Presentation-only mobile bottom nav for the customer portal. It reuses the
 * design-system `MobileBottomNav` primitive and routes to the SAME customer
 * destinations already exposed in the sidebar; the trailing "Menu" item opens
 * the existing off-canvas sidebar so every remaining destination stays reachable
 * on small screens (nothing is hidden by width). No routes/permissions change.
 */
function CustomerBottomNav({
  activeTab,
  onOpenMenu,
}: {
  activeTab: CustomerPortalTab;
  onOpenMenu: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const quoted = (location.state as { status?: string } | null)?.status === 'QUOTED';
  const go = (tab: CustomerPortalTab, state?: { status?: string }) =>
    navigate(customerPathForTab(tab), { state: state || {} });
  const items = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, onClick: () => go('dashboard') },
    { id: 'price_estimation', label: 'Inquiries', icon: Calculator, onClick: () => go('price_estimation') },
    {
      id: 'quotations',
      label: 'Quotations',
      icon: FileCheck,
      onClick: () => go('price_estimation', { status: 'QUOTED' }),
    },
    { id: 'sales_orders', label: 'Orders', icon: ShoppingCart, onClick: () => go('sales_orders') },
    { id: 'menu', label: 'More', icon: MenuIcon, onClick: onOpenMenu },
  ];
  const activeId =
    quoted && activeTab === 'price_estimation'
      ? 'quotations'
      : activeTab === 'dashboard' || activeTab === 'price_estimation' || activeTab === 'sales_orders'
        ? activeTab
        : 'menu';
  return <MobileBottomNav items={items} activeId={activeId} />;
}

function AuthenticatedShell() {
  const { currentUser, hasPermission, jwtToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [selectedCableCode, setSelectedCableCode] = useState(
    'MV-33KV-CU-3C-240-XLPE-PVC-SWA-PVC'
  );

  const shellMode: PlatformMode = platformModeForUser(currentUser!);
  const onProfile = isProfilePath(location.pathname);
  const customerTab = customerTabFromPath(location.pathname) ?? 'dashboard';
  const internalTab = internalTabFromPath(location.pathname) ?? 'overview';

  useEffect(() => {
    if (!currentUser || currentUser.userType !== 'internal') return;
    if (isProfilePath(location.pathname)) return;
    const targetPerm = INTERNAL_TAB_PERMISSION[internalTab];
    if (targetPerm && !hasPermission(targetPerm)) {
      navigate(internalPathForTab(firstAuthorizedInternalTab(hasPermission)), { replace: true });
    }
    // hasPermission is stable for a given user; omit it to avoid re-running every render.
  }, [currentUser, internalTab, navigate, location.pathname]);

  useEffect(() => {
    const onToggle = () => setIsMobileSidebarOpen((open) => !open);
    window.addEventListener('energya-toggle-mobile-sidebar', onToggle);
    return () => window.removeEventListener('energya-toggle-mobile-sidebar', onToggle);
  }, []);

  useEffect(() => {
    if (!jwtToken) return;
    let cancelled = false;
    void fetch('/api/notifications', { headers: { Authorization: `Bearer ${jwtToken}` } })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled || !Array.isArray(body.notifications)) return;
        setNotifications((prev) => {
          const server = (body.notifications as Array<{
            id: string;
            title: string;
            message: string;
            timestamp: string;
            read: boolean;
            type?: string;
            refNo?: string;
            entityType?: string | null;
            entityId?: string | null;
          }>).map((n) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            timestamp: n.timestamp,
            read: n.read,
            type: (n.type as SystemNotification['type']) || 'system',
            refNo: n.refNo,
            entityType: n.entityType,
            entityId: n.entityId,
          }));
          const localOnly = prev.filter((p) => !server.some((s) => s.id === p.id));
          return [...server, ...localOnly];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [jwtToken]);

  const handleAddNotification = (notif: SystemNotification) => {
    setNotifications((prev) => [notif, ...prev]);
  };

  const handleMarkAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (!jwtToken) return;
    void fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwtToken}`, 'Content-Type': 'application/json' },
    }).catch(() => undefined);
  };

  const handleNotificationOpen = (notification: SystemNotification) => {
    if (jwtToken) {
      void fetch(`/api/notifications/${encodeURIComponent(notification.id)}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtToken}`, 'Content-Type': 'application/json' },
      }).catch(() => undefined);
    }
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    const entityId = notification.entityId;
    if (!entityId) return;
    if (shellMode === 'customer') {
      navigate(customerInquiryDetailPath(entityId));
      return;
    }
    navigate(internalPathForTab('sales_quotations'), { state: { inquiryId: entityId } });
  };

  const costingWorkspace = shellMode !== 'customer' && internalTab === 'costing_pricing' && !onProfile;
  const navbar = !costingWorkspace ? (
    <Navbar
      platformMode={shellMode}
      darkMode={darkMode}
      setDarkMode={setDarkMode}
      onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      notifications={notifications}
      onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
      onNotificationOpen={handleNotificationOpen}
    />
  ) : null;
  const sidebar = (
    <Sidebar
      platformMode={shellMode}
      activeCustomerTab={customerTab}
      activeInternalTab={internalTab}
      isOpenMobile={isMobileSidebarOpen}
      setIsOpenMobile={setIsMobileSidebarOpen}
    />
  );
  const main = (
    <main
      className={`flex-1 min-w-0 ${
        shellMode === 'customer'
          ? 'p-4 sm:p-6 lg:px-7 lg:py-6 space-y-6 bg-brand-surface pb-20 md:pb-6 overflow-x-hidden'
          : internalTab === 'costing_pricing' && !onProfile
            ? 'p-0 bg-brand-surface'
            : 'p-4 sm:p-5 lg:p-6 space-y-5 bg-white'
      }`}
    >
      <div className={costingWorkspace ? '' : 'w-full max-w-[1440px] mx-auto'}>
        {onProfile ? (
          <UserProfilePage />
        ) : shellMode === 'customer' ? (
          <CustomerPortalPages
            selectedCableCode={selectedCableCode}
            onAddNotification={handleAddNotification}
            notifications={notifications}
          />
        ) : (
          <InternalPortalPages
            onAddNotification={handleAddNotification}
            onSetGeneratedCableCode={setSelectedCableCode}
          />
        )}
      </div>
    </main>
  );

  return (
    <div
      className={`min-h-screen ${
        shellMode === 'customer'
          ? 'customer-portal bg-brand-surface text-brand-800'
          : darkMode
            ? 'dark bg-slate-50 text-slate-800'
            : 'bg-white text-slate-800'
      } flex font-sans transition-colors duration-200 selection:bg-blue-500 selection:text-white ${
        shellMode === 'customer' ? 'flex-row' : 'flex-col'
      }`}
    >
      {shellMode === 'customer' ? (
        <>
          {sidebar}
          <div className="flex-1 flex flex-col min-w-0">
            {navbar}
            {main}
            {ENABLE_AI_QUOTATION_ASSISTANT && <AiAssistantWidget onSetCableCode={setSelectedCableCode} />}
            <CustomerBottomNav
              activeTab={customerTab}
              onOpenMenu={() => setIsMobileSidebarOpen(true)}
            />
            <Footer platformMode={shellMode} />
          </div>
        </>
      ) : (
        <>
          {navbar}
          <div className="flex-1 flex max-w-full w-full mx-auto">
            {sidebar}
            {main}
          </div>
          {ENABLE_AI_QUOTATION_ASSISTANT && <AiAssistantWidget onSetCableCode={setSelectedCableCode} />}
          {!costingWorkspace && <Footer platformMode={shellMode} />}
        </>
      )}
    </div>
  );
}

function PublicLoginRoute() {
  const { currentUser, isSessionReady } = useAuth();
  const location = useLocation();

  if (!isSessionReady) {
    return (
      <div className="min-h-screen bg-white text-slate-800 font-sans flex items-center justify-center">
        <p className="text-sm text-slate-500">Restoring your session…</p>
      </div>
    );
  }

  if (currentUser) {
    const decision = resolveShellNavigation({
      isAuthenticated: true,
      user: currentUser,
      pathname: location.pathname,
    });
    if (decision.action === 'redirect') {
      return <Navigate to={decision.to} replace />;
    }
  }

  return <LoginPage />;
}

function AuthenticatedApp() {
  const { currentUser } = useAuth();
  const location = useLocation();

  const decision = resolveShellNavigation({
    isAuthenticated: Boolean(currentUser),
    user: currentUser,
    pathname: location.pathname,
  });

  if (decision.action === 'redirect') {
    return <Navigate to={decision.to} replace />;
  }

  const shellKind = resolveAuthenticatedShellKind(location.pathname);
  if (shellKind === 'v2_customer') {
    return <V2CustomerProductShell />;
  }
  if (shellKind === 'v2_internal') {
    return <V2InternalProductShell />;
  }
  if (shellKind === 'v2_platform') {
    return <V2Shell />;
  }

  return <AuthenticatedShell />;
}

function AppContent() {
  return (
    <>
      <Routes>
        <Route path={UNIFIED_LOGIN_PATH} element={<PublicLoginRoute />} />
        <Route path={LOGIN_PATHS.customer} element={<PublicLoginRoute />} />
        <Route path={LOGIN_PATHS.users} element={<PublicLoginRoute />} />
        <Route path={LOGIN_PATHS.admin} element={<PublicLoginRoute />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AuthenticatedApp />
            </RequireAuth>
          }
        />
      </Routes>
      {/* Overlay login (Navbar / AccessRestricted); standalone page login is LoginPage */}
      <LoginModal />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
