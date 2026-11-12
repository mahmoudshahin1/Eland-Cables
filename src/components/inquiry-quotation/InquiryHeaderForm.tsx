import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  ClipboardList,
  Coins,
  FileText,
  Info,
  Plus,
  Search,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react';
import { CommercialInquiryDto, fetchMarketMetalQuotesForDate, formatInquiryStatus } from '../../services/commercialInquiryApiService';
import {
  applyInquiryCurrencyChange,
  applyPublishedMetalQuotesToForm,
  applySelectedDeliveryCombination,
  metalPriceFieldNote,
  CURRENCY_OPTIONS,
  InquiryHeaderFormState,
  metalRateEditPatch,
  ORGANIZATION_OPTIONS,
  PAYMENT_TERM_OPTIONS,
  TRANSACTION_TYPE_OPTIONS,
} from '../../services/inquiryHeaderFormService';
import { useAuth } from '../../context/AuthContext';
import { CUSTOMER_PROFILE_PATH } from '../../app/shellRoutes';
import { CUSTOMER_PRICE_BASIS_OPTIONS } from '../customer/customerInquiryDetailPresentation';
import { InquiryFieldDefinition } from '../../services/inquiryFieldManifest';
import { StatusBadge } from '../ui/Badge';
import {
  formatInquiryProcessLabel,
  readInquiryProcessFromMetadata,
} from '../../domain/inquiryProcessResolver';
import { buildApprovedMasterSelectState, CUSTOMER_MASTER_DESTINATION_NOT_CONFIGURED_MESSAGE } from '../../domain/inquiryContainerStudyPresentation';
import {
  deliveryCombinationKey,
  matchCustomerDestinationPort,
} from '../../domain/customerDeliveryCombination';
import { requiredMetalsForLines } from '../../domain/inquiryRequiredMetals';

interface InquiryHeaderFormProps {
  form: InquiryHeaderFormState;
  inquiry: CommercialInquiryDto;
  visibleFields: InquiryFieldDefinition[];
  isEditable: boolean;
  isCustomer: boolean;
  canNewVersion?: boolean;
  onChange: (patch: Partial<InquiryHeaderFormState>) => void;
  onNewVersion?: () => void;
  expandSignal?: number;
  destinationPorts?: Array<{ code: string; name: string }>;
  incotermMasters?: Array<{ code: string; name: string; active?: boolean }>;
  deliveryCombinations?: Array<{
    countryCode: string;
    countryLabel: string;
    incotermCode: string;
    destinationPortCode: string;
    destinationPortName: string;
    isDefault?: boolean;
  }>;
  showReturnToContainerStudy?: boolean;
  onReturnToContainerStudy?: () => void;
  customerProfile?: {
    customerCode?: string | null;
    companyName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}

const inputClass =
  'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 font-medium placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
const readOnlyClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 bg-slate-50 text-xs font-medium text-slate-700 select-all';
const metalInputClass =
  'w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 font-semibold outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
const uomFixedClass =
  'shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-center text-xs font-semibold bg-slate-100 text-slate-600';

function isVisible(fields: InquiryFieldDefinition[], id: string): boolean {
  return fields.some((f) => f.id === id);
}

const HeaderField: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className = '' }) => (
  <div className={`min-w-0 space-y-1 ${className}`}>
    <label className="block text-[11px] font-semibold text-slate-600 leading-tight">
      {label}
    </label>
    {children}
  </div>
);

