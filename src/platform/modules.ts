/**
 * Modular monolith module map.
 * V1 logical names preserved; V2 catalog lives in moduleRegistry.ts (01–29).
 */

export { PLATFORM_MODULE_REGISTRY as V2_MODULE_REGISTRY } from './moduleRegistry';

export const PLATFORM_MODULES = [
  'Authentication',
  'Users',
  'Roles',
  'Customers',
  'CableMaster',
  'CableConfiguration',
  'Validation',
  'BOM',
  'RawMaterials',
  'Drums',
  'Costing',
  'Pricing',
  'Inquiry',
  'Quotation',
  'TechnicalOffice',
  'Workflow',
  'Audit',
  'Reporting',
  'Integration',
  'PlatformV2',
  'NumberSequence',
  'EffectiveAccess',
  'Metadata',
] as const;

export type PlatformModule = (typeof PLATFORM_MODULES)[number];

/** Task 04A: PostgreSQL is primary for governed MD; LS may remain as non-authoritative mirror. Full SoT cutover = Task 04B. */
export const PERSISTENCE_MODE = 'POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT' as const;

export const V2_RUNTIME = {
  shellPath: '/v2',
  apiPrefix: '/api/v2',
  coexistence: 'Same process and database as V1; V1 routes preserved',
  moduleIa: {
    surfaces: ['workspace', 'master', 'transactions', 'setup', 'workflows', 'reports', 'dashboards'],
    operationalStatuses: ['LIVE', 'PARTIAL', 'FROZEN'],
    masterDataOwnershipPath: '/v2/master-data',
  },
} as const;
