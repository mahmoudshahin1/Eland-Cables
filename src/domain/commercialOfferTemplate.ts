/**
 * Energya Commercial Offer document template.
 * Presentation only — does not change costing, pricing, or Decision 5 engines.
 */

export const COMMERCIAL_OFFER_DOCUMENT_TYPE = 'COMMERCIAL_OFFER' as const;
export const DOCUMENT_ENGINE_TYPES = [
  'COMMERCIAL_OFFER',
  'TECHNICAL_OFFER',
  'QUOTATION',
] as const;
export type DocumentEngineType = (typeof DOCUMENT_ENGINE_TYPES)[number];

export const NOT_SET = 'Not Set';

export interface OfferCompanyBlock {
  legalName: string;
  tagline: string;
  addressLines: string[];
  telephone: string;
  fax: string;
  email: string;
  website: string;
  countryOfOrigin: string;
}

export interface OfferSalesContactBlock {
  companyName: string;
  name: string;
  title: string;
  email: string;
  telephone: string;
  mobile: string;
}

export interface OfferGreetingTemplate {
  body: string;
  signOff: string;
}

export interface OfferFooterTemplate {
  pillars: Array<{ title: string; subtitle: string }>;
  sloganLines: [string, string];
  documentLabel: string;
}

export interface CommercialOfferTemplate {
  id: string;
  version: number;
  documentType: typeof COMMERCIAL_OFFER_DOCUMENT_TYPE;
  subtitle: string;
  company: OfferCompanyBlock;
  defaultSalesContact: OfferSalesContactBlock;
  greeting: OfferGreetingTemplate;
  packingDefault: string;
  paymentDefault: string;
  manufacturerDefault: string;
  countryOfOriginDefault: string;
  deliveryPeriodDefault: string;
  vatDefault: string;
  acceptanceDefault: string;
  warrantyDefault: string;
  notes: string[];
  footer: OfferFooterTemplate;
  hero: {
    lines: string[];
    caption: string;
  };
}

export const ENERGYA_COMMERCIAL_OFFER_TEMPLATE: CommercialOfferTemplate = {
  id: 'energya-commercial-offer-v1',
  version: 1,
  documentType: COMMERCIAL_OFFER_DOCUMENT_TYPE,
  subtitle: 'TECHNICAL & COMMERCIAL QUOTATION',
  company: {
    legalName: 'Energya Power Cables',
    tagline: 'Cables People Progress',
    addressLines: ['97 Omar Bin El Khattab Street, Heliopolis, Cairo, Egypt'],
    telephone: '+20 2 2415 2371/2',
    fax: '+20 2 2415 2470',
    email: 'info@energyacables.com',
    website: 'www.energyacables.com',
    countryOfOrigin: 'Egypt',
  },
  defaultSalesContact: {
    companyName: 'Energya Power Cables',
    name: 'Export Coordination',
    title: 'Export Coordinator',
    email: 'info@energyacables.com',
    telephone: '+20 2 2415 2371/2',
    mobile: '+20 2 2415 2470',
  },
  greeting: {
    body:
      'Many thanks for your enquiry, please find our technical and commercial offer attached.\n\nWe trust this shall meet your requirements and in case of any further clarification required, please don\'t hesitate to contact me.',
    signOff: 'Best Regards,',
  },
  packingDefault: 'Seaworthy export packing on wooden drums.',
  paymentDefault: '60 days from delivery by direct transfer to our bank account.',
  manufacturerDefault: 'Energya Power Cables.',
  countryOfOriginDefault: 'Egypt.',
  deliveryPeriodDefault:
    'Expected dispatch 8-10 weeks, subject to confirmation at the time of placing the order. Please add 3-4 weeks for delivery under the stated incoterm, subject to shipping line availability.',
  vatDefault:
    'The offered prices are net and do not include any rebates, discounts, customs, clearances, value added tax or any other taxes, fees, duties, licenses, or levies now or in the future imposed upon the Product or Service subject of our offer. Any such taxes shall be paid by the Buyer.',
  acceptanceDefault:
    'Any claim by the Buyer for loss or damage apparent on inspection or for non-delivery must be made in writing by the Buyer within six days of the earlier of delivery or receipt of the Company\'s invoice. If no such claim is made within that time frame the Buyer will be deemed to have accepted the Goods as delivered.',
  warrantyDefault:
    'Energya warrants the buyer that the Goods at the time of delivery will be free from manufacturing defects in material and workmanship and will be materially in accordance with specifications. Unless agreed otherwise in writing, the warranty will continue for a period of 1 year from the date of the sales invoice.',
  notes: [
    'Prices are net and do not include any rebate, discount, taxes or any other cost not clearly mentioned in our offer.',
    'Shipping cost is subject to variation at the time of the order.',
    'PRICES WILL VARY IF NUMBER OF ITEMS OR QUANTITIES CHANGE',
  ],
  footer: {
    pillars: [
      { title: 'Reliable', subtitle: 'Quality' },
      { title: 'Engineering', subtitle: 'Excellence' },
      { title: 'A Sustainable', subtitle: 'Future' },
      { title: 'People', subtitle: 'Progress' },
    ],
    sloganLines: ['More Than Cables', 'A Stronger Tomorrow'],
    documentLabel: 'Commercial Offer',
  },
  hero: {
    lines: ['Powering', 'Industries', 'Connecting', 'Lives'],
    caption: 'RELIABLE CABLES FOR A STRONGER TOMORROW',
  },
};

export const FORMULA_DEFINITIONS = [
  { code: 'F.P.', meaning: 'Final Unit Price' },
  { code: 'U.P.', meaning: 'Offered Unit Price' },
  { code: 'LME2', meaning: 'LME official settlement price at time of order' },
  { code: 'LME1', meaning: 'Offered Metal Base' },
  { code: 'C.W.', meaning: 'Conductor weight (kg/km)' },
] as const;

export function firstNameFromContact(contactPerson: string | null | undefined): string {
  const raw = String(contactPerson ?? '').trim();
  if (!raw) return '';
  return raw.split(/\s+/)[0] || '';
}

export function currencySymbol(code: string | null | undefined): string {
  const c = String(code || '').trim().toUpperCase();
  if (c === 'GBP') return '£';
  if (c === 'EUR') return '€';
  if (c === 'USD') return '$';
  if (c === 'EGP') return 'E£';
  return c || '';
}

export function presentNumeric(value: unknown): number {
  if (value == null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function presentText(value: unknown): string {
  const t = String(value ?? '').trim();
  return t || NOT_SET;
}

export function commercialOfferDocumentActions(input: {
  issued: boolean;
  isCustomer: boolean;
}): Array<{ id: string; label: string; draft: boolean }> {
  if (input.isCustomer && !input.issued) return [];
  if (input.issued) {
    return [
      { id: 'print-final', label: 'Print Final Commercial Offer', draft: false },
      { id: 'export-final', label: 'Export Final Commercial Offer PDF', draft: false },
    ];
  }
  return [
    { id: 'print-draft', label: 'Print Commercial Offer', draft: true },
    { id: 'export-draft', label: 'Export Commercial Offer PDF', draft: true },
  ];
}
