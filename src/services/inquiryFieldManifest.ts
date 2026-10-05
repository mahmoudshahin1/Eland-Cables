export type FieldVisibilityMode = 'VISIBLE' | 'HIDDEN' | 'READ_ONLY' | 'REQUIRED';

export interface InquiryFieldDefinition {
  id: string;
  label: string;
  section: 'header' | 'line';
  dataType: 'string' | 'number' | 'date' | 'enum' | 'textarea';
  systemProtected?: boolean;
  customerVisible?: boolean;
  required?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  exportable?: boolean;
  defaultVisible: boolean;
  displayOrder: number;
}

export const INQUIRY_HEADER_FIELDS: InquiryFieldDefinition[] = [
  { id: 'transactionType', label: 'Transaction Type', section: 'header', dataType: 'enum', defaultVisible: true, displayOrder: 1, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'inquiryDate', label: 'Trx Date', section: 'header', dataType: 'date', defaultVisible: true, displayOrder: 2, searchable: false, filterable: true, sortable: true, exportable: true },
  { id: 'customerReference', label: 'Ref. No', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 3, searchable: true, filterable: true, sortable: false, exportable: true },
  { id: 'customerName', label: 'Customer', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 4, searchable: true, filterable: true, sortable: true, exportable: true },
  { id: 'organization', label: 'Organization', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 5, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'contactPerson', label: 'Contact Person', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 6, searchable: true, filterable: false, sortable: false, exportable: true },
  { id: 'salesAgent', label: 'Sales Agent', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 7, searchable: true, filterable: true, sortable: false, exportable: true },
  { id: 'projectName', label: 'Project Name', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 8, searchable: true, filterable: true, sortable: false, exportable: true },
  { id: 'currency', label: 'Currency', section: 'header', dataType: 'enum', defaultVisible: true, displayOrder: 9, searchable: false, filterable: true, sortable: false, exportable: true },
  { id: 'exchangeRate', label: 'Exchange Rate', section: 'header', dataType: 'number', defaultVisible: true, displayOrder: 10, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'rawMaterialCurrency', label: 'Raw Material Currency', section: 'header', dataType: 'enum', defaultVisible: true, displayOrder: 11, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'rawMaterialExchangeRate', label: 'Raw Material Exchange Rate', section: 'header', dataType: 'number', defaultVisible: true, displayOrder: 12, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'copperPriceRate', label: 'Copper Price', section: 'header', dataType: 'number', defaultVisible: true, required: true, displayOrder: 13, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'copperPriceUom', label: 'Copper Price UOM', section: 'header', dataType: 'string', defaultVisible: false, required: true, displayOrder: 13.1, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'aluminiumPriceRate', label: 'Aluminium Price', section: 'header', dataType: 'number', defaultVisible: true, required: true, displayOrder: 14, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'aluminiumPriceUom', label: 'Aluminium Price UOM', section: 'header', dataType: 'string', defaultVisible: false, required: true, displayOrder: 14.1, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'status', label: 'Status', section: 'header', dataType: 'enum', defaultVisible: true, displayOrder: 15, searchable: false, filterable: true, sortable: true, exportable: true },
  { id: 'requestedDeliveryDate', label: 'Delivery Date', section: 'header', dataType: 'date', defaultVisible: true, displayOrder: 16, searchable: false, filterable: true, sortable: true, exportable: true },
  { id: 'versionNo', label: 'Version No', section: 'header', dataType: 'number', defaultVisible: true, displayOrder: 17, searchable: false, filterable: true, sortable: true, exportable: true },
  { id: 'salesComments', label: 'Sales Comments', section: 'header', dataType: 'textarea', defaultVisible: true, displayOrder: 18, customerVisible: false, searchable: false, filterable: false, sortable: false, exportable: false },
  { id: 'notes', label: 'Remarks', section: 'header', dataType: 'textarea', defaultVisible: true, displayOrder: 19, searchable: true, filterable: false, sortable: false, exportable: true },
  { id: 'quotationOwner', label: 'Quotation Owner', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 20, searchable: true, filterable: true, sortable: false, exportable: true },
  { id: 'incoterms', label: 'Incoterm', section: 'header', dataType: 'enum', defaultVisible: true, required: true, displayOrder: 21, searchable: false, filterable: false, sortable: false, exportable: true },
  { id: 'deliveryDestination', label: 'Destination', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 22, searchable: true, filterable: true, sortable: false, exportable: true },
  { id: 'paymentTerms', label: 'Payment Terms', section: 'header', dataType: 'enum', defaultVisible: true, displayOrder: 23, searchable: false, filterable: false, sortable: false, exportable: true },
];

