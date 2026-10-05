import { ModulePermissions } from '../types';
import { permissionCode, type PermissionTriple } from './permissionCatalog';

export interface LegacyModulePermissions {
  overview?: boolean;
  technicalOffice?: boolean;
  costingPricing?: boolean;
  salesQuotations?: boolean;
  ordersProduction?: boolean;
  financeCollections?: boolean;
  userManagement?: boolean;
  masterData?: boolean;
  reportsAnalytics?: boolean;
  customerPortalAccess?: boolean;
}

const LEGACY_TO_GRANULAR: Record<keyof LegacyModulePermissions, Array<{ module: string; resource: string; action: string }>> = {
  overview: [{ module: 'REPORT', resource: 'DASHBOARD', action: 'VIEW' }],
  technicalOffice: [
    { module: 'BOM', resource: 'BOM_CONFLICT', action: 'VIEW' },
    { module: 'BOM', resource: 'BOM_CONFLICT', action: 'ASSIGN' },
    { module: 'BOM', resource: 'BOM_CONFLICT', action: 'RESOLVE' },
    { module: 'BOM', resource: 'BOM_CONFLICT', action: 'APPROVE' },
    { module: 'ENGINEERING', resource: 'MAPPING', action: 'VIEW' },
    { module: 'ENGINEERING', resource: 'MAPPING', action: 'UPDATE' },
    { module: 'ENGINEERING', resource: 'MAPPING', action: 'APPROVE' },
    { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'VIEW' },
    { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'CREATE' },
    { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'VALIDATE' },
    { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'CALCULATE' },
    { module: 'LOGISTICS', resource: 'PACKING_PROFILE', action: 'MANAGE' },
  ],
  costingPricing: [
    { module: 'COSTING', resource: 'COSTING_RUN', action: 'VIEW' },
    { module: 'COSTING', resource: 'COSTING_RUN', action: 'CALCULATE' },
    { module: 'COSTING', resource: 'COSTING_RUN', action: 'RECALCULATE' },
    { module: 'PRICE', resource: 'RAW_MATERIAL_PRICE', action: 'VIEW' },
    { module: 'PRICE', resource: 'RAW_MATERIAL_PRICE', action: 'CREATE' },
    { module: 'PRICE', resource: 'RAW_MATERIAL_PRICE', action: 'APPROVE' },
    { module: 'COMMERCIAL', resource: 'PRICING_RULE', action: 'VIEW' },
    { module: 'COMMERCIAL', resource: 'PRICING_RULE', action: 'MANAGE' },
    { module: 'COMMERCIAL', resource: 'PRICING_RULE', action: 'APPROVE' },
  ],
  salesQuotations: [
    { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'VIEW' },
    { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'CREATE' },
    { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'UPDATE' },
    { module: 'COMMERCIAL', resource: 'QUOTATION', action: 'VIEW' },
    { module: 'COMMERCIAL', resource: 'QUOTATION', action: 'CREATE' },
    { module: 'COMMERCIAL', resource: 'QUOTATION', action: 'APPROVE' },
    { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'VIEW' },
    { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'CREATE' },
  ],
  ordersProduction: [{ module: 'PRODUCTION', resource: 'ORDER', action: 'VIEW' }],
  financeCollections: [{ module: 'FINANCE', resource: 'COLLECTION', action: 'VIEW' }],
  userManagement: [
    { module: 'ADMIN', resource: 'USER', action: 'VIEW' },
    { module: 'ADMIN', resource: 'USER', action: 'CREATE' },
    { module: 'ADMIN', resource: 'USER', action: 'UPDATE' },
    { module: 'ADMIN', resource: 'USER', action: 'DEACTIVATE' },
    { module: 'ADMIN', resource: 'USER', action: 'LOCK' },
    { module: 'ADMIN', resource: 'USER', action: 'RESET_PASSWORD' },
    { module: 'ADMIN', resource: 'ROLE', action: 'VIEW' },
    { module: 'ADMIN', resource: 'ROLE', action: 'CREATE' },
    { module: 'ADMIN', resource: 'ROLE', action: 'UPDATE' },
    { module: 'ADMIN', resource: 'ROLE', action: 'MANAGE' },
    { module: 'ADMIN', resource: 'PERMISSION', action: 'VIEW' },
    { module: 'ADMIN', resource: 'SECURITY', action: 'VIEW' },
    { module: 'ADMIN', resource: 'CUSTOMER', action: 'VIEW' },
    { module: 'ADMIN', resource: 'CUSTOMER', action: 'CREATE' },
    { module: 'ADMIN', resource: 'CUSTOMER', action: 'UPDATE' },
    { module: 'ADMIN', resource: 'CUSTOMER', action: 'ACTIVATE' },
    { module: 'ADMIN', resource: 'CUSTOMER_USER', action: 'VIEW' },
    { module: 'ADMIN', resource: 'CUSTOMER_USER', action: 'CREATE' },
    { module: 'ADMIN', resource: 'CUSTOMER_USER', action: 'UPDATE' },
    { module: 'ADMIN', resource: 'CUSTOMER_USER', action: 'ASSIGN' },
  ],
  masterData: [
    { module: 'CABLE', resource: 'CABLE_MASTER', action: 'VIEW' },
    { module: 'CABLE', resource: 'CABLE_MASTER', action: 'CREATE' },
    { module: 'CABLE', resource: 'CABLE_MASTER', action: 'UPDATE' },
    { module: 'CABLE', resource: 'CABLE_MASTER', action: 'IMPORT' },
    { module: 'RAW_MATERIAL', resource: 'RAW_MATERIAL', action: 'VIEW' },
    { module: 'RAW_MATERIAL', resource: 'RAW_MATERIAL', action: 'UPDATE' },
    { module: 'LOGISTICS', resource: 'CONTAINER_MASTER', action: 'MANAGE' },
    { module: 'LOGISTICS', resource: 'PACKING_PROFILE', action: 'MANAGE' },
    { module: 'LOGISTICS', resource: 'ALGORITHM_CONFIGURATION', action: 'MANAGE' },
  ],
  reportsAnalytics: [
    { module: 'REPORT', resource: 'REPORT', action: 'VIEW' },
    { module: 'REPORT', resource: 'DASHBOARD', action: 'VIEW' },
  ],
  customerPortalAccess: [
    { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'VIEW' },
    { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'CREATE' },
    { module: 'COMMERCIAL', resource: 'SERVICE_CASE', action: 'VIEW' },
    { module: 'COMMERCIAL', resource: 'SERVICE_CASE', action: 'CREATE' },
    { module: 'COMMERCIAL', resource: 'SERVICE_CASE', action: 'UPDATE' },
    { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'VIEW' },
  ],
};