export const InquiryHeaderForm: React.FC<InquiryHeaderFormProps> = ({
  form,
  inquiry,
  visibleFields,
  isEditable,
  isCustomer,
  canNewVersion,
  onChange,
  onNewVersion,
  expandSignal,
  destinationPorts: _destinationPorts = [],
  incotermMasters = [],
  deliveryCombinations = [],
  showReturnToContainerStudy = false,
  onReturnToContainerStudy,
  customerProfile,
}) => {
  const { jwtToken } = useAuth();
  const formRef = useRef(form);
  formRef.current = form;
  const requestedMetalDate = useRef('');
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const [remarksExpanded, setRemarksExpanded] = useState(false);
  const show = (id: string) => isVisible(visibleFields, id);

  useEffect(() => {
    if (expandSignal && expandSignal > 0) {
      setHeaderExpanded(true);
      setRemarksExpanded(true);
    }
  }, [expandSignal]);
  const statusLabel = formatInquiryStatus(inquiry.status);
  const inquiryProcess = readInquiryProcessFromMetadata(inquiry.commercialMetadata);
  const processLabel = inquiryProcess
    ? formatInquiryProcessLabel(inquiryProcess.processCode)
    : 'Standard Workflow';

  const collapsedSummary = useMemo(() => {
    const cu = form.copperPriceRate ? `Cu ${form.copperPriceRate}` : 'Cu —';
    const al = form.aluminiumPriceRate ? `Al ${form.aluminiumPriceRate}` : 'Al —';
    return [form.currency || '—', cu, al, statusLabel].join(' · ');
  }, [form.aluminiumPriceRate, form.copperPriceRate, form.currency, statusLabel]);

  const incotermSelect = useMemo(
    () =>
      buildApprovedMasterSelectState({
        currentValue: form.incoterms,
        records: incotermMasters,
      }),
    [form.incoterms, incotermMasters]
  );
  const incotermConfigured = incotermSelect.configured;
  const selectedDeliveryKey = useMemo(() => {
    const requested = form.destinationPortCode || form.deliveryDestination;
    const match =
      deliveryCombinations.find((row) => deliveryCombinationKey(row) === requested) ||
      matchCustomerDestinationPort(requested, deliveryCombinations);
    return match ? deliveryCombinationKey(match) : '';
  }, [deliveryCombinations, form.deliveryDestination, form.destinationPortCode]);
  const destinationConfigured = Boolean(selectedDeliveryKey);
  const selectedDeliveryCombo = deliveryCombinations.find((row) => deliveryCombinationKey(row) === selectedDeliveryKey);
  const selectedCountryCode = form.destinationCountryCode || selectedDeliveryCombo?.countryCode || '';
  const countryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of deliveryCombinations) {
      if (!seen.has(row.countryCode)) seen.set(row.countryCode, row.countryLabel);
    }
    return [...seen.entries()].map(([countryCode, countryLabel]) => ({ countryCode, countryLabel }));
  }, [deliveryCombinations]);
  const portOptions = useMemo(() => {
    const seen = new Map<string, { code: string; name: string; countryCode: string }>();
    for (const row of deliveryCombinations) {
      if (selectedCountryCode && row.countryCode !== selectedCountryCode) continue;
      if (!seen.has(row.destinationPortCode)) {
        seen.set(row.destinationPortCode, {
          code: row.destinationPortCode,
          name: row.destinationPortName,
          countryCode: row.countryCode,
        });
      }
    }
    return [...seen.values()];
  }, [deliveryCombinations, selectedCountryCode]);
  const destinationCountryLabel =
    countryOptions.find((row) => row.countryCode === selectedCountryCode)?.countryLabel ||
    selectedDeliveryCombo?.countryLabel ||
    '';
  const deliveryFocused = Boolean(showReturnToContainerStudy);
  const defaultedDeliveryFor = useRef<string | null>(null);
  const requiredMetals = useMemo(
    () =>
      requiredMetalsForLines(
        (inquiry.lines || []).map((line) => ({
          conductor: line.conductor,
          cableDescription: line.cableDescription,
        }))
      ),
    [inquiry.lines]
  );
  const requiredMetalsRef = useRef(requiredMetals);
  requiredMetalsRef.current = requiredMetals;

  const publishedQuotePatch = (
    quotes: {
      copper: { id: string; quoteDate: string; cashAsk: number } | null;
      aluminium: { id: string; quoteDate: string; cashAsk: number } | null;
    }
  ) =>
    applyPublishedMetalQuotesToForm(
      formRef.current,
      {
        copper: quotes.copper ? { ...quotes.copper, threeMonthAsk: null } : null,
        aluminium: quotes.aluminium ? { ...quotes.aluminium, threeMonthAsk: null } : null,
      },
      requiredMetalsRef.current
    );

  const onMetalPriceDateChange = (value: string) => {
    const requestKey = value || 'latest';
    requestedMetalDate.current = requestKey;
    onChange({ metalPriceDate: value });
    if (!isEditable || !jwtToken) return;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
    void fetchMarketMetalQuotesForDate(jwtToken, date)
      .then((quotes) => {
        if (requestedMetalDate.current !== requestKey) return;
        const patch = publishedQuotePatch(quotes);
        if (Object.keys(patch).length > 0) onChange(patch);
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!isEditable || !jwtToken) return;
    const needsCopper = requiredMetals.copper && !form.copperPriceRate;
    const needsAluminium = requiredMetals.aluminium && !form.aluminiumPriceRate;
    if (!needsCopper && !needsAluminium) return;
    const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(form.metalPriceDate) ? form.metalPriceDate : '';
    const key = `${inquiry.id}|${requestedDate}|${form.copperPriceRate}|${form.aluminiumPriceRate}|${requiredMetals.copper}|${requiredMetals.aluminium}`;
    if (requestedMetalDate.current === `loaded:${key}`) return;
    requestedMetalDate.current = `loaded:${key}`;
    void fetchMarketMetalQuotesForDate(jwtToken, requestedDate || undefined)
      .then((quotes) => {
        if (requestedMetalDate.current !== `loaded:${key}`) return;
        const patch = publishedQuotePatch(quotes);
        if (Object.keys(patch).length > 0) onChange(patch);
      })
      .catch(() => undefined);
  }, [
    form.aluminiumPriceRate,
    form.copperPriceRate,
    form.metalPriceDate,
    inquiry.id,
    isEditable,
    jwtToken,
    onChange,
    requiredMetals.aluminium,
    requiredMetals.copper,
  ]);

  const metalNote = (metal: 'copper' | 'aluminium') => {
    const required = metal === 'copper' ? requiredMetals.copper : requiredMetals.aluminium;
    const note = metalPriceFieldNote(form, metal, { required });
    if (!note.text) return null;
    return (
      <div
        className={
          note.tone === 'warn'
            ? 'text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200'
            : note.tone === 'muted'
              ? 'text-[10px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200'
              : 'text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200'
        }
      >
        {note.text}
      </div>
    );
  };

  const metalLabel = (label: string, required: boolean) => (
    <>
      {label}
      {required ? <span className="text-red-500"> *</span> : null}
    </>
  );

  useEffect(() => {
    if (!isEditable) return;
    if (defaultedDeliveryFor.current === inquiry.id) return;
    if (form.deliveryDestination || form.destinationPortCode) {
      defaultedDeliveryFor.current = inquiry.id;
      return;
    }
    if (deliveryCombinations.length === 0) return;
    const preferred = deliveryCombinations.find((row) => row.isDefault) || deliveryCombinations[0];
    defaultedDeliveryFor.current = inquiry.id;
    onChange({
      ...applySelectedDeliveryCombination(preferred),
      destinationCountryCode: preferred.countryCode,
    });
  }, [
    deliveryCombinations,
    form.deliveryDestination,
    form.destinationPortCode,
    inquiry.id,
    isEditable,
    onChange,
  ]);

  // Section 1: Commercial Details
  const renderCommercialDetails = () => {
    const hasAny = [
      'transactionType',
      'inquiryDate',
      'customerReference',
      'customerName',
      'organization',
      'contactPerson',
      'salesAgent',
      'projectName',
    ].some(show);

    if (!hasAny) return null;

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
            <Building2 className="h-4 w-4 text-brand-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-800">
              Commercial Details
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {show('transactionType') && (
              <HeaderField
                label={
                  <>
                    Transaction Type <span className="text-red-500">*</span>
                  </>
                }
              >
                {isEditable ? (
                  <select
                    value={form.transactionType}
                    onChange={(e) => onChange({ transactionType: e.target.value })}
                    className={inputClass}
                  >
                    {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className={readOnlyClass}>{form.transactionType}</div>
                )}
              </HeaderField>
            )}

            {show('inquiryDate') && (
              <HeaderField
                label={
                  <>
                    Trx Date <span className="text-red-500">*</span>
                  </>
                }
              >
                {isEditable ? (
                  <input
                    type="date"
                    value={form.inquiryDate}
                    onChange={(e) => onChange({ inquiryDate: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.inquiryDate || '—'}</div>
                )}
              </HeaderField>
            )}

            {show('customerReference') && (
              <HeaderField
                label={
                  <>
                    Ref. No <span className="text-red-500">*</span>
                  </>
                }
              >
                {isEditable ? (
                  <input
                    type="text"
                    value={form.customerReference}
                    onChange={(e) => onChange({ customerReference: e.target.value })}
                    className={`${inputClass} font-mono font-bold text-blue-700`}
                  />
                ) : (
                  <div className={`${readOnlyClass} font-mono font-bold text-blue-700`}>
                    {form.customerReference || '—'}
                  </div>
                )}
              </HeaderField>
            )}

            {show('customerName') && (
              <HeaderField
                label={
                  <>
                    Customer <span className="text-red-500">*</span>
                  </>
                }
              >
                <div className="flex items-center gap-1.5">
                  {isEditable && !isCustomer ? (
                    <input
                      type="text"
                      value={form.customerName}
                      onChange={(e) => onChange({ customerName: e.target.value })}
                      className={`${inputClass} font-bold`}
                    />
                  ) : (
                    <div className={`${readOnlyClass} font-bold`}>{form.customerName}</div>
                  )}
                  {isEditable && !isCustomer && (
                    <button
                      type="button"
                      title="Add New Customer"
                      className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </HeaderField>
            )}

            {show('organization') && (
              <HeaderField
                label={
                  <>
                    Organization <span className="text-red-500">*</span>
                  </>
                }
              >
                {isEditable ? (
                  <select
                    value={form.organization}
                    onChange={(e) => onChange({ organization: e.target.value })}
                    className={inputClass}
                  >
                    {ORGANIZATION_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className={readOnlyClass}>{form.organization}</div>
                )}
              </HeaderField>
            )}

            {show('contactPerson') && (
              <HeaderField label="Contact Person">
                {isEditable ? (
                  <input
                    type="text"
                    value={form.contactPerson}
                    onChange={(e) => onChange({ contactPerson: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.contactPerson || '—'}</div>
                )}
              </HeaderField>
            )}

            {show('salesAgent') && (
              <HeaderField label="Sales Agent">
                {isEditable ? (
                  <input
                    type="text"
                    value={form.salesAgent}
                    onChange={(e) => onChange({ salesAgent: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.salesAgent || '—'}</div>
                )}
              </HeaderField>
            )}

            {show('projectName') && (
              <HeaderField label="Project Name" className="sm:col-span-2">
                {isEditable ? (
                  <input
                    type="text"
                    value={form.projectName}
                    onChange={(e) => onChange({ projectName: e.target.value })}
                    className={`${inputClass} font-semibold`}
                  />
                ) : (
                  <div className={`${readOnlyClass} font-semibold`}>
                    {form.projectName || '—'}
                  </div>
                )}
              </HeaderField>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Section 2: Pricing & Currency
  const renderPricingAndCurrency = () => {
    const hasAny = [
      'currency',
      'exchangeRate',
      'rawMaterialCurrency',
      'rawMaterialExchangeRate',
      'copperPriceRate',
      'aluminiumPriceRate',
    ].some(show);

    if (!hasAny) return null;


    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
            <Coins className="h-4 w-4 text-brand-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-800">
              Pricing & Currency
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {show('currency') && (
              <HeaderField
                label={
                  <>
                    Currency <span className="text-red-500">*</span>
                  </>
                }
              >
                {isEditable ? (
                  <select
                    value={form.currency}
                    onChange={(e) => onChange(applyInquiryCurrencyChange(form, e.target.value))}
                    className={inputClass}
                  >
                    {CURRENCY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className={readOnlyClass}>{form.currency}</div>
                )}
              </HeaderField>
            )}

            {show('exchangeRate') && (
              <HeaderField label="Exchange Rate">
                {isEditable ? (
                  <input
                    type="number"
                    step="any"
                    value={form.exchangeRate}
                    onChange={(e) => onChange({ exchangeRate: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.exchangeRate || '—'}</div>
                )}
              </HeaderField>
            )}

            {show('rawMaterialCurrency') && (
              <HeaderField label="Raw Material Currency">
                <div className={readOnlyClass}>{form.currency}</div>
              </HeaderField>
            )}

            {show('rawMaterialExchangeRate') && (
              <HeaderField label="Raw Material Exchange Rate">
                {isEditable ? (
                  <input
                    type="number"
                    step="any"
                    value={form.rawMaterialExchangeRate}
                    onChange={(e) => onChange({ rawMaterialExchangeRate: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.rawMaterialExchangeRate || '—'}</div>
                )}
              </HeaderField>
            )}

            {show('copperPriceRate') && (
              <HeaderField
                label={metalLabel('Copper Price', requiredMetals.copper)}
              >
                {isEditable ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={form.copperPriceRate}
                        onChange={(e) =>
                          onChange(metalRateEditPatch('copper', e.target.value, form.originalSystemDefaultCopperRate))
                        }
                        className={metalInputClass}
                      />
                      <span className={uomFixedClass}>USD/MT</span>
                    </div>
                    {metalNote('copper')}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className={readOnlyClass}>
                      {form.copperPriceRate ? `${form.copperPriceRate} USD/MT` : '—'}
                    </div>
                    {metalNote('copper')}
                  </div>
                )}
              </HeaderField>
            )}

            {show('aluminiumPriceRate') && (
              <HeaderField
                label={metalLabel('Aluminium Price', requiredMetals.aluminium)}
              >
                {isEditable ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={form.aluminiumPriceRate}
                        onChange={(e) =>
                          onChange(
                            metalRateEditPatch('aluminium', e.target.value, form.originalSystemDefaultAluminiumRate)
                          )
                        }
                        className={metalInputClass}
                      />
                      <span className={uomFixedClass}>USD/MT</span>
                    </div>
                    {metalNote('aluminium')}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className={readOnlyClass}>
                      {form.aluminiumPriceRate ? `${form.aluminiumPriceRate} USD/MT` : '—'}
                    </div>
                    {metalNote('aluminium')}
                  </div>
                )}
              </HeaderField>
            )}
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-start gap-1.5 text-[11px] text-blue-700 bg-blue-50/70 p-2 rounded-lg">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" />
          <span>
            System LME defaults are inherited. You can override these prices for this inquiry.
          </span>
        </div>
      </div>
    );
  };

  // Section 3: Delivery Information
  const renderDeliveryInformation = () => {
    const hasAny = [
      'incoterms',
      'deliveryDestination',
      'requestedDeliveryDate',
      'salesComments',
    ].some(show);

    if (!hasAny) return null;

    return (
      <div
        id="inquiry-delivery-information"
        data-delivery-information="true"
        className={`bg-white border rounded-xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-col justify-between ${
          deliveryFocused ? 'border-amber-400 ring-2 ring-amber-300' : 'border-slate-200'
        }`}
      >
        <div>
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
            <Truck className="h-4 w-4 text-brand-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-800">
              Delivery Information
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-3 text-xs">
            {show('incoterms') && (
              <HeaderField
                label={
                  <>
                    Incoterm <span className="text-red-500">*</span>
                  </>
                }
              >
                {isEditable ? (
                  <select
                    value={incotermSelect.selectedCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      onChange({ incoterms: code, deliveryTerms: code });
                    }}
                    className={`${inputClass} font-semibold text-slate-900`}
                    data-incoterm-master-select="true"
                  >
                    <option value="">Select Incoterm</option>
                    {incotermSelect.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className={readOnlyClass}>
                    {incotermConfigured
                      ? incotermSelect.options.find((opt) => opt.value === incotermSelect.selectedCode)?.label ||
                        incotermSelect.selectedCode
                      : incotermSelect.unresolvedCurrent
                        ? `${incotermSelect.unresolvedCurrent} — Not Configured`
                        : 'Not Configured'}
                  </div>
                )}
                {!incotermConfigured ? (
                  <p className="text-[11px] text-amber-800">
                    {incotermSelect.unresolvedCurrent
                      ? `${incotermSelect.unresolvedCurrent} — Not Configured. Select an approved Incoterm Master record.`
                      : 'Incoterm must be selected from the approved Incoterm Master.'}
                  </p>
                ) : null}
                {incotermMasters.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No approved Incoterm Master records are available.</p>
                ) : null}
              </HeaderField>
            )}

            {show('deliveryDestination') && (
              <>
                <HeaderField label="Country">
                  {isEditable && countryOptions.length > 0 ? (
                    <select
                      value={selectedCountryCode}
                      onChange={(e) =>
                        onChange({
                          destinationCountryCode: e.target.value,
                          destinationPortCode: '',
                          deliveryDestination: '',
                        })
                      }
                      className={`${inputClass} font-semibold text-slate-900`}
                      data-destination-country-select="true"
                    >
                      <option value="">Select country</option>
                      {countryOptions.map((row) => (
                        <option key={row.countryCode} value={row.countryCode}>
                          {row.countryLabel}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className={readOnlyClass}>{destinationCountryLabel || '—'}</div>
                  )}
                </HeaderField>
                <HeaderField label="Destination Port">
                  {isEditable && portOptions.length > 0 ? (
                    <select
                      value={form.destinationPortCode}
                      onChange={(e) => {
                        const port = portOptions.find((row) => row.code === e.target.value);
                        onChange({
                          destinationPortCode: port?.code || '',
                          destinationCountryCode: port?.countryCode || selectedCountryCode,
                          deliveryDestination: port?.name || '',
                        });
                      }}
                      className={`${inputClass} font-semibold text-slate-900`}
                      data-destination-port-master-select="true"
                      data-customer-master-destination={destinationConfigured ? 'configured' : 'not-configured'}
                    >
                      <option value="">Select destination port</option>
                      {portOptions.map((row) => (
                        <option key={row.code} value={row.code}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div
                      className={readOnlyClass}
                      data-destination-port-master-select="true"
                      data-customer-master-destination={destinationConfigured ? 'configured' : 'not-configured'}
                    >
                      {form.destinationPortCode || form.deliveryDestination || CUSTOMER_MASTER_DESTINATION_NOT_CONFIGURED_MESSAGE}
                    </div>
                  )}
                </HeaderField>
              </>
            )}

            {show('requestedDeliveryDate') && (
              <HeaderField label="Delivery Date">
                {isEditable ? (
                  <input
                    type="date"
                    value={form.requestedDeliveryDate}
                    onChange={(e) => onChange({ requestedDeliveryDate: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.requestedDeliveryDate || '—'}</div>
                )}
              </HeaderField>
            )}

            {show('salesComments') && (
              <HeaderField label="Sales Comments">
                {isEditable ? (
                  <textarea
                    rows={2}
                    value={form.salesComments}
                    onChange={(e) => onChange({ salesComments: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.salesComments || '—'}</div>
                )}
              </HeaderField>
            )}
          </div>
          {showReturnToContainerStudy && onReturnToContainerStudy ? (
            <button
              type="button"
              onClick={onReturnToContainerStudy}
              className="mt-3 inline-flex items-center px-3 py-1.5 rounded-xl border border-blue-300 bg-blue-50 text-blue-800 font-bold hover:bg-blue-100"
              data-return-to-container-study="true"
            >
              Return to Container Study
            </button>
          ) : null}
        </div>
      </div>
    );
  };
  const renderStatusAndOwnership = () => {
    const hasAny = ['status', 'versionNo', 'quotationOwner', 'notes'].some(show);
    if (!hasAny) return null;

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
            <ShieldCheck className="h-4 w-4 text-brand-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-800">
              Status & Ownership
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-3 text-xs">
            {show('status') && (
              <HeaderField label="Status">
                <div className="py-1">
                  <StatusBadge status={inquiry.status} label={statusLabel} />
                </div>
              </HeaderField>
            )}

            <HeaderField label="Process">
              <div className="py-1">
                <span className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {processLabel}
                </span>
              </div>
            </HeaderField>

            {show('versionNo') && (
              <HeaderField label="Version No">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    readOnly
                    value={form.versionNo}
                    className={`${readOnlyClass} font-bold`}
                  />
                  {canNewVersion && onNewVersion && (
                    <button
                      type="button"
                      onClick={onNewVersion}
                      className="px-2.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shrink-0 shadow flex items-center gap-1"
                      title="Create new inquiry version"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Version</span>
                    </button>
                  )}
                </div>
              </HeaderField>
            )}

            {show('quotationOwner') && (
              <HeaderField label="Quotation Owner">
                {isEditable ? (
                  <input
                    type="text"
                    value={form.quotationOwner}
                    onChange={(e) => onChange({ quotationOwner: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.quotationOwner || '—'}</div>
                )}
              </HeaderField>
            )}

            {show('notes') && (
              <HeaderField label="Remarks">
                {isEditable ? (
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => onChange({ notes: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.notes || '—'}</div>
                )}
              </HeaderField>
            )}
          </div>
        </div>
      </div>
    );
  };

  const customerCardClass =
    'rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex flex-col min-w-0';
  const customerTitleClass = 'flex items-center gap-2 pb-3 mb-3 border-b border-slate-100';
  const paymentTermOptions = Array.from(
    new Set([...PAYMENT_TERM_OPTIONS, form.paymentTerms].filter((value) => String(value || '').trim()))
  );
  const priceBasisOptions = Array.from(
    new Set([...CUSTOMER_PRICE_BASIS_OPTIONS, form.priceBasis].filter((value) => String(value || '').trim()))
  );

  if (isCustomer) {
    return (
      <div className="space-y-3">
        <div id="inquiry-header" className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[var(--shadow-card)]">
          <button
            type="button"
            onClick={() => setHeaderExpanded((open) => !open)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50/80 transition-colors"
            aria-expanded={headerExpanded}
          >
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#2F6BFF]" />
              <span className="text-[13px] font-bold text-[#2F6BFF]">Inquiry Header</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform ${headerExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          {headerExpanded && (
            <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <section className={customerCardClass}>
                <div className={customerTitleClass}>
                  <User className="h-4 w-4 text-[#2F6BFF]" />
                  <h3 className="text-[13px] font-bold text-[#2F6BFF]">Customer Information</h3>
                </div>
                <div className="space-y-2.5">
                  <HeaderField
                    label={
                      <>
                        Customer <span className="text-red-500">*</span>
                      </>
                    }
                  >
                    <div className="relative">
                      <div className={`${readOnlyClass} font-semibold pr-8`}>
                        {customerProfile?.companyName || form.customerName || '—'}
                      </div>
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute end-2.5 top-1/2 -translate-y-1/2" />
                    </div>
                  </HeaderField>
                  <HeaderField label="Customer Code">
                    <div className={`${readOnlyClass} font-mono`}>{customerProfile?.customerCode || inquiry.customerId || '—'}</div>
                  </HeaderField>
                  {show('contactPerson') && (
                    <HeaderField label="Contact Person">
                      {isEditable ? (
                        <input
                          type="text"
                          value={form.contactPerson}
                          onChange={(e) => onChange({ contactPerson: e.target.value })}
                          className={inputClass}
                        />
                      ) : (
                        <div className={readOnlyClass}>{form.contactPerson || '—'}</div>
                      )}
                    </HeaderField>
                  )}
                  <HeaderField label="Email">
                    <div className={readOnlyClass}>{customerProfile?.email || '—'}</div>
                  </HeaderField>
                  <HeaderField label="Phone">
                    <div className={readOnlyClass}>
                      {customerProfile?.phone ||
                        (typeof inquiry.commercialMetadata?.contactPhone === 'string'
                          ? inquiry.commercialMetadata.contactPhone
                          : '') ||
                        '—'}
                    </div>
                  </HeaderField>
                  <Link
                    to={CUSTOMER_PROFILE_PATH}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#2F6BFF] hover:underline pt-1"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    View Customer Profile
                  </Link>
                </div>
              </section>

              <section className={customerCardClass}>
                <div className={customerTitleClass}>
                  <ClipboardList className="h-4 w-4 text-[#2F6BFF]" />
                  <h3 className="text-[13px] font-bold text-[#2F6BFF]">Project & Inquiry Information</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {show('transactionType') && (
                    <HeaderField label="Transaction Type">
                      {isEditable ? (
                        <select
                          value={form.transactionType}
                          onChange={(e) => onChange({ transactionType: e.target.value })}
                          className={inputClass}
                        >
                          {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className={readOnlyClass}>{form.transactionType}</div>
                      )}
                    </HeaderField>
                  )}
                  <HeaderField label="Inquiry No.">
                    <div className={`${readOnlyClass} font-mono text-[#2F6BFF]`}>{inquiry.inquiryNumber}</div>
                  </HeaderField>
                  {show('inquiryDate') && (
                    <HeaderField
                      label={
                        <>
                          Transaction Date <span className="text-red-500">*</span>
                        </>
                      }
                    >
                      {isEditable ? (
                        <input
                          type="date"
                          value={form.inquiryDate}
                          onChange={(e) => onChange({ inquiryDate: e.target.value })}
                          className={inputClass}
                        />
                      ) : (
                        <div className={readOnlyClass}>{form.inquiryDate || '—'}</div>
                      )}
                    </HeaderField>
                  )}
                  {show('projectName') && (
                    <HeaderField
                      label={
                        <>
                          Project Name / Reference <span className="text-red-500">*</span>
                        </>
                      }
                      className="sm:col-span-2"
                    >
                      {isEditable ? (
                        <input
                          type="text"
                          value={form.projectName}
                          onChange={(e) => onChange({ projectName: e.target.value })}
                          className={inputClass}
                        />
                      ) : (
                        <div className={readOnlyClass}>{form.projectName || '—'}</div>
                      )}
                    </HeaderField>
                  )}
                  <HeaderField label="End User" className="sm:col-span-2">
                    {isEditable ? (
                      <input
                        type="text"
                        value={form.endUser}
                        onChange={(e) => onChange({ endUser: e.target.value })}
                        className={inputClass}
                      />
                    ) : (
                      <div className={readOnlyClass}>{form.endUser || '—'}</div>
                    )}
                  </HeaderField>
                  {show('customerReference') && (
                    <HeaderField label="Customer RFQ No.">
                      {isEditable ? (
                        <input
                          type="text"
                          value={form.customerReference}
                          onChange={(e) => onChange({ customerReference: e.target.value })}
                          className={inputClass}
                        />
                      ) : (
                        <div className={readOnlyClass}>{form.customerReference || '—'}</div>
                      )}
                    </HeaderField>
                  )}
                  <HeaderField label="Customer PO / Tender No.">
                    {isEditable ? (
                      <input
                        type="text"
                        value={form.customerPoTenderNo}
                        onChange={(e) => onChange({ customerPoTenderNo: e.target.value })}
                        className={inputClass}
                      />
                    ) : (
                      <div className={readOnlyClass}>{form.customerPoTenderNo || '—'}</div>
                    )}
                  </HeaderField>
                  <HeaderField
                    label={
                      <>
                        Inquiry Type <span className="text-red-500">*</span>
                      </>
                    }
                    className="sm:col-span-2"
                  >
                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      <label className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
                        <input
                          type="radio"
                          name="inquiryKind"
                          checked={form.inquiryKind !== 'TECHNICAL'}
                          disabled={!isEditable}
                          onChange={() => onChange({ inquiryKind: 'PRICE' })}
                        />
                        Price Inquiry
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
                        <input
                          type="radio"
                          name="inquiryKind"
                          checked={form.inquiryKind === 'TECHNICAL'}
                          disabled={!isEditable}
                          onChange={() => onChange({ inquiryKind: 'TECHNICAL' })}
                        />
                        Technical Inquiry
                      </label>
                    </div>
                  </HeaderField>
                  {(show('organization') || show('salesAgent') || show('quotationOwner') || show('versionNo')) && (
                    <details className="sm:col-span-2 pt-1">
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">
                        Additional commercial fields
                      </summary>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                        {show('organization') && (
                          <HeaderField label="Organization">
                            {isEditable ? (
                              <select
                                value={form.organization}
                                onChange={(e) => onChange({ organization: e.target.value })}
                                className={inputClass}
                              >
                                {ORGANIZATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className={readOnlyClass}>{form.organization}</div>
                            )}
                          </HeaderField>
                        )}
                        {show('salesAgent') && (
                          <HeaderField label="Sales Agent">
                            {isEditable ? (
                              <input
                                type="text"
                                value={form.salesAgent}
                                onChange={(e) => onChange({ salesAgent: e.target.value })}
                                className={inputClass}
                              />
                            ) : (
                              <div className={readOnlyClass}>{form.salesAgent || '—'}</div>
                            )}
                          </HeaderField>
                        )}
                        {show('quotationOwner') && (
                          <HeaderField label="Quotation Owner">
                            {isEditable ? (
                              <input
                                type="text"
                                value={form.quotationOwner}
                                onChange={(e) => onChange({ quotationOwner: e.target.value })}
                                className={inputClass}
                              />
                            ) : (
                              <div className={readOnlyClass}>{form.quotationOwner || '—'}</div>
                            )}
                          </HeaderField>
                        )}
                        {show('versionNo') && (
                          <HeaderField label="Version No">
                            <div className={`${readOnlyClass} font-bold`}>V{form.versionNo}</div>
                          </HeaderField>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </section>

              <section className={customerCardClass} data-customer-pricing-card="true">
                <div className={customerTitleClass}>
                  <Coins className="h-4 w-4 text-[#2F6BFF]" />
                  <h3 className="text-[13px] font-bold text-[#2F6BFF]">Pricing & Currency</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {show('currency') && (
                    <HeaderField label="Currency" className="sm:col-span-2">
                      {isEditable ? (
                        <select
                          value={form.currency}
                          onChange={(e) => onChange(applyInquiryCurrencyChange(form, e.target.value))}
                          className={inputClass}
                        >
                          {CURRENCY_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className={readOnlyClass}>{form.currency}</div>
                      )}
                    </HeaderField>
                  )}
                  {show('rawMaterialCurrency') && (
                    <HeaderField label="Raw Material Currency" className="sm:col-span-2">
                      <div className={readOnlyClass}>{form.rawMaterialCurrency || form.currency}</div>
                    </HeaderField>
                  )}
                  {show('copperPriceRate') && (
                    <HeaderField label={metalLabel('Copper Price (MT)', requiredMetals.copper)}>
                      {isEditable ? (
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={form.copperPriceRate}
                          onChange={(e) =>
                            onChange(metalRateEditPatch('copper', e.target.value, form.originalSystemDefaultCopperRate))
                          }
                          className={metalInputClass}
                        />
                      ) : (
                        <div className={readOnlyClass}>{form.copperPriceRate || '—'}</div>
                      )}
                      <div className="mt-1">{metalNote('copper')}</div>
                    </HeaderField>
                  )}
                  {show('aluminiumPriceRate') && (
                    <HeaderField label={metalLabel('Aluminum Price (MT)', requiredMetals.aluminium)}>
                      {isEditable ? (
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={form.aluminiumPriceRate}
                          onChange={(e) =>
                            onChange(
                              metalRateEditPatch('aluminium', e.target.value, form.originalSystemDefaultAluminiumRate)
                            )
                          }
                          className={metalInputClass}
                        />
                      ) : (
                        <div className={readOnlyClass}>{form.aluminiumPriceRate || '—'}</div>
                      )}
                      <div className="mt-1">{metalNote('aluminium')}</div>
                    </HeaderField>
                  )}
                  <HeaderField label="Metal Price Date" className="sm:col-span-2">
                    {isEditable ? (
                      <input
                        type="date"
                        value={form.metalPriceDate}
                        onChange={(e) => onMetalPriceDateChange(e.target.value)}
                        className={inputClass}
                      />
                    ) : (
                      <div className={readOnlyClass}>{form.metalPriceDate || '—'}</div>
                    )}
                  </HeaderField>
                  <HeaderField label="Price Basis" className="sm:col-span-2">
                    {isEditable ? (
                      <select
                        value={form.priceBasis}
                        onChange={(e) => onChange({ priceBasis: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">Select</option>
                        {priceBasisOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className={readOnlyClass}>{form.priceBasis || '—'}</div>
                    )}
                  </HeaderField>
                </div>
              </section>

              <section
                id="inquiry-delivery-information"
                data-delivery-information="true"
                className={`${customerCardClass} ${
                  deliveryFocused ? 'border-amber-400 ring-2 ring-amber-300' : ''
                }`}
              >
                <div className={customerTitleClass}>
                  <Truck className="h-4 w-4 text-[#2F6BFF]" />
                  <h3 className="text-[13px] font-bold text-[#2F6BFF]">Delivery & Commercial</h3>
                </div>
                <div className="space-y-2.5">
                  <HeaderField
                    label={
                      <>
                        Required Quotation Date <span className="text-red-500">*</span>
                      </>
                    }
                  >
                    {isEditable ? (
                      <input
                        type="date"
                        value={form.requiredQuotationDate}
                        onChange={(e) => onChange({ requiredQuotationDate: e.target.value })}
                        className={inputClass}
                      />
                    ) : (
                      <div className={readOnlyClass}>{form.requiredQuotationDate || '—'}</div>
                    )}
                  </HeaderField>
                  {show('requestedDeliveryDate') && (
                    <HeaderField label="Target Delivery Date">
                      {isEditable ? (
                        <input
                          type="date"
                          value={form.requestedDeliveryDate}
                          onChange={(e) => onChange({ requestedDeliveryDate: e.target.value })}
                          className={inputClass}
                        />
                      ) : (
                        <div className={readOnlyClass}>{form.requestedDeliveryDate || '—'}</div>
                      )}
                    </HeaderField>
                  )}
                  {show('deliveryDestination') && (
                    <>
                      <HeaderField label="Country">
                        {isEditable && countryOptions.length > 0 ? (
                          <select
                            value={selectedCountryCode}
                            onChange={(e) =>
                              onChange({
                                destinationCountryCode: e.target.value,
                                destinationPortCode: '',
                                deliveryDestination: '',
                              })
                            }
                            className={inputClass}
                            data-destination-country-select="true"
                          >
                            <option value="">Select country</option>
                            {countryOptions.map((row) => (
                              <option key={row.countryCode} value={row.countryCode}>
                                {row.countryLabel}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className={readOnlyClass}>{destinationCountryLabel || '—'}</div>
                        )}
                      </HeaderField>
                      <HeaderField label="Destination Port">
                        {isEditable && portOptions.length > 0 ? (
                          <select
                            value={form.destinationPortCode}
                            onChange={(e) => {
                              const port = portOptions.find((row) => row.code === e.target.value);
                              onChange({
                                destinationPortCode: port?.code || '',
                                destinationCountryCode: port?.countryCode || selectedCountryCode,
                                deliveryDestination: port?.name || '',
                              });
                            }}
                            className={inputClass}
                            data-destination-port-master-select="true"
                          >
                            <option value="">Select destination port</option>
                            {portOptions.map((row) => (
                              <option key={row.code} value={row.code}>
                                {row.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className={readOnlyClass} data-destination-port-master-select="true">
                            {form.destinationPortCode ||
                              form.deliveryDestination ||
                              CUSTOMER_MASTER_DESTINATION_NOT_CONFIGURED_MESSAGE}
                          </div>
                        )}
                      </HeaderField>
                    </>
                  )}
                  {show('incoterms') && (
                    <HeaderField label="Incoterm">
                      {isEditable ? (
                        <select
                          value={incotermSelect.selectedCode}
                          onChange={(e) => {
                            const code = e.target.value;
                            onChange({ incoterms: code, deliveryTerms: code });
                          }}
                          className={inputClass}
                          data-incoterm-master-select="true"
                        >
                          <option value="">Select Incoterm</option>
                          {incotermSelect.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className={readOnlyClass}>
                          {incotermConfigured
                            ? incotermSelect.options.find((opt) => opt.value === incotermSelect.selectedCode)?.label ||
                              incotermSelect.selectedCode
                            : 'Not Configured'}
                        </div>
                      )}
                    </HeaderField>
                  )}
                  {show('paymentTerms') && (
                    <HeaderField label="Payment Terms">
                      {isEditable ? (
                        <select
                          value={form.paymentTerms}
                          onChange={(e) => onChange({ paymentTerms: e.target.value })}
                          className={inputClass}
                        >
                          <option value="">Select</option>
                          {paymentTermOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className={readOnlyClass}>{form.paymentTerms || '—'}</div>
                      )}
                    </HeaderField>
                  )}
                  <HeaderField label="Delivery Address">
                    {isEditable ? (
                      <input
                        type="text"
                        value={form.deliveryAddress}
                        onChange={(e) => onChange({ deliveryAddress: e.target.value })}
                        className={inputClass}
                      />
                    ) : (
                      <div className={readOnlyClass}>{form.deliveryAddress || '—'}</div>
                    )}
                  </HeaderField>
                  {showReturnToContainerStudy && onReturnToContainerStudy ? (
                    <button
                      type="button"
                      onClick={onReturnToContainerStudy}
                      className="inline-flex items-center px-3 py-1.5 rounded-xl border border-blue-300 bg-blue-50 text-blue-800 font-bold hover:bg-blue-100"
                      data-return-to-container-study="true"
                    >
                      Return to Container Study
                    </button>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[var(--shadow-card)]">
          <button
            type="button"
            onClick={() => setRemarksExpanded((open) => !open)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50/80"
            aria-expanded={remarksExpanded}
          >
            <span className="text-[13px] font-bold text-slate-800">Customer Requirements & Special Conditions</span>
            <ChevronDown className={`h-4 w-4 text-slate-400 ${remarksExpanded ? '' : '-rotate-90'}`} />
          </button>
          {remarksExpanded && show('notes') && (
            <div className="px-4 pb-4">
              <HeaderField label="Remarks">
                {isEditable ? (
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => onChange({ notes: e.target.value })}
                    className={inputClass}
                  />
                ) : (
                  <div className={readOnlyClass}>{form.notes || '—'}</div>
                )}
              </HeaderField>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setHeaderExpanded((open) => !open)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left bg-slate-50/50 hover:bg-slate-50 border-b border-slate-100 transition-colors"
        aria-expanded={headerExpanded}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-brand-100 text-brand-700">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-800">
            Inquiry Header
          </span>
          {!headerExpanded && (
            <span className="ml-2 text-xs font-medium text-slate-500">
              {collapsedSummary}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
            headerExpanded ? '' : '-rotate-90'
          }`}
        />
      </button>

      {headerExpanded && (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 bg-slate-50/30">
          {renderCommercialDetails()}
          {renderPricingAndCurrency()}
          {renderDeliveryInformation()}
          {renderStatusAndOwnership()}
        </div>
      )}
    </div>
  );
};
