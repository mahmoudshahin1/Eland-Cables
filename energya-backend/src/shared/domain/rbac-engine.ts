import { permissionCode } from './permission-catalog.js';
import { LEGACY_TO_GRANULAR, type LegacyModulePermissions, type ModulePermissions } from './rbac-compatibility.js';

export interface PermissionActor {
  id?: string;
  email?: string;
  name?: string;
  roles?: string[];
  role?: string;
  userType?: string;
  permissionCodes?: string[];
  permissions?: LegacyModulePermissions | Record<string, boolean>;
}

export function hasPermission(
  actor: PermissionActor,
  module: string,
  resource: string,
  action: string
): boolean {
  if (actor.userType === 'superadmin' || actor.roles?.includes('SUPERADMIN') || actor.permissionCodes?.includes('SUPERADMIN:ALL')) {
    return true;
  }
  const code = permissionCode({ module, resource, action });
  if (actor.permissionCodes?.includes(code)) return true;
  if (actor.permissionCodes && actor.permissionCodes.length > 0) return false;
  const perms = actor.permissions as LegacyModulePermissions | undefined;
  if (!perms) return false;
  for (const [flag, triples] of Object.entries(LEGACY_TO_GRANULAR) as Array<
    [keyof ModulePermissions, Array<{ module: string; resource: string; action: string }>]
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
    throw Object.assign(new Error('Sign in is required.'), { code: 'UNAUTHORIZED' });
  }
  if (!hasPermission(actor, module, resource, action)) {
    throw Object.assign(new Error(`Not authorized for ${module}:${resource}:${action}.`), { code: 'UNAUTHORIZED' });
  }
}

export function isAuthenticated(actor: PermissionActor): boolean {
  return Boolean(actor.id || actor.email || actor.name);
}
