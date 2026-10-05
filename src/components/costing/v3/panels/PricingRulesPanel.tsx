import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Plus, RefreshCw } from 'lucide-react';
import {
  CostingBadge,
  CostingBtn,
  CostingEmptyState,
  CostingField,
  CostingInput,
  CostingPagination,
  CostingRowMenu,
  CostingSearchInput,
  CostingSelect,
  CostingTable,
  CostingTableSkeleton,
  CostingTd,
  CostingTh,
  CostingToolbar,
  statusTone,
} from '../CostingUiPrimitives';
import { usePagedRows } from '../costingUiUtils';
import { authHeaders, costingApi, downloadCostingFile } from '../costingV3Api';
import { CostingPanelProps } from './types';
import {
  PRICING_METHOD_OPTIONS,
  PRICING_RULES_PAGE_SIZE,
  PRICING_RULE_SCOPES,
  PRICING_WORKFLOW_STATUSES,
  PricingCableOption,
  PricingRuleFilters,
  PricingRuleForm,
  PricingRuleOptions,
  PricingRuleRow,
  buildPricingRuleName,
  canCreatePricingVersion,
  emptyPricingRuleFilters,
  emptyPricingRuleForm,
  formatPercentage,
  formatPricingDate,
  lookupCableLabel,
  lookupCustomerName,
  lookupGroupName,
  pricingMethodLabel,
  ruleMatchesFilters,
  scopeLabel,
  showsScopeField,
  validatePricingRuleForm,
  workflowActionsFor,
} from '../pricingRulesUi';

export type PricingRulesDialog =
  | { kind: 'create' }
  | { kind: 'view'; rule: PricingRuleRow }
  | { kind: 'version'; rule: PricingRuleRow }
  | { kind: 'history'; rule: PricingRuleRow; history: PricingRuleRow[] };

export type PricingRulesAdminViewProps = {
  rules: PricingRuleRow[];
  options: PricingRuleOptions;
  cables: PricingCableOption[];
  currencies: Array<{ code?: string; name?: string }>;
  filters: PricingRuleFilters;
  onFiltersChange: (next: PricingRuleFilters) => void;
  loading?: boolean;
  message?: { text: string; type: 'success' | 'error' } | null;
  dialog?: PricingRulesDialog | null;
  form: PricingRuleForm;
  onFormChange: (next: PricingRuleForm) => void;
  versionForm: { percentageValue: string; effectiveFrom: string };
  onVersionFormChange: (next: { percentageValue: string; effectiveFrom: string }) => void;
  formError?: string | null;
  submitting?: boolean;
  onRefresh: () => void;
  onExport: () => void;
  onOpenCreate: () => void;
  onCloseDialog: () => void;
  onView: (rule: PricingRuleRow) => void;
  onOpenVersion: (rule: PricingRuleRow) => void;
  onOpenHistory: (rule: PricingRuleRow) => void;
  onCreate: () => void;
  onCreateVersion: () => void;
  onWorkflow: (rule: PricingRuleRow, action: string) => void;
};

