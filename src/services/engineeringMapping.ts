export const MAPPING_WORKFLOW_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
] as const;
export type MappingWorkflowStatus = (typeof MAPPING_WORKFLOW_STATUSES)[number];

export const MAPPING_ORIGINS = ['SOURCE', 'DERIVED', 'APPROVED', 'MISSING', 'BUSINESS_DECISION_REQUIRED'] as const;
export type MappingOrigin = (typeof MAPPING_ORIGINS)[number];

export const MAPPING_STATUSES = ['COMPLETE', 'PARTIAL', 'MISSING', 'BUSINESS_DECISION_REQUIRED'] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

export const ENGINEERING_FIELDS = [
  'family',
  'voltage',
  'conductor',
  'conductorSize',
  'cores',
  'insulation',
  'screen',
  'armour',
  'sheath',
  'sheathColour',
  'coreColour',
  'standard',
  'specialAdditives',
  'diameter',
  'weight',
] as const;

export type EngineeringField = (typeof ENGINEERING_FIELDS)[number];

export interface EngineeringAttribute {
  field: EngineeringField;
  value: string | number | null;
  origin: MappingOrigin;
  /** Present only when a description parse produced a candidate. Never treated as approved. */
  suggestedValue?: string | number | null;
  suggestionLabel?: 'Suggested';
}

export interface ControlledEngineeringInput {
  family?: string | null;
  voltage?: string | null;
  conductor?: string | null;
  conductorSize?: string | null;
  cores?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  sheathColour?: string | null;
  coreColour?: string | null;
  standard?: string | null;
  specialAdditives?: string | null;
}

export const BOM_CONFLICT_CLASSIFICATIONS = [
  'TRUE_DUPLICATE',
  'BOM_VERSION',
  'PLANT_VARIATION',
  'MANUFACTURING_ROUTE',
  'EFFECTIVE_DATE_VARIATION',
  'VALID_PROCESS_VARIATION',
  'SOURCE_DATA_ERROR',
  'OTHER',
  'BUSINESS_DECISION_REQUIRED',
] as const;

export type BomConflictClassification = (typeof BOM_CONFLICT_CLASSIFICATIONS)[number];

export const STRUCTURED_MATCH_FIELDS: EngineeringField[] = [
  'family',
  'voltage',
  'conductor',
  'conductorSize',
  'cores',
  'insulation',
];

export function isBlankMappingValue(value: unknown): boolean {
  return value == null || String(value).trim() === '';
}

/**
 * Candidates from a cable description. Defaults are not invented: a field is omitted
 * unless a token is actually present. Results are Suggested only.
 */
export function suggestEngineeringFromDescription(description: string): Partial<Record<EngineeringField, string>> {
  const suggested: Partial<Record<EngineeringField, string>> = {};
  const desc = description || '';
  const d = desc.toLowerCase();

  if (/\bcu\b/.test(d) || /\bcopper\b/.test(d)) suggested.conductor = 'Copper';
  else if (/\bal\b/.test(d) || /aluminium|aluminum/.test(d) || /na2xs/i.test(desc)) suggested.conductor = 'Aluminum';

  if (/\bxlpe\b/.test(d)) suggested.insulation = 'XLPE';
  else if (/\bpvc\b/.test(d) && /insul/i.test(d)) suggested.insulation = 'PVC';

  if (/\blshf\b/.test(d) || /\blszh\b/.test(d) || /\bohls\b/.test(d)) suggested.sheath = 'LSHF';
  else if (/\bmdpe\b/.test(d)) suggested.sheath = 'MDPE';
  else if (/\bpe\b/.test(d) && !/\bmdpe\b/.test(d) && !/\bxlpe\b/.test(d)) suggested.sheath = 'PE';

  const kv = desc.match(/(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*kV)/i);
  if (kv) suggested.voltage = kv[1].replace(/\s+/g, ' ');

  const coreSize = desc.match(/(\d+)\s*[xX]\s*(\d+(?:\.\d+)?)/);
  if (coreSize) {
    suggested.cores = coreSize[1];
    suggested.conductorSize = coreSize[2];
  }

  const iec = desc.match(/IEC\s*[\d-]+/i);
  if (iec) suggested.standard = iec[0].replace(/\s+/g, ' ').toUpperCase().replace('IEC', 'IEC ');

  if (/\bunarmou?red\b/.test(d) || /\bno armour\b/.test(d)) suggested.armour = 'NONE';
  if (/\bswa\b/.test(d)) suggested.armour = 'SWA';

  return suggested;
}

