/**
 * Modular monolith service boundaries for live master data.
 * Organizational contracts only — no duplicate domain engines.
 */

export { CUSTOMER_MASTER_BOUNDARY, listCustomersViaBoundary, assertCustomerWriteOwner } from './customerMasterService';
export { ENGINEERING_MASTER_BOUNDARY } from './engineeringMasterService';
export { BOM_MASTER_BOUNDARY } from './bomMasterService';
export { COSTING_MASTER_BOUNDARY } from './costingMasterService';
export { PRICING_MASTER_BOUNDARY } from './pricingMasterService';
export {
  SHARED_REFERENCE_BOUNDARY,
  listReadableEntitiesForModule,
  describeEntityAccess,
} from './sharedReferenceService';
