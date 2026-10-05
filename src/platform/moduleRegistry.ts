/**
 * V2 Module Registry — single catalog for navigation, ownership, and IA.
 * Organizational only: does not duplicate Customer / Pricing / Costing / Engineering authority.
 */

export type ModuleStatus =
  | 'LIVE'
  | 'PARTIAL'
  | 'FROZEN'
  | 'PLANNED'
  | 'STUB'
  | 'NOT_IMPLEMENTED';

export type ModuleCategory =
  | 'CORE'
  | 'COMMERCIAL'
  | 'ENGINEERING'
  | 'SUPPLY_CHAIN'
  | 'FINANCE'
  | 'SUPPORT'
  | 'PLATFORM';

export type ModuleSurfaceKind =
  | 'workspace'
  | 'master'
  | 'transactions'
  | 'setup'
  | 'workflows'
  | 'reports'
  | 'dashboards';

export type SurfaceAvailability = 'IMPLEMENTED' | 'PARTIAL' | 'N_A' | 'PLANNED';

export type ModuleSurfaceMap = Record<ModuleSurfaceKind, SurfaceAvailability>;

export interface ModuleIntegrationHook {
  code: string;
  status: 'NOT_IMPLEMENTED' | 'NOT_CONNECTED' | 'PLANNED' | 'CONNECTED';
  notes?: string;
}

export interface PlatformModuleDefinition {
  moduleId: string;
  catalogNumber: number;
  displayName: string;
  category: ModuleCategory;
  status: ModuleStatus;
  ownedEntities: string[];
  ownedApis: string[];
  dependencies: string[];
  /** V2 workspace route under /v2/modules/... (Task 03 IA). */
  workspaceEntry: string | null;
  /** Preserved V1 hub path for coexistence — never broken. */
  legacyWorkspaceEntry?: string | null;
  surfaces: ModuleSurfaceMap;
  permissions: string[];
  invariants: string[];
  integrationHooks: ModuleIntegrationHook[];
  /** When true, eligible for default V2 navigator (no fake GAP screens). */
  navDefault: boolean;
  notes?: string;
}

const ALL_NA: ModuleSurfaceMap = {
  workspace: 'N_A',
  master: 'N_A',
  transactions: 'N_A',
  setup: 'N_A',
  workflows: 'N_A',
  reports: 'N_A',
  dashboards: 'N_A',
};

function surfaces(partial: Partial<ModuleSurfaceMap>): ModuleSurfaceMap {
  return { ...ALL_NA, ...partial };
}

/** Statuses that may appear in default module navigation. */
export const NAV_VISIBLE_STATUSES: ReadonlySet<ModuleStatus> = new Set([
  'LIVE',
  'PARTIAL',
  'FROZEN',
]);

