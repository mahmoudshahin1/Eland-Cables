/**
 * Issued commercial-offer snapshot. Financial totals are copied from
 * FinancialOfferSnapshot. This module does not reprice or re-cost.
 */

import {
  ENERGYA_COMMERCIAL_OFFER_TEMPLATE,
  firstNameFromContact,
  presentNumeric,
  presentText,
  type OfferCompanyBlock,
  type OfferFooterTemplate,
  type OfferSalesContactBlock,
  type CommercialOfferTemplate,
} from './commercialOfferTemplate';

export const PRICE_ADJUSTMENT_FORMULA = 'F.P. = U.P. + ((LME2 - LME1) * C.W. / 1000)';

export {
  ENERGYA_COMMERCIAL_OFFER_TEMPLATE,
  NOT_SET,
  commercialOfferDocumentActions,
  currencySymbol,
  firstNameFromContact,
  presentNumeric,
  presentText,
} from './commercialOfferTemplate';

export const COMMERCIAL_TERM_CODES = [
  'PRICE_ADJUSTMENT',
  'PACKING',
  'TOLERANCE',
  'DELIVERY',
  'DELIVERY_PERIOD',
  'PAYMENT',
  'MANUFACTURER',
  'COUNTRY_OF_ORIGIN',
  'OFFER_VALIDITY',
  'VAT',
  'ACCEPTANCE',
  'WARRANTY',
] as const;

export type CommercialTermCode = (typeof COMMERCIAL_TERM_CODES)[number];

export interface ConductorWeightEvidenceLine {
  metalType?: string | null;
  consumptionPerKm?: number | null;
  consumptionUom?: string | null;
}

export interface PriceAdjustmentSnapshot {
  formula: string;
  copperBase: number | null;
  aluminiumBase: number | null;
  currency: string | null;
  unitBasis: string | null;
  conductorWeightBasis: 'kg/km';
  issuedAt: string;
}

export interface CommercialTermSnapshot {
  code: CommercialTermCode;
  title: string;
  text: string;
}

export interface IssuedCommercialOfferLine {
  lineNumber: number;
  itemDescription: string;
  moqKm: number | null;
  quantityUom: string;
  cuWeightKgPerKm: number | null;
  alWeightKgPerKm: number | null;
  unitSellingPrice: number | null;
  lineTotal: number | null;
  materialNumber?: string | null;
}

export interface OfferGreetingSnapshot {
  salutation: string;
  body: string;
  signOff: string;
  signerName: string;
  signerTitle: string;
  companyName: string;
}

export interface IssuedCommercialOfferDocument {
  documentType?: 'COMMERCIAL_OFFER';
  templateId?: string;
  templateVersion?: number;
  quotationNumber: string;
  versionNo: number;
  currency: string;
  validUntil: string | null;
  validityDays: number | null;
  validityLabel: string;
  incoterms: string | null;
  destination: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  generatedAt: string;
  financialOfferSnapshotId: string | null;
  productsTotal: number | null;
  shipmentTotal: number | null;
  grandTotal: number | null;
  productsTotalLabel?: string;
  grandTotalLabel: string;
  shippingLabel: string;
  priceAdjustment: PriceAdjustmentSnapshot;
  terms: CommercialTermSnapshot[];
  notes?: string[];
  company?: OfferCompanyBlock;
  from?: OfferSalesContactBlock;
  greeting?: OfferGreetingSnapshot;
  footer?: OfferFooterTemplate;
  customer: {
    customerName: string;
    country?: string | null;
    contactPerson: string | null;
    customerReference: string | null;
    quotationOwner: string | null;
  };
  lines: IssuedCommercialOfferLine[];
  /** True only for an unsaved preview. Issued snapshots omit this or set it false. */
  draft?: boolean;
}

const TERM_TITLES: Record<CommercialTermCode, string> = {
  PRICE_ADJUSTMENT: 'Price Adjustment',
  PACKING: 'Packing',
  TOLERANCE: 'Tolerance',
  DELIVERY: 'Delivery',
  DELIVERY_PERIOD: 'Delivery Period',
  PAYMENT: 'Payment',
  MANUFACTURER: 'Manufacturer',
  COUNTRY_OF_ORIGIN: 'Country of Origin',
  OFFER_VALIDITY: 'Offer Validity',
  VAT: 'VAT',
  ACCEPTANCE: 'Acceptance',
  WARRANTY: 'Warranty',
};

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function isKilogramUom(uom: unknown): boolean {
  const u = text(uom).toLowerCase().replace(/\./g, '');
  return u === 'kg' || u === 'kgs' || u === 'kilogram' || u === 'kilograms';
}

