import { CommercialInquiryDto, formatInquiryStatus } from './commercialInquiryApiService';
import { UpdateInquiryInput } from '../domain/commercialDomain';
import {
  metalHeaderPatchFromPublished,
  type PublishedCableMetalQuotes,
} from '../domain/cableMetalPriceResolution';
import type { RequiredInquiryMetals } from '../domain/inquiryRequiredMetals';
import {
  formatDeliveryCombinationLabel,
  type CustomerDeliveryCombinationView,
} from '../domain/customerDeliveryCombination';

export interface InquiryHeaderFormState {
  transactionType: string;
  inquiryDate: string;
  customerReference: string;
  customerName: string;
  organization: string;
  contactPerson: string;
  salesAgent: string;
  projectName: string;
  currency: string;
  exchangeRate: string;
  rawMaterialCurrency: string;
  rawMaterialExchangeRate: string;
  copperPriceRate: string;
  copperPriceUom: string;
  copperPriceSource: string;
  copperMarketPriceId: string;
  copperMarketQuoteDate: string;
  aluminiumPriceRate: string;
  aluminiumPriceUom: string;
  aluminiumPriceSource: string;
  aluminiumMarketPriceId: string;
  aluminiumMarketQuoteDate: string;
  originalSystemDefaultCopperRate: string;
  originalSystemDefaultAluminiumRate: string;
  requestedDeliveryDate: string;
  versionNo: number;
  quotationOwner: string;
  deliveryTerms: string;
  deliveryDestination: string;
  destinationPortCode: string;
  incoterms: string;
  paymentTerms: string;
  notes: string;
  salesComments: string;
  endUser: string;
  customerPoTenderNo: string;
  inquiryKind: 'PRICE' | 'TECHNICAL' | '';
  metalPriceDate: string;
  priceBasis: string;
  requiredQuotationDate: string;
  deliveryAddress: string;
}

export const TRANSACTION_TYPE_OPTIONS = [
  'Customer Request',
  'Sales Quotation',
  'Tender Inquiry',
] as const;

export const ORGANIZATION_OPTIONS = ['1 - Energya Cables', 'ELAND Cables', 'Energya Export'] as const;

export const CURRENCY_OPTIONS = ['LE', 'USD', 'EUR', 'SAR', 'GBP'] as const;

export const PAYMENT_TERM_OPTIONS = [
  'LC at sight',
  '30 days net',
  '60 days net',
  'Advance payment',
] as const;

function meta(inquiry: CommercialInquiryDto, key: string, fallback = ''): string {
  const value = inquiry.commercialMetadata?.[key];
  if (value == null || value === '') return fallback;
  return String(value);
}

