/**
 * D365 F&O must not be called from domain services.
 * These adapters are the only integration boundary.
 * Increment 1 / Phase 1: contracts only — no live D365 calls.
 */

export interface CustomerIntegrationAdapter {
  readonly name: 'CustomerIntegrationAdapter';
  pullCustomer(customerCode: string): Promise<{ status: 'NOT_IMPLEMENTED' }>;
}

export interface ItemIntegrationAdapter {
  readonly name: 'ItemIntegrationAdapter';
  pullItem(itemCode: string): Promise<{ status: 'NOT_IMPLEMENTED' }>;
}

export interface SalesOrderIntegrationAdapter {
  readonly name: 'SalesOrderIntegrationAdapter';
  postSalesOrder(documentNo: string): Promise<{ status: 'NOT_IMPLEMENTED' }>;
}

/** Spec §29 — agreement posting contract only; no HTTP/OData in Phase 1. */
export interface SalesAgreementIntegrationAdapter {
  readonly name: 'SalesAgreementIntegrationAdapter';
  postSalesAgreement(documentNo: string): Promise<{ status: 'NOT_IMPLEMENTED' }>;
}

/** Spec §30 — release posting contract only; no HTTP/OData in Phase 1. */
export interface AgreementReleaseIntegrationAdapter {
  readonly name: 'AgreementReleaseIntegrationAdapter';
  postAgreementRelease(documentNo: string): Promise<{ status: 'NOT_IMPLEMENTED' }>;
}

export interface InventoryIntegrationAdapter {
  readonly name: 'InventoryIntegrationAdapter';
  getAvailability(itemCode: string): Promise<{ status: 'NOT_IMPLEMENTED' }>;
}

export interface FinancialIntegrationAdapter {
  readonly name: 'FinancialIntegrationAdapter';
  postInvoice(documentNo: string): Promise<{ status: 'NOT_IMPLEMENTED' }>;
}

async function notImplemented(): Promise<{ status: 'NOT_IMPLEMENTED' }> {
  return { status: 'NOT_IMPLEMENTED' };
}

export const customerIntegrationAdapter: CustomerIntegrationAdapter = {
  name: 'CustomerIntegrationAdapter',
  pullCustomer: () => notImplemented(),
};

export const itemIntegrationAdapter: ItemIntegrationAdapter = {
  name: 'ItemIntegrationAdapter',
  pullItem: () => notImplemented(),
};

export const salesOrderIntegrationAdapter: SalesOrderIntegrationAdapter = {
  name: 'SalesOrderIntegrationAdapter',
  postSalesOrder: () => notImplemented(),
};

export const salesAgreementIntegrationAdapter: SalesAgreementIntegrationAdapter = {
  name: 'SalesAgreementIntegrationAdapter',
  postSalesAgreement: () => notImplemented(),
};

export const agreementReleaseIntegrationAdapter: AgreementReleaseIntegrationAdapter = {
  name: 'AgreementReleaseIntegrationAdapter',
  postAgreementRelease: () => notImplemented(),
};

export const inventoryIntegrationAdapter: InventoryIntegrationAdapter = {
  name: 'InventoryIntegrationAdapter',
  getAvailability: () => notImplemented(),
};

export const financialIntegrationAdapter: FinancialIntegrationAdapter = {
  name: 'FinancialIntegrationAdapter',
  postInvoice: () => notImplemented(),
};
