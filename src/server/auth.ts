import jwt from 'jsonwebtoken';
import { getPrisma } from './db';
import { deriveLegacyPermissions } from '../domain/rbacCompatibility';
import { permissionCode } from '../domain/permissionCatalog';

/** Development-only JWT signing key. Never acceptable when NODE_ENV=production. */
export const DEV_JWT_SECRET_FALLBACK = 'energya_connect_dotnet9_super_secret_jwt_key_2026_x89f!';
export const MIN_PRODUCTION_JWT_SECRET_LENGTH = 32;

/** Reject missing, default, or short JWT secrets for production/demo public hosts. */
export function validateProductionJwtSecret(configured: string | undefined): string {
  if (!configured || !configured.trim()) {
    throw new Error('JWT_SECRET must be configured to a non-default value in production.');
  }
  const trimmed = configured.trim();
  if (trimmed === DEV_JWT_SECRET_FALLBACK) {
    throw new Error('JWT_SECRET must be configured to a non-default value in production.');
  }
  if (trimmed.length < MIN_PRODUCTION_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must be at least ${MIN_PRODUCTION_JWT_SECRET_LENGTH} characters in production.`
    );
  }
  return trimmed;
}

export const JWT_SECRET = (() => {
  const configured = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    return validateProductionJwtSecret(configured);
  }
  return configured || DEV_JWT_SECRET_FALLBACK;
})();
export const JWT_ISSUER = 'Energya.DotNet9.JwtAuthority';
export const JWT_AUDIENCE = 'Energya.Connect.Api';

export type CustomerScopeStatus = 'resolved' | 'none' | 'ambiguous' | 'internal';

export interface RequestActor {
  id?: string;
  name?: string;
  email?: string;
  userType?: string;
  role?: string;
  roles?: string[];
  permissions?: Record<string, boolean>;
  permissionCodes?: string[];
  customerId?: string;
  customerCode?: string;
  customerScopeKeys?: string[];
  customerMasterIds?: string[];
  customerScopeStatus?: CustomerScopeStatus;
  sessionId?: string;
  department?: string;
  username?: string;
  accountStatus?: string;
}

export function actorFromAuthorizationHeader(authorization?: string): RequestActor {
  if (!authorization?.startsWith('Bearer ')) return {};
  try {
    const decoded: any = jwt.verify(authorization.slice(7), JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return {
      id: decoded.sub || decoded.id,
      name: decoded.name || decoded.email || decoded.unique_name,
      email: decoded.email,
      userType: decoded.userType,
      role: decoded.role,
      roles: Array.isArray(decoded.roles) ? decoded.roles : decoded.role ? [decoded.role] : [],
      permissions: decoded.permissions,
      permissionCodes: Array.isArray(decoded.permissionCodes) ? decoded.permissionCodes : undefined,
      customerId: decoded.customerId,
      customerCode: decoded.customerCode,
      customerScopeKeys: Array.isArray(decoded.customerScopeKeys) ? decoded.customerScopeKeys : undefined,
      customerMasterIds: Array.isArray(decoded.customerMasterIds) ? decoded.customerMasterIds : undefined,
      sessionId: typeof decoded.sid === 'string' ? decoded.sid : undefined,
      department: decoded.department,
      username: decoded.username,
      accountStatus: decoded.accountStatus,
    };
  } catch {
    return {};
  }
}

async function sessionIsActive(sessionId: string | undefined, userId: string | undefined): Promise<boolean> {
  if (!sessionId || !userId) return false;
  const prisma = getPrisma();
  if (!prisma) return false;
  const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
  if (!session) return false;
  if (session.userId !== userId) return false;
  if (session.revokedAt) return false;
  if (session.expiresAt < new Date()) return false;
  return true;
}

export async function hydrateActorFromDatabase(actor: RequestActor): Promise<RequestActor> {
  if (!actor.id) return actor;
  const prisma = getPrisma();
  if (!prisma) return actor;
  try {
    const user = await prisma.userAccount.findUnique({
      where: { id: actor.id },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
        customerUsers: { where: { status: 'ACTIVE' }, include: { customer: true } },
      },
    });
    if (!user) {
      // Increment 1–11 / unit-test JWTs: no UserAccount row, claims stay as signed.
      return actor;
    }
    if (!actor.sessionId || !(await sessionIsActive(actor.sessionId, user.id))) {
      return {};
    }
    if (!user.isActive || user.isLocked || user.status === 'INACTIVE' || user.status === 'LOCKED') {
      return {};
    }
    const codes = [
      ...new Set(
        user.roles.flatMap((ur) =>
          ur.role.isActive
            ? ur.role.permissions
                .filter((rp) => rp.permission.isActive)
                .map((rp) => permissionCode(rp.permission))
            : []
        )
      ),
    ];
    const roleCodes = user.roles.map((ur) => ur.role.code);
    const links = user.customerUsers;
    const isCustomer = user.userType === 'customer';
    let customerScopeStatus: CustomerScopeStatus = 'internal';
    let scopedLinks = links;
    if (isCustomer) {
      if (links.length === 1) {
        customerScopeStatus = 'resolved';
        scopedLinks = links;
      } else if (links.length === 0) {
        customerScopeStatus = 'none';
        scopedLinks = [];
      } else {
        customerScopeStatus = 'ambiguous';
        scopedLinks = [];
      }
    }
    const masterIds = scopedLinks.map((l) => l.customerId);
    const customerScopeKeys =
      isCustomer && customerScopeStatus !== 'resolved'
        ? []
        : [
            ...new Set(
              [
                ...(isCustomer ? [] : [user.id, user.email, user.customerId]),
                ...(isCustomer && customerScopeStatus === 'resolved'
                  ? [user.id, user.email, user.customerId, scopedLinks[0].customerId, scopedLinks[0].customer.code]
                  : [...masterIds, ...scopedLinks.map((l) => l.customer.code), user.id, user.email, user.customerId]),
              ].filter((v): v is string => Boolean(v))
            ),
          ];
    const primary = scopedLinks[0]?.customer;
    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      username: user.username,
      userType: user.userType,
      role: roleCodes[0],
      roles: roleCodes,
      sessionId: actor.sessionId,
      customerId: primary?.id || (isCustomer ? undefined : user.customerId || undefined),
      customerCode: primary?.code || (isCustomer ? undefined : user.customerId || undefined),
      customerMasterIds: masterIds,
      customerScopeKeys,
      customerScopeStatus,
      department: user.department || undefined,
      accountStatus: user.status,
      permissionCodes: codes,
      permissions: deriveLegacyPermissions(codes) as unknown as Record<string, boolean>,
    };
  } catch {
    return {};
  }
}

export async function resolveRequestActor(authorization?: string): Promise<RequestActor> {
  const actor = actorFromAuthorizationHeader(authorization);
  return hydrateActorFromDatabase(actor);
}

export function signTestToken(actor: RequestActor): string {
  return jwt.sign(
    {
      sub: actor.id || 'u-test',
      sid: actor.sessionId,
      name: actor.name,
      email: actor.email,
      userType: actor.userType,
      role: actor.role,
      roles: actor.roles,
      permissions: actor.permissions,
      permissionCodes: actor.permissionCodes,
      customerId: actor.customerId,
      customerCode: actor.customerCode,
      department: actor.department,
      username: actor.username,
    },
    JWT_SECRET,
    { expiresIn: '1h', issuer: JWT_ISSUER, audience: JWT_AUDIENCE }
  );
}