export const PLATFORM_MODULE_REGISTRY: PlatformModuleDefinition[] = [
  {
    moduleId: 'ADMIN',
    catalogNumber: 1,
    displayName: 'Administration',
    category: 'CORE',
    status: 'LIVE',
    ownedEntities: ['UserAccount', 'Role', 'Permission', 'UserRole', 'UserSession'],
    ownedApis: ['/api/admin/users', '/api/admin/roles', '/api/admin/permissions'],
    dependencies: ['SECURITY'],
    workspaceEntry: '/v2/modules/admin',
    legacyWorkspaceEntry: '/internal/administration',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      master: 'IMPLEMENTED',
      setup: 'PARTIAL',
      reports: 'PARTIAL',
    }),
    permissions: ['ADMIN:USER:*', 'ADMIN:ROLE:*', 'ADMIN:PERMISSION:VIEW'],
    invariants: ['Admins cannot invent unregistered permission triples', 'No business pricing rules in RBAC'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'SECURITY',
    catalogNumber: 2,
    displayName: 'Security',
    category: 'CORE',
    status: 'LIVE',
    ownedEntities: ['SecurityGroup', 'SecurityGroupMember', 'SecurityGroupRole', 'Permission'],
    ownedApis: ['/api/v2/security', '/api/auth'],
    dependencies: ['ADMIN'],
    workspaceEntry: '/v2/modules/security',
    legacyWorkspaceEntry: '/v2/security',
    surfaces: surfaces({
      workspace: 'PARTIAL',
      master: 'PARTIAL',
      setup: 'PARTIAL',
      reports: 'PARTIAL',
    }),
    permissions: ['ADMIN:SECURITY:VIEW', 'PLATFORM:EFFECTIVE_ACCESS:EXPLAIN'],
    invariants: ['Deny by default on new routes', 'UI hide is not authorization'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'MASTER_DATA',
    catalogNumber: 3,
    displayName: 'Master Data',
    category: 'CORE',
    status: 'LIVE',
    ownedEntities: ['ImportBatch', 'ImportBatchRow'],
    ownedApis: ['/api/master', '/api/master/imports'],
    dependencies: ['CABLE_MASTER', 'CUSTOMER'],
    workspaceEntry: '/v2/modules/master_data',
    legacyWorkspaceEntry: '/internal/master-data',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      master: 'IMPLEMENTED',
      setup: 'PARTIAL',
      workflows: 'PARTIAL',
      reports: 'PARTIAL',
    }),
    permissions: ['CABLE:CABLE_MASTER:IMPORT', 'CABLE:CABLE_MASTER:VIEW'],
    invariants: ['Import validates against typed masters — no arbitrary schema'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'WORKFLOW',
    catalogNumber: 4,
    displayName: 'Workflow',
    category: 'CORE',
    status: 'PARTIAL',
    ownedEntities: [],
    ownedApis: [],
    dependencies: ['PLATFORM'],
    workspaceEntry: null,
    surfaces: surfaces({ workflows: 'PARTIAL', setup: 'PLANNED' }),
    permissions: [],
    invariants: [
      'No generic free-form workflow engine',
      'Labels and queues overlay existing STANDARD_INQUIRY_V1 status machine',
      'VIP_FAST_TRACK does not start STANDARD_INQUIRY_V1',
    ],
    integrationHooks: [],
    navDefault: false,
    notes: 'Presentation metadata (labels/queues) over existing runtime; no standalone generic WF engine.',
  },
  {
    moduleId: 'REPORTING',
    catalogNumber: 5,
    displayName: 'Reporting',
    category: 'CORE',
    status: 'PARTIAL',
    ownedEntities: ['ReportDefinition'],
    ownedApis: ['/api/admin/platform/reports', '/api/admin/platform/reports/:code/run'],
    dependencies: ['SECURITY'],
    workspaceEntry: '/v2/modules/reporting',
    legacyWorkspaceEntry: '/internal/analytics',
    surfaces: surfaces({
      workspace: 'PARTIAL',
      setup: 'PARTIAL',
      reports: 'PARTIAL',
      dashboards: 'PARTIAL',
    }),
    permissions: ['REPORT:REPORT:VIEW'],
    invariants: ['No arbitrary SQL — whitelist entity queries only'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'ANALYTICS',
    catalogNumber: 6,
    displayName: 'Analytics',
    category: 'CORE',
    status: 'PARTIAL',
    ownedEntities: [],
    ownedApis: ['/api/admin/platform/dashboard/kpis'],
    dependencies: ['REPORTING'],
    workspaceEntry: '/v2/modules/analytics',
    legacyWorkspaceEntry: '/internal',
    surfaces: surfaces({ dashboards: 'PARTIAL', reports: 'PARTIAL' }),
    permissions: ['REPORT:DASHBOARD:VIEW'],
    invariants: ['KPIs must not invent live ERP connectivity'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'CUSTOMER',
    catalogNumber: 7,
    displayName: 'Customer Management',
    category: 'COMMERCIAL',
    status: 'LIVE',
    ownedEntities: ['Customer', 'CustomerUser'],
    ownedApis: ['/api/admin/customers'],
    dependencies: ['ADMIN', 'SECURITY'],
    workspaceEntry: '/v2/modules/customer',
    legacyWorkspaceEntry: '/internal/administration',
    surfaces: surfaces({
      workspace: 'PARTIAL',
      master: 'IMPLEMENTED',
      setup: 'PARTIAL',
    }),
    permissions: ['ADMIN:CUSTOMER:*', 'ADMIN:CUSTOMER_USER:*'],
    invariants: ['One Customer master — no second customer authority'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'SALES',
    catalogNumber: 8,
    displayName: 'Sales',
    category: 'COMMERCIAL',
    status: 'FROZEN',
    ownedEntities: ['EpcSalesOrder', 'SalesAgreement', 'AgreementRelease'],
    ownedApis: ['/api/sales-orders', '/api/sales-agreements', '/api/agreement-releases'],
    dependencies: ['COMMERCIAL', 'INQUIRY_QUOTATION', 'CUSTOMER'],
    workspaceEntry: '/v2/modules/sales',
    legacyWorkspaceEntry: '/internal/fulfillment',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      transactions: 'IMPLEMENTED',
      workflows: 'IMPLEMENTED',
      setup: 'PARTIAL',
    }),
    permissions: ['COMMERCIAL:QUOTATION:APPROVE', 'PRODUCTION:ORDER:VIEW'],
    invariants: [
      'Phase 1 fulfillment domain FROZEN',
      'Three entry points only',
      'D365 posting NOT_IMPLEMENTED',
    ],
    integrationHooks: [{ code: 'D365_FO', status: 'NOT_CONNECTED', notes: 'ADR-004' }],
    navDefault: true,
  },
  {
    moduleId: 'INQUIRY_QUOTATION',
    catalogNumber: 9,
    displayName: 'Inquiry & Quotation',
    category: 'COMMERCIAL',
    status: 'LIVE',
    ownedEntities: [
      'CommercialInquiry',
      'CommercialInquiryLine',
      'CommercialQuotation',
      'CommercialQuotationLine',
      'FinancialOfferSnapshot',
      'FinancialOfferProductLine',
      'FinancialOfferShipmentLine',
      'FinancialOfferShipmentTypeLine',
    ],
    ownedApis: [
      '/api/inquiries',
      '/api/quotations',
      '/api/v2/financial-offer-snapshots',
      '/api/v2/customer-financial-offers',
    ],
    dependencies: ['CUSTOMER', 'CABLE_MASTER', 'COSTING', 'PRICING'],
    workspaceEntry: '/v2/modules/inquiry_quotation',
    legacyWorkspaceEntry: '/internal/quotations',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      transactions: 'IMPLEMENTED',
      setup: 'PARTIAL',
      workflows: 'IMPLEMENTED',
      reports: 'PLANNED',
      dashboards: 'PARTIAL',
    }),
    permissions: ['COMMERCIAL:INQUIRY:*', 'COMMERCIAL:QUOTATION:*'],
    invariants: ['Customer scope on all commercial APIs', 'Costing via orchestrator only'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'PRICING',
    catalogNumber: 10,
    displayName: 'Pricing',
    category: 'COMMERCIAL',
    status: 'LIVE',
    ownedEntities: [
      'CustomerPricingTier',
      'CommercialPricingRule',
      'CommercialDiscountRule',
      'CommercialPricingSnapshot',
    ],
    ownedApis: ['/api/commercial-pricing', '/api/master/commercial-pricing-rules'],
    dependencies: ['CUSTOMER', 'INQUIRY_QUOTATION'],
    workspaceEntry: '/v2/modules/pricing',
    legacyWorkspaceEntry: '/internal/quotations',
    surfaces: surfaces({
      master: 'IMPLEMENTED',
      transactions: 'PARTIAL',
      setup: 'IMPLEMENTED',
      workflows: 'IMPLEMENTED',
      workspace: 'PARTIAL',
    }),
    permissions: ['COMMERCIAL:PRICING_RULE:*'],
    invariants: ['Distinct from Costing Engine — one Pricing Engine'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'COMMERCIAL',
    catalogNumber: 11,
    displayName: 'Commercial',
    category: 'COMMERCIAL',
    status: 'FROZEN',
    ownedEntities: ['CommercialCommitment'],
    ownedApis: ['/api/commercial-commitments'],
    dependencies: ['INQUIRY_QUOTATION', 'SALES'],
    workspaceEntry: '/v2/modules/commercial',
    legacyWorkspaceEntry: '/internal/fulfillment',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      transactions: 'IMPLEMENTED',
      workflows: 'IMPLEMENTED',
    }),
    permissions: ['COMMERCIAL:QUOTATION:APPROVE'],
    invariants: ['Phase 1 commercial fulfillment FROZEN', 'integrationStatus honesty'],
    integrationHooks: [{ code: 'D365_FO', status: 'NOT_IMPLEMENTED' }],
    navDefault: true,
  },
  {
    moduleId: 'ENGINEERING',
    catalogNumber: 12,
    displayName: 'Engineering',
    category: 'ENGINEERING',
    status: 'LIVE',
    ownedEntities: ['CableEngineeringMapping', 'TechnicalOfficeRequest'],
    ownedApis: ['/api/technical-office', '/api/master/engineering-mappings'],
    dependencies: ['CABLE_MASTER', 'BOM'],
    workspaceEntry: '/v2/modules/engineering',
    legacyWorkspaceEntry: '/internal/technical-office',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      master: 'IMPLEMENTED',
      transactions: 'PARTIAL',
      workflows: 'IMPLEMENTED',
    }),
    permissions: ['ENGINEERING:MAPPING:*'],
    invariants: ['One engineering model', 'No silent zeros', 'BUSINESS_DECISION_REQUIRED conflicts'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'CABLE_MASTER',
    catalogNumber: 13,
    displayName: 'Cable Master',
    category: 'ENGINEERING',
    status: 'LIVE',
    ownedEntities: ['CableMaster', 'CableParameter', 'DrumMaster', 'DrumCompatibility', 'ParameterCompatibility'],
    ownedApis: ['/api/cables', '/api/master/cables', '/api/master/drums'],
    dependencies: ['MASTER_DATA'],
    workspaceEntry: '/v2/modules/cable_master',
    legacyWorkspaceEntry: '/internal/cable-parameters',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      master: 'IMPLEMENTED',
      setup: 'PARTIAL',
    }),
    permissions: ['CABLE:CABLE_MASTER:*'],
    invariants: ['Drum optimization is packaging under Cable/Engineering — not a separate module'],
    integrationHooks: [],
    navDefault: true,
    notes: 'Not a separate top-level Cable app — navigate via Engineering Master Data.',
  },
  {
    moduleId: 'BOM',
    catalogNumber: 14,
    displayName: 'BOM',
    category: 'ENGINEERING',
    status: 'LIVE',
    ownedEntities: ['CableBomLine', 'GovernedBomLine', 'BomDuplicateObservation'],
    ownedApis: ['/api/master/boms', '/api/master/bom-conflicts'],
    dependencies: ['CABLE_MASTER', 'ENGINEERING'],
    workspaceEntry: '/v2/modules/bom',
    legacyWorkspaceEntry: '/internal/technical-office',
    surfaces: surfaces({
      master: 'IMPLEMENTED',
      transactions: 'PARTIAL',
      workflows: 'IMPLEMENTED',
      workspace: 'PARTIAL',
    }),
    permissions: ['BOM:BOM_CONFLICT:*'],
    invariants: ['Governance stays code-protected', 'Not EAV'],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'COSTING',
    catalogNumber: 15,
    displayName: 'Costing',
    category: 'ENGINEERING',
    status: 'LIVE',
    ownedEntities: [
      'CostingConfiguration',
      'CostingFormula',
      'CostingCalculation',
      'CostingScrapRule',
      'CostingExchangeRate',
      'CostingMetalCostComponent',
      'CostingDocumentSequence',
    ],
    ownedApis: ['/api/costing', '/api/admin/costing'],
    dependencies: ['BOM', 'CABLE_MASTER', 'PRICING'],
    workspaceEntry: '/v2/modules/costing',
    legacyWorkspaceEntry: '/internal/costing',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      master: 'IMPLEMENTED',
      transactions: 'IMPLEMENTED',
      setup: 'IMPLEMENTED',
      workflows: 'IMPLEMENTED',
      reports: 'PARTIAL',
      dashboards: 'IMPLEMENTED',
    }),
    permissions: ['COSTING:*'],
    invariants: [
      'One Costing Engine',
      'Option B metal / Decision 5 freeze — do not change CostingMetalCostComponent semantics',
      'TO cannot approve RM prices',
    ],
    integrationHooks: [],
    navDefault: true,
  },
  {
    moduleId: 'PRODUCTION',
    catalogNumber: 16,
    displayName: 'Production',
    category: 'ENGINEERING',
    status: 'STUB',
    ownedEntities: [],
    ownedApis: [],
    dependencies: ['SALES'],
    workspaceEntry: null,
    surfaces: surfaces({ workspace: 'PLANNED' }),
    permissions: ['PRODUCTION:ORDER:VIEW'],
    invariants: ['No fake MES connectivity', 'Advaris stays NOT_CONNECTED'],
    integrationHooks: [{ code: 'ADVARIS_MES', status: 'NOT_CONNECTED' }],
    navDefault: false,
  },
  {
    moduleId: 'QUALITY',
    catalogNumber: 17,
    displayName: 'Quality',
    category: 'ENGINEERING',
    status: 'PLANNED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: ['BOM', 'PRODUCTION'],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: ['No dedicated QMS until authorized'],
    integrationHooks: [],
    navDefault: false,
  },
  {
    moduleId: 'PROCUREMENT',
    catalogNumber: 18,
    displayName: 'Procurement',
    category: 'SUPPLY_CHAIN',
    status: 'PLANNED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: ['No second purchasing authority invented in Task 02'],
    integrationHooks: [],
    navDefault: false,
  },
  {
    moduleId: 'INVENTORY',
    catalogNumber: 19,
    displayName: 'Inventory',
    category: 'SUPPLY_CHAIN',
    status: 'NOT_IMPLEMENTED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: ['No stock ledger invented casually', 'Direct MTS snapshot is not inventory module'],
    integrationHooks: [{ code: 'D365_FO', status: 'PLANNED' }],
    navDefault: false,
  },
  {
    moduleId: 'WAREHOUSE',
    catalogNumber: 20,
    displayName: 'Warehouse',
    category: 'SUPPLY_CHAIN',
    status: 'NOT_IMPLEMENTED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: ['INVENTORY'],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: [],
    integrationHooks: [],
    navDefault: false,
  },
  {
    moduleId: 'LOGISTICS',
    catalogNumber: 21,
    displayName: 'Logistics',
    category: 'SUPPLY_CHAIN',
    status: 'PARTIAL',
    ownedEntities: [
      'CostingLogisticsRule',
      'CostingPackingRule',
      'ContainerType',
      'ContainerTypeVersion',
      'DestinationPort',
      'Incoterm',
      'ShippingCostRate',
      'ShipmentCostSnapshot',
      'ShipmentCostSnapshotLine',
      'AlgorithmConfiguration',
      'DrumPackingProfile',
      'ContainerStudy',
      'ContainerStudyInputSnapshot',
    ],
    ownedApis: [
      '/api/admin/platform/costing/logistics-rules',
      '/api/v2/container-types',
      '/api/v2/container-studies',
      '/api/v2/algorithm-configurations',
      '/api/v2/packing-profiles',
      '/api/v2/destination-ports',
      '/api/v2/incoterms',
      '/api/v2/shipping-cost-rates',
      '/api/v2/shipment-cost-snapshots',
    ],
    dependencies: ['COSTING'],
    workspaceEntry: null,
    surfaces: surfaces({ setup: 'PARTIAL', master: 'PARTIAL' }),
    permissions: [
      'LOGISTICS:CONTAINER_STUDY:VIEW',
      'LOGISTICS:CONTAINER_STUDY:CREATE',
      'LOGISTICS:CONTAINER_STUDY:VALIDATE',
      'LOGISTICS:CONTAINER_STUDY:CALCULATE',
      'LOGISTICS:CONTAINER_STUDY:CONFIRM',
      'LOGISTICS:CONTAINER_STUDY:SUPERSEDE',
      'LOGISTICS:CONTAINER_MASTER:MANAGE',
      'LOGISTICS:SHIPMENT_COST:VIEW',
      'LOGISTICS:SHIPMENT_COST:MANAGE',
      'LOGISTICS:PACKING_PROFILE:MANAGE',
      'LOGISTICS:ALGORITHM_CONFIGURATION:MANAGE',
    ],
    invariants: [
      'Cost packing/logistics rules ≠ WMS/TMS',
      'No fake shipment tracking as live',
      'Container Study engine is not implemented in 05I-DD',
      'Excel sample dimensions are not production Container Master',
    ],
    integrationHooks: [],
    navDefault: false,
    notes: 'Costing logistics/packing config exists; customer shipment UI is mock.',
  },
  {
    moduleId: 'GENERAL_LEDGER',
    catalogNumber: 22,
    displayName: 'General Ledger',
    category: 'FINANCE',
    status: 'NOT_IMPLEMENTED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: ['Prefer D365 GL — no parallel ledger'],
    integrationHooks: [{ code: 'D365_FO', status: 'NOT_IMPLEMENTED' }],
    navDefault: false,
  },
  {
    moduleId: 'ACCOUNTS_RECEIVABLE',
    catalogNumber: 23,
    displayName: 'Accounts Receivable',
    category: 'FINANCE',
    status: 'STUB',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: ['FINANCE:COLLECTION:VIEW'],
    invariants: ['Customer statement mock is not AR'],
    integrationHooks: [{ code: 'D365_FO', status: 'NOT_IMPLEMENTED' }],
    navDefault: false,
  },
  {
    moduleId: 'ACCOUNTS_PAYABLE',
    catalogNumber: 24,
    displayName: 'Accounts Payable',
    category: 'FINANCE',
    status: 'NOT_IMPLEMENTED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: [],
    integrationHooks: [{ code: 'D365_FO', status: 'NOT_IMPLEMENTED' }],
    navDefault: false,
  },
  {
    moduleId: 'CASH_BANK',
    catalogNumber: 25,
    displayName: 'Cash & Bank',
    category: 'FINANCE',
    status: 'NOT_IMPLEMENTED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: [],
    integrationHooks: [],
    navDefault: false,
  },
  {
    moduleId: 'FIXED_ASSETS',
    catalogNumber: 26,
    displayName: 'Fixed Assets',
    category: 'FINANCE',
    status: 'NOT_IMPLEMENTED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: [],
    integrationHooks: [],
    navDefault: false,
  },
  {
    moduleId: 'SUPPORT',
    catalogNumber: 27,
    displayName: 'Support / Help Desk',
    category: 'SUPPORT',
    status: 'PARTIAL',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: '/customer/support',
    surfaces: surfaces({ workspace: 'PARTIAL' }),
    permissions: [],
    invariants: ['Static/support UI only — not a ticketing system'],
    integrationHooks: [],
    navDefault: false,
  },
  {
    moduleId: 'CASES',
    catalogNumber: 28,
    displayName: 'Cases',
    category: 'SUPPORT',
    status: 'PLANNED',
    ownedEntities: [],
    ownedApis: [],
    dependencies: ['SUPPORT'],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: [],
    integrationHooks: [],
    navDefault: false,
  },
  {
    moduleId: 'KNOWLEDGE_BASE',
    catalogNumber: 29,
    displayName: 'Knowledge Base',
    category: 'SUPPORT',
    status: 'STUB',
    ownedEntities: [],
    ownedApis: [],
    dependencies: [],
    workspaceEntry: null,
    surfaces: ALL_NA,
    permissions: [],
    invariants: ['TDS mock library is not KB'],
    integrationHooks: [],
    navDefault: false,
  },
  {
    moduleId: 'PLATFORM',
    catalogNumber: 0,
    displayName: 'Platform Services',
    category: 'PLATFORM',
    status: 'LIVE',
    ownedEntities: [
      'AuditEvent',
      'PlatformFieldDefinition',
      'NumberSequence',
      'NotificationRule',
      'ReportDefinition',
    ],
    ownedApis: ['/api/v2', '/api/platform', '/api/admin/platform'],
    dependencies: [],
    workspaceEntry: '/v2',
    legacyWorkspaceEntry: '/v2',
    surfaces: surfaces({
      workspace: 'IMPLEMENTED',
      master: 'PARTIAL',
      setup: 'PARTIAL',
      reports: 'PARTIAL',
    }),
    permissions: ['PLATFORM:MODULE:VIEW', 'PLATFORM:METADATA:VIEW', 'PLATFORM:METADATA:MANAGE', 'PLATFORM:NUMBER_SEQUENCE:ALLOCATE'],
    invariants: [
      'Platform does not own cable pricing/costing business meaning',
      'No EAV replacement of relational domain models',
      'No arbitrary JS/SQL via low-code',
    ],
    integrationHooks: [
      { code: 'D365_FO', status: 'NOT_IMPLEMENTED' },
      { code: 'ADVARIS_MES', status: 'NOT_CONNECTED' },
    ],
    navDefault: true,
  },
];

export function getModuleById(moduleId: string): PlatformModuleDefinition | undefined {
  return PLATFORM_MODULE_REGISTRY.find((m) => m.moduleId === moduleId);
}

export function listModules(filter?: { status?: ModuleStatus; category?: ModuleCategory }) {
  return PLATFORM_MODULE_REGISTRY.filter((m) => {
    if (filter?.status && m.status !== filter.status) return false;
    if (filter?.category && m.category !== filter.category) return false;
    return true;
  });
}

/** Default navigator: implemented / live / frozen with workspace — never PLANNED/STUB/NOT_IMPLEMENTED fakes. */
export function listNavigableModules(): PlatformModuleDefinition[] {
  return PLATFORM_MODULE_REGISTRY.filter(
    (m) => m.navDefault && NAV_VISIBLE_STATUSES.has(m.status) && Boolean(m.workspaceEntry)
  ).sort((a, b) => a.catalogNumber - b.catalogNumber);
}

export function moduleOwnsEntity(moduleId: string, entity: string): boolean {
  const mod = getModuleById(moduleId);
  return Boolean(mod?.ownedEntities.includes(entity));
}
