/**
 * V2 Module Information Architecture — surfaces, nav, workspace contracts.
 * Organizational only; does not invent second authorities or fake GAP screens.
 */

import {
  getModuleById,
  listNavigableModules,
  PLATFORM_MODULE_REGISTRY,
  type ModuleCategory,
  type ModuleStatus,
  type ModuleSurfaceKind,
  type PlatformModuleDefinition,
  type SurfaceAvailability,
  NAV_VISIBLE_STATUSES,
} from './moduleRegistry';
import { entitiesOwnedBy, ownershipForEntity, type DataOwnershipRow } from './dataOwnershipMatrix';

export type { ModuleSurfaceKind, ModuleCategory, ModuleStatus, SurfaceAvailability };
export const MODULE_SURFACE_ORDER: ModuleSurfaceKind[] = [
  'workspace',
  'master',
  'transactions',
  'setup',
  'workflows',
  'reports',
  'dashboards',
];

export const MODULE_SURFACE_LABELS: Record<ModuleSurfaceKind, string> = {
  workspace: 'Workspace',
  master: 'Master Data',
  transactions: 'Transactions',
  setup: 'Setup',
  workflows: 'Workflows',
  reports: 'Reports',
  dashboards: 'Dashboards',
};

export const MODULE_CATEGORY_ORDER: ModuleCategory[] = [
  'PLATFORM',
  'CORE',
  'COMMERCIAL',
  'ENGINEERING',
  'SUPPLY_CHAIN',
  'FINANCE',
  'SUPPORT',
];

export const MODULE_CATEGORY_LABELS: Record<ModuleCategory, string> = {
  PLATFORM: 'Platform',
  CORE: 'Core',
  COMMERCIAL: 'Commercial',
  ENGINEERING: 'Engineering',
  SUPPLY_CHAIN: 'Supply Chain',
  FINANCE: 'Finance',
  SUPPORT: 'Support',
};

/** Statuses that may host operational V2 workspaces (not informational-only). */
export const OPERATIONAL_STATUSES: ReadonlySet<ModuleStatus> = NAV_VISIBLE_STATUSES;

/** Surfaces that may appear in secondary nav (not N_A / PLANNED-only placeholders). */
export const NAV_SURFACE_AVAILABILITIES: ReadonlySet<SurfaceAvailability> = new Set([
  'IMPLEMENTED',
  'PARTIAL',
]);

export interface ModuleMasterEntityLink {
  entityCode: string;
  label: string;
  path: string;
  ownerModuleId: string;
  permissions: string[];
  scope: 'GLOBAL' | 'CUSTOMER' | 'INTERNAL';
  v1Path?: string;
}

export interface ModuleSurfaceNavItem {
  surface: ModuleSurfaceKind;
  label: string;
  path: string;
  availability: SurfaceAvailability;
  /** Extra deep-links under this surface (e.g. Engineering → Cables / Params / Drums). */
  children?: Array<{
    id: string;
    label: string;
    path: string;
    entityCode?: string;
    v1Path?: string;
  }>;
}

export interface ModulePrimaryAction {
  id: string;
  label: string;
  href: string;
  permissionHint?: string;
  kind: 'v2' | 'v1' | 'external';
}

export type WorkspaceKpiAvailability = 'LIVE' | 'NOT_AVAILABLE';

export interface WorkspaceKpiSpec {
  id: string;
  label: string;
  availability: WorkspaceKpiAvailability;
  /** API path that supplies the value when LIVE; never invent counts. */
  sourceApi?: string;
  notes?: string;
}

export interface ModuleWorkspaceContract {
  moduleId: string;
  displayName: string;
  status: ModuleStatus;
  category: ModuleCategory;
  header: {
    title: string;
    subtitle: string;
    status: ModuleStatus;
  };
  summary: string;
  kpis: WorkspaceKpiSpec[];
  recentActivity: { availability: WorkspaceKpiAvailability; sourceApi?: string; notes?: string };
  primaryActions: ModulePrimaryAction[];
  surfaces: ModuleSurfaceNavItem[];
  masterEntities: ModuleMasterEntityLink[];
  permissions: string[];
  search: { structural: boolean; notes: string };
  ownershipRows: DataOwnershipRow[];
  v1Entry: string | null;
  invariants: string[];
}

