/**
 * Customer master service boundary (modular monolith).
 * Single authority: Customer module — no duplicate customer model.
 * Preserves customerScope / isolation via existing admin APIs.
 */

import { ownershipForEntity } from '../dataOwnershipMatrix';

export const CUSTOMER_MASTER_BOUNDARY = {
  moduleId: 'CUSTOMER' as const,
  entities: ['Customer', 'CustomerUser', 'CustomerAddress', 'CustomerContact', 'CustomerExternalMapping', 'CustomerDeliveryCombination'] as const,
  writeApiPrefixes: ['/api/admin/customers', '/api/admin/customer-users'] as const,
  isolation: 'customerScope on commercial reads; admin customer CRUD is GLOBAL internal',
  ownership: {
    Customer: ownershipForEntity('Customer'),
    CustomerUser: ownershipForEntity('CustomerUser'),
  },
} as const;

export type CustomerListFilter = {
  q?: string;
  status?: string;
  type?: string;
};

/** Client boundary: list customers via owning admin API (JWT required). */
export async function listCustomersViaBoundary(
  api: (path: string, init?: RequestInit) => Promise<{ customers?: unknown[]; total?: number }>,
  filter: CustomerListFilter = {}
) {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.status && filter.status !== 'all') params.set('status', filter.status);
  if (filter.type && filter.type !== 'all') params.set('type', filter.type);
  return api(`/api/admin/customers?${params.toString()}`);
}

export function assertCustomerWriteOwner(callerModuleId: string): boolean {
  return callerModuleId === CUSTOMER_MASTER_BOUNDARY.moduleId;
}
