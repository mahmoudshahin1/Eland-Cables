import { CustomerPortalTab, UserAccount } from '../types';

/**
 * Presentation-only customer home navigation.
 * Does not delete routes, APIs, or components for hidden items.
 */
export type CustomerHomeNavId =
  | 'home'
  | 'products'
  | 'my_inquiries'
  | 'quotations'
  | 'orders'
  | 'documents'
  | 'support';

export type CustomerHomeNavItem = {
  id: CustomerHomeNavId;
  label: string;
  tab: CustomerPortalTab;
  /** True when this item shares a tab with another row and should not steal the active highlight. */
  suppressActive?: boolean;
  navState?: { status?: string };
};

export const CUSTOMER_HOME_NAV_ITEMS: CustomerHomeNavItem[] = [
  { id: 'home', label: 'Home', tab: 'dashboard' },
  { id: 'products', label: 'Products', tab: 'products' },
  { id: 'my_inquiries', label: 'My Inquiries', tab: 'price_estimation' },
  { id: 'quotations', label: 'Quotations', tab: 'price_estimation', navState: { status: 'QUOTED' } },
  { id: 'orders', label: 'Orders', tab: 'sales_orders' },
  { id: 'documents', label: 'Documents', tab: 'tds_library' },
  { id: 'support', label: 'Help & Support', tab: 'support' },
];

/** Tabs reachable from customer home nav. Hidden items keep their existing routes. */
export const CUSTOMER_PORTAL_VISIBLE_TABS = new Set<CustomerPortalTab>([
  'dashboard',
  'products',
  'price_estimation',
  'sales_orders',
  'tds_library',
  'support',
]);

/** Labels that must not appear in customer home / sidebar / bottom nav. */
export const CUSTOMER_HOME_HIDDEN_NAV_LABELS = [
  'Cable Configuration',
  'Drum Optimizer',
  'Technical Office',
  'Pricing Rules',
  'Commercial Pricing Rules',
] as const;

export function isCustomerHomeNavHiddenLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return CUSTOMER_HOME_HIDDEN_NAV_LABELS.some((hidden) => hidden.toLowerCase() === normalized);
}

