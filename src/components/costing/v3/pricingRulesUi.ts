/** Presentation helpers for Costing → Pricing Rules. No pricing-engine calculations. */

export const PRICING_RULE_SCOPES = [
  { value: 'CUSTOMER_CABLE_SPECIFIC', label: 'Customer + Cable' },
  { value: 'CUSTOMER_GROUP_CABLE', label: 'Customer Group + Cable' },
  { value: 'CUSTOMER_FAMILY', label: 'Customer + Cable Family' },
  { value: 'CUSTOMER_GROUP_FAMILY', label: 'Customer Group + Cable Family' },
  { value: 'CABLE_FAMILY', label: 'Cable Family' },
  { value: 'GLOBAL', label: 'Global' },
  { value: 'CUSTOMER_SPECIFIC', label: 'Customer' },
  { value: 'CUSTOMER_TIER', label: 'Customer Tier' },
  { value: 'CABLE_SPECIFIC', label: 'Cable' },
] as const;

export type PricingRuleScopeValue = (typeof PRICING_RULE_SCOPES)[number]['value'];

export type ScopeFieldId = 'customer' | 'customerGroup' | 'cableFamily' | 'cable' | 'customerTier';

export const PRICING_METHOD_OPTIONS = [
  { value: 'MARKUP', label: 'Markup' },
  { value: 'GROSS_MARGIN', label: 'Margin' },
] as const;

export const PRICING_WORKFLOW_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const;

export const PRICING_RULES_PAGE_SIZE = 25;

export type PricingRuleRow = {
  id: string;
  ruleCode?: string;
  ruleName?: string;
  scope?: string;
  ruleType?: string;
  percentageValue?: number | string;
  currency?: string;
  customerId?: string | null;
  customerGroupId?: string | null;
  customerTierCode?: string | null;
  cableMaterialNumber?: string | null;
  cableFamily?: string | null;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  workflowStatus?: string;
  status?: string;
  revision?: number;
  createdBy?: string | null;
  createdAt?: string | Date | null;
  isCurrent?: boolean;
};

export type PricingRuleOptions = {
  customers: Array<{ id: string; code: string; name: string; customerGroupId?: string | null }>;
  groups: Array<{ id: string; code: string; name: string }>;
  families: string[];
};

export type PricingCableOption = {
  materialNumber: string;
  description?: string | null;
  family?: string | null;
};

export type PricingRuleForm = {
  scope: string;
  ruleType: string;
  percentageValue: string;
  currency: string;
  customerId: string;
  customerGroupId: string;
  customerTierCode: string;
  cableMaterialNumber: string;
  cableFamily: string;
  effectiveFrom: string;
};

export function emptyPricingRuleForm(today = new Date().toISOString().slice(0, 10)): PricingRuleForm {
  return {
    scope: '',
    ruleType: 'MARKUP',
    percentageValue: '',
    currency: 'USD',
    customerId: '',
    customerGroupId: '',
    customerTierCode: '',
    cableMaterialNumber: '',
    cableFamily: '',
    effectiveFrom: today,
  };
}

export function scopeLabel(scope?: string | null): string {
  const found = PRICING_RULE_SCOPES.find((s) => s.value === scope);
  return found?.label || scope || '—';
}

export function pricingMethodLabel(ruleType?: string | null): string {
  if (ruleType === 'GROSS_MARGIN') return 'Margin';
  if (ruleType === 'MARKUP') return 'Markup';
  return ruleType || '—';
}

export function scopeFields(scope?: string | null): ScopeFieldId[] {
  switch (scope) {
    case 'CUSTOMER_CABLE_SPECIFIC':
      return ['customer', 'cable'];
    case 'CUSTOMER_GROUP_CABLE':
      return ['customerGroup', 'cable'];
    case 'CUSTOMER_FAMILY':
      return ['customer', 'cableFamily'];
    case 'CUSTOMER_GROUP_FAMILY':
      return ['customerGroup', 'cableFamily'];
    case 'CABLE_FAMILY':
      return ['cableFamily'];
    case 'GLOBAL':
      return [];
    case 'CUSTOMER_SPECIFIC':
      return ['customer'];
    case 'CUSTOMER_TIER':
      return ['customerTier'];
    case 'CABLE_SPECIFIC':
      return ['cable'];
    default:
      return [];
  }
}

export function showsScopeField(scope: string | null | undefined, field: ScopeFieldId): boolean {
  return scopeFields(scope).includes(field);
}

export function formatPricingDate(value?: string | Date | null): string {
  if (!value) return '—';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  return raw.slice(0, 10) || '—';
}

export function formatPercentage(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? `${n}` : String(value);
}

export function lookupCustomerName(
  customerId: string | null | undefined,
  customers: PricingRuleOptions['customers']
): string {
  if (!customerId) return '—';
  const row = customers.find((c) => c.id === customerId);
  return row ? `${row.code} — ${row.name}` : customerId;
}

export function lookupGroupName(
  groupId: string | null | undefined,
  groups: PricingRuleOptions['groups']
): string {
  if (!groupId) return '—';
  const row = groups.find((g) => g.id === groupId);
  return row ? `${row.code} — ${row.name}` : groupId;
}

export function lookupCableLabel(
  materialNumber: string | null | undefined,
  cables: PricingCableOption[]
): string {
  if (!materialNumber) return '—';
  const row = cables.find((c) => c.materialNumber === materialNumber);
  return row?.description ? `${row.materialNumber} — ${row.description}` : materialNumber;
}

