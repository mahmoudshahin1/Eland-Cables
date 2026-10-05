import { issue } from '../platform/errors/domainError';
import { assertCustomerBusinessScope } from './customerScope';
import { hasPermission } from '../domain/rbacEngine';
import { RequestActor } from './auth';

function denyIfMissingGranular(actor: RequestActor, allowed: Array<[string, string, string]>): boolean {
  if (!actor.permissionCodes || actor.permissionCodes.length === 0) return false;
  return !allowed.some(([m, r, a]) => hasPermission(actor, m, r, a));
}

/** Legacy module flags: costing approvals require costingPricing, not Technical Office. */
function denyIfNotCostingTeam(actor: RequestActor): boolean {
  if (actor.permissionCodes && actor.permissionCodes.length > 0) return false;
  return Boolean(actor.permissions) && actor.permissions!.costingPricing !== true;
}

export function assertCanWriteCableMaster(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to change Cable Master.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create or modify Cable Master records.');
  }
  if (denyIfMissingGranular(actor, [['CABLE', 'CABLE_MASTER', 'CREATE'], ['CABLE', 'CABLE_MASTER', 'UPDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to modify Cable Master.');
  }
  if (actor.permissions && actor.permissions.masterData === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to modify Cable Master.');
  }
}

export function assertCanImportMasterData(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to import master data.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot import or modify Cable Master, BOM, raw materials, or prices.');
  }
  if (denyIfMissingGranular(actor, [['CABLE', 'CABLE_MASTER', 'IMPORT']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to import master data.');
  }
  if (actor.permissions && actor.permissions.masterData === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to import master data.');
  }
}

export function assertCanWriteBomAndRawMaterials(actor: RequestActor): void {
  assertCanImportMasterData(actor);
}

export function assertCanExportMasterData(
  actor: RequestActor,
  entity:
    | 'customers'
    | 'drums'
    | 'cables'
    | 'cable-boms'
    | 'raw-materials'
    | 'raw-material-prices'
    | 'destination-ports'
    | 'incoterms'
    | 'payment-terms'
    | 'payment-methods'
    | 'classifications'
    | 'segments'
): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to export master data.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot export master data.');
  }
  if (entity === 'customers' || entity === 'payment-terms' || entity === 'payment-methods' || entity === 'classifications' || entity === 'segments') {
    if (denyIfMissingGranular(actor, [['ADMIN', 'CUSTOMER', 'VIEW'], ['ADMIN', 'CUSTOMER', 'EXPORT']])) {
      throw issue('UNAUTHORIZED', 'Your role is not authorized to export customer master data.');
    }
    return;
  }
  if (entity === 'destination-ports' || entity === 'incoterms') {
    if (
      denyIfMissingGranular(actor, [
        ['LOGISTICS', 'SHIPMENT_COST', 'VIEW'],
        ['LOGISTICS', 'SHIPMENT_COST', 'MANAGE'],
        ['CABLE', 'CABLE_MASTER', 'VIEW'],
        ['CABLE', 'CABLE_MASTER', 'EXPORT'],
      ])
    ) {
      throw issue('UNAUTHORIZED', 'Your role is not authorized to export shipment masters.');
    }
    return;
  }
  if (entity === 'raw-materials' || entity === 'raw-material-prices') {
    if (
      denyIfMissingGranular(actor, [
        ['RAW_MATERIAL', 'RAW_MATERIAL', 'VIEW'],
        ['PRICE', 'RAW_MATERIAL_PRICE', 'VIEW'],
        ['CABLE', 'CABLE_MASTER', 'VIEW'],
        ['CABLE', 'CABLE_MASTER', 'EXPORT'],
      ])
    ) {
      throw issue('UNAUTHORIZED', 'Your role is not authorized to export raw material master data.');
    }
    return;
  }
  if (
    denyIfMissingGranular(actor, [
      ['CABLE', 'CABLE_MASTER', 'VIEW'],
      ['CABLE', 'CABLE_MASTER', 'EXPORT'],
    ])
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to export master data.');
  }
}