/** Copy copper and aluminium kg/km from costing evidence. Missing metal stays null. */
export function extractConductorWeightsKgPerKm(lines: ConductorWeightEvidenceLine[]): {
  cuWeightKgPerKm: number | null;
  alWeightKgPerKm: number | null;
} {
  let copper = 0;
  let aluminium = 0;
  let sawCopper = false;
  let sawAluminium = false;
  for (const line of lines) {
    const metal = text(line.metalType).toUpperCase();
    const perKm = num(line.consumptionPerKm);
    if (perKm == null || perKm < 0 || !isKilogramUom(line.consumptionUom)) continue;
    if (metal === 'COPPER' || metal === 'CU') {
      copper += perKm;
      sawCopper = true;
    } else if (metal === 'ALUMINIUM' || metal === 'ALUMINUM' || metal === 'AL') {
      aluminium += perKm;
      sawAluminium = true;
    }
  }
  return {
    cuWeightKgPerKm: sawCopper ? Math.round((copper + Number.EPSILON) * 1000) / 1000 : null,
    alWeightKgPerKm: sawAluminium ? Math.round((aluminium + Number.EPSILON) * 1000) / 1000 : null,
  };
}

export function grandTotalLabel(incoterm?: string | null, destination?: string | null): string {
  const inc = text(incoterm);
  const dest = text(destination);
  if (inc && dest) return `Grand Total ${inc} ${dest}`;
  if (inc) return `Grand Total ${inc}`;
  if (dest) return `Grand Total ${dest}`;
  return 'Grand Total';
}

export function shippingLabel(incoterm?: string | null, destination?: string | null): string {
  const inc = text(incoterm);
  const dest = text(destination);
  if (inc && dest) return `Shipping (${inc} ${dest})`;
  if (inc) return `Shipping (${inc})`;
  if (dest) return `Shipping (${dest})`;
  return 'Shipping';
}