export function buildPricingRuleName(
  form: PricingRuleForm,
  options: PricingRuleOptions,
  cables: PricingCableOption[]
): string {
  const label = scopeLabel(form.scope);
  const parts: string[] = [];
  if (showsScopeField(form.scope, 'customer')) parts.push(lookupCustomerName(form.customerId, options.customers));
  if (showsScopeField(form.scope, 'customerGroup')) parts.push(lookupGroupName(form.customerGroupId, options.groups));
  if (showsScopeField(form.scope, 'customerTier') && form.customerTierCode) parts.push(form.customerTierCode);
  if (showsScopeField(form.scope, 'cableFamily') && form.cableFamily) parts.push(form.cableFamily);
  if (showsScopeField(form.scope, 'cable')) parts.push(lookupCableLabel(form.cableMaterialNumber, cables));
  const suffix = parts.filter((p) => p && p !== '—').join(' / ');
  return suffix ? `${label} — ${suffix}` : label;
}

export function validatePricingRuleForm(form: PricingRuleForm): string | null {
  if (!form.scope) return 'Scope is required.';
  const fields = scopeFields(form.scope);
  if (fields.includes('customer') && !form.customerId) return 'Customer is required for this scope.';
  if (fields.includes('customerGroup') && !form.customerGroupId) return 'Customer Group is required for this scope.';
  if (fields.includes('cableFamily') && !form.cableFamily) return 'Cable Family is required for this scope.';
  if (fields.includes('cable') && !form.cableMaterialNumber) return 'Cable is required for this scope.';
  if (fields.includes('customerTier') && !form.customerTierCode.trim()) return 'Customer Tier is required for this scope.';
  if (!form.ruleType) return 'Method is required.';
  const pct = Number(form.percentageValue);
  if (form.percentageValue === '' || !Number.isFinite(pct)) return 'Percentage must be a number.';
  if (pct < 0) return 'Percentage must be 0 or greater.';
  if (form.ruleType === 'GROSS_MARGIN' && pct >= 100) return 'Margin must be less than 100%.';
  if (!form.currency) return 'Currency is required.';
  if (!form.effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom)) return 'Effective From must be a valid date.';
  return null;
}

export type PricingRuleFilters = {
  search: string;
  customerGroupId: string;
  customerId: string;
  cableFamily: string;
  cableMaterialNumber: string;
  method: string;
  status: string;
  effectiveDate: string;
};

export function emptyPricingRuleFilters(): PricingRuleFilters {
  return {
    search: '',
    customerGroupId: '',
    customerId: '',
    cableFamily: '',
    cableMaterialNumber: '',
    method: '',
    status: '',
    effectiveDate: '',
  };
}

function dateOnly(value?: string | Date | null): string | null {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const slice = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

export function ruleMatchesFilters(
  rule: PricingRuleRow,
  filters: PricingRuleFilters,
  options: PricingRuleOptions
): boolean {
  if (filters.customerGroupId && rule.customerGroupId !== filters.customerGroupId) return false;
  if (filters.customerId && rule.customerId !== filters.customerId) return false;
  if (filters.cableFamily && rule.cableFamily !== filters.cableFamily) return false;
  if (filters.cableMaterialNumber && rule.cableMaterialNumber !== filters.cableMaterialNumber) return false;
  if (filters.method && rule.ruleType !== filters.method) return false;
  if (filters.status && rule.workflowStatus !== filters.status) return false;
  if (filters.effectiveDate) {
    const from = dateOnly(rule.effectiveFrom);
    const to = dateOnly(rule.effectiveTo);
    if (from && filters.effectiveDate < from) return false;
    if (to && filters.effectiveDate > to) return false;
  }
  const q = filters.search.trim().toLowerCase();
  if (!q) return true;
  const customer = lookupCustomerName(rule.customerId, options.customers);
  const group = lookupGroupName(rule.customerGroupId, options.groups);
  const hay = [
    rule.ruleCode,
    rule.ruleName,
    rule.scope,
    scopeLabel(rule.scope),
    rule.customerId,
    rule.customerGroupId,
    rule.customerTierCode,
    rule.cableMaterialNumber,
    rule.cableFamily,
    customer,
    group,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

export function workflowActionsFor(rule: PricingRuleRow): Array<{ action: string; label: string; danger?: boolean }> {
  const status = String(rule.workflowStatus || '').toUpperCase();
  const items: Array<{ action: string; label: string; danger?: boolean }> = [];
  if (status === 'DRAFT') items.push({ action: 'SUBMIT', label: 'Submit' });
  if (status === 'SUBMITTED' || status === 'UNDER_REVIEW') {
    items.push({ action: 'APPROVE', label: 'Approve' });
    items.push({ action: 'REJECT', label: 'Reject', danger: true });
  }
  if (status === 'APPROVED' && rule.status !== 'SUPERSEDED') {
    items.push({ action: 'EXPIRE', label: 'Expire' });
  }
  if (status === 'DRAFT' || status === 'SUBMITTED' || status === 'UNDER_REVIEW') {
    items.push({ action: 'CANCEL', label: 'Cancel', danger: true });
  }
  return items;
}

export function canCreatePricingVersion(rule: PricingRuleRow): boolean {
  return String(rule.workflowStatus || '').toUpperCase() === 'APPROVED' && rule.status !== 'SUPERSEDED';
}
