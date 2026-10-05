/**
 * StatCard — the design-system KPI/stat card.
 *
 * The existing `DashboardStatCard` already implements the approved UI Kit stat
 * card exactly (brand-800 label, 24px value, view-all link). Rather than fork
 * a second implementation, the design system re-exports it as `StatCard` so
 * there is ONE source of truth going forward. The original export path keeps
 * working for existing pages.
 */
export {
  DashboardStatCard as StatCard,
  type DashboardStatCardProps as StatCardProps,
  type DashboardStatIcon as StatCardIcon,
} from '../common/DashboardStatCard';