export function assertCanExportInquiry(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to export inquiries.');
  }
  if (
    denyIfMissingGranular(actor, [
      ['COMMERCIAL', 'INQUIRY', 'VIEW'],
      ['COMMERCIAL', 'INQUIRY', 'EXPORT'],
    ])
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to export inquiries.');
  }
}

export function assertCanProcessTechnicalOffice(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required for Technical Office actions.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot process Technical Office master-data decisions.');
  }
  if (denyIfMissingGranular(actor, [['ENGINEERING', 'MAPPING', 'UPDATE'], ['BOM', 'BOM_CONFLICT', 'RESOLVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized for Technical Office processing.');
  }
  if (actor.permissions && actor.permissions.technicalOffice === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized for Technical Office processing.');
  }
}

export function assertCanApproveEngineeringMapping(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required for engineering mapping approval.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot approve engineering mappings.');
  }
  if (denyIfMissingGranular(actor, [['ENGINEERING', 'MAPPING', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve engineering mappings.');
  }
  if (actor.permissions && actor.permissions.technicalOffice === false && actor.permissions.masterData === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve engineering mappings.');
  }
}

export function assertCanEditEngineeringMapping(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to edit engineering mappings.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create or edit engineering mappings.');
  }
  if (denyIfMissingGranular(actor, [['ENGINEERING', 'MAPPING', 'UPDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to edit engineering mappings.');
  }
  if (actor.permissions && actor.permissions.technicalOffice === false && actor.permissions.masterData === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to edit engineering mappings.');
  }
}

export function assertCanApproveBomGovernance(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required for BOM governance approval.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot approve BOM governance decisions.');
  }
  if (denyIfMissingGranular(actor, [['BOM', 'BOM_CONFLICT', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve BOM governance decisions.');
  }
  if (actor.permissions && actor.permissions.technicalOffice === false && actor.permissions.masterData === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve BOM governance decisions.');
  }
}

export function assertCanInvestigateBomGovernance(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required for BOM governance investigation.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot perform BOM governance actions.');
  }
  if (denyIfMissingGranular(actor, [['BOM', 'BOM_CONFLICT', 'ASSIGN'], ['BOM', 'BOM_CONFLICT', 'RESOLVE'], ['BOM', 'BOM_CONFLICT', 'VIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized for BOM governance.');
  }
  if (actor.permissions && actor.permissions.technicalOffice === false && actor.permissions.masterData === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized for BOM governance.');
  }
}

export function assertCanProposeRawMaterialPrice(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to propose or edit raw material prices.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create or edit raw material prices.');
  }
  if (denyIfMissingGranular(actor, [['PRICE', 'RAW_MATERIAL_PRICE', 'CREATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage raw material prices.');
  }
  if (denyIfNotCostingTeam(actor)) {
    throw issue('UNAUTHORIZED', 'Raw material prices are managed by the Costing Team, not Technical Office.');
  }
}

export function assertCanApproveRawMaterialPrice(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required for raw material price approval.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot approve raw material prices.');
  }
  if (denyIfMissingGranular(actor, [['PRICE', 'RAW_MATERIAL_PRICE', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve raw material prices.');
  }
  if (denyIfNotCostingTeam(actor)) {
    throw issue('UNAUTHORIZED', 'Raw material price approval is restricted to the Costing Team, not Technical Office.');
  }
}

export function assertCanCalculateCosting(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to calculate manufacturing costs.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot calculate internal manufacturing costs.');
  }
  if (denyIfMissingGranular(actor, [['COSTING', 'COSTING_RUN', 'CALCULATE'], ['COSTING', 'COSTING_RUN', 'RECALCULATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to execute costing calculations.');
  }
  if (denyIfNotCostingTeam(actor)) {
    throw issue('UNAUTHORIZED', 'Costing calculations are restricted to the Costing Team, not Technical Office.');
  }
}

/** Inquiry-owned calculate: customers may trigger VIP orchestrator; internals need CALCULATE or costing. */
export function assertCanCalculateVipInquiry(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to calculate inquiry costs.');
  }
  if (actor.userType === 'customer') {
    if (
      denyIfMissingGranular(actor, [['COMMERCIAL', 'INQUIRY', 'CALCULATE']]) &&
      denyIfMissingGranular(actor, [['COMMERCIAL', 'INQUIRY', 'UPDATE']])
    ) {
      throw issue('UNAUTHORIZED', 'Your role is not authorized to run VIP Calculate.');
    }
    return;
  }
  if (
    denyIfMissingGranular(actor, [
      ['COMMERCIAL', 'INQUIRY', 'CALCULATE'],
      ['COSTING', 'COSTING_RUN', 'CALCULATE'],
      ['COSTING', 'COSTING_RUN', 'RECALCULATE'],
      ['COMMERCIAL', 'INQUIRY', 'UPDATE'],
    ])
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to run VIP Calculate.');
  }
  if (
    actor.permissions &&
    actor.permissions.costingPricing === false &&
    actor.permissions.salesQuotations === false
  ) {
    throw issue('UNAUTHORIZED', 'VIP Calculate is for Costing or Sales, not Technical Office.');
  }
}

/** Inquiry-owned calculate: customers may trigger it (results are projected); internals need costing or sales. */
export function assertCanCalculateInquiryCost(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to calculate inquiry costs.');
  }
  if (actor.userType === 'customer') {
    return;
  }
  if (
    denyIfMissingGranular(actor, [
      ['COSTING', 'COSTING_RUN', 'CALCULATE'],
      ['COSTING', 'COSTING_RUN', 'RECALCULATE'],
      ['COMMERCIAL', 'INQUIRY', 'UPDATE'],
      ['COMMERCIAL', 'INQUIRY', 'CREATE'],
    ])
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to calculate inquiry costs.');
  }
  if (
    actor.permissions &&
    actor.permissions.costingPricing === false &&
    actor.permissions.salesQuotations === false
  ) {
    throw issue('UNAUTHORIZED', 'Inquiry costing is for Costing or Sales, not Technical Office.');
  }
}

export function assertCanManageInquiry(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to manage commercial inquiries.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'INQUIRY', 'VIEW'], ['COMMERCIAL', 'INQUIRY', 'CREATE'], ['COMMERCIAL', 'INQUIRY', 'UPDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage commercial inquiries.');
  }
}

export function assertCanViewServiceCase(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view customer service cases.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'SERVICE_CASE', 'VIEW'], ['COMMERCIAL', 'SERVICE_CASE', 'CREATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view customer service cases.');
  }
  if (actor.userType === 'customer') {
    assertCustomerBusinessScope(actor);
  }
}

export function assertCanCreateServiceCase(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to create customer service cases.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'SERVICE_CASE', 'CREATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to create customer service cases.');
  }
  if (actor.userType === 'customer') {
    assertCustomerBusinessScope(actor);
  }
}

export function assertCanUpdateServiceCase(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to update customer service cases.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'SERVICE_CASE', 'UPDATE'], ['COMMERCIAL', 'SERVICE_CASE', 'CREATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to update customer service cases.');
  }
  if (actor.userType === 'customer') {
    assertCustomerBusinessScope(actor);
  }
}

export function assertCanAssignServiceCase(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to assign customer service cases.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot change case assignment.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'SERVICE_CASE', 'ASSIGN']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to assign customer service cases.');
  }
}

