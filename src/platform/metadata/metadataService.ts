/**
 * Platform metadata foundation.
 * Configures labels/visibility/required/read-only/order/sections/tabs/lookup/field security
 * for typed relational entities — NOT an EAV store for transactions.
 */

import { issue } from '../errors/domainError';
import type { InquiryFieldDefinition } from '../../services/inquiryFieldManifest';
import {
  INQUIRY_HEADER_FIELDS,
  INQUIRY_LINE_COLUMNS,
  INQUIRY_LIST_COLUMNS,
} from '../../services/inquiryFieldManifest';

export type MetadataEntityCode =
  | 'INQUIRY'
  | 'INQUIRY_LINE'
  | 'QUOTATION'
  | 'QUOTATION_LINE'
  | 'CUSTOMER'
  | 'CABLE'
  | 'RAW_MATERIAL'
  | 'TECHNICAL_OFFICE_REQUEST'
  | 'COSTING';

export interface PlatformFieldMetadata {
  entityCode: MetadataEntityCode | string;
  fieldCode: string;
  label: string;
  description?: string | null;
  dataType: string;
  section?: string | null;
  tab?: string | null;
  required: boolean;
  readOnly: boolean;
  visible: boolean;
  customerVisible: boolean;
  displayOrder: number;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  exportable?: boolean;
  lookupEntity?: string | null;
  lookupDisplayField?: string | null;
  /** Role-based visibility / field security map */
  roleVisibility?: Record<string, unknown> | null;
  fieldSecurity?: {
    hideFromCustomer?: boolean;
    requiredPermissionCodes?: string[];
    readOnlyRoles?: string[];
  } | null;
  systemProtected?: boolean;
  defaultValue?: string | null;
  validationRules?: unknown;
  helpText?: string | null;
  active?: boolean;
  moduleId?: string;
  source: 'CODE_MANIFEST' | 'PLATFORM_FIELD_DEFINITION';
}

/** Typed relational field catalogs — low-code may overlay these keys only (no EAV). */
export const CUSTOMER_FORM_FIELDS: InquiryFieldDefinition[] = [
  { id: 'code', label: 'Customer code', section: 'header', dataType: 'string', required: true, defaultVisible: true, displayOrder: 1 },
  { id: 'name', label: 'Name', section: 'header', dataType: 'string', required: true, defaultVisible: true, displayOrder: 2 },
  { id: 'defaultCurrency', label: 'Default currency', section: 'header', dataType: 'string', defaultVisible: true, displayOrder: 3 },
];

export const LOW_CODE_ALLOWED_ENTITIES = ['INQUIRY', 'INQUIRY_LINE', 'CUSTOMER'] as const;

const TYPED_FIELD_CODES: Record<string, Set<string>> = {
  INQUIRY: new Set([...INQUIRY_HEADER_FIELDS, ...INQUIRY_LIST_COLUMNS].map((f) => f.id)),
  INQUIRY_LINE: new Set(INQUIRY_LINE_COLUMNS.map((f) => f.id)),
  CUSTOMER: new Set(CUSTOMER_FORM_FIELDS.map((f) => f.id)),
};

export function typedFieldCodesForEntity(entityCode: string): Set<string> | undefined {
  return TYPED_FIELD_CODES[entityCode];
}

export function isSystemProtectedInquiryField(entityCode: string, fieldCode: string): boolean {
  const pool =
    entityCode === 'INQUIRY_LINE'
      ? INQUIRY_LINE_COLUMNS
      : entityCode === 'CUSTOMER'
        ? CUSTOMER_FORM_FIELDS
        : [...INQUIRY_HEADER_FIELDS, ...INQUIRY_LIST_COLUMNS];
  return Boolean(pool.find((f) => f.id === fieldCode)?.systemProtected || pool.find((f) => f.id === fieldCode)?.customerVisible === false);
}

