import { DomainIssueCode } from '../platform/errors/domainError';

export type ParameterKindName =
  | 'FAMILY'
  | 'VOLTAGE'
  | 'CONDUCTOR'
  | 'INSULATION'
  | 'SCREEN'
  | 'ARMOUR'
  | 'SHEATH'
  | 'CORE_COLOUR'
  | 'STANDARD';

export interface CableMasterSnapshot {
  id: string;
  materialNumber: string;
  itemCode: string;
  customerCode: string;
  description: string;
  family?: string | null;
  voltage?: string | null;
  conductor?: string | null;
  conductorSize?: string | null;
  cores?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  coreColour?: string | null;
  diameter?: number | null;
  status?: string | null;
  approvalStatus?: string | null;
}

export interface CableParameterSnapshot {
  kind: ParameterKindName | string;
  code: string;
  status?: string;
}

export interface CompatibilitySnapshot {
  fromKind: string;
  fromCode: string;
  toKind: string;
  toCode: string;
  relation: 'ALLOWED' | 'FORBIDDEN';
}

export interface CableConfigInput {
  customerCode?: string;
  itemCode?: string;
  materialNumber?: string;
  family?: string;
  voltage?: string;
  conductor?: string;
  conductorSize?: string | number;
  cores?: string | number;
  insulation?: string;
  screen?: string;
  armour?: string;
  sheath?: string;
  coreColour?: string;
  diameter?: number;
}

export interface FailedRule {
  field: string;
  message: string;
}

export interface CableDecision {
  code: Extract<
    DomainIssueCode,
    'EXISTING_CABLE' | 'TECHNICALLY_VALID_NOT_MASTER' | 'INVALID_CONFIGURATION' | 'CONFIGURATION_REQUIRED'
  >;
  message: string;
  technicalOfficeEligible: boolean;
  quotationAllowed: boolean;
  cable?: CableMasterSnapshot;
  matches: CableMasterSnapshot[];
  failedRules: FailedRule[];
  matchAttributesUsed: string[];
}

export const MATCH_ATTRIBUTES = [
  'customerCode',
  'materialNumber',
  'itemCode',
  'family',
  'voltage',
  'conductor',
  'conductorSize',
  'cores',
  'insulation',
  'screen',
  'armour',
  'diameter',
] as const;

/** Relationships that must have persisted rules when both sides are selected. */
export const REQUIRED_COMPATIBILITY_PAIRS: Array<[ParameterKindName, ParameterKindName, keyof CableConfigInput, keyof CableConfigInput]> = [
  ['FAMILY', 'VOLTAGE', 'family', 'voltage'],
  ['FAMILY', 'CORE_COLOUR', 'family', 'coreColour'],
];

export function normalizeToken(value?: string | number | null): string {
  if (value == null) return '';
  return String(value).trim().toUpperCase().replace(/\s+/g, '');
}

export function parseSizeNumber(value?: string | number | null): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

export function parseCoreCount(value?: string | number | null): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

export function normalizeConductor(value?: string | null): string {
  const u = (value || '').toUpperCase();
  if (!u) return '';
  if (u === 'AL' || u.includes('ALUM')) return 'ALUMINUM';
  if (u === 'CU' || u.includes('COPPER')) return 'COPPER';
  return normalizeToken(value);
}

function isBlank(value?: string | number | null): boolean {
  return value == null || String(value).trim() === '';
}

function isNoScreen(value?: string): boolean {
  const u = (value || '').toUpperCase();
  return !u || u === 'NO SCREEN' || u === 'NONE' || u === 'N/A';
}

function parameterExists(
  parameters: CableParameterSnapshot[],
  kind: ParameterKindName,
  code: string
): boolean {
  const needle = normalizeToken(code);
  return parameters.some(
    (p) =>
      p.kind === kind &&
      p.status !== 'INACTIVE' &&
      (normalizeToken(p.code) === needle || normalizeToken(p.code).includes(needle) || needle.includes(normalizeToken(p.code)))
  );
}

function findCompatibility(
  rules: CompatibilitySnapshot[],
  fromKind: string,
  fromCode: string,
  toKind: string,
  toCode: string
): CompatibilitySnapshot[] {
  const a = normalizeToken(fromCode);
  const b = normalizeToken(toCode);
  return rules.filter((r) => {
    if (r.fromKind === fromKind && r.toKind === toKind) {
      return normalizeToken(r.fromCode) === a && normalizeToken(r.toCode) === b;
    }
    if (r.fromKind === toKind && r.toKind === fromKind) {
      return normalizeToken(r.fromCode) === b && normalizeToken(r.toCode) === a;
    }
    return false;
  });
}

function pairHasAnyRules(rules: CompatibilitySnapshot[], kindA: string, kindB: string): boolean {
  return rules.some(
    (r) =>
      (r.fromKind === kindA && r.toKind === kindB) || (r.fromKind === kindB && r.toKind === kindA)
  );
}

function hasAuthoritative(value?: string | number | null): boolean {
  return value != null && String(value).trim() !== '';
}