export function assertCanAccessServiceCaseOwnership(actor: RequestActor, recordCustomerId: string): void {
  if (actor.userType !== 'customer') return;
  assertCustomerBusinessScope(actor);
  const keys = new Set(
    [
      actor.customerId,
      actor.customerCode,
      actor.id,
      actor.email,
      ...(actor.customerScopeKeys || []),
      ...(actor.customerMasterIds || []),
    ].filter((v): v is string => Boolean(v))
  );
  if (!keys.has(recordCustomerId)) {
    throw issue('UNAUTHORIZED', 'Access denied: You can only view your own customer service cases.');
  }
}

export function assertCanManageQuotations(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to manage sales quotations.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create or revise quotations directly.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'QUOTATION', 'CREATE'], ['COMMERCIAL', 'QUOTATION', 'VIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage sales quotations.');
  }
  if (actor.permissions && actor.permissions.salesQuotations === false && actor.permissions.masterData === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage sales quotations.');
  }
}

/** V2 quotation approval before issue — separate from commercial fulfillment approval. */
export function assertCanApproveQuotation(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to approve quotations.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot approve quotations.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'QUOTATION', 'APPROVE_QUOTATION'], ['COMMERCIAL', 'QUOTATION', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve quotations.');
  }
  if (actor.permissions && actor.permissions.salesQuotations !== true && actor.permissions.masterData !== true) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve quotations.');
  }
}