export const INQUIRY_LINE_COLUMNS: InquiryFieldDefinition[] = [
  { id: 'lineNumber', label: 'Line No.', section: 'line', dataType: 'number', defaultVisible: true, displayOrder: 1, sortable: true, exportable: true },
  { id: 'materialNumber', label: 'Cable Material No.', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 2, searchable: true, exportable: true },
  { id: 'cableDescription', label: 'Cable Description', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 3, searchable: true, exportable: true },
  { id: 'voltage', label: 'Voltage', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 4, searchable: true, exportable: true },
  { id: 'conductor', label: 'Conductor', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 5, searchable: true, exportable: true },
  { id: 'conductorSize', label: 'Size', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 6, searchable: true, exportable: true },
  { id: 'requestedQuantity', label: 'Drums', section: 'line', dataType: 'number', defaultVisible: true, displayOrder: 7, exportable: true },
  { id: 'requestedLengthMeters', label: 'Total Length (m)', section: 'line', dataType: 'number', defaultVisible: true, displayOrder: 8, exportable: true },
  { id: 'cuttingLengthMeters', label: 'Cutting Length (m)', section: 'line', dataType: 'number', defaultVisible: true, displayOrder: 9, exportable: true },
  { id: 'cableTolerancePercent', label: 'Cable Tolerance (%)', section: 'line', dataType: 'number', defaultVisible: false, displayOrder: 9.5, exportable: true },
  { id: 'quantityUom', label: 'UOM', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 10, exportable: true },
  { id: 'drumType', label: 'Drum Required', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 11, exportable: true },
  { id: 'value', label: 'Value', section: 'line', dataType: 'number', defaultVisible: true, displayOrder: 12, customerVisible: false, systemProtected: true, exportable: false },
  { id: 'currency', label: 'Currency', section: 'line', dataType: 'enum', defaultVisible: true, displayOrder: 13, exportable: true },
  { id: 'unitPrice', label: 'Unit Price', section: 'line', dataType: 'number', defaultVisible: true, displayOrder: 13.2, exportable: true },
  { id: 'totalValue', label: 'Total Value', section: 'line', dataType: 'number', defaultVisible: true, displayOrder: 13.4, exportable: true },
  { id: 'cableAuthorityStatus', label: 'Tech. Status', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 14, exportable: true },
  { id: 'costingReadinessStatus', label: 'Costing Status', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 15, customerVisible: false, systemProtected: true, exportable: false },
  { id: 'attachments', label: 'Attachments', section: 'line', dataType: 'string', defaultVisible: true, displayOrder: 16, exportable: false },
];

export const INQUIRY_LIST_COLUMNS: InquiryFieldDefinition[] = [
  { id: 'inquiryNumber', label: 'Inquiry No.', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 1, searchable: true, sortable: true, exportable: true },
  { id: 'versionNo', label: 'Version', section: 'header', dataType: 'number', defaultVisible: true, displayOrder: 2, sortable: true, exportable: true },
  { id: 'inquiryDate', label: 'Date', section: 'header', dataType: 'date', defaultVisible: true, displayOrder: 3, sortable: true, exportable: true },
  { id: 'customerName', label: 'Customer', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 4, searchable: true, filterable: true, sortable: true, exportable: true },
  { id: 'projectName', label: 'Project', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 5, searchable: true, exportable: true },
  { id: 'salesAgent', label: 'Sales Agent', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 6, filterable: true, exportable: true },
  { id: 'status', label: 'Status', section: 'header', dataType: 'enum', defaultVisible: true, displayOrder: 7, filterable: true, sortable: true, exportable: true },
  { id: 'estimatedValue', label: 'Value', section: 'header', dataType: 'number', defaultVisible: true, displayOrder: 8, customerVisible: false, systemProtected: true, exportable: false },
  { id: 'currency', label: 'Currency', section: 'header', dataType: 'enum', defaultVisible: true, displayOrder: 9, filterable: true, exportable: true },
  { id: 'requestedDeliveryDate', label: 'Requested Delivery Date', section: 'header', dataType: 'date', defaultVisible: true, displayOrder: 10, exportable: true },
  { id: 'quotationOwner', label: 'Quotation Owner', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 11, exportable: true },
  { id: 'lineCount', label: 'Total Lines', section: 'header', dataType: 'number', defaultVisible: true, displayOrder: 12, exportable: true },
  { id: 'updatedAt', label: 'Modified Date', section: 'header', dataType: 'date', defaultVisible: true, displayOrder: 13, sortable: true, exportable: true },
  { id: 'modifiedBy', label: 'Modified By', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 14, exportable: true },
];

export interface UserGridPreference {
  visibleFieldIds: string[];
  /** Field ids known when the preference was saved. Used to introduce new columns only. */
  knownFieldIds?: string[];
}

const HEADER_PREF_KEY = 'energya_inquiry_header_fields_v2';
const LINE_PREF_KEY = 'energya_inquiry_line_columns_v1';
const LIST_PREF_KEY = 'energya_inquiry_list_columns_v1';

function storageKey(base: string, userId?: string | null): string {
  const scope = userId?.trim();
  return scope ? `${base}:${scope}` : base;
}