export function hasAuthoritativeStructuredFields(cable: CableMasterSnapshot): boolean {
  return (
    hasAuthoritative(cable.family) &&
    hasAuthoritative(cable.voltage) &&
    hasAuthoritative(cable.conductor) &&
    hasAuthoritative(cable.conductorSize) &&
    hasAuthoritative(cable.cores) &&
    hasAuthoritative(cable.insulation)
  );
}

export function structuredEngineeringRequested(config: CableConfigInput): boolean {
  return (
    !isBlank(config.family) ||
    !isBlank(config.voltage) ||
    !isBlank(config.conductor) ||
    !isBlank(config.conductorSize) ||
    !isBlank(config.cores) ||
    !isBlank(config.insulation)
  );
}

export function cableMatchesConfig(cable: CableMasterSnapshot, config: CableConfigInput): boolean {
  if (cable.status && cable.status !== 'ACTIVE') return false;

  if (!isBlank(config.materialNumber) && normalizeToken(cable.materialNumber) !== normalizeToken(config.materialNumber)) {
    return false;
  }
  if (!isBlank(config.itemCode) && normalizeToken(cable.itemCode) !== normalizeToken(config.itemCode)) {
    return false;
  }
  if (!isBlank(config.customerCode) && normalizeToken(cable.customerCode) !== normalizeToken(config.customerCode)) {
    return false;
  }
  if (!isBlank(config.family)) {
    if (!hasAuthoritative(cable.family)) return false;
    if (normalizeToken(cable.family) !== normalizeToken(config.family)) return false;
  }
  if (!isBlank(config.voltage)) {
    if (!hasAuthoritative(cable.voltage)) return false;
    const a = normalizeToken(cable.voltage);
    const b = normalizeToken(config.voltage);
    if (!a.includes(b) && !b.includes(a)) return false;
  }
  if (!isBlank(config.conductor)) {
    if (!hasAuthoritative(cable.conductor)) return false;
    if (normalizeConductor(cable.conductor) !== normalizeConductor(String(config.conductor))) return false;
  }
  if (!isBlank(config.conductorSize)) {
    if (!hasAuthoritative(cable.conductorSize)) return false;
    const a = parseSizeNumber(cable.conductorSize);
    const b = parseSizeNumber(config.conductorSize);
    if (a != null && b != null && a !== b) return false;
  }
  if (!isBlank(config.cores)) {
    if (!hasAuthoritative(cable.cores)) return false;
    const a = parseCoreCount(cable.cores);
    const b = parseCoreCount(config.cores);
    if (a != null && b != null && a !== b) return false;
  }
  if (!isBlank(config.insulation)) {
    if (!hasAuthoritative(cable.insulation)) return false;
    const a = normalizeToken(cable.insulation);
    const b = normalizeToken(config.insulation);
    if (!a.includes(b) && !b.includes(a)) return false;
  }
  if (!isBlank(config.screen) && !isNoScreen(String(config.screen))) {
    if (!hasAuthoritative(cable.screen)) return false;
    const a = normalizeToken(cable.screen);
    const b = normalizeToken(config.screen);
    if (!a.includes(b) && !b.includes(a) && isNoScreen(cable.screen)) return false;
  }
  if (!isBlank(config.armour) && cable.armour) {
    const cfg = normalizeToken(config.armour);
    const row = normalizeToken(cable.armour);
    const cfgNone = cfg === 'NOARMOUR' || cfg === 'NONE' || cfg === 'UNARMOURED';
    const rowNone = row === 'NOARMOUR' || row === 'NONE' || row === 'UNARMOURED' || row === '';
    if (cfgNone !== rowNone && cfg && row) {
      if (!cfgNone && rowNone) return false;
      if (!cfgNone && !row.includes(cfg) && !cfg.includes(row)) return false;
    }
  }
  if (config.diameter != null && cable.diameter != null && Number(cable.diameter) !== Number(config.diameter)) {
    return false;
  }
  return true;
}