export function assertTypedFieldMutationAllowed(entityCode: string, fieldCode: string): void {
  const entity = String(entityCode || '').trim().toUpperCase();
  const code = String(fieldCode || '').trim();
  if (!LOW_CODE_ALLOWED_ENTITIES.includes(entity as (typeof LOW_CODE_ALLOWED_ENTITIES)[number])) {
    throw issue(
      'VALIDATION_FAILED',
      `Entity ${entity || '(empty)'} is not configurable via PlatformFieldDefinition (no EAV, no costing/D365 bypass).`
    );
  }
  const allowed = TYPED_FIELD_CODES[entity];
  if (!allowed?.has(code)) {
    throw issue(
      'VALIDATION_FAILED',
      `Field ${entity}.${code} is not a typed relational column. Low-code cannot invent storage, relations, or business logic.`
    );
  }
}

/** Code manifests remain the fallback SoT until PlatformFieldDefinition rows exist. */
export function inquiryManifestAsMetadata(): PlatformFieldMetadata[] {
  const map = (rows: InquiryFieldDefinition[], entity: MetadataEntityCode): PlatformFieldMetadata[] =>
    rows.map((f) => ({
      entityCode: entity,
      fieldCode: f.id,
      label: f.label,
      dataType: f.dataType,
      section: f.section,
      tab: f.section === 'header' ? 'Header' : 'Lines',
      required: Boolean(f.required),
      readOnly: Boolean(f.systemProtected),
      visible: f.defaultVisible,
      customerVisible: f.customerVisible !== false,
      displayOrder: f.displayOrder,
      searchable: f.searchable,
      filterable: f.filterable,
      sortable: f.sortable,
      exportable: f.exportable,
      lookupEntity: null,
      lookupDisplayField: null,
      roleVisibility: null,
      fieldSecurity: f.systemProtected || f.customerVisible === false
        ? { hideFromCustomer: f.customerVisible === false }
        : null,
      systemProtected: f.systemProtected,
      moduleId: entity === 'CUSTOMER' ? 'CUSTOMER' : 'INQUIRY_QUOTATION',
      active: true,
      source: 'CODE_MANIFEST',
    }));

  return [
    ...map(INQUIRY_HEADER_FIELDS, 'INQUIRY'),
    ...map(INQUIRY_LIST_COLUMNS, 'INQUIRY'),
    ...map(INQUIRY_LINE_COLUMNS, 'INQUIRY_LINE'),
    ...map(CUSTOMER_FORM_FIELDS, 'CUSTOMER'),
  ];
}

/**
 * Merge PlatformFieldDefinition rows over code manifest.
 * DB rows win for label/visibility/required/readOnly/order/section when present.
 */