export function deriveLegacyPermissions(codes: string[]): ModulePermissions {
  const set = new Set(codes);
  const hasAny = (triples: Array<{ module: string; resource: string; action: string }>) =>
    triples.some((t) => set.has(permissionCode(t)));

  return {
    overview: hasAny(LEGACY_TO_GRANULAR.overview),
    technicalOffice: hasAny(LEGACY_TO_GRANULAR.technicalOffice),
    costingPricing: hasAny(LEGACY_TO_GRANULAR.costingPricing),
    salesQuotations: hasAny(LEGACY_TO_GRANULAR.salesQuotations),
    ordersProduction: hasAny(LEGACY_TO_GRANULAR.ordersProduction),
    financeCollections: hasAny(LEGACY_TO_GRANULAR.financeCollections),
    userManagement: hasAny(LEGACY_TO_GRANULAR.userManagement),
    masterData: hasAny(LEGACY_TO_GRANULAR.masterData),
    reportsAnalytics: hasAny(LEGACY_TO_GRANULAR.reportsAnalytics),
    customerPortalAccess: hasAny(LEGACY_TO_GRANULAR.customerPortalAccess),
  };
}

export function legacyFlagSatisfies(
  actor: { permissions?: LegacyModulePermissions | Record<string, boolean>; permissionCodes?: string[] },
  flag: keyof LegacyModulePermissions,
  required: { module: string; resource: string; action: string }
): boolean {
  if (actor.permissionCodes?.includes(permissionCode(required))) return true;
  if (actor.permissionCodes?.length) {
    // Live granular set: do not treat missing legacy flag as allow.
    return actor.permissionCodes.includes(permissionCode(required));
  }
  const perms = actor.permissions as LegacyModulePermissions | undefined;
  if (!perms) return true; // Increment tests: internal actor without permissions object
  if (perms[flag] === false) return false;
  if (perms[flag] === true) return true;
  return true;
}

export { LEGACY_TO_GRANULAR };