/** Trust saved hidden columns. Only auto-show columns added after the last save. */
export function resolveGridPreference(
  saved: UserGridPreference | null | undefined,
  fields: InquiryFieldDefinition[]
): UserGridPreference {
  const allIds = fields.map((f) => f.id);
  const defaultIds = fields.filter((f) => f.defaultVisible).map((f) => f.id);
  if (!saved || !Array.isArray(saved.visibleFieldIds)) {
    return { visibleFieldIds: [...defaultIds], knownFieldIds: allIds };
  }

  const currentIdSet = new Set(allIds);
  const visible = saved.visibleFieldIds.filter((id) => currentIdSet.has(id));
  if (Array.isArray(saved.knownFieldIds)) {
    const knownSet = new Set(saved.knownFieldIds);
    for (const field of fields) {
      if (!knownSet.has(field.id) && field.defaultVisible && !visible.includes(field.id)) {
        visible.push(field.id);
      }
    }
  }

  return { visibleFieldIds: visible, knownFieldIds: allIds };
}

function readStorage(key: string): UserGridPreference | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserGridPreference;
    if (!Array.isArray(parsed.visibleFieldIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(key: string, pref: UserGridPreference, fields: InquiryFieldDefinition[]): void {
  const knownFieldIds = fields.map((f) => f.id);
  localStorage.setItem(key, JSON.stringify({ ...pref, knownFieldIds }));
}

function loadPref(
  key: string,
  defaults: InquiryFieldDefinition[],
  userId?: string | null
): UserGridPreference {
  const scoped = readStorage(storageKey(key, userId));
  if (scoped) return resolveGridPreference(scoped, defaults);
  if (userId) {
    const legacy = readStorage(key);
    if (legacy) return resolveGridPreference(legacy, defaults);
  }
  return resolveGridPreference(null, defaults);
}

export function loadHeaderFieldPreference(userId?: string | null): UserGridPreference {
  return loadPref(HEADER_PREF_KEY, INQUIRY_HEADER_FIELDS, userId);
}

export function saveHeaderFieldPreference(pref: UserGridPreference, userId?: string | null): void {
  writeStorage(storageKey(HEADER_PREF_KEY, userId), pref, INQUIRY_HEADER_FIELDS);
}

export function loadLineColumnPreference(userId?: string | null): UserGridPreference {
  return loadPref(LINE_PREF_KEY, INQUIRY_LINE_COLUMNS, userId);
}

export function saveLineColumnPreference(pref: UserGridPreference, userId?: string | null): void {
  writeStorage(storageKey(LINE_PREF_KEY, userId), pref, INQUIRY_LINE_COLUMNS);
}

export function loadListColumnPreference(userId?: string | null): UserGridPreference {
  return loadPref(LIST_PREF_KEY, INQUIRY_LIST_COLUMNS, userId);
}

export function saveListColumnPreference(pref: UserGridPreference, userId?: string | null): void {
  writeStorage(storageKey(LIST_PREF_KEY, userId), pref, INQUIRY_LIST_COLUMNS);
}

export function applyPlatformFieldOverrides(
  fields: InquiryFieldDefinition[],
  platform: Array<{
    fieldCode: string;
    label?: string | null;
    visible?: boolean | null;
    required?: boolean | null;
    customerVisible?: boolean | null;
    displayOrder?: number | null;
    readOnly?: boolean | null;
  }>
): InquiryFieldDefinition[] {
  if (!platform.length) return fields;
  const byCode = new Map(platform.map((row) => [row.fieldCode, row]));
  return fields
    .map((field) => {
      const override = byCode.get(field.id);
      if (!override) return field;
      const protectedField = Boolean(field.systemProtected || field.customerVisible === false);
      return {
        ...field,
        label: override.label?.trim() || field.label,
        defaultVisible: override.visible == null ? field.defaultVisible : override.visible,
        required: override.required ?? field.required,
        customerVisible: protectedField ? false : override.customerVisible ?? field.customerVisible,
        displayOrder: override.displayOrder ?? field.displayOrder,
      };
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Columns this actor may toggle. Same population the selector lists. */
export function columnEligibleForActor(field: InquiryFieldDefinition, isCustomer: boolean): boolean {
  if (field.systemProtected && isCustomer) return false;
  if (field.customerVisible === false && isCustomer) return false;
  return true;
}

/** Checked in the selector and rendered in the grid. Locked columns stay visible. */
export function isColumnSelected(field: InquiryFieldDefinition, pref: UserGridPreference): boolean {
  if (field.required || field.id === 'lineNumber') return true;
  return pref.visibleFieldIds.includes(field.id);
}

export function visibleFieldsForUser(
  fields: InquiryFieldDefinition[],
  pref: UserGridPreference,
  isCustomer: boolean
): InquiryFieldDefinition[] {
  const allowed = fields.filter(
    (field) => columnEligibleForActor(field, isCustomer) && isColumnSelected(field, pref)
  );
  return allowed.sort((a, b) => a.displayOrder - b.displayOrder);
}