export function mergeFieldMetadata(
  manifest: PlatformFieldMetadata[],
  dbRows: Array<{
    entityCode: string;
    fieldCode: string;
    label: string;
    description?: string | null;
    dataType: string;
    section?: string | null;
    tab?: string | null;
    required?: boolean;
    readOnly?: boolean;
    visible?: boolean;
    customerVisible?: boolean;
    displayOrder?: number;
    searchable?: boolean;
    filterable?: boolean;
    sortable?: boolean;
    exportable?: boolean;
    lookupEntity?: string | null;
    lookupDisplayField?: string | null;
    roleVisibility?: unknown;
    fieldSecurity?: unknown;
  }>
): PlatformFieldMetadata[] {
  const byKey = new Map(manifest.map((m) => [`${m.entityCode}:${m.fieldCode}`, { ...m }]));

  for (const row of dbRows) {
    const key = `${row.entityCode}:${row.fieldCode}`;
    const existing = byKey.get(key);
    const roleVisibility =
      row.roleVisibility && typeof row.roleVisibility === 'object'
        ? (row.roleVisibility as Record<string, unknown>)
        : existing?.roleVisibility ?? null;
    const fieldSecurity =
      row.fieldSecurity && typeof row.fieldSecurity === 'object'
        ? (row.fieldSecurity as PlatformFieldMetadata['fieldSecurity'])
        : existing?.fieldSecurity ?? null;

    const protectedField = Boolean(existing?.systemProtected || existing?.customerVisible === false);
    const customerVisible = protectedField
      ? false
      : row.customerVisible ?? existing?.customerVisible ?? false;
    byKey.set(key, {
      entityCode: row.entityCode,
      fieldCode: row.fieldCode,
      label: row.label || existing?.label || row.fieldCode,
      description: row.description ?? existing?.description,
      dataType: existing?.dataType || row.dataType || 'string',
      section: row.section ?? existing?.section,
      tab: row.tab ?? existing?.tab,
      required: row.required ?? existing?.required ?? false,
      readOnly: existing?.systemProtected ? true : row.readOnly ?? existing?.readOnly ?? false,
      visible: row.visible ?? existing?.visible ?? true,
      customerVisible,
      displayOrder: row.displayOrder ?? existing?.displayOrder ?? 100,
      searchable: row.searchable ?? existing?.searchable,
      filterable: row.filterable ?? existing?.filterable,
      sortable: row.sortable ?? existing?.sortable,
      exportable: row.exportable ?? existing?.exportable,
      lookupEntity: row.lookupEntity ?? existing?.lookupEntity ?? null,
      lookupDisplayField: row.lookupDisplayField ?? existing?.lookupDisplayField ?? null,
      roleVisibility,
      fieldSecurity: protectedField
        ? { ...(fieldSecurity || {}), hideFromCustomer: true }
        : fieldSecurity,
      systemProtected: existing?.systemProtected,
      defaultValue: (row as { defaultValue?: string | null }).defaultValue ?? existing?.defaultValue,
      validationRules: (row as { validationRules?: unknown }).validationRules ?? existing?.validationRules,
      helpText: (row as { helpText?: string | null }).helpText ?? existing?.helpText,
      active: true,
      moduleId: existing?.entityCode === 'CUSTOMER' ? 'CUSTOMER' : existing?.entityCode === 'INQUIRY_LINE' ? 'INQUIRY_QUOTATION' : 'INQUIRY_QUOTATION',
      source: 'PLATFORM_FIELD_DEFINITION',
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      String(a.entityCode).localeCompare(String(b.entityCode)) ||
      a.displayOrder - b.displayOrder ||
      a.fieldCode.localeCompare(b.fieldCode)
  );
}

export function assertNotEavTransactionStore(): {
  eavForTransactions: false;
  policy: string;
} {
  return {
    eavForTransactions: false,
    policy:
      'PlatformFieldDefinition configures typed relational entities only. Transactional facts remain on Prisma models (Inquiry, Quotation, Costing, etc.).',
  };
}

export function toPlatformMergeInput(
  rows: Array<{
    entityCode: unknown;
    fieldCode: string;
    label: string;
    description?: string | null;
    dataType: string;
    section?: string | null;
    tab?: string | null;
    required?: boolean;
    readOnly?: boolean;
    visible?: boolean;
    customerVisible?: boolean;
    displayOrder?: number;
    searchable?: boolean;
    filterable?: boolean;
    sortable?: boolean;
    exportable?: boolean;
    lookupEntity?: string | null;
    lookupDisplayField?: string | null;
    roleVisibility?: unknown;
    fieldSecurity?: unknown;
    defaultValue?: string | null;
    helpText?: string | null;
    validationRules?: unknown;
  }>
) {
  return rows.map((r) => ({
    entityCode: String(r.entityCode),
    fieldCode: r.fieldCode,
    label: r.label,
    description: r.description,
    dataType: r.dataType,
    section: r.section,
    tab: r.tab,
    required: r.required,
    readOnly: r.readOnly,
    visible: r.visible,
    customerVisible: r.customerVisible,
    displayOrder: r.displayOrder,
    searchable: r.searchable,
    filterable: r.filterable,
    sortable: r.sortable,
    exportable: r.exportable,
    lookupEntity: r.lookupEntity,
    lookupDisplayField: r.lookupDisplayField,
    roleVisibility: r.roleVisibility,
    fieldSecurity: r.fieldSecurity,
    defaultValue: r.defaultValue,
    helpText: r.helpText,
    validationRules: r.validationRules,
  }));
}

export function projectMetadataForActor(
  fields: PlatformFieldMetadata[],
  actor: { userType?: string }
): PlatformFieldMetadata[] {
  if (actor.userType !== 'customer') return fields;
  return fields.filter((f) => f.customerVisible !== false && f.fieldSecurity?.hideFromCustomer !== true);
}
