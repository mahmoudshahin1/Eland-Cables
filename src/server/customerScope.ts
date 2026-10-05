import { getPrisma } from './db';
import { RequestActor } from './auth';
import { issue } from '../platform/errors/domainError';
import { writeAudit } from './identityService';

export type CustomerScope = {
  matchKeys: string[];
  masterIds: string[];
  primaryCode?: string;
  primaryMasterId?: string;
};

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v && String(v).trim())) )];
}

/** Derive customer ownership keys from authenticated identity. Never from request body/query/URL. */
export async function resolveCustomerScope(actor: RequestActor): Promise<CustomerScope> {
  const prisma = getPrisma();
  if (!prisma || !actor.id) {
    const base = uniqueNonEmpty([
      actor.id,
      actor.email,
      actor.customerId,
      actor.customerCode,
      ...(actor.customerScopeKeys || []),
      ...(actor.customerMasterIds || []),
    ]);
    return {
      matchKeys: base,
      masterIds: actor.customerMasterIds || [],
      primaryCode: actor.customerCode,
      primaryMasterId: actor.customerMasterIds?.[0],
    };
  }
  try {
    const account = await prisma.userAccount.findUnique({ where: { id: actor.id } });
    const links = await prisma.customerUser.findMany({
      where: { userAccountId: actor.id, status: 'ACTIVE' },
      include: { customer: true },
    });
    if (account?.userType === 'customer') {
      if (links.length !== 1) {
        return { matchKeys: [], masterIds: [] };
      }
      const only = links[0];
      return {
        matchKeys: uniqueNonEmpty([
          account.id,
          account.email,
          account.customerId,
          only.customerId,
          only.customer.code,
        ]),
        masterIds: [only.customerId],
        primaryCode: only.customer.code,
        primaryMasterId: only.customerId,
      };
    }
    const matchKeys = uniqueNonEmpty([
      actor.id,
      actor.email,
      actor.customerId,
      actor.customerCode,
      account?.id,
      account?.email,
      account?.customerId,
      ...links.map((l) => l.customerId),
      ...links.map((l) => l.customer.code),
      ...(actor.customerScopeKeys || []),
      ...(actor.customerMasterIds || []),
    ]);
    const masterIds = uniqueNonEmpty(links.map((l) => l.customerId));
    const primary = links[0]?.customer;
    return {
      matchKeys,
      masterIds,
      primaryCode: primary?.code || actor.customerCode,
      primaryMasterId: primary?.id || actor.customerMasterIds?.[0],
    };
  } catch {
    return {
      matchKeys: uniqueNonEmpty([actor.id, actor.email, actor.customerId, actor.customerCode]),
      masterIds: actor.customerMasterIds || [],
      primaryCode: actor.customerCode,
      primaryMasterId: actor.customerMasterIds?.[0],
    };
  }
}

export function actorOwnsCustomerRecord(
  actor: RequestActor,
  recordCustomerId: string,
  recordMasterId?: string | null
): boolean {
  if (actor.userType !== 'customer') return true;
  if (actor.customerScopeStatus === 'none' || actor.customerScopeStatus === 'ambiguous') return false;
  const keys = new Set(
    uniqueNonEmpty([
      actor.id,
      actor.email,
      actor.customerId,
      actor.customerCode,
      ...(actor.customerScopeKeys || []),
      ...(actor.customerMasterIds || []),
    ])
  );
  if (recordMasterId && keys.has(recordMasterId)) return true;
  return keys.has(recordCustomerId);
}

/** Deny commercial operations when a persisted customer user is unassigned or ambiguously assigned. */
export function assertCustomerBusinessScope(actor: RequestActor): void {
  if (actor.userType !== 'customer') return;
  if (!actor.customerScopeStatus) return;
  if (actor.customerScopeStatus === 'none') {
    throw issue(
      'CONFIGURATION_REQUIRED',
      'Customer user has no active customer assignment. Commercial access is denied until an administrator assigns exactly one customer.'
    );
  }
  if (actor.customerScopeStatus === 'ambiguous') {
    throw issue(
      'CONFIGURATION_REQUIRED',
      'Customer user has multiple active customer assignments. Resolve the configuration before accessing commercial records.'
    );
  }
}

export async function auditAmbiguousCustomerScope(actor: RequestActor): Promise<void> {
  if (actor.userType !== 'customer' || actor.customerScopeStatus !== 'ambiguous' || !actor.id) return;
  await writeAudit({
    actor,
    entity: 'UserAccount',
    entityId: actor.id,
    action: 'AMBIGUOUS_CUSTOMER_SCOPE',
    message: 'Customer-scoped operation denied because multiple active CustomerUser rows exist.',
  });
}

export async function lookupCustomerMasterId(legacyOrCode: string | undefined | null): Promise<string | null> {
  if (!legacyOrCode) return null;
  const prisma = getPrisma();
  if (!prisma) return null;
  const byId = await prisma.customer.findUnique({ where: { id: legacyOrCode } });
  if (byId) return byId.id;
  const byCode = await prisma.customer.findUnique({ where: { code: legacyOrCode } });
  if (byCode) return byCode.id;
  return null;
}

/** Resolve Customer Master from authenticated identity and existing assignments. Never invent a customer. */
export async function resolveCustomerMasterIdForActor(actor: RequestActor): Promise<string | null> {
  if (actor.customerMasterIds?.[0]) return actor.customerMasterIds[0];
  for (const key of uniqueNonEmpty([actor.customerId, actor.customerCode, actor.id])) {
    const found = await lookupCustomerMasterId(key);
    if (found) return found;
  }
  const prisma = getPrisma();
  if (!prisma) return null;
  const identityKeys = uniqueNonEmpty([actor.id, actor.email]);
  if (identityKeys.length === 0) return null;
  const account = await prisma.userAccount.findFirst({
    where: { OR: [{ id: { in: identityKeys } }, { email: { in: identityKeys } }] },
    include: { customerUsers: { where: { status: 'ACTIVE' } } },
  });
  if (!account) return null;
  const assigned = uniqueNonEmpty(account.customerUsers.map((row) => row.customerId));
  if (assigned.length === 1) return assigned[0];
  if (assigned.length > 1) return null;
  return lookupCustomerMasterId(account.customerId);
}
