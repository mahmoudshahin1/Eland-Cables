import { CustomerPortalTab, InternalPortalTab, ModulePermissions, UserAccount } from '../types';
import { UNIFIED_LOGIN_PATH, isLoginPath, platformModeForUser } from '../auth/loginRoutes';
import { CUSTOMER_PORTAL_VISIBLE_TABS } from './customerPortalNav';

export const CUSTOMER_HOME_PATH = '/customer';
export const INTERNAL_HOME_PATH = '/internal';
export const V2_HOME_PATH = '/v2';
export const V2_CUSTOMER_HOME_PATH = '/v2/customer';
export const V2_CUSTOMER_INQUIRIES_PATH = `${V2_CUSTOMER_HOME_PATH}/inquiries`;
export const V2_INTERNAL_HOME_PATH = '/v2/internal';

export function v2CustomerInquiryDetailPath(inquiryId: string): string {
  return `${V2_CUSTOMER_INQUIRIES_PATH}/${encodeURIComponent(inquiryId)}`;
}

export function v2CustomerInquiryIdFromPath(pathname: string): string | null {
  const path = normalizeAppPath(pathname);
  const prefix = `${V2_CUSTOMER_INQUIRIES_PATH}/`;
  if (!path.startsWith(prefix) || path === V2_CUSTOMER_INQUIRIES_PATH) return null;
  const id = path.slice(prefix.length);
  return id ? decodeURIComponent(id) : null;
}

export const CUSTOMER_PROFILE_PATH = '/customer/profile';
export const INTERNAL_PROFILE_PATH = '/internal/profile';
export const CUSTOMER_INQUIRIES_PATH = '/customer/inquiries';
export const CUSTOMER_PRODUCTS_PATH = '/customer/products';

export function customerProductsPath(category?: string | null): string {
  if (!category) return CUSTOMER_PRODUCTS_PATH;
  const params = new URLSearchParams({ category: String(category).toUpperCase() });
  return `${CUSTOMER_PRODUCTS_PATH}?${params.toString()}`;
}

export function customerInquiryDetailPath(inquiryId: string): string {
  return `${CUSTOMER_INQUIRIES_PATH}/${encodeURIComponent(inquiryId)}`;
}

export function customerInquiryIdFromPath(pathname: string): string | null {
  const path = normalizeAppPath(pathname);
  const prefix = `${CUSTOMER_INQUIRIES_PATH}/`;
  if (!path.startsWith(prefix) || path === CUSTOMER_INQUIRIES_PATH) return null;
  const id = path.slice(prefix.length);
  return id ? decodeURIComponent(id) : null;
}

export function isCustomerInquiryDetailPath(pathname: string): boolean {
  return customerInquiryIdFromPath(pathname) != null;
}

export const CUSTOMER_TAB_PATHS: Record<CustomerPortalTab, string> = {
  dashboard: '/customer',
  products: '/customer/products',
  price_estimation: '/customer/inquiries',
  sales_orders: '/customer/sales-orders',
  drum_optimizer: '/customer/drum-optimizer',
  statement: '/customer/statement',
  invoices: '/customer/invoices',
  shipment_tracking: '/customer/shipments',
  tds_library: '/customer/documents',
  support: '/customer/support',
  process: '/customer/process',
  journey: '/customer/journey',
  configurator: '/customer',
  production_tracking: '/customer',
};

export const INTERNAL_TAB_PATHS: Record<InternalPortalTab, string> = {
  overview: '/internal',
  technical_office: '/internal/technical-office',
  cable_configurator: '/internal/cable-parameters',
  costing_pricing: '/internal/costing',
  sales_quotations: '/internal/quotations',
  sales_orders: '/internal/sales-orders',
  orders_production: '/internal/production',
  shipments_logistics: '/internal/logistics',
  finance_collections: '/internal/finance',
  master_data: '/internal/master-data',
  reports_analytics: '/internal/analytics',
  user_management: '/internal/administration',
};

const CUSTOMER_PATH_ALIASES: Record<string, CustomerPortalTab> = {
  '/customer': 'dashboard',
  '/customer/dashboard': 'dashboard',
  '/customer/products': 'products',
  '/customer/inquiries': 'price_estimation',
  '/customer/price-estimation': 'price_estimation',
  '/customer/sales-orders': 'sales_orders',
  '/customer/drum-optimizer': 'drum_optimizer',
  '/customer/statement': 'statement',
  '/customer/customer-statement': 'statement',
  '/customer/invoices': 'invoices',
  '/customer/shipments': 'shipment_tracking',
  '/customer/shipment-tracking': 'shipment_tracking',
  '/customer/documents': 'tds_library',
  '/customer/tds': 'tds_library',
  '/customer/support': 'support',
  '/customer/support-desk': 'support',
  '/customer/process': 'process',
  '/customer/journey': 'journey',
};