function metaNumber(inquiry: CommercialInquiryDto, key: string, fallback = ''): string {
  const value = inquiry.commercialMetadata?.[key];
  if (value == null || value === '') return fallback;
  return String(value);
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function todayDateInput(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function originalSystemRate(inquiry: CommercialInquiryDto, metal: 'copper' | 'aluminium'): string {
  const orig = inquiry.commercialMetadata?.originalSystemDefault;
  if (!orig || typeof orig !== 'object') return '';
  const side = (orig as Record<string, unknown>)[metal];
  if (!side || typeof side !== 'object') return '';
  const rate = (side as Record<string, unknown>).priceRate;
  if (rate == null || rate === '') return '';
  return String(rate);
}

export function buildHeaderFormFromInquiry(inquiry: CommercialInquiryDto): InquiryHeaderFormState {
  return {
    transactionType: meta(inquiry, 'transactionType', 'Customer Request'),
    inquiryDate: toDateInput(inquiry.inquiryDate),
    customerReference: inquiry.customerReference || '',
    customerName: inquiry.customerName || '',
    organization: meta(inquiry, 'organization', inquiry.customerName || '1 - Energya Cables'),
    contactPerson: inquiry.contactPerson || '',
    salesAgent: inquiry.salesAgent || '',
    projectName: inquiry.projectName || '',
    currency: inquiry.currency || 'USD',
    exchangeRate: metaNumber(inquiry, 'exchangeRate', '1'),
    rawMaterialCurrency: meta(inquiry, 'rawMaterialCurrency', 'USD'),
    rawMaterialExchangeRate: metaNumber(inquiry, 'rawMaterialExchangeRate', '1'),
    copperPriceRate: metaNumber(inquiry, 'copperPriceRate', ''),
    copperPriceUom: meta(inquiry, 'copperPriceUom', 'USD/MT'),
    copperPriceSource: meta(inquiry, 'copperPriceSource', ''),
    copperMarketPriceId: meta(inquiry, 'copperMarketPriceId', ''),
    copperMarketQuoteDate: meta(inquiry, 'copperMarketQuoteDate', ''),
    aluminiumPriceRate: metaNumber(inquiry, 'aluminiumPriceRate', ''),
    aluminiumPriceUom: meta(inquiry, 'aluminiumPriceUom', 'USD/MT'),
    aluminiumPriceSource: meta(inquiry, 'aluminiumPriceSource', ''),
    aluminiumMarketPriceId: meta(inquiry, 'aluminiumMarketPriceId', ''),
    aluminiumMarketQuoteDate: meta(inquiry, 'aluminiumMarketQuoteDate', ''),
    originalSystemDefaultCopperRate: originalSystemRate(inquiry, 'copper'),
    originalSystemDefaultAluminiumRate: originalSystemRate(inquiry, 'aluminium'),
    requestedDeliveryDate: toDateInput(inquiry.requestedDeliveryDate),
    versionNo: inquiry.versionNo || 1,
    quotationOwner: inquiry.quotationOwner || inquiry.createdBy || '',
    deliveryTerms: inquiry.deliveryTerms || inquiry.incoterms || '',
    deliveryDestination: meta(inquiry, 'deliveryDestination', ''),
    destinationPortCode: meta(inquiry, 'destinationPortCode', ''),
    incoterms: inquiry.incoterms || '',
    paymentTerms: inquiry.paymentTerms || '',
    notes: inquiry.notes || '',
    salesComments: meta(inquiry, 'salesComments', ''),
    endUser: meta(inquiry, 'endUser', ''),
    customerPoTenderNo: meta(inquiry, 'customerPoTenderNo', ''),
    inquiryKind: (meta(inquiry, 'inquiryKind', '') === 'TECHNICAL' ? 'TECHNICAL' : meta(inquiry, 'inquiryKind', '') === 'PRICE' ? 'PRICE' : '') as
      | 'PRICE'
      | 'TECHNICAL'
      | '',
    metalPriceDate: toDateInput(meta(inquiry, 'metalPriceDate', '')),
    priceBasis: meta(inquiry, 'priceBasis', ''),
    requiredQuotationDate:
      toDateInput(meta(inquiry, 'requiredQuotationDate', '')) || todayDateInput(),
    deliveryAddress: meta(inquiry, 'deliveryAddress', ''),
  };
}

export const COPPER_PRICE_REQUIRED = 'COPPER_PRICE_REQUIRED';
export const ALUMINIUM_PRICE_REQUIRED = 'ALUMINIUM_PRICE_REQUIRED';
export const DESTINATION_REQUIRED = 'DESTINATION_REQUIRED';
export const INCOTERMS_REQUIRED = 'INCOTERMS_REQUIRED';
export const LINES_REQUIRED = 'LINES_REQUIRED';
export const CALCULATION_REQUIRED = 'CALCULATION_REQUIRED';
export const TECHNICAL_OFFER_REQUIRED = 'TECHNICAL_OFFER_REQUIRED';

export interface InquirySubmitMissingItem {
  code: string;
  label: string;
  detail?: string;
}

export function parseFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Submit requires a numeric rate strictly greater than zero. Does not invent LME values. */
export function parsePositiveMetalRate(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

export function collectInquirySubmitHeaderCodes(input: {
  copperPriceRate?: unknown;
  aluminiumPriceRate?: unknown;
  requiredMetals?: RequiredInquiryMetals;
}): string[] {
  const required = input.requiredMetals ?? { copper: true, aluminium: true };
  const codes: string[] = [];
  if (required.copper && parsePositiveMetalRate(input.copperPriceRate) == null) codes.push(COPPER_PRICE_REQUIRED);
  if (required.aluminium && parsePositiveMetalRate(input.aluminiumPriceRate) == null) codes.push(ALUMINIUM_PRICE_REQUIRED);
  return codes;
}

export function formatInquirySubmitHeaderMessage(codes: string[]): string {
  if (!codes.length) return '';
  return `Inquiry submit blocked: ${codes.join(', ')}. The required metal price must be numeric and greater than 0.`;
}

export function collectInquirySubmitMissingItems(input: {
  copperPriceRate?: unknown;
  aluminiumPriceRate?: unknown;
  deliveryDestination?: unknown;
  incoterms?: unknown;
  lineCount?: number;
  mappedLinesNeedingCalc?: Array<{ lineNumber: number }>;
  linesMissingTechnicalOffer?: number[];
  requiredMetals?: RequiredInquiryMetals;
}): InquirySubmitMissingItem[] {
  const required = input.requiredMetals ?? { copper: true, aluminium: true };
  const items: InquirySubmitMissingItem[] = [];
  if (required.copper && parsePositiveMetalRate(input.copperPriceRate) == null) {
    items.push({ code: COPPER_PRICE_REQUIRED, label: 'Copper Price' });
  }
  if (required.aluminium && parsePositiveMetalRate(input.aluminiumPriceRate) == null) {
    items.push({ code: ALUMINIUM_PRICE_REQUIRED, label: 'Aluminium Price' });
  }
  if (!String(input.deliveryDestination ?? '').trim()) {
    items.push({ code: DESTINATION_REQUIRED, label: 'Destination' });
  }
  if (!String(input.incoterms ?? '').trim()) {
    items.push({ code: INCOTERMS_REQUIRED, label: 'Incoterm' });
  }
  if (!input.lineCount) {
    items.push({ code: LINES_REQUIRED, label: 'At least one cable line' });
  }
  if (input.mappedLinesNeedingCalc && input.mappedLinesNeedingCalc.length > 0) {
    const nos = input.mappedLinesNeedingCalc.map((line) => `#${line.lineNumber}`).join(', ');
    items.push({
      code: CALCULATION_REQUIRED,
      label: 'Costing calculation',
      detail: `Run Calculate for mapped line(s): ${nos}.`,
    });
  }
  if (input.linesMissingTechnicalOffer && input.linesMissingTechnicalOffer.length > 0) {
    const nos = input.linesMissingTechnicalOffer.map((n) => `#${n}`).join(', ');
    items.push({
      code: TECHNICAL_OFFER_REQUIRED,
      label: 'Technical Offer attachment',
      detail: `Attach Technical Offer for line(s): ${nos}.`,
    });
  }
  return items;
}

/** Submit stays visible for DRAFT inquiries. Missing fields open a popup instead of hiding/disabling the button. */
export function canShowInquirySubmit(status?: string | null): boolean {
  return (status || '').toUpperCase() === 'DRAFT';
}

/** Calculate is available while the inquiry is still editable and has cable lines. */
export function canShowInquiryCalculate(status?: string | null, lineCount = 0): boolean {
  const normalized = (status || '').toUpperCase();
  return (normalized === 'DRAFT' || normalized === 'UNDER_REVIEW') && lineCount > 0;
}

/**
 * Explicit user selection of an approved delivery combination.
 * Does not auto-select a default, first option, or customer-master fallback.
 * Leaves deliveryTerms unchanged — that field is not the Container Study destination.
 */
export function applySelectedDeliveryCombination(
  combo:
    | Pick<CustomerDeliveryCombinationView, 'countryLabel' | 'incotermCode' | 'destinationPortCode' | 'destinationPortName'>
    | null
    | undefined
): Partial<InquiryHeaderFormState> {
  if (!combo) {
    return { destinationPortCode: '', deliveryDestination: '' };
  }
  return {
    destinationPortCode: combo.destinationPortCode,
    deliveryDestination: formatDeliveryCombinationLabel(combo),
    incoterms: combo.incotermCode,
  };
}

export function buildUpdatePayloadFromForm(form: InquiryHeaderFormState): UpdateInquiryInput {
  const commercialMetadata: Record<string, unknown> = {
    transactionType: form.transactionType,
    organization: form.organization,
    exchangeRate: parseFiniteNumber(form.exchangeRate) ?? undefined,
    rawMaterialCurrency: form.rawMaterialCurrency,
    rawMaterialExchangeRate: parseFiniteNumber(form.rawMaterialExchangeRate) ?? undefined,
    salesComments: form.salesComments,
    incoterms: form.incoterms,
    deliveryDestination: form.deliveryDestination.trim() || null,
    destinationPortCode: form.destinationPortCode.trim() || null,
    copperPriceRate: parseFiniteNumber(form.copperPriceRate),
    copperPriceUom: 'USD/MT',
    copperPriceSource: form.copperPriceSource || undefined,
    copperMarketPriceId: form.copperMarketPriceId.trim() || null,
    copperMarketQuoteDate: form.copperMarketQuoteDate.trim() || null,
    aluminiumPriceRate: parseFiniteNumber(form.aluminiumPriceRate),
    aluminiumPriceUom: 'USD/MT',
    aluminiumPriceSource: form.aluminiumPriceSource || undefined,
    aluminiumMarketPriceId: form.aluminiumMarketPriceId.trim() || null,
    aluminiumMarketQuoteDate: form.aluminiumMarketQuoteDate.trim() || null,
    endUser: form.endUser || undefined,
    customerPoTenderNo: form.customerPoTenderNo || undefined,
    inquiryKind: form.inquiryKind || undefined,
    metalPriceDate: form.metalPriceDate || undefined,
    priceBasis: form.priceBasis || undefined,
    requiredQuotationDate: form.requiredQuotationDate || undefined,
    deliveryAddress: form.deliveryAddress || undefined,
  };

  return {
    customerName: form.customerName || undefined,
    contactPerson: form.contactPerson || undefined,
    customerReference: form.customerReference || undefined,
    inquiryDate: form.inquiryDate || undefined,
    requestedDeliveryDate: form.requestedDeliveryDate || undefined,
    currency: form.currency,
    incoterms: form.incoterms,
    paymentTerms: form.paymentTerms,
    deliveryTerms: form.deliveryTerms || form.incoterms,
    projectName: form.projectName || undefined,
    notes: form.notes || undefined,
    salesAgent: form.salesAgent || undefined,
    quotationOwner: form.quotationOwner || undefined,
    commercialMetadata,
  };
}

export function applyInquiryCurrencyChange(
  form: InquiryHeaderFormState,
  nextCurrency: string
): Partial<InquiryHeaderFormState> {
  if (form.currency === nextCurrency) {
    return { currency: nextCurrency };
  }
  return {
    currency: nextCurrency,
    rawMaterialCurrency: nextCurrency,
    copperPriceRate: '',
    aluminiumPriceRate: '',
    copperPriceUom: 'USD/MT',
    aluminiumPriceUom: 'USD/MT',
    copperPriceSource: '',
    aluminiumPriceSource: '',
    copperMarketPriceId: '',
    copperMarketQuoteDate: '',
    aluminiumMarketPriceId: '',
    aluminiumMarketQuoteDate: '',
    originalSystemDefaultCopperRate: '',
    originalSystemDefaultAluminiumRate: '',
  };
}

/** Fills only empty metal rates from a published cash ask. A typed positive rate stays. */
export function applyPublishedMetalQuotesToForm(
  form: Pick<InquiryHeaderFormState, 'copperPriceRate' | 'aluminiumPriceRate'>,
  quotes: PublishedCableMetalQuotes,
  required?: RequiredInquiryMetals
): Partial<InquiryHeaderFormState> {
  const patch = metalHeaderPatchFromPublished(
    {
      copperPriceRate: parseFiniteNumber(form.copperPriceRate),
      aluminiumPriceRate: parseFiniteNumber(form.aluminiumPriceRate),
    },
    quotes,
    required
  );
  const next: Partial<InquiryHeaderFormState> = {};
  if (patch.copperPriceRate != null) {
    next.copperPriceRate = String(patch.copperPriceRate);
    next.copperPriceUom = 'USD/MT';
    next.copperPriceSource = '';
    next.copperMarketPriceId = patch.copperMarketPriceId == null ? '' : String(patch.copperMarketPriceId);
    next.copperMarketQuoteDate = patch.copperMarketQuoteDate == null ? '' : String(patch.copperMarketQuoteDate);
  }
  if (patch.aluminiumPriceRate != null) {
    next.aluminiumPriceRate = String(patch.aluminiumPriceRate);
    next.aluminiumPriceUom = 'USD/MT';
    next.aluminiumPriceSource = '';
    next.aluminiumMarketPriceId = patch.aluminiumMarketPriceId == null ? '' : String(patch.aluminiumMarketPriceId);
    next.aluminiumMarketQuoteDate = patch.aluminiumMarketQuoteDate == null ? '' : String(patch.aluminiumMarketQuoteDate);
  }
  return next;
}

export function metalRateEditPatch(
  metal: 'copper' | 'aluminium',
  rate: string,
  originalRate: string
): Partial<InquiryHeaderFormState> {
  const source = resolveMetalPriceSourceForEdit(rate, originalRate);
  if (metal === 'copper') {
    return {
      copperPriceRate: rate,
      copperPriceUom: 'USD/MT',
      copperPriceSource: source,
      copperMarketPriceId: '',
      copperMarketQuoteDate: '',
    };
  }
  return {
    aluminiumPriceRate: rate,
    aluminiumPriceUom: 'USD/MT',
    aluminiumPriceSource: source,
    aluminiumMarketPriceId: '',
    aluminiumMarketQuoteDate: '',
  };
}

export function metalPriceFieldNote(
  form: Pick<
    InquiryHeaderFormState,
    | 'copperPriceRate'
    | 'aluminiumPriceRate'
    | 'copperPriceSource'
    | 'aluminiumPriceSource'
    | 'copperMarketPriceId'
    | 'aluminiumMarketPriceId'
    | 'copperMarketQuoteDate'
    | 'aluminiumMarketQuoteDate'
    | 'metalPriceDate'
  >,
  metal: 'copper' | 'aluminium',
  options?: { required?: boolean }
): { tone: 'ok' | 'warn' | 'muted'; text: string } {
  const required = options?.required !== false;
  const rate = metal === 'copper' ? form.copperPriceRate : form.aluminiumPriceRate;
  const source = metal === 'copper' ? form.copperPriceSource : form.aluminiumPriceSource;
  const marketId = metal === 'copper' ? form.copperMarketPriceId : form.aluminiumMarketPriceId;
  const quoteDate = metal === 'copper' ? form.copperMarketQuoteDate : form.aluminiumMarketQuoteDate;
  if (parsePositiveMetalRate(rate) != null) {
    const labeled = metalPriceSourceLabel(source);
    if (labeled) return { tone: 'ok', text: `Source: ${labeled}` };
    if (marketId || quoteDate) {
      const actual = String(quoteDate || '').trim().slice(0, 10);
      const requested = String(form.metalPriceDate || '').trim().slice(0, 10);
      const latest = /^\d{4}-\d{2}-\d{2}$/.test(actual) && /^\d{4}-\d{2}-\d{2}$/.test(requested) && actual !== requested;
      const dated = /^\d{4}-\d{2}-\d{2}$/.test(actual) ? ` - ${actual}` : '';
      return {
        tone: 'ok',
        text: `LME cash ask (international market price)${dated}${latest ? ' · latest available' : ''}`,
      };
    }
    return { tone: 'ok', text: 'USD/MT' };
  }
  if (!required) return { tone: 'muted', text: 'Not required for the selected cables.' };
  const when = /^\d{4}-\d{2}-\d{2}$/.test(form.metalPriceDate) ? ` for ${form.metalPriceDate}` : '';
  const label = metal === 'copper' ? 'Copper price' : 'Aluminium price';
  return {
    tone: 'warn',
    text: `${label} is missing${when}. Pricing stays incomplete until a published cash ask is available.`,
  };
}

export function internationalMetalPriceNotice(
  form: Pick<
    InquiryHeaderFormState,
    | 'copperPriceRate'
    | 'aluminiumPriceRate'
    | 'copperPriceSource'
    | 'aluminiumPriceSource'
    | 'copperMarketQuoteDate'
    | 'aluminiumMarketQuoteDate'
    | 'metalPriceDate'
  >,
  required: RequiredInquiryMetals
): string | null {
  const dates: string[] = [];
  const take = (needed: boolean, rate: unknown, source: string, quoteDate: string) => {
    if (!needed || parsePositiveMetalRate(rate) == null) return;
    if (metalPriceSourceLabel(source) === 'Inquiry Override') return;
    const day = String(quoteDate || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) dates.push(day);
  };
  take(required.copper, form.copperPriceRate, form.copperPriceSource, form.copperMarketQuoteDate);
  take(required.aluminium, form.aluminiumPriceRate, form.aluminiumPriceSource, form.aluminiumMarketQuoteDate);
  if (dates.length === 0) return null;
  const unique = [...new Set(dates)];
  const requested = String(form.metalPriceDate || '').trim().slice(0, 10);
  const latest = /^\d{4}-\d{2}-\d{2}$/.test(requested) && unique.some((day) => day !== requested);
  return `Metal prices are based on the LME international market price of ${unique.join(' and ')}${latest ? ' (latest available)' : ''}.`;
}

export function inquiryFinancialTotalReady(
  copperPriceRate: unknown,
  aluminiumPriceRate: unknown,
  required: RequiredInquiryMetals = { copper: true, aluminium: true }
): boolean {
  if (required.copper && parsePositiveMetalRate(copperPriceRate) == null) return false;
  if (required.aluminium && parsePositiveMetalRate(aluminiumPriceRate) == null) return false;
  return required.copper || required.aluminium;
}

export function metalPriceSourceLabel(source: string): 'System Default' | 'Inquiry Override' | null {
  const token = String(source || '').trim().toUpperCase();
  if (token === 'SYSTEM_DEFAULT') return 'System Default';
  if (token === 'INQUIRY_OVERRIDE') return 'Inquiry Override';
  return null;
}

/** Client-side source badge when the user edits a rate relative to the create-time snapshot. */
export function resolveMetalPriceSourceForEdit(
  rate: string,
  originalRate: string
): 'SYSTEM_DEFAULT' | 'INQUIRY_OVERRIDE' | '' {
  const next = parsePositiveMetalRate(rate);
  const original = parsePositiveMetalRate(originalRate);
  if (next == null) return '';
  if (original != null && Math.abs(next - original) < 1e-9) return 'SYSTEM_DEFAULT';
  return 'INQUIRY_OVERRIDE';
}

export function displayHeaderField(form: InquiryHeaderFormState, inquiry: CommercialInquiryDto, fieldId: string): string {
  switch (fieldId) {
    case 'status':
      return formatInquiryStatus(inquiry.status);
    case 'versionNo':
      return `V${form.versionNo}`;
    case 'inquiryDate':
      return form.inquiryDate || '—';
    case 'requestedDeliveryDate':
      return form.requestedDeliveryDate || '—';
    default:
      return String((form as unknown as Record<string, unknown>)[fieldId] ?? '—');
  }
}