/** V2 quotation issue to customer. */
export function assertCanIssueQuotation(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to issue quotations.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot issue quotations.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'QUOTATION', 'ISSUE_QUOTATION'], ['COMMERCIAL', 'QUOTATION', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to issue quotations.');
  }
  if (actor.permissions && actor.permissions.salesQuotations !== true && actor.permissions.masterData !== true) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to issue quotations.');
  }
}

/** Spec commercial approval (fulfillment choice) — uses QUOTATION:APPROVE; separate from pricing approve. */
export function assertCanApproveCommercialQuotation(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to commercially approve quotations.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot commercially approve quotations.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'QUOTATION', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to commercially approve quotations.');
  }
  if (actor.permissions && actor.permissions.salesQuotations !== true && actor.permissions.masterData !== true) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to commercially approve quotations.');
  }
}

export function assertCanAccessInquiryOwnership(
  actor: RequestActor,
  inquiryCustomerId: string,
  inquiryCustomerMasterId?: string | null
): void {
  if (actor.userType === 'customer') {
    assertCustomerBusinessScope(actor);
    const keys = new Set(
      [
        actor.customerId,
        actor.customerCode,
        actor.id,
        actor.email,
        ...(actor.customerScopeKeys || []),
        ...(actor.customerMasterIds || []),
      ].filter((v): v is string => Boolean(v))
    );
    const owned =
      keys.has(inquiryCustomerId) ||
      (inquiryCustomerMasterId ? keys.has(inquiryCustomerMasterId) : false);
    if (!owned) {
      throw issue('UNAUTHORIZED', 'Access denied: You can only view your own commercial inquiries.');
    }
  }
}

/** Internal costing runs and lineage are not exposed to customer portal actors. */
export function assertCanRunV2Costing(actor: RequestActor): void {
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot access internal costing runs.');
  }
}

/** Customers may view issued quotations for owned inquiries only (enforced via inquiry scope). */
export function assertCanViewCustomerQuotation(actor: RequestActor): void {
  assertCanManageInquiry(actor);
  assertCustomerBusinessScope(actor);
}

/** Customers may create commitments from their own issued quotations. */
export function assertCanCreateCustomerCommitment(actor: RequestActor): void {
  if (actor.userType !== 'customer') {
    assertCanManageQuotations(actor);
    return;
  }
  assertCanManageInquiry(actor);
  assertCustomerBusinessScope(actor);
}

export function assertCanViewCustomerCommitment(actor: RequestActor): void {
  assertCanCreateCustomerCommitment(actor);
}

/** Read-only fulfillment documents (SO / agreement / release) for customer portal + internal Sales. */
export function assertCanViewCustomerFulfillment(actor: RequestActor): void {
  if (actor.userType === 'customer') {
    assertCanManageInquiry(actor);
    assertCustomerBusinessScope(actor);
    return;
  }
  assertCanManageQuotations(actor);
}

