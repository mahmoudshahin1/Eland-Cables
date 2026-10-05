/**
 * Global Incoterm Master policy.
 * Inquiry.incoterms is the current transactional code. Customer preferences, shipment groups,
 * snapshots, localStorage, and hardcoded DAP/CIF/FOB lists are not replacement masters.
 */

export type GlobalIncotermRecord = {
  code: string;
  name: string;
  active?: boolean;
};

/** Official ICC Incoterms 2020 catalog. Canonical identity is `code`. */
export const ICC_INCOTERMS_2020: readonly GlobalIncotermRecord[] = [
  { code: 'EXW', name: 'Ex Works', active: true },
  { code: 'FCA', name: 'Free Carrier', active: true },
  { code: 'CPT', name: 'Carriage Paid To', active: true },
  { code: 'CIP', name: 'Carriage and Insurance Paid To', active: true },
  { code: 'DAP', name: 'Delivered at Place', active: true },
  { code: 'DPU', name: 'Delivered at Place Unloaded', active: true },
  { code: 'DDP', name: 'Delivered Duty Paid', active: true },
  { code: 'FAS', name: 'Free Alongside Ship', active: true },
  { code: 'FOB', name: 'Free On Board', active: true },
  { code: 'CFR', name: 'Cost and Freight', active: true },
  { code: 'CIF', name: 'Cost, Insurance and Freight', active: true },
];

export const ICC_INCOTERM_CODES_2020: readonly string[] = ICC_INCOTERMS_2020.map((row) => row.code);

export const ICC_INCOTERM_CODE_SET_2020 = new Set(ICC_INCOTERM_CODES_2020);

export const ICC_INCOTERM_LOAD_DESCRIPTION = 'ICC Incoterms 2020';

export function canonicalizeIncotermCode(value?: string | null): string | null {
  const text = String(value || '').trim();
  return text ? text.toUpperCase() : null;
}

/**
 * Current inquiry Incoterm. Explicit inquiry value wins.
 * Metadata is the same header field persisted on the inquiry, not a second master.
 * Shipment groups, snapshots, localStorage, customer preference, and DAP/FOB defaults are ignored.
 */
export function resolveCurrentInquiryIncotermCode(input: {
  inquiryIncoterms?: string | null;
  metadataIncoterms?: string | null;
  shipmentGroupIncoterm?: string | null;
  snapshotIncoterm?: string | null;
  localStorageIncoterm?: string | null;
  customerPreferenceIncoterm?: string | null;
  defaultIncoterm?: string | null;
}): string | null {
  const inquiry = String(input.inquiryIncoterms || '').trim();
  if (inquiry) return inquiry;
  const metadata = String(input.metadataIncoterms || '').trim();
  return metadata || null;
}

export function selectableGlobalIncoterms(records: GlobalIncotermRecord[]): GlobalIncotermRecord[] {
  return (records || []).filter((row) => row.active !== false && String(row.code || '').trim());
}

export function matchIncotermMaster(
  requested: string | null | undefined,
  records: GlobalIncotermRecord[],
  options?: { allowInactive?: boolean }
): GlobalIncotermRecord | null {
  const value = String(requested || '').trim();
  if (!value) return null;
  const normalized = value.toUpperCase();
  return (
    (records || []).find((record) => {
      if (options?.allowInactive !== true && record.active === false) return false;
      const code = String(record.code || '').trim().toUpperCase();
      const name = String(record.name || '').trim().toUpperCase();
      return (
        code === normalized ||
        name === normalized ||
        normalized === `${code} - ${name}` ||
        (code && (normalized.startsWith(`${code} `) || normalized.startsWith(`${code}-`)))
      );
    }) || null
  );
}

/**
 * New inquiry default: explicit selection, else customer preference if that code is an ACTIVE global master.
 * Never invent DAP/CIF/FOB.
 */
export function defaultNewInquiryIncoterm(input: {
  explicitIncoterm?: string | null;
  customerPreferenceIncoterm?: string | null;
  activeMaster: GlobalIncotermRecord[];
}): string | null {
  const explicit = String(input.explicitIncoterm || '').trim();
  if (explicit) return explicit;
  const preferred = matchIncotermMaster(input.customerPreferenceIncoterm, input.activeMaster);
  return preferred ? String(preferred.code).trim() : null;
}

export function inquiryIncotermForDownstream(inquiryIncoterms?: string | null): string | null {
  return String(inquiryIncoterms || '').trim() || null;
}
