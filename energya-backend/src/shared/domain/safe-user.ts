import { deriveLegacyPermissions, type ModulePermissions } from './rbac-compatibility.js';

export interface SafeUser {
  id: string;
  userName: string;
  username: string;
  email: string;
  fullName: string;
  mobile?: string;
  employeeNumber?: string;
  jobTitle?: string;
  department: string;
  customerId?: string;
  customerCode?: string;
  userType: string;
  status: string;
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  lastLogin?: string;
  lastLoginAt?: Date | null;
  role: string;
  roles: string[];
  permissions: ModulePermissions;
  permissionCodes?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function toSafeUser(user: {
  id: string;
  username: string;
  email: string;
  fullName: string;
  mobile?: string | null;
  employeeNumber?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  customerId?: string | null;
  userType: string;
  status?: string;
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles?: Array<{ role: { code: string; name?: string } }>;
  permissionCodes?: string[];
}): SafeUser {
  const roleCodes = user.roles?.map((r) => r.role.code) || [];
  const codes = user.permissionCodes || [];
  return {
    id: user.id,
    userName: user.username,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    mobile: user.mobile || undefined,
    employeeNumber: user.employeeNumber || undefined,
    jobTitle: user.jobTitle || undefined,
    department: user.department || '',
    customerId: user.customerId || undefined,
    customerCode: user.customerId || undefined,
    userType: user.userType,
    status: user.isLocked ? 'Locked' : user.isActive ? 'Active' : 'Inactive',
    isActive: user.isActive,
    isLocked: user.isLocked,
    failedLoginAttempts: user.failedLoginAttempts,
    lastLogin: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : undefined,
    lastLoginAt: user.lastLoginAt,
    role: roleCodes[0] || '',
    roles: roleCodes,
    permissions: deriveLegacyPermissions(codes),
    permissionCodes: codes,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