const INTERNAL_PATH_ALIASES: Record<string, InternalPortalTab> = {
  '/internal': 'overview',
  '/internal/dashboard': 'overview',
  '/internal/overview': 'overview',
  '/internal/technical-office': 'technical_office',
  '/internal/cable-parameters': 'cable_configurator',
  '/internal/cable-configurator': 'cable_configurator',
  '/internal/costing': 'costing_pricing',
  '/internal/costing-calculator': 'costing_pricing',
  '/internal/quotations': 'sales_quotations',
  '/internal/sales-quotations': 'sales_quotations',
  '/internal/sales-orders': 'sales_orders',
  '/internal/sales-agreements': 'sales_orders',
  '/internal/fulfillment': 'sales_orders',
  '/internal/production': 'orders_production',
  '/internal/logistics': 'shipments_logistics',
  '/internal/finance': 'finance_collections',
  '/internal/master-data': 'master_data',
  '/internal/analytics': 'reports_analytics',
  '/internal/reports': 'reports_analytics',
  '/internal/administration': 'user_management',
  '/internal/admin': 'user_management',
};

export const INTERNAL_TAB_PERMISSION: Record<InternalPortalTab, keyof ModulePermissions> = {
  overview: 'overview',
  technical_office: 'technicalOffice',
  cable_configurator: 'overview',
  costing_pricing: 'costingPricing',
  sales_quotations: 'salesQuotations',
  sales_orders: 'salesQuotations',
  orders_production: 'ordersProduction',
  shipments_logistics: 'ordersProduction',
  finance_collections: 'financeCollections',
  master_data: 'masterData',
  reports_analytics: 'reportsAnalytics',
  user_management: 'userManagement',
};

const ELAND_ALLOWED_TABS = CUSTOMER_PORTAL_VISIBLE_TABS;

export function normalizeAppPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function customerPathForTab(tab: CustomerPortalTab): string {
  return CUSTOMER_TAB_PATHS[tab] || CUSTOMER_HOME_PATH;
}

export function internalPathForTab(tab: InternalPortalTab): string {
  return INTERNAL_TAB_PATHS[tab] || INTERNAL_HOME_PATH;
}

export function customerTabFromPath(pathname: string): CustomerPortalTab | null {
  const path = normalizeAppPath(pathname);
  if (isCustomerInquiryDetailPath(path)) return 'price_estimation';
  return CUSTOMER_PATH_ALIASES[path] ?? null;
}

export function internalTabFromPath(pathname: string): InternalPortalTab | null {
  return INTERNAL_PATH_ALIASES[normalizeAppPath(pathname)] ?? null;
}

export function isCustomerAppPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === '/customer' || path.startsWith('/customer/');
}

export function isInternalAppPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === '/internal' || path.startsWith('/internal/');
}

export function isV2AppPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === '/v2' || path.startsWith('/v2/');
}

/** B2B customer product shell — not `/v2/modules/customer`. */
export function isV2CustomerProductPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === V2_CUSTOMER_HOME_PATH || path.startsWith(`${V2_CUSTOMER_HOME_PATH}/`);
}

/** Internal product shell — not the Task 02/03 platform navigator. */
export function isV2InternalProductPath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === V2_INTERNAL_HOME_PATH || path.startsWith(`${V2_INTERNAL_HOME_PATH}/`);
}

/** Existing `/v2` platform navigator (home, security, master-data, modules). */
export function isV2PlatformPath(pathname: string): boolean {
  return isV2AppPath(pathname) && !isV2CustomerProductPath(pathname) && !isV2InternalProductPath(pathname);
}

export type AuthenticatedShellKind = 'v2_customer' | 'v2_internal' | 'v2_platform' | 'v1';

/** Split used by AuthenticatedApp: product shells above V2Shell. */
export function resolveAuthenticatedShellKind(pathname: string): AuthenticatedShellKind {
  if (isV2CustomerProductPath(pathname)) return 'v2_customer';
  if (isV2InternalProductPath(pathname)) return 'v2_internal';
  if (isV2AppPath(pathname)) return 'v2_platform';
  return 'v1';
}

export function defaultHomePath(user: Pick<UserAccount, 'userType'>): string {
  return platformModeForUser(user) === 'customer' ? CUSTOMER_HOME_PATH : INTERNAL_HOME_PATH;
}

export function profilePathForUser(user: Pick<UserAccount, 'userType'>): string {
  return platformModeForUser(user) === 'customer' ? CUSTOMER_PROFILE_PATH : INTERNAL_PROFILE_PATH;
}

export function isProfilePath(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === CUSTOMER_PROFILE_PATH || path === INTERNAL_PROFILE_PATH;
}

export const NO_APPLICATION_ACCESS_MESSAGE =
  'Your account is authenticated, but no application access has been assigned. Please contact your administrator.';

export const NO_CUSTOMER_ASSOCIATION_MESSAGE =
  'Your account is authenticated, but no customer has been assigned. Please contact your administrator.';

export type CustomerAssociationStatus = 'internal' | 'resolved' | 'none' | 'ambiguous';

export type PostLoginDestination =
  | { ok: true; path: string }
  | { ok: false; reason: 'no_application_access' | 'no_customer_association' | 'ambiguous_customer'; message: string };