export function offerValidityLabel(issuedAt: Date, validUntil: Date | null): string {
  if (!validUntil) return 'As stated on the quotation';
  const hours = (validUntil.getTime() - issuedAt.getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return validUntil.toISOString();
  if (Math.abs(hours - 48) <= 1) return '48 Hours';
  if (hours < 72) return `${Math.round(hours)} Hours`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function buildPriceAdjustmentSnapshot(input: {
  copperBase?: unknown;
  aluminiumBase?: unknown;
  currency?: string | null;
  unitBasis?: string | null;
  issuedAt: string;
}): PriceAdjustmentSnapshot {
  return {
    formula: PRICE_ADJUSTMENT_FORMULA,
    copperBase: num(input.copperBase),
    aluminiumBase: num(input.aluminiumBase),
    currency: text(input.currency) || null,
    unitBasis: text(input.unitBasis) || null,
    conductorWeightBasis: 'kg/km',
    issuedAt: input.issuedAt,
  };
}

function moneyClause(base: number | null, currency: string | null, unitBasis: string | null, metal: string): string {
  if (base == null) return `${metal} price of ${presentText('')}`;
  const unit = unitBasis ? ` ${unitBasis}` : '';
  const cur = currency ? `${currency} ` : '';
  return `${metal} price of ${cur}${base}${unit}`.replace(/\s+/g, ' ').trim();
}

export function buildOfferGreeting(input: {
  contactPerson?: string | null;
  signerName?: string | null;
  signerTitle?: string | null;
  template?: CommercialOfferTemplate;
}): OfferGreetingSnapshot {
  const template = input.template || ENERGYA_COMMERCIAL_OFFER_TEMPLATE;
  const first = firstNameFromContact(input.contactPerson);
  const signerName = text(input.signerName) || template.defaultSalesContact.name;
  const signerTitle = text(input.signerTitle) || template.defaultSalesContact.title;
  return {
    salutation: first ? `Dear ${first},` : 'Dear Valued Customer,',
    body: template.greeting.body,
    signOff: template.greeting.signOff,
    signerName,
    signerTitle,
    companyName: template.company.legalName,
  };
}

export function buildOfferSalesContact(input: {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  telephone?: string | null;
  mobile?: string | null;
  template?: CommercialOfferTemplate;
}): OfferSalesContactBlock {
  const template = input.template || ENERGYA_COMMERCIAL_OFFER_TEMPLATE;
  const fallback = template.defaultSalesContact;
  return {
    companyName: template.company.legalName,
    name: text(input.name) || fallback.name,
    title: text(input.title) || fallback.title,
    email: text(input.email) || fallback.email,
    telephone: text(input.telephone) || fallback.telephone,
    mobile: text(input.mobile) || fallback.mobile,
  };
}

export function buildCommercialTerms(input: {
  priceAdjustment: PriceAdjustmentSnapshot;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  incoterm?: string | null;
  destination?: string | null;
  tolerancePercent?: number | null;
  validityLabel: string;
  packingText?: string | null;
  template?: CommercialOfferTemplate;
}): CommercialTermSnapshot[] {
  const template = input.template || ENERGYA_COMMERCIAL_OFFER_TEMPLATE;
  const inc = text(input.incoterm);
  const dest = text(input.destination);
  const deliveryPlace = [inc, dest].filter(Boolean).join(' ');
  const copper = moneyClause(
    input.priceAdjustment.copperBase,
    input.priceAdjustment.currency,
    input.priceAdjustment.unitBasis,
    'Copper'
  );
  const aluminium = moneyClause(
    input.priceAdjustment.aluminiumBase,
    input.priceAdjustment.currency,
    input.priceAdjustment.unitBasis,
    'Aluminium'
  );
  const tolerance =
    input.tolerancePercent != null && Number.isFinite(input.tolerancePercent)
      ? `+/- ${input.tolerancePercent}% per drum.`
      : 'As specified on each inquiry line.';

  const clauses: Array<[CommercialTermCode, string]> = [
    [
      'PRICE_ADJUSTMENT',
      `Based on ${copper} and ${aluminium}. Final prices shall be adjusted at the time of placing the order according to the following equation.`,
    ],
    ['PACKING', text(input.packingText) || template.packingDefault],
    ['TOLERANCE', tolerance],
    [
      'DELIVERY',
      text(input.deliveryTerms) ||
        (deliveryPlace ? `Cables will be delivered ${deliveryPlace}.` : 'Delivery follows the incoterm and destination on this quotation.'),
    ],
    ['DELIVERY_PERIOD', template.deliveryPeriodDefault],
    ['PAYMENT', text(input.paymentTerms) || template.paymentDefault],
    ['MANUFACTURER', template.manufacturerDefault],
    ['COUNTRY_OF_ORIGIN', template.countryOfOriginDefault],
    ['OFFER_VALIDITY', `This offer is valid for ${input.validityLabel} from its date.`],
    ['VAT', template.vatDefault],
    ['ACCEPTANCE', template.acceptanceDefault],
    ['WARRANTY', template.warrantyDefault],
  ];

  return clauses.map(([code, body]) => ({ code, title: TERM_TITLES[code], text: body }));
}

export function buildIssuedCommercialOfferDocument(input: {
  quotationNumber: string;
  versionNo: number;
  currency: string;
  validUntil?: Date | null;
  validityDays?: number | null;
  issuedAt: Date;
  incoterms?: string | null;
  destination?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  packingText?: string | null;
  tolerancePercent?: number | null;
  copperBase?: unknown;
  aluminiumBase?: unknown;
  metalCurrency?: string | null;
  metalUnitBasis?: string | null;
  financialOfferSnapshotId?: string | null;
  productsTotal?: unknown;
  shipmentTotal?: unknown;
  grandTotal?: unknown;
  customerName: string;
  customerCountry?: string | null;
  contactPerson?: string | null;
  customerReference?: string | null;
  quotationOwner?: string | null;
  ownerTitle?: string | null;
  ownerEmail?: string | null;
  ownerTelephone?: string | null;
  ownerMobile?: string | null;
  template?: CommercialOfferTemplate;
  lines: IssuedCommercialOfferLine[];
  draft?: boolean;
}): IssuedCommercialOfferDocument {
  const template = input.template || ENERGYA_COMMERCIAL_OFFER_TEMPLATE;
  const issuedAt = input.issuedAt.toISOString();
  const priceAdjustment = buildPriceAdjustmentSnapshot({
    copperBase: input.copperBase,
    aluminiumBase: input.aluminiumBase,
    currency: input.metalCurrency || input.currency,
    unitBasis: input.metalUnitBasis,
    issuedAt,
  });
  const validityLabel = offerValidityLabel(input.issuedAt, input.validUntil ?? null);
  const incoterms = text(input.incoterms) || null;
  const destination = text(input.destination) || null;
  const from = buildOfferSalesContact({
    name: input.quotationOwner,
    title: input.ownerTitle,
    email: input.ownerEmail,
    telephone: input.ownerTelephone,
    mobile: input.ownerMobile,
    template,
  });
  return {
    documentType: 'COMMERCIAL_OFFER',
    templateId: template.id,
    templateVersion: template.version,
    quotationNumber: input.quotationNumber,
    versionNo: input.versionNo,
    currency: input.currency,
    validUntil: input.validUntil ? input.validUntil.toISOString() : null,
    validityDays: input.validityDays ?? null,
    validityLabel,
    incoterms,
    destination,
    paymentTerms: text(input.paymentTerms) || null,
    deliveryTerms: text(input.deliveryTerms) || null,
    generatedAt: issuedAt,
    financialOfferSnapshotId: input.financialOfferSnapshotId ?? null,
    productsTotal: num(input.productsTotal),
    shipmentTotal: num(input.shipmentTotal),
    grandTotal: num(input.grandTotal),
    productsTotalLabel: 'Grand Total (Products)',
    grandTotalLabel: grandTotalLabel(incoterms, destination),
    shippingLabel: shippingLabel(incoterms, destination),
    priceAdjustment,
    terms: buildCommercialTerms({
      priceAdjustment,
      paymentTerms: input.paymentTerms,
      deliveryTerms: input.deliveryTerms,
      incoterm: incoterms,
      destination,
      tolerancePercent: input.tolerancePercent ?? null,
      validityLabel,
      packingText: input.packingText,
      template,
    }),
    notes: [...template.notes],
    company: { ...template.company },
    from,
    greeting: buildOfferGreeting({
      contactPerson: input.contactPerson,
      signerName: from.name,
      signerTitle: from.title,
      template,
    }),
    footer: {
      pillars: template.footer.pillars.map((p) => ({ ...p })),
      sloganLines: [template.footer.sloganLines[0], template.footer.sloganLines[1]] as [string, string],
      documentLabel: template.footer.documentLabel,
    },
    customer: {
      customerName: text(input.customerName) || presentText(''),
      country: text(input.customerCountry) || null,
      contactPerson: text(input.contactPerson) || null,
      customerReference: text(input.customerReference) || null,
      quotationOwner: text(input.quotationOwner) || null,
    },
    lines: input.lines,
    draft: input.draft === true,
  };
}

export type HydratedCommercialOfferDocument = IssuedCommercialOfferDocument & {
  documentType: 'COMMERCIAL_OFFER';
  templateId: string;
  templateVersion: number;
  productsTotalLabel: string;
  notes: string[];
  company: OfferCompanyBlock;
  from: OfferSalesContactBlock;
  greeting: OfferGreetingSnapshot;
  footer: OfferFooterTemplate;
};

export function hydrateCommercialOfferDocument(value: IssuedCommercialOfferDocument): HydratedCommercialOfferDocument {
  const template = ENERGYA_COMMERCIAL_OFFER_TEMPLATE;
  const from = value.from || buildOfferSalesContact({ name: value.customer?.quotationOwner, template });
  return {
    ...value,
    documentType: 'COMMERCIAL_OFFER',
    templateId: value.templateId || template.id,
    templateVersion: value.templateVersion || template.version,
    productsTotalLabel: value.productsTotalLabel || 'Grand Total (Products)',
    notes: value.notes?.length ? value.notes : [...template.notes],
    company: value.company || { ...template.company },
    from,
    greeting: value.greeting || buildOfferGreeting({
      contactPerson: value.customer?.contactPerson,
      signerName: from.name,
      signerTitle: from.title,
      template,
    }),
    footer: value.footer || {
      pillars: template.footer.pillars.map((p) => ({ ...p })),
      sloganLines: [template.footer.sloganLines[0], template.footer.sloganLines[1]],
      documentLabel: template.footer.documentLabel,
    },
  };
}

export function commercialOfferHeading(draft: boolean | undefined): string {
  return draft ? 'DRAFT COMMERCIAL OFFER' : 'COMMERCIAL OFFER';
}

export function draftOfferDisclaimer(): string {
  return 'This draft is not an official issued quotation. It cannot be accepted as the customer offer.';
}

export function readIssuedCommercialOffer(value: unknown): IssuedCommercialOfferDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<IssuedCommercialOfferDocument>;
  if (!record.quotationNumber || !Array.isArray(record.terms) || !record.priceAdjustment) return null;
  return record as IssuedCommercialOfferDocument;
}

export function conductorWeightsFromCostingOutput(output: unknown): {
  cuWeightKgPerKm: number | null;
  alWeightKgPerKm: number | null;
} {
  if (!output || typeof output !== 'object') return extractConductorWeightsKgPerKm([]);
  const breakdown = (output as { materialBreakdown?: unknown }).materialBreakdown;
  if (!Array.isArray(breakdown)) return extractConductorWeightsKgPerKm([]);
  return extractConductorWeightsKgPerKm(
    breakdown.map((row) => {
      const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
      return {
        metalType: record.metalType == null ? null : String(record.metalType),
        consumptionPerKm:
          record.baseConsumptionPerKm != null ? Number(record.baseConsumptionPerKm) : Number(record.consumptionPerKm),
        consumptionUom: record.consumptionUom == null ? null : String(record.consumptionUom),
      };
    })
  );
}

export function formatOfferWeight(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return String(value);
}

export function formatOfferMoney(value: number | null | undefined, currency?: string | null): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${amount} ${currency}` : amount;
}

export function formatDocumentNumber(value: unknown, fractionDigits = 0): string {
  const n = presentNumeric(value);
  if (fractionDigits <= 0) {
    return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  return n.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

export function formatDocumentMoney(value: unknown, currency?: string | null): string {
  const amount = formatDocumentNumber(value, 2);
  const code = text(currency);
  return code ? `${code} ${amount}` : amount;
}
