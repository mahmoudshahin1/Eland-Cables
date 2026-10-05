/**
 * Responsive conventions for the Energya Connect design system.
 *
 * A single documented source of truth for breakpoints, container widths, and
 * common responsive class recipes so business pages (in later approved phases)
 * stack consistently across desktop / tablet / mobile.
 *
 * Tailwind v4 default breakpoints are used (no custom overrides), restated here
 * so TS/JS code can reason about them without magic numbers.
 */

/** Min-width breakpoints in px, matching Tailwind defaults. */
export const breakpoints = {
  sm: 640, // large phone / small tablet
  md: 768, // tablet — mobile bottom nav hides at/above this
  lg: 1024, // small desktop / landscape tablet
  xl: 1280, // desktop
  '2xl': 1536, // wide desktop
} as const;

export type Breakpoint = keyof typeof breakpoints;

/**
 * Convention: the mobile bottom nav is visible below `md` and hidden at `md+`.
 * Sidebar navigation is the desktop counterpart (>= md).
 */
export const MOBILE_NAV_MAX_BREAKPOINT: Breakpoint = 'md';

/**
 * Reusable class recipes. These are plain strings so they can be spread into
 * `className` without a helper. They intentionally mirror patterns already used
 * across the app so adopting them causes no visual change.
 */
export const responsive = {
  /** Centered page container with responsive horizontal padding. */
  container: 'w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8',

  /** Standard content vertical rhythm. */
  pageStack: 'space-y-4 lg:space-y-6',

  /** KPI/stat grid: 1 col mobile → 2 tablet → 4 desktop (as in the UI Kit). */
  statGrid: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4',

  /** Two-column split that stacks below lg (table + side panel pattern). */
  splitMain: 'flex flex-col lg:flex-row gap-4 items-start',

  /** Bottom padding to clear the fixed mobile nav; no effect at md+. */
  mobileNavSafeArea: 'pb-16 md:pb-0',

  /** Hide on mobile, show at md+ (e.g. desktop sidebar). */
  desktopOnly: 'hidden md:block',

  /** Show on mobile, hide at md+ (e.g. mobile bottom nav wrapper). */
  mobileOnly: 'block md:hidden',
} as const;
