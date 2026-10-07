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
