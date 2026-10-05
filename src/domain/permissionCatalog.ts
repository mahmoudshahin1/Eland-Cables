export type PermissionTriple = {
  module: string;
  resource: string;
  action: string;
  description: string;
};

export function permissionCode(p: { module: string; resource: string; action: string }): string {
  return `${p.module}:${p.resource}:${p.action}`;
}

/** Controlled registry — administrators cannot invent unregistered permissions. */
export const PERMISSION_CATALOG: PermissionTriple[] = [
  { module: 'ADMIN', resource: 'USER', action: 'VIEW', description: 'View user accounts' },
  { module: 'ADMIN', resource: 'USER', action: 'CREATE', description: 'Create user accounts' },
  { module: 'ADMIN', resource: 'USER', action: 'UPDATE', description: 'Update user accounts' },
  { module: 'ADMIN', resource: 'USER', action: 'DEACTIVATE', description: 'Activate or deactivate users' },
  { module: 'ADMIN', resource: 'USER', action: 'LOCK', description: 'Lock or unlock users' },
  { module: 'ADMIN', resource: 'USER', action: 'RESET_PASSWORD', description: 'Issue password reset tickets' },
  { module: 'ADMIN', resource: 'ROLE', action: 'VIEW', description: 'View roles' },
  { module: 'ADMIN', resource: 'ROLE', action: 'CREATE', description: 'Create roles' },
  { module: 'ADMIN', resource: 'ROLE', action: 'UPDATE', description: 'Update roles' },
  { module: 'ADMIN', resource: 'ROLE', action: 'MANAGE', description: 'Assign role permissions and membership' },
  { module: 'ADMIN', resource: 'PERMISSION', action: 'VIEW', description: 'View permission catalog' },
  { module: 'ADMIN', resource: 'SECURITY', action: 'VIEW', description: 'View security summary' },
  { module: 'ADMIN', resource: 'CUSTOMER', action: 'VIEW', description: 'View customer master' },
  { module: 'ADMIN', resource: 'CUSTOMER', action: 'CREATE', description: 'Create customer master records' },
  { module: 'ADMIN', resource: 'CUSTOMER', action: 'UPDATE', description: 'Update customer master records' },
  { module: 'ADMIN', resource: 'CUSTOMER', action: 'ACTIVATE', description: 'Activate or deactivate customers' },
  { module: 'ADMIN', resource: 'CUSTOMER', action: 'EXPORT', description: 'Export customer master to Excel' },
  { module: 'ADMIN', resource: 'CUSTOMER_USER', action: 'VIEW', description: 'View customer–user assignments' },
  { module: 'ADMIN', resource: 'CUSTOMER_USER', action: 'CREATE', description: 'Create customer–user assignments' },
  { module: 'ADMIN', resource: 'CUSTOMER_USER', action: 'UPDATE', description: 'Update customer–user assignments' },
  { module: 'ADMIN', resource: 'CUSTOMER_USER', action: 'ASSIGN', description: 'Assign users to customers' },
  { module: 'CABLE', resource: 'CABLE_MASTER', action: 'VIEW', description: 'View cable master' },
  { module: 'CABLE', resource: 'CABLE_MASTER', action: 'CREATE', description: 'Create cable master records' },
  { module: 'CABLE', resource: 'CABLE_MASTER', action: 'UPDATE', description: 'Update cable master records' },
  { module: 'CABLE', resource: 'CABLE_MASTER', action: 'IMPORT', description: 'Import master data' },
  { module: 'CABLE', resource: 'CABLE_MASTER', action: 'EXPORT', description: 'Export cable, drum, BOM, and related masters to Excel' },
  { module: 'RAW_MATERIAL', resource: 'RAW_MATERIAL', action: 'VIEW', description: 'View raw materials' },
  { module: 'RAW_MATERIAL', resource: 'RAW_MATERIAL', action: 'UPDATE', description: 'Update raw materials' },
  { module: 'BOM', resource: 'BOM_CONFLICT', action: 'VIEW', description: 'View BOM conflicts' },
  { module: 'BOM', resource: 'BOM_CONFLICT', action: 'ASSIGN', description: 'Assign BOM conflicts' },
  { module: 'BOM', resource: 'BOM_CONFLICT', action: 'RESOLVE', description: 'Investigate BOM conflicts' },
  { module: 'BOM', resource: 'BOM_CONFLICT', action: 'APPROVE', description: 'Approve BOM governance' },
  { module: 'ENGINEERING', resource: 'MAPPING', action: 'VIEW', description: 'View engineering mappings' },
  { module: 'ENGINEERING', resource: 'MAPPING', action: 'UPDATE', description: 'Edit engineering mappings' },
  { module: 'ENGINEERING', resource: 'MAPPING', action: 'APPROVE', description: 'Approve engineering mappings' },
  { module: 'PRICE', resource: 'RAW_MATERIAL_PRICE', action: 'VIEW', description: 'View raw material prices' },
  { module: 'PRICE', resource: 'RAW_MATERIAL_PRICE', action: 'CREATE', description: 'Propose raw material prices' },
  { module: 'PRICE', resource: 'RAW_MATERIAL_PRICE', action: 'APPROVE', description: 'Approve raw material prices' },
  { module: 'COSTING', resource: 'COSTING_RUN', action: 'VIEW', description: 'View costing runs' },
  { module: 'COSTING', resource: 'COSTING_RUN', action: 'CALCULATE', description: 'Calculate costing runs' },
  { module: 'COSTING', resource: 'COSTING_RUN', action: 'RECALCULATE', description: 'Recalculate costing runs' },
  { module: 'COSTING', resource: 'FORMULA', action: 'VIEW', description: 'View costing formulas and registry' },
  { module: 'COSTING', resource: 'FORMULA', action: 'CREATE', description: 'Create costing formulas' },
  { module: 'COSTING', resource: 'FORMULA', action: 'UPDATE', description: 'Update draft costing formulas' },
  { module: 'COSTING', resource: 'FORMULA', action: 'ACTIVATE', description: 'Activate costing formula versions' },
  { module: 'COSTING', resource: 'FORMULA', action: 'DEACTIVATE', description: 'Deactivate costing formulas' },
  { module: 'COSTING', resource: 'FORMULA', action: 'VALIDATE', description: 'Validate costing formula expressions' },
  { module: 'COSTING', resource: 'FORMULA', action: 'PREVIEW', description: 'Preview costing formula evaluation' },
  { module: 'COSTING', resource: 'VARIABLE', action: 'VIEW', description: 'View costing variable registry' },
  { module: 'COSTING', resource: 'VARIABLE', action: 'CREATE', description: 'Create costing variables' },
  { module: 'COSTING', resource: 'VARIABLE', action: 'UPDATE', description: 'Update costing variables' },
  { module: 'COSTING', resource: 'COMPONENT', action: 'VIEW', description: 'View costing components' },
  { module: 'COSTING', resource: 'COMPONENT', action: 'CREATE', description: 'Create costing components' },
  { module: 'COSTING', resource: 'COMPONENT', action: 'UPDATE', description: 'Update costing components' },
  { module: 'COSTING', resource: 'CONFIGURATION', action: 'VIEW', description: 'View costing configurations' },
  { module: 'COSTING', resource: 'CONFIGURATION', action: 'CREATE', description: 'Create costing configurations' },
  { module: 'COSTING', resource: 'CONFIGURATION', action: 'UPDATE', description: 'Update costing configurations' },
  { module: 'COSTING', resource: 'CONFIGURATION', action: 'APPROVE', description: 'Activate costing configuration versions' },
  { module: 'COSTING', resource: 'SCRAP_RULE', action: 'VIEW', description: 'View costing scrap rules' },
  { module: 'COSTING', resource: 'SCRAP_RULE', action: 'CREATE', description: 'Create costing scrap rules' },
  { module: 'COSTING', resource: 'SCRAP_RULE', action: 'UPDATE', description: 'Update costing scrap rules' },
  { module: 'COSTING', resource: 'SCRAP_RULE', action: 'APPROVE', description: 'Approve and activate scrap rules' },
  { module: 'COSTING', resource: 'EXCHANGE_RATE', action: 'VIEW', description: 'View governed exchange rates' },
  { module: 'COSTING', resource: 'EXCHANGE_RATE', action: 'CREATE', description: 'Create exchange rates' },
  { module: 'COSTING', resource: 'EXCHANGE_RATE', action: 'UPDATE', description: 'Update exchange rates' },
  { module: 'COSTING', resource: 'EXCHANGE_RATE', action: 'APPROVE', description: 'Approve and activate exchange rates' },
  { module: 'COSTING', resource: 'PREVIEW', action: 'EXECUTE', description: 'Execute costing preview calculations' },
  { module: 'COSTING', resource: 'AUDIT', action: 'VIEW', description: 'View costing configuration audit history' },
  { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'VIEW', description: 'View inquiries' },
  { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'CREATE', description: 'Create inquiries' },
  { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'UPDATE', description: 'Update inquiries' },
  { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'CALCULATE', description: 'VIP Fast Track calculate orchestrator' },
  { module: 'COMMERCIAL', resource: 'INQUIRY', action: 'EXPORT', description: 'Export inquiry header and lines to Excel' },
  { module: 'COMMERCIAL', resource: 'QUOTATION', action: 'VIEW', description: 'View quotations' },
  { module: 'COMMERCIAL', resource: 'QUOTATION', action: 'CREATE', description: 'Create quotations' },
  { module: 'COMMERCIAL', resource: 'QUOTATION', action: 'APPROVE', description: 'Approve quotations' },
  { module: 'COMMERCIAL', resource: 'QUOTATION', action: 'APPROVE_QUOTATION', description: 'Approve V2 quotation for issue' },
  { module: 'COMMERCIAL', resource: 'QUOTATION', action: 'ISSUE_QUOTATION', description: 'Issue V2 quotation to customer' },
  { module: 'COMMERCIAL', resource: 'SERVICE_CASE', action: 'VIEW', description: 'View customer service cases' },
  { module: 'COMMERCIAL', resource: 'SERVICE_CASE', action: 'CREATE', description: 'Create customer service cases' },
  { module: 'COMMERCIAL', resource: 'SERVICE_CASE', action: 'UPDATE', description: 'Update customer service cases, comments, and customer commands' },
  { module: 'COMMERCIAL', resource: 'SERVICE_CASE', action: 'ASSIGN', description: 'Assign customer service cases internally' },
  { module: 'COMMERCIAL', resource: 'PRICING_RULE', action: 'VIEW', description: 'View commercial pricing rules' },
  { module: 'COMMERCIAL', resource: 'PRICING_RULE', action: 'MANAGE', description: 'Manage commercial pricing rules' },
  { module: 'COMMERCIAL', resource: 'PRICING_RULE', action: 'APPROVE', description: 'Approve commercial pricing rules' },
  { module: 'PRODUCTION', resource: 'ORDER', action: 'VIEW', description: 'View production / orders' },
  { module: 'FINANCE', resource: 'COLLECTION', action: 'VIEW', description: 'View finance collections' },
  { module: 'REPORT', resource: 'REPORT', action: 'VIEW', description: 'View reports' },
  { module: 'REPORT', resource: 'DASHBOARD', action: 'VIEW', description: 'View dashboards' },
  { module: 'PLATFORM', resource: 'MODULE', action: 'VIEW', description: 'View V2 module registry' },
  { module: 'PLATFORM', resource: 'METADATA', action: 'VIEW', description: 'View platform field metadata' },
  { module: 'PLATFORM', resource: 'METADATA', action: 'MANAGE', description: 'Manage platform field metadata' },
  { module: 'PLATFORM', resource: 'NUMBER_SEQUENCE', action: 'VIEW', description: 'View number sequences' },
  { module: 'PLATFORM', resource: 'NUMBER_SEQUENCE', action: 'ALLOCATE', description: 'Allocate number sequence values' },
  { module: 'PLATFORM', resource: 'EFFECTIVE_ACCESS', action: 'EXPLAIN', description: 'Explain effective access for a user' },
  { module: 'PLATFORM', resource: 'AUDIT', action: 'VIEW', description: 'View platform audit events' },
  { module: 'WORKFLOW', resource: 'WORKFLOW', action: 'VIEW', description: 'View workflow instances and tasks' },
  { module: 'WORKFLOW', resource: 'WORKFLOW', action: 'START', description: 'Start workflow instances' },
  { module: 'WORKFLOW', resource: 'WORKFLOW', action: 'ASSIGN', description: 'Assign workflow tasks' },
  { module: 'WORKFLOW', resource: 'WORKFLOW', action: 'COMPLETE', description: 'Complete workflow tasks' },
  { module: 'WORKFLOW', resource: 'WORKFLOW', action: 'TRANSITION', description: 'Transition workflow steps' },
  { module: 'WORKFLOW', resource: 'WORKFLOW', action: 'CANCEL', description: 'Cancel workflow instances' },
  { module: 'WORKFLOW', resource: 'WORKFLOW', action: 'ADMIN', description: 'Administer workflow templates' },
  { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'VIEW', description: 'View container studies' },
  { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'CREATE', description: 'Create container studies' },
  { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'VALIDATE', description: 'Validate container studies' },
  { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'CALCULATE', description: 'Calculate container study allocations' },
  { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'CONFIRM', description: 'Confirm container studies' },
  { module: 'LOGISTICS', resource: 'CONTAINER_STUDY', action: 'SUPERSEDE', description: 'Supersede container studies' },
  { module: 'LOGISTICS', resource: 'CONTAINER_MASTER', action: 'MANAGE', description: 'Manage container type master versions' },
  { module: 'LOGISTICS', resource: 'SHIPMENT_COST', action: 'VIEW', description: 'View destination ports, incoterms, and shipping cost rates' },
  { module: 'LOGISTICS', resource: 'SHIPMENT_COST', action: 'MANAGE', description: 'Manage destination ports, incoterms, and shipping cost rates' },
  { module: 'LOGISTICS', resource: 'PACKING_PROFILE', action: 'MANAGE', description: 'Manage drum packing profiles' },
  { module: 'LOGISTICS', resource: 'ALGORITHM_CONFIGURATION', action: 'MANAGE', description: 'Activate algorithm configuration versions' },
];

