/**
 * Controlled Customer Service complaint category master.
 *
 * Seed these rows once (prisma/seed.ts + ensureComplaintCategories()).
 * UI and APIs must load categories from ComplaintCategory — do not hardcode
 * this list in multiple React files.
 *
 * Codes are stable. Names are the customer-facing labels.
 */
export const COMPLAINT_CATEGORY_SEED = [
  { code: 'PRODUCT_CABLE_QUALITY', name: 'Product / Cable Quality', sortOrder: 10 },
  { code: 'CABLE_SPECIFICATION', name: 'Cable Specification', sortOrder: 20 },
  { code: 'CABLE_LENGTH', name: 'Cable Length', sortOrder: 30 },
  { code: 'DRUM_PACKING', name: 'Drum / Packing', sortOrder: 40 },
  { code: 'DELIVERY', name: 'Delivery', sortOrder: 50 },
  { code: 'SHIPMENT_LOGISTICS', name: 'Shipment / Logistics', sortOrder: 60 },
  { code: 'QUANTITY', name: 'Quantity', sortOrder: 70 },
  { code: 'DAMAGED_CABLE', name: 'Damaged Cable', sortOrder: 80 },
  { code: 'DAMAGED_DRUM', name: 'Damaged Drum', sortOrder: 90 },
  { code: 'DOCUMENTATION', name: 'Documentation', sortOrder: 100 },
  { code: 'QUOTATION_COMMERCIAL', name: 'Quotation / Commercial', sortOrder: 110 },
  { code: 'INVOICE_PAYMENT', name: 'Invoice / Payment', sortOrder: 120 },
  { code: 'TECHNICAL_SUPPORT', name: 'Technical Support', sortOrder: 130 },
  { code: 'CUSTOMER_SERVICE', name: 'Customer Service', sortOrder: 140 },
  { code: 'OTHER', name: 'Other', sortOrder: 150 },
] as const;

export const CUSTOMER_SERVICE_CASE_SEQUENCE = {
  code: 'CUSTOMER_SERVICE_CASE',
  name: 'Customer Service Case',
  prefix: 'CS',
  format: '{PREFIX}-{YY}-{#####}',
  moduleId: 'CUSTOMER_SERVICE',
  description: 'Customer complaints and support cases. Example: CS-26-00001.',
} as const;

export const REQUESTED_RESOLUTION_OPTIONS = [
  { code: 'REPLACEMENT', label: 'Replacement / remake' },
  { code: 'CREDIT', label: 'Credit / commercial adjustment' },
  { code: 'ADDITIONAL_LENGTH', label: 'Additional length' },
  { code: 'TECHNICAL_CLARIFICATION', label: 'Technical clarification' },
  { code: 'DOCUMENT_REISSUE', label: 'Reissue documentation' },
  { code: 'INVESTIGATION', label: 'Investigation only' },
  { code: 'OTHER', label: 'Other' },
] as const;