export function assertCanMutateCommercialFulfillment(actor: RequestActor): void {
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create or change sales orders, agreements, or releases.');
  }
  assertCanManageQuotations(actor);
}

export function assertCanMutateV2Quotation(actor: RequestActor): void {
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create, price, approve, issue, or revise quotations.');
  }
  assertCanManageQuotations(actor);
}

export function assertCanManagePricingRules(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to manage commercial pricing rules.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot configure commercial pricing rules.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'PRICING_RULE', 'MANAGE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to configure commercial pricing rules.');
  }
  if (actor.permissions && actor.permissions.costingPricing === false && actor.permissions.masterData === false && actor.permissions.salesQuotations === false) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to configure commercial pricing rules.');
  }
}

export function assertCanApprovePricingRules(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required for pricing rule approval.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot approve commercial pricing rules.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'PRICING_RULE', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve pricing rules.');
  }
  if (actor.permissions && actor.permissions.costingPricing !== true && actor.permissions.salesQuotations !== true) {
    throw issue('UNAUTHORIZED', 'Commercial pricing rule approval is not a Technical Office function.');
  }
}

export function canSearchCableMaster(_actor: RequestActor): boolean {
  return true;
}

export function assertCanViewPlatformMetadata(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view platform field metadata.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot administer platform field metadata.');
  }
  if (denyIfMissingGranular(actor, [['PLATFORM', 'METADATA', 'VIEW'], ['PLATFORM', 'METADATA', 'MANAGE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view platform field metadata.');
  }
  if (actor.permissionCodes && actor.permissionCodes.length > 0) return;
  const perms = actor.permissions;
  if (perms && perms.userManagement !== true && perms.masterData !== true) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view platform field metadata.');
  }
}

export function assertCanManagePlatformMetadata(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to manage platform field metadata.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot mutate platform field metadata.');
  }
  if (denyIfMissingGranular(actor, [['PLATFORM', 'METADATA', 'MANAGE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage platform field metadata.');
  }
  if (actor.permissionCodes && actor.permissionCodes.length > 0) return;
  const perms = actor.permissions;
  if (!perms || perms.userManagement !== true) {
    throw issue('UNAUTHORIZED', 'Only administrators can mutate form and grid metadata.');
  }
}

export function assertCanViewCostingFormulas(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view costing formulas.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot access costing formula administration.');
  }
  if (denyIfMissingGranular(actor, [['COSTING', 'FORMULA', 'VIEW'], ['COSTING', 'CONFIGURATION', 'VIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view costing formulas.');
  }
  if (denyIfNotCostingTeam(actor)) {
    throw issue('UNAUTHORIZED', 'Costing configuration is restricted to the Costing Team, not Technical Office.');
  }
}

export function assertCanManageCostingFormulas(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'FORMULA', 'CREATE'], ['COSTING', 'FORMULA', 'UPDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage costing formulas.');
  }
}

export function assertCanActivateCostingFormula(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'FORMULA', 'ACTIVATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to activate costing formulas.');
  }
}

export function assertCanDeactivateCostingFormula(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'FORMULA', 'DEACTIVATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to deactivate costing formulas.');
  }
}

export function assertCanValidateCostingFormula(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'FORMULA', 'VALIDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to validate costing formulas.');
  }
}

export function assertCanPreviewCostingFormula(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'FORMULA', 'PREVIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to preview costing formulas.');
  }
}

export function assertCanManageCostingVariables(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'VARIABLE', 'CREATE'], ['COSTING', 'VARIABLE', 'UPDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage costing variables.');
  }
}

export function assertCanManageCostingComponents(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'COMPONENT', 'CREATE'], ['COSTING', 'COMPONENT', 'UPDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage costing components.');
  }
}

export function assertCanManageCostingConfiguration(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'CONFIGURATION', 'CREATE'], ['COSTING', 'CONFIGURATION', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage costing configurations.');
  }
}