function v2ModulePath(moduleId: string, ...parts: string[]): string {
  const base = `/v2/modules/${moduleId.toLowerCase()}`;
  if (!parts.length) return base;
  return `${base}/${parts.map((p) => p.replace(/^\//, '')).join('/')}`;
}

/** Master-data deep links per owning module — wraps existing V1 screens; no rebuild. */
export function masterEntityLinksForModule(moduleId: string): ModuleMasterEntityLink[] {
  const id = moduleId.toUpperCase();
  switch (id) {
    case 'CUSTOMER':
      return [
        {
          entityCode: 'Customer',
          label: 'Customers',
          path: v2ModulePath('CUSTOMER', 'master', 'customers'),
          ownerModuleId: 'CUSTOMER',
          permissions: ['ADMIN:CUSTOMER:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/administration',
        },
        {
          entityCode: 'CustomerUser',
          label: 'Customer Users',
          path: v2ModulePath('CUSTOMER', 'master', 'customer-users'),
          ownerModuleId: 'CUSTOMER',
          permissions: ['ADMIN:CUSTOMER_USER:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/administration',
        },
      ];
    case 'CABLE_MASTER':
    case 'ENGINEERING':
      return [
        {
          entityCode: 'CableMaster',
          label: 'Cables',
          path: v2ModulePath('ENGINEERING', 'master', 'cables'),
          ownerModuleId: 'CABLE_MASTER',
          permissions: ['CABLE:CABLE_MASTER:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/master-data',
        },
        {
          entityCode: 'CableParameter',
          label: 'Parameters',
          path: v2ModulePath('ENGINEERING', 'master', 'parameters'),
          ownerModuleId: 'CABLE_MASTER',
          permissions: ['CABLE:CABLE_MASTER:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/cable-parameters',
        },
        {
          entityCode: 'DrumMaster',
          label: 'Drums',
          path: v2ModulePath('ENGINEERING', 'master', 'drums'),
          ownerModuleId: 'CABLE_MASTER',
          permissions: ['CABLE:CABLE_MASTER:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/master-data',
        },
        {
          entityCode: 'CableBomLine',
          label: 'BOM',
          path: v2ModulePath('BOM', 'master', 'boms'),
          ownerModuleId: 'BOM',
          permissions: ['BOM:BOM_CONFLICT:VIEW', 'CABLE:CABLE_MASTER:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/master-data',
        },
      ];
    case 'BOM':
      return [
        {
          entityCode: 'CableBomLine',
          label: 'Approved BOM',
          path: v2ModulePath('BOM', 'master', 'boms'),
          ownerModuleId: 'BOM',
          permissions: ['BOM:BOM_CONFLICT:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/technical-office',
        },
        {
          entityCode: 'GovernedBomLine',
          label: 'Governed BOM / Conflicts',
          path: v2ModulePath('BOM', 'master', 'conflicts'),
          ownerModuleId: 'BOM',
          permissions: ['BOM:BOM_CONFLICT:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/technical-office',
        },
      ];
    case 'COSTING':
      return [
        {
          entityCode: 'CostingFormula',
          label: 'Costing Formulas',
          path: v2ModulePath('COSTING', 'master', 'formulas'),
          ownerModuleId: 'COSTING',
          permissions: ['COSTING:FORMULA:VIEW'],
          scope: 'INTERNAL',
          v1Path: '/internal/costing',
        },
        {
          entityCode: 'RawMaterialPrice',
          label: 'RM Prices',
          path: v2ModulePath('COSTING', 'master', 'rm-prices'),
          ownerModuleId: 'COSTING',
          permissions: ['COSTING:PRICE:VIEW'],
          scope: 'INTERNAL',
          v1Path: '/internal/costing',
        },
      ];
    case 'PRICING':
      return [
        {
          entityCode: 'CommercialPricingRule',
          label: 'Pricing Rules',
          path: v2ModulePath('PRICING', 'master', 'rules'),
          ownerModuleId: 'PRICING',
          permissions: ['COMMERCIAL:PRICING_RULE:VIEW'],
          scope: 'INTERNAL',
          v1Path: '/internal/quotations',
        },
      ];
    case 'MASTER_DATA':
      return [
        {
          entityCode: 'ImportBatch',
          label: 'Import Batches',
          path: v2ModulePath('MASTER_DATA', 'master', 'imports'),
          ownerModuleId: 'MASTER_DATA',
          permissions: ['CABLE:CABLE_MASTER:IMPORT'],
          scope: 'INTERNAL',
          v1Path: '/internal/master-data',
        },
        {
          entityCode: 'RawMaterial',
          label: 'Raw Materials',
          path: v2ModulePath('MASTER_DATA', 'master', 'raw-materials'),
          ownerModuleId: 'MASTER_DATA',
          permissions: ['CABLE:CABLE_MASTER:VIEW'],
          scope: 'GLOBAL',
          v1Path: '/internal/master-data',
        },
      ];
    case 'ADMIN':
      return [
        {
          entityCode: 'UserAccount',
          label: 'Users',
          path: v2ModulePath('ADMIN', 'master', 'users'),
          ownerModuleId: 'ADMIN',
          permissions: ['ADMIN:USER:VIEW'],
          scope: 'INTERNAL',
          v1Path: '/internal/administration',
        },
        {
          entityCode: 'Role',
          label: 'Roles',
          path: v2ModulePath('ADMIN', 'master', 'roles'),
          ownerModuleId: 'SECURITY',
          permissions: ['ADMIN:ROLE:VIEW'],
          scope: 'INTERNAL',
          v1Path: '/internal/administration',
        },
      ];
    default:
      return entitiesOwnedBy(id).map((row) => ({
        entityCode: row.entity,
        label: row.entity,
        path: v2ModulePath(id, 'master', row.entity.toLowerCase()),
        ownerModuleId: row.ownerModuleId,
        permissions: [],
        scope: 'INTERNAL' as const,
      }));
  }
}

function surfaceChildren(
  moduleId: string,
  surface: ModuleSurfaceKind
): ModuleSurfaceNavItem['children'] {
  if (surface !== 'master') return undefined;
  const links = masterEntityLinksForModule(moduleId);
  if (!links.length) return undefined;
  return links.map((l) => ({
    id: l.entityCode,
    label: l.label,
    path: l.path,
    entityCode: l.entityCode,
    v1Path: l.v1Path,
  }));
}

export function buildModuleSurfaceNav(mod: PlatformModuleDefinition): ModuleSurfaceNavItem[] {
  return MODULE_SURFACE_ORDER.filter((surface) =>
    NAV_SURFACE_AVAILABILITIES.has(mod.surfaces[surface])
  ).map((surface) => ({
    surface,
    label: MODULE_SURFACE_LABELS[surface],
    path: surface === 'workspace' ? v2ModulePath(mod.moduleId) : v2ModulePath(mod.moduleId, surface),
    availability: mod.surfaces[surface],
    children: surfaceChildren(mod.moduleId, surface),
  }));
}

function kpisForModule(moduleId: string): WorkspaceKpiSpec[] {
  switch (moduleId.toUpperCase()) {
    case 'ADMIN':
      return [
        {
          id: 'users',
          label: 'Users',
          availability: 'LIVE',
          sourceApi: '/api/admin/security',
        },
        {
          id: 'roles',
          label: 'Roles',
          availability: 'LIVE',
          sourceApi: '/api/admin/security',
        },
      ];
    case 'CUSTOMER':
      return [
        {
          id: 'customers',
          label: 'Customers',
          availability: 'LIVE',
          sourceApi: '/api/admin/customers',
          notes: 'Count from list total — no synthetic KPI.',
        },
      ];
    case 'COSTING':
      return [
        {
          id: 'costing_readiness',
          label: 'Costing readiness',
          availability: 'LIVE',
          sourceApi: '/api/admin/costing/readiness/summary',
        },
      ];
    case 'INQUIRY_QUOTATION':
      return [
        {
          id: 'open_inquiries',
          label: 'Open inquiries',
          availability: 'NOT_AVAILABLE',
          notes: 'No dedicated KPI endpoint — use V1 quotations workspace.',
        },
      ];
    case 'SALES':
    case 'COMMERCIAL':
      return [
        {
          id: 'fulfillment',
          label: 'Fulfillment queue',
          availability: 'NOT_AVAILABLE',
          notes: 'Frozen domain — open V1 fulfillment workspace for live queues.',
        },
      ];
    case 'REPORTING':
    case 'ANALYTICS':
      return [
        {
          id: 'platform_kpis',
          label: 'Platform KPIs',
          availability: 'LIVE',
          sourceApi: '/api/admin/platform/dashboard/kpis',
          notes: 'Whitelist KPIs only — no invented ERP connectivity.',
        },
      ];
    default:
      return [
        {
          id: 'module_status',
          label: 'Module status',
          availability: 'NOT_AVAILABLE',
          notes: 'No live KPI endpoint registered for this module.',
        },
      ];
  }
}

function primaryActionsForModule(mod: PlatformModuleDefinition): ModulePrimaryAction[] {
  const actions: ModulePrimaryAction[] = [
    {
      id: 'open_workspace',
      label: `${mod.displayName} workspace`,
      href: v2ModulePath(mod.moduleId),
      kind: 'v2',
    },
  ];
  if (mod.surfaces.master === 'IMPLEMENTED' || mod.surfaces.master === 'PARTIAL') {
    actions.push({
      id: 'open_master',
      label: 'Master Data',
      href: v2ModulePath(mod.moduleId, 'master'),
      kind: 'v2',
    });
  }
  const legacy = (mod as PlatformModuleDefinition & { legacyWorkspaceEntry?: string | null })
    .legacyWorkspaceEntry;
  const v1 = legacy || (mod.workspaceEntry?.startsWith('/internal') || mod.workspaceEntry?.startsWith('/customer')
    ? mod.workspaceEntry
    : null);
  if (v1) {
    actions.push({
      id: 'open_v1',
      label: 'Open V1 screen',
      href: v1,
      kind: 'v1',
    });
  }
  return actions;
}

export function buildModuleWorkspaceContract(moduleId: string): ModuleWorkspaceContract | null {
  const mod = getModuleById(moduleId.toUpperCase());
  if (!mod) return null;
  const surfaces = buildModuleSurfaceNav(mod);
  const masterEntities = masterEntityLinksForModule(mod.moduleId);
  const ownershipRows = entitiesOwnedBy(mod.moduleId);
  const legacy =
    (mod as PlatformModuleDefinition & { legacyWorkspaceEntry?: string | null }).legacyWorkspaceEntry ||
    (mod.workspaceEntry && !mod.workspaceEntry.startsWith('/v2') ? mod.workspaceEntry : null);

  return {
    moduleId: mod.moduleId,
    displayName: mod.displayName,
    status: mod.status,
    category: mod.category,
    header: {
      title: mod.displayName,
      subtitle: `${MODULE_CATEGORY_LABELS[mod.category]} · ${mod.moduleId}`,
      status: mod.status,
    },
    summary:
      mod.notes ||
      `ERP module surfaces: ${surfaces.map((s) => s.label).join(', ') || 'none navigable'}. ` +
        `Status ${mod.status}; only LIVE/PARTIAL/FROZEN modules are operational.`,
    kpis: OPERATIONAL_STATUSES.has(mod.status) ? kpisForModule(mod.moduleId) : [],
    recentActivity: {
      availability: mod.moduleId === 'ADMIN' || mod.moduleId === 'SECURITY' ? 'LIVE' : 'NOT_AVAILABLE',
      sourceApi: mod.moduleId === 'ADMIN' || mod.moduleId === 'SECURITY' ? '/api/v2/audit/events' : undefined,
      notes:
        mod.moduleId === 'ADMIN' || mod.moduleId === 'SECURITY'
          ? 'Server AuditEvent feed.'
          : 'No module-scoped activity feed — NOT AVAILABLE.',
    },
    primaryActions: primaryActionsForModule(mod),
    surfaces,
    masterEntities,
    permissions: mod.permissions,
    search: {
      structural: true,
      notes: 'Module/surface search is structural; entity full-text search remains on owning V1 APIs.',
    },
    ownershipRows,
    v1Entry: legacy,
    invariants: mod.invariants,
  };
}

export interface ModuleNavGroup {
  category: ModuleCategory;
  label: string;
  modules: PlatformModuleDefinition[];
}

/** Default navigator: operational modules only, grouped by category. */
export function listNavigableModulesByCategory(): ModuleNavGroup[] {
  const nav = listNavigableModules();
  return MODULE_CATEGORY_ORDER.map((category) => ({
    category,
    label: MODULE_CATEGORY_LABELS[category],
    modules: nav.filter((m) => m.category === category),
  })).filter((g) => g.modules.length > 0);
}

/** Informational catalog (PLANNED/STUB/NOT_IMPLEMENTED) — never mounted as fake screens. */
export function listInformationalModules(): PlatformModuleDefinition[] {
  return PLATFORM_MODULE_REGISTRY.filter((m) => !OPERATIONAL_STATUSES.has(m.status)).sort(
    (a, b) => a.catalogNumber - b.catalogNumber
  );
}

export interface V2Breadcrumb {
  label: string;
  path?: string;
}

export function breadcrumbsForPath(pathname: string): V2Breadcrumb[] {
  const crumbs: V2Breadcrumb[] = [{ label: 'V2', path: '/v2' }];
  const path = pathname.replace(/\/+$/, '') || '/v2';
  if (path === '/v2') {
    crumbs.push({ label: 'Modules' });
    return crumbs;
  }
  if (path.startsWith('/v2/security')) {
    crumbs.push({ label: 'Security', path: '/v2/security' });
    crumbs.push({ label: 'Effective Access' });
    return crumbs;
  }
  if (path.startsWith('/v2/master-data')) {
    crumbs.push({ label: 'Master Data IA', path: '/v2/master-data' });
    return crumbs;
  }
  const match = path.match(/^\/v2\/modules\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (!match) {
    crumbs.push({ label: path });
    return crumbs;
  }
  const moduleId = match[1].toUpperCase();
  const mod = getModuleById(moduleId);
  crumbs.push({ label: 'Modules', path: '/v2' });
  crumbs.push({
    label: mod?.displayName || moduleId,
    path: v2ModulePath(moduleId),
  });
  if (match[2]) {
    const surface = match[2] as ModuleSurfaceKind | string;
    const label =
      MODULE_SURFACE_LABELS[surface as ModuleSurfaceKind] ||
      match[2].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({
      label,
      path: match[3] ? v2ModulePath(moduleId, match[2]) : undefined,
    });
  }
  if (match[3]) {
    crumbs.push({
      label: match[3].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  }
  return crumbs;
}

export function parseV2ModulePath(pathname: string): {
  moduleId: string | null;
  surface: ModuleSurfaceKind | null;
  entitySlug: string | null;
} {
  const match = pathname.replace(/\/+$/, '').match(/^\/v2\/modules\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (!match) return { moduleId: null, surface: null, entitySlug: null };
  const moduleId = match[1].toUpperCase();
  const part2 = match[2]?.toLowerCase() || null;
  const entitySlug = match[3]?.toLowerCase() || null;
  if (!part2 || part2 === 'workspace') {
    return { moduleId, surface: 'workspace', entitySlug: null };
  }
  if (MODULE_SURFACE_ORDER.includes(part2 as ModuleSurfaceKind)) {
    return { moduleId, surface: part2 as ModuleSurfaceKind, entitySlug };
  }
  // /v2/modules/x/master/customers style already captured; treat unknown as entity under workspace
  return { moduleId, surface: null, entitySlug: part2 };
}

export function isOperationalModule(moduleId: string): boolean {
  const mod = getModuleById(moduleId.toUpperCase());
  return Boolean(mod && OPERATIONAL_STATUSES.has(mod.status) && mod.navDefault);
}

export function ownershipSurfaceRows(): Array<
  DataOwnershipRow & { displayPath: string | null; permissions: string[] }
> {
  return entitiesOwnedBy('CUSTOMER')
    .concat(
      entitiesOwnedBy('CABLE_MASTER'),
      entitiesOwnedBy('BOM'),
      entitiesOwnedBy('ENGINEERING'),
      entitiesOwnedBy('COSTING'),
      entitiesOwnedBy('PRICING'),
      entitiesOwnedBy('MASTER_DATA'),
      entitiesOwnedBy('INQUIRY_QUOTATION'),
      entitiesOwnedBy('SALES'),
      entitiesOwnedBy('COMMERCIAL'),
      entitiesOwnedBy('ADMIN'),
      entitiesOwnedBy('SECURITY'),
      entitiesOwnedBy('PLATFORM')
    )
    .filter((row, idx, arr) => arr.findIndex((r) => r.entity === row.entity) === idx)
    .map((row) => {
      const links = masterEntityLinksForModule(row.ownerModuleId);
      const link = links.find((l) => l.entityCode === row.entity);
      const mod = getModuleById(row.ownerModuleId);
      return {
        ...row,
        displayPath: link?.path || null,
        permissions: link?.permissions || mod?.permissions || [],
      };
    });
}

export function resolveEntityOwnership(entityCode: string): DataOwnershipRow | undefined {
  return ownershipForEntity(entityCode);
}

export { v2ModulePath };
