import { issue } from '../platform/errors/domainError';
import { permissionCode } from './permissionCatalog';
import { LEGACY_TO_GRANULAR, type LegacyModulePermissions } from './rbacCompatibility';

export interface PermissionActor {
  id?: string;
  email?: string;
  name?: string;
  permissionCodes?: string[];
  permissions?: LegacyModulePermissions | Record<string, boolean>;
}

export function hasPermission(
  actor: PermissionActor,
  module: string,
  resource: string,
  action: string
): boolean {
  const code = permissionCode({ module, resource, action });
  if (actor.permissionCodes?.includes(code)) return true;
  if (actor.permissionCodes && actor.permissionCodes.length > 0) return false;
  const perms = actor.permissions as LegacyModulePermissions | undefined;
  if (!perms) return false;
  for (const [flag, triples] of Object.entries(LEGACY_TO_GRANULAR) as Array<
    [keyof LegacyModulePermissions, Array<{ module: string; resource: string; action: string }>]
  >) {
    if (perms[flag] === true && triples.some((t) => permissionCode(t) === code)) return true;
  }
  return false;
}

export function requirePermission(
  actor: PermissionActor,
  module: string,
  resource: string,
  action: string
): void {
  if (!actor.id && !actor.email && !actor.name) {
    throw issue('UNAUTHORIZED', 'Sign in is required.');
  }
  if (!hasPermission(actor, module, resource, action)) {
    throw issue('UNAUTHORIZED', `Not authorized for ${module}:${resource}:${action}.`);
  }
}

export function isAuthenticated(actor: PermissionActor): boolean {
  return Boolean(actor.id || actor.email || actor.name);
}