/** Canonical customer association is CustomerUser (customerMasterIds from getMe). */
export function customerAssociationStatus(
  user: Pick<UserAccount, 'userType' | 'customerCode' | 'companyName' | 'customerId' | 'customerMasterIds'>
): CustomerAssociationStatus {
  if (user.userType !== 'customer') return 'internal';
  if (Array.isArray(user.customerMasterIds)) {
    const ids = user.customerMasterIds.filter((id) => Boolean(id && String(id).trim()));
    if (ids.length === 1) return 'resolved';
    if (ids.length > 1) return 'ambiguous';
    return 'none';
  }
  return 'resolved';
}

/**
 * Post-login destination from the authenticated account, never from a login-page portal toggle.
 * Dedicated /login/customer|/users|/admin URLs are aliases and must not change this result.
 */
export function resolvePostLoginDestination(user: UserAccount): PostLoginDestination {
  if (user.userType === 'internal') {
    return { ok: true, path: INTERNAL_HOME_PATH };
  }
  if (user.userType === 'customer') {
    const association = customerAssociationStatus(user);
    if (association === 'none') {
      return { ok: false, reason: 'no_customer_association', message: NO_CUSTOMER_ASSOCIATION_MESSAGE };
    }
    if (association === 'ambiguous') {
      return { ok: false, reason: 'ambiguous_customer', message: NO_APPLICATION_ACCESS_MESSAGE };
    }
    return { ok: true, path: CUSTOMER_HOME_PATH };
  }
  return { ok: false, reason: 'no_application_access', message: NO_APPLICATION_ACCESS_MESSAGE };
}

export function postLoginPath(user: UserAccount): string {
  const dest = resolvePostLoginDestination(user);
  return dest.ok ? dest.path : UNIFIED_LOGIN_PATH;
}

export function isPostLoginBlocked(
  dest: PostLoginDestination
): dest is Extract<PostLoginDestination, { ok: false }> {
  return dest.ok === false;
}

export function isElandCustomer(user: Pick<UserAccount, 'userType' | 'companyName' | 'email' | 'userName'> | null | undefined): boolean {
  if (!user || user.userType !== 'customer') return false;
  const hay = `${user.companyName || ''} ${user.email || ''} ${user.userName || ''}`.toLowerCase();
  return hay.includes('eland');
}

export function isCustomerTabAllowed(user: UserAccount, tab: CustomerPortalTab): boolean {
  if (tab === 'configurator') return false;
  if (isElandCustomer(user) && !ELAND_ALLOWED_TABS.has(tab)) return false;
  return true;
}

export type ShellNavDecision =
  | { action: 'allow' }
  | { action: 'redirect'; to: string };

export function resolveShellNavigation(args: {
  isAuthenticated: boolean;
  user?: UserAccount | null;
  pathname: string;
}): ShellNavDecision {
  const path = normalizeAppPath(args.pathname);

  if (!args.isAuthenticated || !args.user) {
    if (isLoginPath(path)) return { action: 'allow' };
    return { action: 'redirect', to: UNIFIED_LOGIN_PATH };
  }

  const dest = resolvePostLoginDestination(args.user);
  if (!dest.ok) {
    if (isLoginPath(path)) return { action: 'allow' };
    return { action: 'redirect', to: UNIFIED_LOGIN_PATH };
  }

  if (isLoginPath(path) || path === '/') {
    return { action: 'redirect', to: dest.path };
  }

  if (args.user.userType === 'customer') {
    if (isInternalAppPath(path) || isV2AppPath(path)) {
      return { action: 'redirect', to: CUSTOMER_HOME_PATH };
    }
    if (path === CUSTOMER_PROFILE_PATH || isCustomerInquiryDetailPath(path)) {
      return { action: 'allow' };
    }
    const tab = customerTabFromPath(path);
    if (!tab) {
      return { action: 'redirect', to: CUSTOMER_HOME_PATH };
    }
    if (!isCustomerTabAllowed(args.user, tab)) {
      return { action: 'redirect', to: CUSTOMER_HOME_PATH };
    }
    return { action: 'allow' };
  }

  if (isCustomerAppPath(path)) {
    return { action: 'redirect', to: INTERNAL_HOME_PATH };
  }
  if (isV2CustomerProductPath(path)) {
    return { action: 'redirect', to: V2_INTERNAL_HOME_PATH };
  }
  if (isV2AppPath(path)) {
    return { action: 'allow' };
  }
  if (path === INTERNAL_PROFILE_PATH) {
    return { action: 'allow' };
  }
  const tab = internalTabFromPath(path);
  if (!tab) {
    return { action: 'redirect', to: INTERNAL_HOME_PATH };
  }
  return { action: 'allow' };
}

export function firstAuthorizedInternalTab(
  hasPermission: (key: keyof ModulePermissions) => boolean
): InternalPortalTab {
  const order = Object.keys(INTERNAL_TAB_PERMISSION) as InternalPortalTab[];
  return order.find((tab) => hasPermission(INTERNAL_TAB_PERMISSION[tab])) || 'overview';
}