export function buildAttributesFromCable(row: {
  family?: string | null;
  voltage?: string | null;
  conductor?: string | null;
  conductorSize?: string | null;
  cores?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  sheathColour?: string | null;
  coreColour?: string | null;
  standard?: string | null;
  specialAdditives?: string | null;
  diameter?: unknown;
  weight?: unknown;
  description?: string | null;
}): EngineeringAttribute[] {
  const suggested = suggestEngineeringFromDescription(row.description || '');
  const sourceValues: Record<EngineeringField, unknown> = {
    family: row.family,
    voltage: row.voltage,
    conductor: row.conductor,
    conductorSize: row.conductorSize,
    cores: row.cores,
    insulation: row.insulation,
    screen: row.screen,
    armour: row.armour,
    sheath: row.sheath,
    sheathColour: row.sheathColour,
    coreColour: row.coreColour,
    standard: row.standard,
    specialAdditives: row.specialAdditives,
    diameter: row.diameter,
    weight: row.weight,
  };

  return ENGINEERING_FIELDS.map((field) => {
    const raw = sourceValues[field];
    const hasSource = !isBlankMappingValue(raw);
    const suggestion = suggested[field];
    if (hasSource) {
      return {
        field,
        value: field === 'diameter' || field === 'weight' ? Number(raw) : String(raw),
        origin: 'SOURCE' as const,
        suggestedValue: suggestion ?? null,
        suggestionLabel: suggestion ? ('Suggested' as const) : undefined,
      };
    }
    if (suggestion) {
      return {
        field,
        value: null,
        origin: 'DERIVED' as const,
        suggestedValue: suggestion,
        suggestionLabel: 'Suggested' as const,
      };
    }
    return { field, value: null, origin: 'MISSING' as const };
  });
}

export function mappingStatusFromAttributes(attributes: EngineeringAttribute[]): MappingStatus {
  const origins = attributes.map((a) => a.origin);
  if (origins.every((o) => o === 'MISSING')) return 'MISSING';
  const approvedOrSource = attributes.filter((a) => a.origin === 'SOURCE' || a.origin === 'APPROVED');
  if (approvedOrSource.length === attributes.length) return 'COMPLETE';
  if (approvedOrSource.length > 0) return 'PARTIAL';
  if (origins.includes('BUSINESS_DECISION_REQUIRED')) return 'BUSINESS_DECISION_REQUIRED';
  return 'MISSING';
}

export function approvedValue(attr: EngineeringAttribute | undefined): string | number | null {
  if (!attr) return null;
  if (attr.origin === 'SOURCE' || attr.origin === 'APPROVED') return attr.value;
  return null;
}