export function assertCanManageScrapRules(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'SCRAP_RULE', 'CREATE'], ['COSTING', 'SCRAP_RULE', 'UPDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage scrap rules.');
  }
}

export function assertCanApproveScrapRules(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'SCRAP_RULE', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve scrap rules.');
  }
}

export function assertCanManageExchangeRates(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'EXCHANGE_RATE', 'CREATE'], ['COSTING', 'EXCHANGE_RATE', 'UPDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage exchange rates.');
  }
}

export function assertCanApproveExchangeRates(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'EXCHANGE_RATE', 'APPROVE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to approve exchange rates.');
  }
}

export function assertCanExecuteCostingPreview(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'PREVIEW', 'EXECUTE'], ['COSTING', 'FORMULA', 'PREVIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to execute costing preview.');
  }
}

export function assertCanViewCostingAudit(actor: RequestActor): void {
  assertCanViewCostingFormulas(actor);
  if (denyIfMissingGranular(actor, [['COSTING', 'AUDIT', 'VIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view costing audit history.');
  }
}

/** Authenticated master-data / drum read+compute — deny anonymous; customers may read drums for packaging. */
export function assertCanViewMasterDataCatalog(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view master data.');
  }
  if (actor.userType === 'customer') {
    return;
  }
  if (
    denyIfMissingGranular(actor, [
      ['CABLE', 'CABLE_MASTER', 'VIEW'],
      ['RAW_MATERIAL', 'RAW_MATERIAL', 'VIEW'],
      ['ENGINEERING', 'MAPPING', 'VIEW'],
      ['BOM', 'BOM_CONFLICT', 'VIEW'],
      ['COMMERCIAL', 'INQUIRY', 'VIEW'],
      ['COMMERCIAL', 'INQUIRY', 'CREATE'],
      ['COMMERCIAL', 'INQUIRY', 'UPDATE'],
    ])
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view master data catalogs.');
  }
  if (
    actor.permissions &&
    actor.permissions.masterData === false &&
    actor.permissions.technicalOffice === false &&
    actor.permissions.salesQuotations === false &&
    actor.permissions.costingPricing === false &&
    actor.permissions.overview === false
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view master data catalogs.');
  }
}

/** Drum capacity / optimize / validate — signed-in only; same catalog gate as master reads. */
export function assertCanUseDrumOptimization(actor: RequestActor): void {
  assertCanViewMasterDataCatalog(actor);
}

function denyIfMissingWorkflow(actor: RequestActor, action: string): boolean {
  return denyIfMissingGranular(actor, [['WORKFLOW', 'WORKFLOW', action]]);
}

export function assertCanViewWorkflow(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view workflows.');
  }
  if (actor.userType === 'customer') {
    return;
  }
  if (denyIfMissingWorkflow(actor, 'VIEW')) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view workflows.');
  }
}

export function assertCanStartWorkflow(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to start workflows.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot start internal workflows.');
  }
  if (denyIfMissingWorkflow(actor, 'START') && denyIfMissingWorkflow(actor, 'TRANSITION')) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to start workflows.');
  }
}

export function assertCanAssignWorkflow(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to assign workflow tasks.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot assign workflow tasks.');
  }
  if (denyIfMissingWorkflow(actor, 'ASSIGN')) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to assign workflow tasks.');
  }
}

export function assertCanCompleteWorkflowTask(
  actor: RequestActor,
  opts: { customerAction?: boolean } = {}
): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to complete workflow tasks.');
  }
  if (opts.customerAction && actor.userType === 'customer') {
    return;
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot complete internal workflow tasks.');
  }
  if (denyIfMissingWorkflow(actor, 'COMPLETE') && denyIfMissingWorkflow(actor, 'TRANSITION')) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to complete workflow tasks.');
  }
}

