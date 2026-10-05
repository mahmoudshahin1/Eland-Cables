import { InternalPortalTab, PlatformMode, UserAccount } from '../types';

export type LoginPortalKind = 'customer' | 'users' | 'admin';

export const UNIFIED_LOGIN_PATH = '/login';

/** Bookmark aliases of UNIFIED_LOGIN_PATH. They must not gate post-login experience. */
export const LOGIN_PATHS: Record<LoginPortalKind, string> = {
  customer: '/login/customer',
  users: '/login/users',
  admin: '/login/admin',
};

export interface LoginPortalConfig {
  kind: LoginPortalKind;
  path: string;
  title: string;
  subtitle: string;
  badge: string;
  defaultEmail: string;
  defaultPassword: string;
  platformMode: PlatformMode;
  defaultInternalTab?: InternalPortalTab;
  accentClass: string;
  buttonClass: string;
}

export const LOGIN_PORTAL_CONFIG: Record<LoginPortalKind, LoginPortalConfig> = {
  customer: {
    kind: 'customer',
    path: LOGIN_PATHS.customer,
    title: 'Customer Portal',
    subtitle: 'Sign in to manage inquiries, quotations, and orders.',
    badge: 'B2B Customer Access',
    defaultEmail: 'david.smith@elandcables.com',
    defaultPassword: 'Customer@2026!',
    platformMode: 'customer',
    accentClass: 'text-brand-600',
    buttonClass: 'bg-brand-600 hover:bg-brand-700',
  },
  users: {
    kind: 'users',
    path: LOGIN_PATHS.users,
    title: 'Energya Connect Users',
    subtitle: 'Sign in for Sales, Technical Office, Costing, and Operations.',
    badge: 'Internal User Access',
    defaultEmail: 'm.ahmed@energya.com',
    defaultPassword: 'Sales@2026!',
    platformMode: 'internal',
    defaultInternalTab: 'overview',
    accentClass: 'text-brand-800',
    buttonClass: 'bg-brand-800 hover:bg-brand-900',
  },
  admin: {
    kind: 'admin',
    path: LOGIN_PATHS.admin,
    title: 'Administration Portal',
    subtitle: 'Sign in for platform security, users, roles, and governance.',
    badge: 'System Administration',
    defaultEmail: 'admin@energya.com',
    defaultPassword: 'Admin@2026!',
    platformMode: 'internal',
    defaultInternalTab: 'user_management',
    accentClass: 'text-accent-500',
    buttonClass: 'bg-accent-500 hover:bg-accent-600',
  },
};

export function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

export function isLoginPath(pathname = typeof window !== 'undefined' ? window.location.pathname : '/'): boolean {
  const path = normalizePathname(pathname);
  return path === UNIFIED_LOGIN_PATH || path === LOGIN_PATHS.customer || path === LOGIN_PATHS.users || path === LOGIN_PATHS.admin;
}

export function getLoginPortalFromPath(pathname = typeof window !== 'undefined' ? window.location.pathname : '/'): LoginPortalKind | null {
  const path = normalizePathname(pathname);
  if (path === LOGIN_PATHS.customer) return 'customer';
  if (path === LOGIN_PATHS.users) return 'users';
  if (path === LOGIN_PATHS.admin) return 'admin';
  return null;
}

export function resolveUnauthenticatedPath(pathname: string): string {
  return isLoginPath(pathname) ? normalizePathname(pathname) : UNIFIED_LOGIN_PATH;
}

export function platformModeForUser(user: Pick<UserAccount, 'userType'>): PlatformMode {
  return user.userType === 'customer' ? 'customer' : 'internal';
}

export function isAdminUser(user: UserAccount): boolean {
  return user.userType === 'internal' && Boolean(user.permissions?.userManagement);
}

export function canAccessPlatformMode(user: Pick<UserAccount, 'userType'>, mode: PlatformMode): boolean {
  return platformModeForUser(user) === mode;
}