export function validateWorkflowTransition(
  currentStatus: MappingWorkflowStatus,
  targetStatus: MappingWorkflowStatus
): { valid: boolean; error?: string } {
  if (currentStatus === targetStatus) return { valid: true };

  const allowedTransitions: Record<MappingWorkflowStatus, MappingWorkflowStatus[]> = {
    DRAFT: ['SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'],
    SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'DRAFT'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT', 'CANCELLED'],
    APPROVED: ['DRAFT'], // Changes to approved must create a new revision starting in DRAFT
    REJECTED: ['DRAFT', 'SUBMITTED', 'CANCELLED'],
    CANCELLED: ['DRAFT'],
  };

  const allowed = allowedTransitions[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid workflow state transition from ${currentStatus} to ${targetStatus}.`,
    };
  }
  return { valid: true };
}

export function validateEngineeringParameters(
  input: ControlledEngineeringInput,
  context: {
    parameters: Array<{ kind: string; code: string; name?: string; status?: string }>;
    compatibility: Array<{ fromKind: string; fromCode: string; toKind: string; toCode: string; relation: string }>;
  }
): { valid: boolean; errors: Array<{ field: string; message: string }> } {
  const errors: Array<{ field: string; message: string }> = [];

  const checkParam = (field: keyof ControlledEngineeringInput, kind: string, val?: string | null) => {
    if (!val || !val.trim()) return;
    const clean = val.trim().toUpperCase();
    const conductorSynonym =
      kind === 'CONDUCTOR' &&
      (clean === 'CU' || clean === 'COPPER' || clean === 'AL' || clean === 'ALUMINUM' || clean === 'ALUMINIUM');
    const exists = context.parameters.some((p) => {
      if (p.kind !== kind || p.status === 'INACTIVE') return false;
      const pCode = p.code.trim().toUpperCase();
      const pName = (p.name || '').trim().toUpperCase();
      if (pCode === clean || pName === clean || pCode.replace(/\s+/g, '') === clean.replace(/\s+/g, '')) return true;
      if (conductorSynonym) {
        if ((clean === 'CU' || clean === 'COPPER') && (pCode === 'CU' || pCode.includes('COPPER') || pName.includes('CU'))) return true;
        if ((clean === 'AL' || clean.startsWith('ALUM')) && (pCode === 'AL' || pCode.includes('ALUM') || pName.includes('AL'))) return true;
      }
      return false;
    });
    if (!exists) {
      errors.push({
        field,
        message: `${field} value "${val}" is not in the active ${kind} parameter master.`,
      });
    }
  };

  checkParam('family', 'FAMILY', input.family);
  checkParam('voltage', 'VOLTAGE', input.voltage);
  checkParam('conductor', 'CONDUCTOR', input.conductor);
  checkParam('insulation', 'INSULATION', input.insulation);
  checkParam('screen', 'SCREEN', input.screen);
  checkParam('armour', 'ARMOUR', input.armour);
  checkParam('sheath', 'SHEATH', input.sheath);
  checkParam('sheathColour', 'CORE_COLOUR', input.sheathColour);
  checkParam('coreColour', 'CORE_COLOUR', input.coreColour);
  checkParam('standard', 'STANDARD', input.standard);

  // Validate Compatibility (e.g. FAMILY ↔ VOLTAGE)
  if (input.family && input.voltage && context.compatibility.length > 0) {
    const f = input.family.trim().toUpperCase();
    const v = input.voltage.trim().toUpperCase();
    const hits = context.compatibility.filter((c) => {
      const match1 = c.fromKind === 'VOLTAGE' && c.fromCode.trim().toUpperCase() === v && c.toKind === 'FAMILY' && c.toCode.trim().toUpperCase() === f;
      const match2 = c.fromKind === 'FAMILY' && c.fromCode.trim().toUpperCase() === f && c.toKind === 'VOLTAGE' && c.toCode.trim().toUpperCase() === v;
      return match1 || match2;
    });
    if (hits.some((h) => h.relation === 'FORBIDDEN')) {
      errors.push({
        field: 'voltage',
        message: `Voltage "${input.voltage}" is forbidden for Cable Family "${input.family}".`,
      });
    } else {
      const allowedForVoltage = context.compatibility.filter(
        (c) => c.relation === 'ALLOWED' && (
          (c.fromKind === 'VOLTAGE' && c.fromCode.trim().toUpperCase() === v && c.toKind === 'FAMILY') ||
          (c.toKind === 'VOLTAGE' && c.toCode.trim().toUpperCase() === v && c.fromKind === 'FAMILY')
        )
      );
      if (allowedForVoltage.length > 0 && !hits.some((h) => h.relation === 'ALLOWED')) {
        errors.push({
          field: 'voltage',
          message: `Voltage "${input.voltage}" is not in the allowed compatibility set for Family "${input.family}".`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