export function assertCanTransitionWorkflow(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to transition workflows.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot perform internal workflow transitions.');
  }
  if (denyIfMissingWorkflow(actor, 'TRANSITION')) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to transition workflows.');
  }
}

export function assertCanCancelWorkflow(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to cancel workflows.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot cancel workflows.');
  }
  if (denyIfMissingWorkflow(actor, 'CANCEL')) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to cancel workflows.');
  }
}

export function assertCanAdminWorkflow(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to administer workflows.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot administer workflows.');
  }
  if (denyIfMissingWorkflow(actor, 'ADMIN')) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to administer workflows.');
  }
}

function denyIfMissingLogistics(
  actor: RequestActor,
  allowed: Array<[string, string, string]>
): boolean {
  return denyIfMissingGranular(actor, allowed);
}

export function assertCanViewContainerStudy(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view container studies.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot view logistics Container Study APIs.');
  }
  assertCustomerBusinessScope(actor);
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'CONTAINER_STUDY', 'VIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view container studies.');
  }
}

/** Inquiry-tab Container Study: customers may calculate/select on their own inquiries. Master data stays blocked. */
export function assertCanOperateInquiryContainerStudy(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to run inquiry Container Study.');
  }
  assertCustomerBusinessScope(actor);
  if (actor.userType === 'customer') return;
  if (
    denyIfMissingLogistics(actor, [
      ['LOGISTICS', 'CONTAINER_STUDY', 'VIEW'],
      ['LOGISTICS', 'CONTAINER_STUDY', 'CREATE'],
      ['LOGISTICS', 'CONTAINER_STUDY', 'CALCULATE'],
    ]) &&
    denyIfMissingGranular(actor, [
      ['COMMERCIAL', 'INQUIRY', 'VIEW'],
      ['COMMERCIAL', 'INQUIRY', 'UPDATE'],
      ['COMMERCIAL', 'INQUIRY', 'CALCULATE'],
    ])
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to run inquiry Container Study.');
  }
}

export function assertCanCreateContainerStudy(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to create container studies.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create container studies.');
  }
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'CONTAINER_STUDY', 'CREATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to create container studies.');
  }
}

export function assertCanValidateContainerStudy(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to validate container studies.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot validate container studies.');
  }
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'CONTAINER_STUDY', 'VALIDATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to validate container studies.');
  }
}

export function assertCanCalculateContainerStudy(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to calculate container studies.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot calculate container studies.');
  }
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'CONTAINER_STUDY', 'CALCULATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to calculate container studies.');
  }
}

export function assertCanConfirmContainerStudy(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to confirm container studies.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot confirm container studies.');
  }
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'CONTAINER_STUDY', 'CONFIRM']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to confirm container studies.');
  }
}

export function assertCanSupersedeContainerStudy(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to supersede container studies.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot supersede container studies.');
  }
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'CONTAINER_STUDY', 'SUPERSEDE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to supersede container studies.');
  }
}

export function assertCanManageContainerMaster(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to manage container master.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot manage container master.');
  }
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'CONTAINER_MASTER', 'MANAGE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage container master.');
  }
}

export function assertCanManagePackingProfile(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to manage packing profiles.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot manage packing profiles.');
  }
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'PACKING_PROFILE', 'MANAGE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage packing profiles.');
  }
}

export function assertCanManageAlgorithmConfiguration(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to manage algorithm configuration.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot manage algorithm configuration.');
  }
  if (denyIfMissingLogistics(actor, [['LOGISTICS', 'ALGORITHM_CONFIGURATION', 'MANAGE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage algorithm configuration.');
  }
}

export function assertCanViewShipmentCost(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view shipping cost master data.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot view the shipping cost master.');
  }
  if (
    !hasPermission(actor, 'LOGISTICS', 'SHIPMENT_COST', 'VIEW') &&
    !hasPermission(actor, 'LOGISTICS', 'SHIPMENT_COST', 'MANAGE')
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view shipping cost master data.');
  }
}

