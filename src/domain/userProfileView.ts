import { UserAccount } from '../types';

export type ProfileField = {
  key: string;
  label: string;
  value: string;
};

function display(value: string | undefined | null, fallback = '—'): string {
  const trimmed = (value || '').trim();
  return trimmed || fallback;
}

function formatUserType(userType: UserAccount['userType']): string {
  return userType === 'customer' ? 'Customer' : 'Internal';
}

/** Fields shown on the authenticated profile page. Customers never receive internal-only rows. */
export function visibleProfileFields(user: UserAccount): ProfileField[] {
  const fields: ProfileField[] = [
    { key: 'fullName', label: 'Full name', value: display(user.fullName) },
    { key: 'email', label: 'Email', value: display(user.email) },
    { key: 'userName', label: 'Username', value: display(user.userName) },
    { key: 'userType', label: 'Account type', value: formatUserType(user.userType) },
    { key: 'status', label: 'Status', value: display(user.status) },
    { key: 'lastLogin', label: 'Last sign-in', value: display(user.lastLogin) },
  ];

  if (user.userType === 'customer') {
    fields.splice(4, 0, { key: 'role', label: 'Role', value: display(user.role, 'Customer') });
    fields.splice(5, 0, { key: 'companyName', label: 'Company', value: display(user.companyName) });
    if (user.customerCode) {
      fields.splice(6, 0, { key: 'customerCode', label: 'Customer code', value: user.customerCode });
    }
    return fields;
  }

  const roleLabel = (user.roles && user.roles.length > 0 ? user.roles.join(', ') : user.role) || '—';
  fields.splice(4, 0,
    { key: 'role', label: 'Role', value: roleLabel },
    { key: 'department', label: 'Department', value: display(user.department) },
    { key: 'jobTitle', label: 'Job title', value: display(user.jobTitle) },
    { key: 'employeeNumber', label: 'Employee number', value: display(user.employeeNumber) },
    { key: 'mobile', label: 'Mobile', value: display(user.mobile) },
  );
  return fields;
}

export function profileExposesInternalOnlyFields(user: UserAccount): boolean {
  const keys = new Set(visibleProfileFields(user).map((f) => f.key));
  return keys.has('employeeNumber') || keys.has('jobTitle') || keys.has('department') || keys.has('mobile');
}