function PricingRulesModal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-3">{children}</div>
        {footer ? <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

function ScopeFields({
  form,
  options,
  cables,
  onChange,
  readOnly,
}: {
  form: PricingRuleForm;
  options: PricingRuleOptions;
  cables: PricingCableOption[];
  onChange?: (next: PricingRuleForm) => void;
  readOnly?: boolean;
}) {
  const set = (patch: Partial<PricingRuleForm>) => onChange?.({ ...form, ...patch });
  return (
    <>
      {showsScopeField(form.scope, 'customer') && (
        <CostingField label="Customer" required={!readOnly}>
          <CostingSelect
            aria-label="Rule Customer"
            value={form.customerId}
            disabled={readOnly}
            onChange={(e) => set({ customerId: e.target.value })}
          >
            <option value="">Select customer</option>
            {options.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
      )}
      {showsScopeField(form.scope, 'customerGroup') && (
        <CostingField label="Customer Group" required={!readOnly}>
          <CostingSelect
            aria-label="Rule Customer Group"
            value={form.customerGroupId}
            disabled={readOnly}
            onChange={(e) => set({ customerGroupId: e.target.value })}
          >
            <option value="">Select customer group</option>
            {options.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} — {g.name}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
      )}
      {showsScopeField(form.scope, 'customerTier') && (
        <CostingField label="Customer Tier" required={!readOnly}>
          <CostingInput
            aria-label="Rule Customer Tier"
            value={form.customerTierCode}
            disabled={readOnly}
            onChange={(e) => set({ customerTierCode: e.target.value })}
          />
        </CostingField>
      )}
      {showsScopeField(form.scope, 'cableFamily') && (
        <CostingField label="Cable Family" required={!readOnly}>
          <CostingSelect
            aria-label="Rule Cable Family"
            value={form.cableFamily}
            disabled={readOnly}
            onChange={(e) => set({ cableFamily: e.target.value })}
          >
            <option value="">Select family</option>
            {options.families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
      )}
      {showsScopeField(form.scope, 'cable') && (
        <CostingField label="Cable" required={!readOnly}>
          <CostingSelect
            aria-label="Rule Cable"
            value={form.cableMaterialNumber}
            disabled={readOnly}
            onChange={(e) => set({ cableMaterialNumber: e.target.value })}
          >
            <option value="">Select cable</option>
            {cables.map((c) => (
              <option key={c.materialNumber} value={c.materialNumber}>
                {c.description ? `${c.materialNumber} — ${c.description}` : c.materialNumber}
              </option>
            ))}
          </CostingSelect>
        </CostingField>
      )}
    </>
  );
}

export function PricingRulesAdminView({
  rules,
  options,
  cables,
  currencies,
  filters,
  onFiltersChange,
  loading,
  message,
  dialog,
  form,
  onFormChange,
  versionForm,
  onVersionFormChange,
  formError,
  submitting,
  onRefresh,
  onExport,
  onOpenCreate,
  onCloseDialog,
  onView,
  onOpenVersion,
  onOpenHistory,
  onCreate,
  onCreateVersion,
  onWorkflow,
}: PricingRulesAdminViewProps) {
  const filtered = useMemo(
    () => rules.filter((rule) => ruleMatchesFilters(rule, filters, options)),
    [rules, filters, options]
  );
  const { paged, page, setPage, pageCount, total, from, to } = usePagedRows(filtered, PRICING_RULES_PAGE_SIZE);

  const methodFields = (
    <>
      <CostingField label="Method" required>
        <CostingSelect
          aria-label="Rule Method"
          value={form.ruleType}
          disabled={dialog?.kind === 'view'}
          onChange={(e) => onFormChange({ ...form, ruleType: e.target.value })}
        >
          {PRICING_METHOD_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </CostingSelect>
      </CostingField>
      <CostingField label="Percentage" required>
          <CostingInput
            aria-label="Rule Percentage"
            type="number"
          min={0}
          step="0.1"
          value={form.percentageValue}
          disabled={dialog?.kind === 'view'}
          onChange={(e) => onFormChange({ ...form, percentageValue: e.target.value })}
        />
      </CostingField>
      <CostingField label="Currency" required>
        <CostingSelect
          aria-label="Rule Currency"
          value={form.currency}
          disabled={dialog?.kind === 'view'}
          onChange={(e) => onFormChange({ ...form, currency: e.target.value })}
        >
          {(currencies.length ? currencies : [{ code: form.currency || 'USD' }]).map((c) => (
            <option key={String(c.code)} value={String(c.code)}>
              {c.name ? `${c.code} — ${c.name}` : String(c.code)}
            </option>
          ))}
        </CostingSelect>
      </CostingField>
      <CostingField label="Effective From" required>
        <CostingInput
          aria-label="Rule Effective From"
          type="date"
          value={form.effectiveFrom}
          disabled={dialog?.kind === 'view'}
          onChange={(e) => onFormChange({ ...form, effectiveFrom: e.target.value })}
        />
      </CostingField>
    </>
  );

  return (
    <div className="space-y-3">
      <CostingToolbar
        actions={
          <>
            <CostingBtn variant="primary" onClick={onOpenCreate}>
              <Plus className="h-4 w-4" /> New Pricing Rule
            </CostingBtn>
            <CostingBtn onClick={onExport}>
              <Download className="h-4 w-4" /> Export
            </CostingBtn>
            <CostingBtn onClick={onRefresh}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </CostingBtn>
          </>
        }
      >
        <span className="sr-only">Pricing Rules toolbar</span>
      </CostingToolbar>

      <div className="bg-white border border-slate-200 rounded-xl p-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
        <CostingSearchInput
          value={filters.search}
          onChange={(search) => onFiltersChange({ ...filters, search })}
          placeholder="Search"
        />
        <CostingSelect
          aria-label="Customer Group"
          value={filters.customerGroupId}
          onChange={(e) => onFiltersChange({ ...filters, customerGroupId: e.target.value })}
        >
          <option value="">Customer Group [ All ]</option>
          {options.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} — {g.name}
            </option>
          ))}
        </CostingSelect>
        <CostingSelect
          aria-label="Customer"
          value={filters.customerId}
          onChange={(e) => onFiltersChange({ ...filters, customerId: e.target.value })}
        >
          <option value="">Customer [ All ]</option>
          {options.customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name}
            </option>
          ))}
        </CostingSelect>
        <CostingSelect
          aria-label="Cable Family"
          value={filters.cableFamily}
          onChange={(e) => onFiltersChange({ ...filters, cableFamily: e.target.value })}
        >
          <option value="">Cable Family [ All ]</option>
          {options.families.map((family) => (
            <option key={family} value={family}>
              {family}
            </option>
          ))}
        </CostingSelect>
        <CostingSelect
          aria-label="Cable"
          value={filters.cableMaterialNumber}
          onChange={(e) => onFiltersChange({ ...filters, cableMaterialNumber: e.target.value })}
        >
          <option value="">Cable [ All ]</option>
          {cables.map((c) => (
            <option key={c.materialNumber} value={c.materialNumber}>
              {c.materialNumber}
            </option>
          ))}
        </CostingSelect>
        <CostingSelect
          aria-label="Method"
          value={filters.method}
          onChange={(e) => onFiltersChange({ ...filters, method: e.target.value })}
        >
          <option value="">Method [ All ]</option>
          {PRICING_METHOD_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </CostingSelect>
        <CostingSelect
          aria-label="Status"
          value={filters.status}
          onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
        >
          <option value="">Status [ All ]</option>
          {PRICING_WORKFLOW_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </CostingSelect>
        <CostingInput
          aria-label="Effective Date"
          type="date"
          value={filters.effectiveDate}
          onChange={(e) => onFiltersChange({ ...filters, effectiveDate: e.target.value })}
        />
      </div>

      {message ? (
        <p className={`text-xs font-semibold ${message.type === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
          {message.text}
        </p>
      ) : null}

      {loading ? (
        <CostingTableSkeleton cols={12} />
      ) : total === 0 ? (
        <CostingEmptyState title="No pricing rules match your filters" />
      ) : (
        <>
          <CostingTable>
            <thead>
              <tr>
                {[
                  'Scope',
                  'Customer',
                  'Customer Group',
                  'Cable Family',
                  'Cable',
                  'Method',
                  'Percentage',
                  'Currency',
                  'Effective From',
                  'Effective To',
                  'Status',
                  'Revision',
                  'Actions',
                ].map((label) => (
                  <React.Fragment key={label}>
                    <CostingTh className="sticky top-0 z-10 whitespace-nowrap">{label}</CostingTh>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50 text-xs">
                  <CostingTd>{scopeLabel(rule.scope)}</CostingTd>
                  <CostingTd>{lookupCustomerName(rule.customerId, options.customers)}</CostingTd>
                  <CostingTd>{lookupGroupName(rule.customerGroupId, options.groups)}</CostingTd>
                  <CostingTd>{rule.cableFamily || '—'}</CostingTd>
                  <CostingTd className="font-mono">{lookupCableLabel(rule.cableMaterialNumber, cables)}</CostingTd>
                  <CostingTd>{pricingMethodLabel(rule.ruleType)}</CostingTd>
                  <CostingTd className="font-mono">{formatPercentage(rule.percentageValue)}</CostingTd>
                  <CostingTd>{rule.currency || '—'}</CostingTd>
                  <CostingTd>{formatPricingDate(rule.effectiveFrom)}</CostingTd>
                  <CostingTd>{formatPricingDate(rule.effectiveTo)}</CostingTd>
                  <CostingTd>
                    <CostingBadge tone={statusTone(rule.workflowStatus)}>{rule.workflowStatus || '—'}</CostingBadge>
                  </CostingTd>
                  <CostingTd className="font-mono">{rule.revision != null ? `v${rule.revision}` : '—'}</CostingTd>
                  <CostingTd>
                    <CostingRowMenu
                      items={[
                        { label: 'View', onClick: () => onView(rule) },
                        ...(canCreatePricingVersion(rule)
                          ? [{ label: 'Create New Version', onClick: () => onOpenVersion(rule) }]
                          : []),
                        { label: 'View History', onClick: () => onOpenHistory(rule) },
                        ...workflowActionsFor(rule).map((item) => ({
                          label: item.label,
                          danger: item.danger,
                          onClick: () => onWorkflow(rule, item.action),
                        })),
                      ]}
                    />
                  </CostingTd>
                </tr>
              ))}
            </tbody>
          </CostingTable>
          <CostingPagination page={page} pageCount={pageCount} total={total} from={from} to={to} onPage={setPage} />
        </>
      )}

      {dialog?.kind === 'create' && (
        <PricingRulesModal
          title="New Pricing Rule"
          onClose={onCloseDialog}
          footer={
            <>
              <CostingBtn onClick={onCloseDialog}>Cancel</CostingBtn>
              <CostingBtn variant="primary" disabled={submitting} onClick={onCreate}>
                {submitting ? 'Creating…' : 'Create'}
              </CostingBtn>
            </>
          }
        >
          <CostingField label="Scope" required>
            <CostingSelect
              aria-label="Scope"
              value={form.scope}
              onChange={(e) =>
                onFormChange({
                  ...emptyPricingRuleForm(form.effectiveFrom),
                  scope: e.target.value,
                  ruleType: form.ruleType,
                  currency: form.currency,
                  percentageValue: form.percentageValue,
                })
              }
            >
              <option value="">Select</option>
              {PRICING_RULE_SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </CostingSelect>
          </CostingField>
          <ScopeFields form={form} options={options} cables={cables} onChange={onFormChange} />
          {form.scope ? methodFields : null}
          {formError ? <p className="text-xs font-semibold text-red-700">{formError}</p> : null}
        </PricingRulesModal>
      )}

      {dialog?.kind === 'view' && (
        <PricingRulesModal
          title={`View ${dialog.rule.ruleCode || 'Pricing Rule'}`}
          onClose={onCloseDialog}
          footer={<CostingBtn onClick={onCloseDialog}>Close</CostingBtn>}
        >
          <p className="text-xs text-slate-500">{dialog.rule.ruleName}</p>
          <ScopeFields form={form} options={options} cables={cables} readOnly />
          {methodFields}
          <div className="flex flex-wrap gap-2 pt-2">
            {canCreatePricingVersion(dialog.rule) ? (
              <CostingBtn onClick={() => onOpenVersion(dialog.rule)}>Create New Version</CostingBtn>
            ) : null}
            <CostingBtn onClick={() => onOpenHistory(dialog.rule)}>View History</CostingBtn>
            {workflowActionsFor(dialog.rule).map((item) => (
              <CostingBtn key={item.action} onClick={() => onWorkflow(dialog.rule, item.action)}>
                {item.label}
              </CostingBtn>
            ))}
          </div>
        </PricingRulesModal>
      )}

      {dialog?.kind === 'version' && (
        <PricingRulesModal
          title="Create New Version"
          onClose={onCloseDialog}
          footer={
            <>
              <CostingBtn onClick={onCloseDialog}>Cancel</CostingBtn>
              <CostingBtn variant="primary" disabled={submitting} onClick={onCreateVersion}>
                {submitting ? 'Saving…' : 'Create New Version'}
              </CostingBtn>
            </>
          }
        >
          <p className="text-xs text-slate-500">
            Creates a successor revision. The current rule is not overwritten.
          </p>
          <CostingField label="Method">
            <CostingInput value={pricingMethodLabel(dialog.rule.ruleType)} disabled />
          </CostingField>
          <CostingField label="Percentage" required>
            <CostingInput
              aria-label="New version percentage"
              type="number"
              min={0}
              step="0.1"
              value={versionForm.percentageValue}
              onChange={(e) => onVersionFormChange({ ...versionForm, percentageValue: e.target.value })}
            />
          </CostingField>
          <CostingField label="Effective From" required>
            <CostingInput
              aria-label="New version effective from"
              type="date"
              value={versionForm.effectiveFrom}
              onChange={(e) => onVersionFormChange({ ...versionForm, effectiveFrom: e.target.value })}
            />
          </CostingField>
          {formError ? <p className="text-xs font-semibold text-red-700">{formError}</p> : null}
        </PricingRulesModal>
      )}

      {dialog?.kind === 'history' && (
        <PricingRulesModal title="Pricing History" onClose={onCloseDialog} footer={<CostingBtn onClick={onCloseDialog}>Close</CostingBtn>}>
          <CostingTable>
            <thead>
              <tr>
                {['Revision', 'Percentage', 'Method', 'Effective From', 'Effective To', 'Status', 'Created By', 'Created At'].map(
                  (label) => (
                    <React.Fragment key={label}>
                      <CostingTh>{label}</CostingTh>
                    </React.Fragment>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {dialog.history.map((row) => (
                <tr key={row.id}>
                  <CostingTd className="font-mono">{row.revision != null ? `v${row.revision}` : '—'}</CostingTd>
                  <CostingTd className="font-mono">{formatPercentage(row.percentageValue)}</CostingTd>
                  <CostingTd>{pricingMethodLabel(row.ruleType)}</CostingTd>
                  <CostingTd>{formatPricingDate(row.effectiveFrom)}</CostingTd>
                  <CostingTd>{formatPricingDate(row.effectiveTo)}</CostingTd>
                  <CostingTd>{row.workflowStatus || row.status || '—'}</CostingTd>
                  <CostingTd>{row.createdBy || '—'}</CostingTd>
                  <CostingTd>{formatPricingDate(row.createdAt)}</CostingTd>
                </tr>
              ))}
            </tbody>
          </CostingTable>
        </PricingRulesModal>
      )}
    </div>
  );
}

function formFromRule(rule: PricingRuleRow): PricingRuleForm {
  return {
    scope: rule.scope || '',
    ruleType: rule.ruleType || 'MARKUP',
    percentageValue: formatPercentage(rule.percentageValue) === '—' ? '' : String(Number(rule.percentageValue)),
    currency: rule.currency || 'USD',
    customerId: rule.customerId || '',
    customerGroupId: rule.customerGroupId || '',
    customerTierCode: rule.customerTierCode || '',
    cableMaterialNumber: rule.cableMaterialNumber || '',
    cableFamily: rule.cableFamily || '',
    effectiveFrom: formatPricingDate(rule.effectiveFrom) === '—' ? '' : formatPricingDate(rule.effectiveFrom),
  };
}

export const PricingRulesPanel: React.FC<Partial<CostingPanelProps> & { token?: string | null }> = ({
  token,
  data,
  setError,
}) => {
  const [rules, setRules] = useState<PricingRuleRow[]>([]);
  const [options, setOptions] = useState<PricingRuleOptions>({ customers: [], groups: [], families: [] });
  const [cables, setCables] = useState<PricingCableOption[]>([]);
  const [filters, setFilters] = useState<PricingRuleFilters>(emptyPricingRuleFilters());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [dialog, setDialog] = useState<PricingRulesDialog | null>(null);
  const [form, setForm] = useState<PricingRuleForm>(emptyPricingRuleForm());
  const [versionForm, setVersionForm] = useState({ percentageValue: '', effectiveFrom: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const currencies = useMemo(
    () =>
      (data?.currencies || []).map((c) => ({
        code: String(c.code || ''),
        name: c.name ? String(c.name) : undefined,
      })).filter((c) => c.code),
    [data?.currencies]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = authHeaders(token || null);
      const [rulesRes, optRes, cableRes] = await Promise.all([
        fetch('/api/master/commercial-pricing-rules', { headers }),
        fetch('/api/master/commercial-pricing-rules/options', { headers }),
        fetch('/api/master/cables', { headers }),
      ]);
      if (rulesRes.ok) {
        const body = await rulesRes.json();
        setRules(body.rules || []);
      } else {
        const body = await rulesRes.json().catch(() => ({}));
        const err = body.error || `Failed to load pricing rules (${rulesRes.status})`;
        setMessage({ text: err, type: 'error' });
        setError?.(err);
      }
      if (optRes.ok) {
        const opt = await optRes.json();
        setOptions({
          customers: opt.customers || [],
          groups: opt.groups || [],
          families: opt.families || [],
        });
      }
      if (cableRes.ok) {
        const body = await cableRes.json();
        const rows = (body.cables || []) as Array<Record<string, unknown>>;
        setCables(
          rows
            .map((c) => ({
              materialNumber: String(c.materialNumber || c.cableCode || ''),
              description: c.description ? String(c.description) : null,
              family: c.family ? String(c.family) : null,
            }))
            .filter((c) => c.materialNumber)
        );
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Failed to load pricing rules';
      setMessage({ text, type: 'error' });
      setError?.(text);
    } finally {
      setLoading(false);
    }
  }, [token, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async () => {
    const error = validatePricingRuleForm(form);
    setFormError(error);
    if (error || !token) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await costingApi(token, '/api/master/commercial-pricing-rules', {
        method: 'POST',
        body: JSON.stringify({
          ruleName: buildPricingRuleName(form, options, cables),
          scope: form.scope,
          ruleType: form.ruleType,
          percentageValue: Number(form.percentageValue),
          currency: form.currency,
          customerId: showsScopeField(form.scope, 'customer') ? form.customerId : undefined,
          customerGroupId: showsScopeField(form.scope, 'customerGroup') ? form.customerGroupId : undefined,
          customerTierCode: showsScopeField(form.scope, 'customerTier') ? form.customerTierCode : undefined,
          cableMaterialNumber: showsScopeField(form.scope, 'cable') ? form.cableMaterialNumber : undefined,
          cableFamily: showsScopeField(form.scope, 'cableFamily') ? form.cableFamily : undefined,
          effectiveFrom: form.effectiveFrom || null,
        }),
      });
      setMessage({ text: 'Pricing rule created in DRAFT status.', type: 'success' });
      setDialog(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create pricing rule');
    } finally {
      setSubmitting(false);
    }
  };

  const onCreateVersion = async () => {
    if (!dialog || dialog.kind !== 'version' || !token) return;
    const pct = Number(versionForm.percentageValue);
    if (!Number.isFinite(pct) || pct < 0) {
      setFormError('Percentage must be a number 0 or greater.');
      return;
    }
    if ((dialog.rule.ruleType || 'MARKUP') === 'GROSS_MARGIN' && pct >= 100) {
      setFormError('Margin must be less than 100%.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(versionForm.effectiveFrom)) {
      setFormError('Effective From must be a valid date.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await costingApi(token, `/api/master/commercial-pricing-rules/${dialog.rule.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          percentageValue: pct,
          effectiveFrom: versionForm.effectiveFrom,
        }),
      });
      setMessage({ text: 'New pricing rule version created. Prior version was not overwritten.', type: 'success' });
      setDialog(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create version');
    } finally {
      setSubmitting(false);
    }
  };

  const onWorkflow = async (rule: PricingRuleRow, action: string) => {
    if (!token) return;
    setSubmitting(true);
    try {
      await costingApi(token, `/api/master/commercial-pricing-rules/${rule.id}/actions`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setMessage({ text: `Pricing rule ${action} executed.`, type: 'success' });
      setDialog(null);
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : `Failed to ${action}`, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const onOpenHistory = async (rule: PricingRuleRow) => {
    if (!token) {
      setDialog({ kind: 'history', rule, history: [] });
      return;
    }
    try {
      const body = await costingApi(token, `/api/master/commercial-pricing-rules/${rule.id}/history`);
      setDialog({ kind: 'history', rule, history: (body.history as PricingRuleRow[]) || [] });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Failed to load history', type: 'error' });
    }
  };

  return (
    <PricingRulesAdminView
      rules={rules}
      options={options}
      cables={cables}
      currencies={currencies}
      filters={filters}
      onFiltersChange={setFilters}
      loading={loading}
      message={message}
      dialog={dialog}
      form={form}
      onFormChange={setForm}
      versionForm={versionForm}
      onVersionFormChange={setVersionForm}
      formError={formError}
      submitting={submitting}
      onRefresh={() => void load()}
      onExport={() =>
        void downloadCostingFile(token || null, '/api/master/commercial-pricing-rules/export', 'Commercial_Pricing_Rules.xlsx')
      }
      onOpenCreate={() => {
        setForm(emptyPricingRuleForm());
        setFormError(null);
        setDialog({ kind: 'create' });
      }}
      onCloseDialog={() => {
        setDialog(null);
        setFormError(null);
      }}
      onView={(rule) => {
        setForm(formFromRule(rule));
        setDialog({ kind: 'view', rule });
      }}
      onOpenVersion={(rule) => {
        setVersionForm({ percentageValue: '', effectiveFrom: '' });
        setFormError(null);
        setDialog({ kind: 'version', rule });
      }}
      onOpenHistory={(rule) => void onOpenHistory(rule)}
      onCreate={() => void onCreate()}
      onCreateVersion={() => void onCreateVersion()}
      onWorkflow={(rule, action) => void onWorkflow(rule, action)}
    />
  );
};