export function assertCanManageShipmentCost(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to manage shipping cost master data.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot manage the shipping cost master.');
  }
  if (!hasPermission(actor, 'LOGISTICS', 'SHIPMENT_COST', 'MANAGE')) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to manage shipping cost master data.');
  }
}

export function assertCanViewShipmentCostSnapshot(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view shipment cost snapshots.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot view shipment cost snapshot APIs.');
  }
  if (
    !hasPermission(actor, 'LOGISTICS', 'SHIPMENT_COST', 'VIEW') &&
    !hasPermission(actor, 'LOGISTICS', 'SHIPMENT_COST', 'MANAGE') &&
    !hasPermission(actor, 'LOGISTICS', 'CONTAINER_STUDY', 'VIEW')
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view shipment cost snapshots.');
  }
}

export function assertCanCreateShipmentCostSnapshot(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to create shipment cost snapshots.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create shipment cost snapshots.');
  }
  if (
    !hasPermission(actor, 'LOGISTICS', 'SHIPMENT_COST', 'MANAGE') &&
    !hasPermission(actor, 'LOGISTICS', 'CONTAINER_STUDY', 'CONFIRM')
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to create shipment cost snapshots.');
  }
}

export function assertCanViewFinancialOfferSnapshot(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view financial offer snapshots.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot view draft financial offer snapshot APIs.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'QUOTATION', 'VIEW'], ['COMMERCIAL', 'QUOTATION', 'CREATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view financial offer snapshots.');
  }
}

export function assertCanCreateFinancialOfferSnapshot(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to create financial offer snapshots.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot create financial offer snapshots.');
  }
  if (denyIfMissingGranular(actor, [['COMMERCIAL', 'QUOTATION', 'CREATE']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to create financial offer snapshots.');
  }
}

/** Customer-safe Financial Offer projection: own inquiry only (ownership in repository). */
export function assertCanViewCustomerFinancialOffer(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view the financial offer.');
  }
  if (actor.userType === 'customer') {
    assertCustomerBusinessScope(actor);
    return;
  }
  assertCanViewFinancialOfferSnapshot(actor);
}

export function assertCanViewPlatformDashboard(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view dashboards.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot view internal platform KPIs.');
  }
  if (denyIfMissingGranular(actor, [['REPORT', 'DASHBOARD', 'VIEW'], ['REPORT', 'REPORT', 'VIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view dashboards.');
  }
  if (actor.permissionCodes && actor.permissionCodes.length > 0) return;
  const perms = actor.permissions;
  if (perms && perms.overview !== true && perms.reportsAnalytics !== true) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view dashboards.');
  }
}

export function assertCanViewReports(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view reports.');
  }
  if (actor.userType === 'customer') {
    throw issue('UNAUTHORIZED', 'Customer users cannot run internal report definitions.');
  }
  if (denyIfMissingGranular(actor, [['REPORT', 'REPORT', 'VIEW'], ['REPORT', 'DASHBOARD', 'VIEW']])) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view reports.');
  }
  if (actor.permissionCodes && actor.permissionCodes.length > 0) return;
  const perms = actor.permissions;
  if (perms && perms.reportsAnalytics !== true && perms.overview !== true) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view reports.');
  }
}

/** Customer-safe persisted CS / shipment facts. Not logistics admin APIs. */
export function assertCanViewCustomerContainerStudy(actor: RequestActor): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required to view shipment status.');
  }
  if (actor.userType === 'customer') {
    assertCustomerBusinessScope(actor);
    return;
  }
  if (
    denyIfMissingGranular(actor, [
      ['COMMERCIAL', 'QUOTATION', 'VIEW'],
      ['COMMERCIAL', 'INQUIRY', 'VIEW'],
      ['LOGISTICS', 'CONTAINER_STUDY', 'VIEW'],
    ])
  ) {
    throw issue('UNAUTHORIZED', 'Your role is not authorized to view customer shipment status.');
  }
}