export const SYSTEM_ADMIN_ROLE_CODE = 'SYSTEM_ADMINISTRATOR';

export const INITIAL_ROLES: Array<{
  code: string;
  name: string;
  description: string;
  userType: 'internal' | 'customer';
  permissionFilter?: (p: PermissionTriple) => boolean;
}> = [
  {
    code: 'SYSTEM_ADMINISTRATOR',
    name: 'System Administrator',
    description: 'Platform control plane. Does not grant business approval unless those permissions are assigned.',
    userType: 'internal',
  },
  {
    code: 'TECHNICAL_OFFICE_ENGINEER',
    name: 'Technical Office Engineer',
    description: 'Engineering mapping and BOM investigation',
    userType: 'internal',
    permissionFilter: (p) =>
      (p.module === 'BOM' && p.action !== 'APPROVE') ||
      (p.module === 'ENGINEERING' && p.action !== 'APPROVE') ||
      (p.module === 'CABLE' && p.action === 'VIEW') ||
      (p.module === 'WORKFLOW' && ['VIEW', 'ASSIGN', 'COMPLETE', 'TRANSITION'].includes(p.action)) ||
      (p.module === 'LOGISTICS' &&
        ((p.resource === 'CONTAINER_STUDY' && ['VIEW', 'CREATE', 'VALIDATE', 'CALCULATE'].includes(p.action)) ||
          p.resource === 'PACKING_PROFILE')) ||
      (p.module === 'REPORT' && p.action === 'VIEW'),
  },
  {
    code: 'TECHNICAL_OFFICE_MANAGER',
    name: 'Technical Office Manager',
    description: 'Technical Office approvals',
    userType: 'internal',
    permissionFilter: (p) =>
      ['BOM', 'ENGINEERING', 'CABLE', 'LOGISTICS'].includes(p.module) ||
      (p.module === 'REPORT' && p.action === 'VIEW'),
  },
  {
    code: 'SALES_REPRESENTATIVE',
    name: 'Sales Representative',
    description: 'Create and view commercial inquiries',
    userType: 'internal',
    permissionFilter: (p) =>
      (p.module === 'COMMERCIAL' && ['INQUIRY', 'QUOTATION'].includes(p.resource) && p.action !== 'APPROVE') ||
      (p.module === 'COMMERCIAL' && p.resource === 'SERVICE_CASE') ||
      (p.module === 'WORKFLOW' && ['VIEW', 'COMPLETE'].includes(p.action)) ||
      (p.module === 'LOGISTICS' && p.resource === 'CONTAINER_STUDY' && ['VIEW', 'CREATE'].includes(p.action)) ||
      p.module === 'REPORT',
  },
  {
    code: 'SALES_MANAGER',
    name: 'Sales Manager',
    description: 'Commercial quotations including approve and issue',
    userType: 'internal',
    permissionFilter: (p) =>
      (p.module === 'COMMERCIAL' && p.resource !== 'PRICING_RULE') ||
      (p.module === 'WORKFLOW' && p.action !== 'ADMIN') ||
      (p.module === 'LOGISTICS' && p.resource === 'CONTAINER_STUDY') ||
      p.module === 'REPORT' ||
      (p.module === 'COSTING' && p.action === 'VIEW'),
  },
  {
    code: 'PROCUREMENT_USER',
    name: 'Procurement User',
    description: 'View prices and materials',
    userType: 'internal',
    permissionFilter: (p) =>
      (p.module === 'PRICE' && p.action !== 'APPROVE') ||
      (p.module === 'RAW_MATERIAL' && p.action === 'VIEW') ||
      p.module === 'REPORT',
  },
  {
    code: 'PROCUREMENT_MANAGER',
    name: 'Procurement Manager',
    description: 'Price proposals and production visibility',
    userType: 'internal',
    permissionFilter: (p) =>
      ['PRICE', 'RAW_MATERIAL', 'PRODUCTION', 'REPORT'].includes(p.module),
  },
  {
    code: 'FINANCE_USER',
    name: 'Finance User',
    description: 'Finance collections view',
    userType: 'internal',
    permissionFilter: (p) => p.module === 'FINANCE' || p.module === 'REPORT',
  },
  {
    code: 'FINANCE_MANAGER',
    name: 'Finance Manager',
    description: 'Finance and commercial view',
    userType: 'internal',
    permissionFilter: (p) => ['FINANCE', 'COMMERCIAL', 'REPORT'].includes(p.module),
  },
  {
    code: 'COSTING_USER',
    name: 'Costing User',
    description: 'Calculate costing; view and preview formulas',
    userType: 'internal',
    permissionFilter: (p) =>
      p.module === 'COSTING' ||
      (p.module === 'PRICE' && p.action !== 'APPROVE') ||
      (p.module === 'CABLE' && p.action === 'VIEW') ||
      p.module === 'REPORT',
  },
  {
    code: 'COSTING_MANAGER',
    name: 'Costing Manager',
    description: 'Costing formula admin, price approval',
    userType: 'internal',
    permissionFilter: (p) =>
      ['COSTING', 'PRICE', 'RAW_MATERIAL', 'REPORT'].includes(p.module) ||
      (p.module === 'COMMERCIAL' && p.resource === 'PRICING_RULE'),
  },
  {
    code: 'CUSTOMER_USER',
    name: 'Customer User',
    description: 'Own-customer commercial access only',
    userType: 'customer',
    permissionFilter: (p) =>
      (p.module === 'COMMERCIAL' && p.resource === 'INQUIRY' && ['VIEW', 'CREATE', 'UPDATE', 'CALCULATE', 'EXPORT'].includes(p.action)) ||
      (p.module === 'COMMERCIAL' && p.resource === 'SERVICE_CASE' && ['VIEW', 'CREATE', 'UPDATE'].includes(p.action)) ||
      (p.module === 'LOGISTICS' && p.resource === 'CONTAINER_STUDY' && p.action === 'VIEW') ||
      (p.module === 'WORKFLOW' && ['VIEW', 'COMPLETE'].includes(p.action)),
  },
  {
    code: 'REPORT_VIEWER',
    name: 'Report Viewer',
    description: 'Read-only reports and dashboards',
    userType: 'internal',
    permissionFilter: (p) => p.module === 'REPORT',
  },
  {
    code: 'AUDITOR',
    name: 'Auditor',
    description: 'View security and users; cannot mutate identity',
    userType: 'internal',
    permissionFilter: (p) =>
      (p.module === 'ADMIN' && p.action === 'VIEW') || p.module === 'REPORT',
  },
];
