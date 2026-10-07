import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'require_permission';

export interface PermissionRequirements {
  domain: string;
  resource: string;
  action: string;
}

export const RequirePermission = (domain: string, resource: string, action: string) =>
  SetMetadata(PERMISSION_KEY, { domain, resource, action } as PermissionRequirements);