export function evaluateCableAuthority(
  config: CableConfigInput,
  context: {
    cables: CableMasterSnapshot[];
    parameters: CableParameterSnapshot[];
    compatibility: CompatibilitySnapshot[];
  }
): CableDecision {
  const failedRules: FailedRule[] = [];
  const matchAttributesUsed = [...MATCH_ATTRIBUTES];

  const identityOnly =
    !isBlank(config.materialNumber) &&
    isBlank(config.family) &&
    isBlank(config.voltage) &&
    isBlank(config.conductor) &&
    isBlank(config.conductorSize) &&
    isBlank(config.cores) &&
    isBlank(config.insulation);

  if (!identityOnly) {
    const requiredPresent = [
      ['conductor', config.conductor],
      ['conductorSize', config.conductorSize],
      ['cores', config.cores],
      ['voltage', config.voltage],
    ] as const;
    requiredPresent.forEach(([field, value]) => {
      if (isBlank(value)) {
        failedRules.push({ field, message: `${field} is required.` });
      }
    });
  }
  if (isBlank(config.family) && isBlank(config.customerCode) && isBlank(config.materialNumber)) {
    failedRules.push({
      field: 'family',
      message: 'Family, customer code, or material number is required to evaluate a cable.',
    });
  }

  const valueChecks: Array<[ParameterKindName, string | undefined]> = [
    ['FAMILY', config.family],
    ['VOLTAGE', config.voltage],
    ['CONDUCTOR', config.conductor ? (normalizeConductor(config.conductor) === 'ALUMINUM' ? 'AL' : 'CU') : undefined],
    ['INSULATION', config.insulation],
    ['SHEATH', config.sheath],
    ['CORE_COLOUR', config.coreColour],
  ];
  valueChecks.forEach(([kind, code]) => {
    if (!code || context.parameters.length === 0) return;
    if (!parameterExists(context.parameters, kind, code) && !parameterExists(context.parameters, kind, String(code))) {
      failedRules.push({
        field: kind.toLowerCase(),
        message: `${kind} value "${code}" is not an active CableParameter.`,
      });
    }
  });

  for (const [kindA, kindB, fieldA, fieldB] of REQUIRED_COMPATIBILITY_PAIRS) {
    const valA = config[fieldA];
    const valB = config[fieldB];
    if (isBlank(valA as string) || isBlank(valB as string)) continue;
    if (fieldB === 'screen' && isNoScreen(String(valB))) continue;

    const hasRules = pairHasAnyRules(context.compatibility, kindA, kindB);
    if (!hasRules) {
      return {
        code: 'CONFIGURATION_REQUIRED',
        message: `Compatibility rules for ${kindA} ↔ ${kindB} are not configured.`,
        technicalOfficeEligible: false,
        quotationAllowed: false,
        matches: [],
        failedRules: [
          {
            field: String(fieldB),
            message: `CONFIGURATION_REQUIRED: no persisted ${kindA}/${kindB} compatibility rules.`,
          },
        ],
        matchAttributesUsed,
      };
    }

    const hits = findCompatibility(
      context.compatibility,
      kindA,
      String(valA),
      kindB,
      String(valB)
    );
    if (hits.some((h) => h.relation === 'FORBIDDEN')) {
      failedRules.push({
        field: String(fieldB),
        message: `${kindB} "${valB}" is not compatible with ${kindA} "${valA}".`,
      });
      continue;
    }
    const allowedForFrom = context.compatibility.filter(
      (r) =>
        r.relation === 'ALLOWED' &&
        ((r.fromKind === kindA && r.toKind === kindB && normalizeToken(r.fromCode) === normalizeToken(String(valA))) ||
          (r.fromKind === kindB && r.toKind === kindA && normalizeToken(r.fromCode) === normalizeToken(String(valB))))
    );
    const explicitlyAllowed = hits.some((h) => h.relation === 'ALLOWED');
    if (allowedForFrom.length > 0 && !explicitlyAllowed) {
      failedRules.push({
        field: String(fieldB),
        message: `${kindB} "${valB}" is not in the allowed set for ${kindA} "${valA}".`,
      });
    }
  }

  if (failedRules.length) {
    return {
      code: 'INVALID_CONFIGURATION',
      message: failedRules.map((r) => r.message).join(' '),
      technicalOfficeEligible: false,
      quotationAllowed: false,
      matches: [],
      failedRules,
      matchAttributesUsed,
    };
  }

  const matches = context.cables.filter((c) => cableMatchesConfig(c, config));
  if (matches.length > 0) {
    const cable = matches[0];
    return {
      code: 'EXISTING_CABLE',
      message: 'Configuration matches an approved Cable Master record.',
      technicalOfficeEligible: false,
      quotationAllowed: true,
      cable,
      matches,
      failedRules: [],
      matchAttributesUsed,
    };
  }

  if (structuredEngineeringRequested(config) && !isBlank(config.materialNumber)) {
    const identity = context.cables.find(
      (c) => c.status !== 'INACTIVE' && normalizeToken(c.materialNumber) === normalizeToken(config.materialNumber)
    );
    if (identity && !hasAuthoritativeStructuredFields(identity)) {
      return {
        code: 'CONFIGURATION_REQUIRED',
        message:
          'Cable Master identity exists but approved engineering attributes are missing. Structured EXISTING_CABLE matching is not available.',
        technicalOfficeEligible: false,
        quotationAllowed: false,
        cable: identity,
        matches: [],
        failedRules: [
          {
            field: 'engineeringMapping',
            message: 'MAPPING_INCOMPLETE: family/voltage/conductor/size/cores/insulation are not SOURCE or APPROVED.',
          },
        ],
        matchAttributesUsed,
      };
    }
  }

  return {
    code: 'TECHNICALLY_VALID_NOT_MASTER',
    message: 'Valid engineering configuration — Cable Master record not found.',
    technicalOfficeEligible: true,
    quotationAllowed: false,
    matches: [],
    failedRules: [],
    matchAttributesUsed,
  };
}