const NAME_TITLES = new Set(['eng', 'eng.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'dr', 'dr.']);

function nameParts(fullName?: string | null): string[] {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const withoutTitle = parts.filter((part) => !NAME_TITLES.has(part.toLowerCase()));
  return withoutTitle.length ? withoutTitle : parts;
}

/** First name for "Welcome back, {firstName}!" from the authenticated user's full name. */
export function customerFirstName(fullName?: string | null): string {
  return nameParts(fullName)[0] || '';
}

/** Two-letter initials for the customer header avatar. */
export function customerInitials(fullName?: string | null): string {
  const parts = nameParts(fullName);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  const single = parts[0] || '';
  return (single.slice(0, 2) || '?').toUpperCase();
}

/** Header display name without courtesy titles (e.g. "David Smith"). */
export function customerHeaderName(fullName?: string | null): string {
  return nameParts(fullName).join(' ') || String(fullName || '').trim();
}

/** Company identity from Customer Master (`Customer.name` via /api/auth/me). */
export function customerCompanyDisplayName(
  user: Pick<UserAccount, 'companyName'> | null | undefined
): string {
  return String(user?.companyName || '').trim();
}

/**
 * Header subtitle from Customer Master. Prefers `companyTagline` (membership line).
 * Falls back to legal name only when it differs from the trading name.
 */
export function customerCompanyDescriptor(
  user: Pick<UserAccount, 'companyName' | 'companyLegalName' | 'companyTagline'> | null | undefined
): string {
  const tagline = String(user?.companyTagline || '').trim();
  if (tagline) return tagline;
  const legal = String(user?.companyLegalName || '').trim();
  const name = customerCompanyDisplayName(user);
  if (!legal || legal.toLowerCase() === name.toLowerCase()) return '';
  return legal;
}

/**
 * Customer company logo URL from Customer Master (`companyLogoUrl` via /api/auth/me).
 * Returns null when the customer has no uploaded logo — callers must use a generic
 * placeholder, never the Energya lockup.
 */
export function customerLogoUrl(
  user: Partial<Pick<UserAccount, 'companyLogoUrl' | 'companyName'>> | null | undefined
): string | null {
  const url = String(user?.companyLogoUrl || '').trim();
  return url || null;
}

export type CustomerBrandLogo =
  | { kind: 'uploaded'; url: string }
  | { kind: 'placeholder' };

/** Resolves customer chrome logo. Never returns the Energya lockup. */
export function resolveCustomerBrandLogo(
  user: Partial<Pick<UserAccount, 'companyLogoUrl' | 'companyName'>> | null | undefined
): CustomerBrandLogo {
  const url = customerLogoUrl(user);
  if (url) return { kind: 'uploaded', url };
  return { kind: 'placeholder' };
}

export type CustomerProductCategory = {
  id: string;
  label: string;
  familyFilter: string;
  catalogCategory?: 'POWER' | 'CONTROL' | 'INSTRUMENTATION' | 'LV' | 'MV' | 'SPECIAL';
  imageSrc?: string;
};

/** Presentation catalog strip for customer home. Static photos, not Cable Master rows. */
export const CUSTOMER_HOME_CATEGORY_TILES: CustomerProductCategory[] = [
  {
    id: 'power',
    label: 'Power Cables',
    familyFilter: 'LV',
    catalogCategory: 'POWER',
    imageSrc: '/customer-home/categories/power-cables.jpg',
  },
  {
    id: 'control',
    label: 'Control Cables',
    familyFilter: 'Control',
    catalogCategory: 'CONTROL',
    imageSrc: '/customer-home/categories/control-cables.jpg',
  },
  {
    id: 'instrumentation',
    label: 'Instrumentation Cables',
    familyFilter: 'Control',
    catalogCategory: 'INSTRUMENTATION',
    imageSrc: '/customer-home/categories/instrumentation-cables.jpg',
  },
  {
    id: 'lv',
    label: 'LV Cables',
    familyFilter: 'LV',
    catalogCategory: 'LV',
    imageSrc: '/customer-home/categories/lv-cables.jpg',
  },
  {
    id: 'mv',
    label: 'MV Cables',
    familyFilter: 'MV',
    catalogCategory: 'MV',
    imageSrc: '/customer-home/categories/mv-cables.jpg',
  },
  {
    id: 'special',
    label: 'Special Cables',
    familyFilter: 'Control',
    catalogCategory: 'SPECIAL',
    imageSrc: '/customer-home/categories/special-cables.jpg',
  },
];

type CategoryRule = CustomerProductCategory & {
  test: (blob: string) => boolean;
};

const PRODUCT_CATEGORY_RULES: CategoryRule[] = [
  {
    id: 'power',
    label: 'Power Cables',
    familyFilter: 'LV',
    test: (blob) => /\bpower\b/.test(blob) && !/\bcontrol\b/.test(blob) && !/\binstrument/.test(blob),
  },
  {
    id: 'control',
    label: 'Control Cables',
    familyFilter: 'Control',
    test: (blob) => /\bcontrol\b/.test(blob),
  },
  {
    id: 'instrumentation',
    label: 'Instrumentation Cables',
    familyFilter: 'Control',
    test: (blob) => /\binstrument/.test(blob),
  },
  {
    id: 'lv',
    label: 'LV Cables',
    familyFilter: 'LV',
    test: (blob) => /\blv\b|\blow voltage\b|l\.v|0\.6\/1|600\/1000/.test(blob),
  },
  {
    id: 'mv',
    label: 'MV Cables',
    familyFilter: 'MV',
    test: (blob) => /\bmv\b|\bmedium voltage\b|m\.v|\b11 kv\b|\b33 kv\b|6\/10|8\.7\/15|12\/20|18\/30/.test(blob),
  },
  {
    id: 'special',
    label: 'Special Cables',
    familyFilter: 'Control',
    test: (blob) => /\bspecial\b|\bfire\b|\blszh\b|\bohtl\b|\boverhead\b/.test(blob),
  },
];

export type CustomerProductCategorySource = {
  family?: string | null;
  voltageClass?: string | null;
  description?: string | null;
};

/**
 * Lightweight product-category tiles from real Cable Master family/voltage/description.
 * Does not invent catalog rows. Falls back to distinct stored family values when rules miss.
 */
export function deriveCustomerProductCategories(
  cables: CustomerProductCategorySource[]
): CustomerProductCategory[] {
  if (!cables.length) return [];
  const matched = PRODUCT_CATEGORY_RULES.filter((rule) =>
    cables.some((cable) =>
      rule.test(`${cable.family || ''} ${cable.voltageClass || ''} ${cable.description || ''}`.toLowerCase())
    )
  ).map(({ id, label, familyFilter }) => ({ id, label, familyFilter }));
  if (matched.length) return matched;

  const families = [
    ...new Set(
      cables
        .map((cable) => String(cable.family || cable.voltageClass || '').trim())
        .filter(Boolean)
    ),
  ].slice(0, 6);
  return families.map((family) => ({
    id: family.toLowerCase().replace(/\s+/g, '-'),
    label: /cables?$/i.test(family) ? family : `${family} Cables`,
    familyFilter: family,
  }));
}
