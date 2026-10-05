/**
 * Machine-readable Master Data source-of-truth registry.
 * Task 04A: honest authority statuses (POSTGRESQL_PRIMARY ≠ POSTGRESQL_SOT).
 * Task 04B-1: cutover phase / gates / matrix framework.
 * Task 04B-2: RawMaterial promoted to POSTGRESQL_SOT (other entities unchanged).
 * Task 04B-3: ImportBatch promoted to POSTGRESQL_SOT (other entities unchanged).
 * Task 04B-4: AuditEvent = AUTHORITATIVE_SERVER_AUDIT (not POSTGRESQL_SOT master data).
 * Task 04B-7: CableMaster promoted to POSTGRESQL_SOT (other complex entities unchanged).
 * Task 04B-12: DrumMaster promoted to POSTGRESQL_SOT (DrumCompatibility remains BLOCKED — separate entity).
 *
 * Do NOT mark BOM/Drum/CableParameters/TCR as
 * POSTGRESQL_SOT until their 04B entity cutovers pass all gates.
 */

/** Authority status per governed entity (Task 04A — do not redefine). */
export type MasterDataAuthorityStatus =
  | 'POSTGRESQL_SOT'
  | 'POSTGRESQL_PRIMARY'
  | 'DUAL_WRITE'
  | 'LOCALSTORAGE_PRIMARY'
  | 'UI_STATE'
  | 'NOT_MASTER_DATA'
  | 'BLOCKED';

/**
 * Task 04B-1 cutover progression (composes with MasterDataAuthorityStatus).
 * POSTGRESQL_SOT appears in both models: authority claim vs cutover terminal phase.
 * BLOCKED / TEMPORARY are shared terminal / hold states — not a second registry.
 */
export type MasterDataCutoverPhase =
  | 'DISCOVERED'
  | 'PG_DATA_VERIFIED'
  | 'PG_READ_READY'
  | 'PG_WRITE_READY'
  | 'V1_V2_CONVERGED'
  | 'LS_NON_AUTHORITATIVE'
  | 'TESTED'
  | 'CUTOVER_READY'
  | 'POSTGRESQL_SOT'
  | 'BLOCKED'
  | 'TEMPORARY'
  /** Task 04B-4: platform immutable audit — not master-data SoT promotion */
  | 'AUTHORITATIVE_SERVER_AUDIT';

/** Formal readiness gates A–J (Task 04B-1). Replaces informal 04A gate letter comments. */
export type MasterDataCutoverGateId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

/** @deprecated Prefer MasterDataAuthorityStatus — kept for older callers. */
export type MasterDataSoTSource =
  | 'POSTGRESQL'
  | 'DUAL'
  | 'LOCALSTORAGE'
  | 'UI_STATE'
  | 'INCOMPLETE'
  | MasterDataAuthorityStatus;

/** Task 04B-4 — AuditEvent is platform history, not governed master data. */
export type AuditAuthoritySemantics = 'AUTHORITATIVE_SERVER_AUDIT';

export interface MasterDataSoTStatus {
  entity: string;
  /** Honest Task 04A authority classification */
  status: MasterDataAuthorityStatus;
  /** Legacy alias derived from status for older consumers */
  source: MasterDataSoTSource;
  /** Primary reads resolve from PostgreSQL when authenticated / DB up */
  readCutover: boolean;
  /** Primary writes go to PostgreSQL */
  writeCutover: boolean;
  /** localStorage must not be authoritative */
  localStorageAuthority: boolean;
  /** Compatibility mirror may still write/read LS but never override PG */
  localStorageCompatibilityMirror: boolean;
  /**
   * True only when status === POSTGRESQL_SOT (full single SoT).
   * POSTGRESQL_PRIMARY keeps postgresSoT=false so cutover is not falsely claimed.
   */
  postgresSoT: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  notes?: string;
  /** Gate pass/fail under Task 04B-1 A–J semantics (evidence-based; not invented). */
  gates?: Partial<Record<MasterDataCutoverGateId, boolean>>;
  /** 04B-1 progression; never implies authority POSTGRESQL_SOT unless phase is that terminal. */
  cutoverPhase?: MasterDataCutoverPhase;
  /** Classification for LS keys / parallel stores (params, TCR, audit) */
  keyClass?: 'A_GOVERNED' | 'B_TEMPORARY' | 'C_UI_STATE' | 'D_OBSOLETE' | 'LEGACY_TELEMETRY';
  /** Task 04B-4: when set, entity uses server audit semantics instead of POSTGRESQL_SOT promotion */
  auditAuthority?: AuditAuthoritySemantics;
}

const VERIFIED_AT = '2026-09-04';
const VERIFIED_BY = 'task-04a-remediation';
const FRAMEWORK_AT = '2026-09-04';
const FRAMEWORK_BY = 'task-04b1-cutover-framework';
const RM_CUTOVER_AT = '2026-09-04';
const RM_CUTOVER_BY = 'task-04b2-raw-material-sot';
const IB_CUTOVER_AT = '2026-09-04';
const IB_CUTOVER_BY = 'task-04b3-import-batch-sot';
const AUDIT_CUTOVER_AT = '2026-09-04';
const AUDIT_CUTOVER_BY = 'task-04b4-audit-authority';
const CABLE_CUTOVER_AT = '2026-09-04';
const CABLE_CUTOVER_BY = 'task-04b7-cable-master-sot';
const DRUM_CUTOVER_AT = '2026-09-04';
const DRUM_CUTOVER_BY = 'task-04b12-drum-master-sot';

function legacySource(status: MasterDataAuthorityStatus): MasterDataSoTSource {
  switch (status) {
    case 'POSTGRESQL_SOT':
    case 'POSTGRESQL_PRIMARY':
      return 'POSTGRESQL';
    case 'DUAL_WRITE':
      return 'DUAL';
    case 'LOCALSTORAGE_PRIMARY':
      return 'LOCALSTORAGE';
    case 'UI_STATE':
      return 'UI_STATE';
    case 'NOT_MASTER_DATA':
      return 'UI_STATE';
    case 'BLOCKED':
      return 'INCOMPLETE';
    default:
      return 'INCOMPLETE';
  }
}

/** Default phase from authority when not explicitly set (04B-1 composition). */
export function defaultCutoverPhase(status: MasterDataAuthorityStatus): MasterDataCutoverPhase {
  switch (status) {
    case 'POSTGRESQL_SOT':
      return 'POSTGRESQL_SOT';
    case 'BLOCKED':
      return 'BLOCKED';
    case 'LOCALSTORAGE_PRIMARY':
    case 'DUAL_WRITE':
      return 'TEMPORARY';
    case 'UI_STATE':
    case 'NOT_MASTER_DATA':
      return 'TEMPORARY';
    case 'POSTGRESQL_PRIMARY':
      return 'LS_NON_AUTHORITATIVE';
    default:
      return 'DISCOVERED';
  }
}

function row(
  partial: Omit<MasterDataSoTStatus, 'source' | 'postgresSoT'> & {
    postgresSoT?: boolean;
  }
): MasterDataSoTStatus {
  const postgresSoT = partial.postgresSoT ?? partial.status === 'POSTGRESQL_SOT';
  return {
    ...partial,
    source: legacySource(partial.status),
    postgresSoT,
    cutoverPhase: partial.cutoverPhase ?? defaultCutoverPhase(partial.status),
  };
}

/** All formal gates A–J passed (required before authority may become POSTGRESQL_SOT). */
export function allCutoverGatesPassed(
  gates: Partial<Record<MasterDataCutoverGateId, boolean>> | undefined
): boolean {
  if (!gates) return false;
  return (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as MasterDataCutoverGateId[]).every(
    (g) => gates[g] === true
  );
}

/**
 * Policy: authority may only move POSTGRESQL_PRIMARY → POSTGRESQL_SOT when
 * cutoverPhase is CUTOVER_READY (or already POSTGRESQL_SOT) and all gates pass.
 * Framework only — does not mutate registry.
 */
export function canPromoteToPostgresqlSot(row: MasterDataSoTStatus): boolean {
  if (row.auditAuthority === 'AUTHORITATIVE_SERVER_AUDIT') return false;
  if (row.status === 'POSTGRESQL_SOT') return true;
  if (row.status === 'BLOCKED' || row.cutoverPhase === 'BLOCKED') return false;
  if (row.cutoverPhase === 'TEMPORARY' || row.status === 'LOCALSTORAGE_PRIMARY') return false;
  if (row.status !== 'POSTGRESQL_PRIMARY' && row.status !== 'DUAL_WRITE') return false;
  return row.cutoverPhase === 'CUTOVER_READY' && allCutoverGatesPassed(row.gates);
}

/** Task 04B-4: server audit authority established (not POSTGRESQL_SOT). */
export function isAuthoritativeServerAudit(entity: string): boolean {
  const row = sotStatusForEntity(entity);
  return row?.auditAuthority === 'AUTHORITATIVE_SERVER_AUDIT';
}

export const MASTER_DATA_SOT_STATUS: MasterDataSoTStatus[] = [
  row({
    entity: 'Customer',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: false,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    notes:
      'Verified: V1/V2 admin customer APIs share PostgreSQL Customer / CustomerUser; no hidden localStorage Customer master.',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'CableMaster',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: true,
    verifiedAt: CABLE_CUTOVER_AT,
    verifiedBy: CABLE_CUTOVER_BY,
    notes:
      '04B-7 cutover: Hub/Import/Configurator/V1/V2/TO share PostgreSQL CableMaster as sole SoT. energya_master_cable_catalog_v3 is NON_AUTHORITATIVE_MIRROR only (retained; not deleted).',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'CableBomLine',
    status: 'POSTGRESQL_PRIMARY',
    cutoverPhase: 'LS_NON_AUTHORITATIVE',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: true,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    notes:
      'Hub/Import prefer PG. LS energya_cable_boms_v3 mirror only. Excel Method-B routes through POST /api/master/boms/excel-commit (04B-9). 04B-13 governance register classifies 81 conflicts; promotion blocked until ENGINEERING_REVIEW completes — POSTGRESQL_PRIMARY retained.',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'RawMaterial',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: true,
    verifiedAt: RM_CUTOVER_AT,
    verifiedBy: RM_CUTOVER_BY,
    notes:
      '04B-2 cutover: Hub + Costing + Import share PostgreSQL RawMaterial as sole SoT. energya_raw_material_master_v1 is NON_AUTHORITATIVE_MIRROR only (retained; not deleted). Costing Option B / Decision 5 untouched.',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'RawMaterialPrice',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: false,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    notes: 'Persistence-only verification. Costing Option B / Decision 5 / market-metal unchanged.',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'DrumMaster',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: true,
    verifiedAt: DRUM_CUTOVER_AT,
    verifiedBy: DRUM_CUTOVER_BY,
    notes:
      '04B-12 cutover: Hub/Import/inquiry/optimization share PostgreSQL DrumMaster as sole SoT. energya_drum_master_v1 is NON_AUTHORITATIVE_MIRROR only (retained; not deleted). DrumCompatibility remains separate BLOCKED entity (0 rows; not fabricated).',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'CableEngineeringMapping',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: false,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'CableParameter',
    status: 'POSTGRESQL_PRIMARY',
    cutoverPhase: 'PG_READ_READY',
    readCutover: true,
    writeCutover: false,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: true,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    keyClass: 'A_GOVERNED',
    notes:
      'Seeded CableParameter / ParameterCompatibility in PG (class A). Legacy LS energya_cable_parameter_masters_v1_* is D_OBSOLETE mirror. Custom params are separate entity.',
    gates: { A: true, B: true, C: false, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'CostingCurrency',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: false,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'CostingExchangeRate',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: false,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'CostingScrapRule',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: false,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'CommercialPricingRule',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: false,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'ImportBatch',
    status: 'POSTGRESQL_SOT',
    cutoverPhase: 'POSTGRESQL_SOT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: true,
    verifiedAt: IB_CUTOVER_AT,
    verifiedBy: IB_CUTOVER_BY,
    notes:
      '04B-3 cutover: Import Center batch history is PostgreSQL sole SoT. energya_import_batches_v1 is NON_AUTHORITATIVE_MIRROR only (retained; not deleted). PG txn commits master records + ImportBatch + AuditEvent before any LS mirror.',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'AuditEvent',
    status: 'POSTGRESQL_PRIMARY',
    cutoverPhase: 'AUTHORITATIVE_SERVER_AUDIT',
    auditAuthority: 'AUTHORITATIVE_SERVER_AUDIT',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: true,
    verifiedAt: AUDIT_CUTOVER_AT,
    verifiedBy: AUDIT_CUTOVER_BY,
    keyClass: 'LEGACY_TELEMETRY',
    notes:
      '04B-4: Server AuditEvent is AUTHORITATIVE_SERVER_AUDIT (immutable platform history — not master-data POSTGRESQL_SOT). energya_platform_audit_v1 / appendAudit = LEGACY_TELEMETRY retained, not deleted.',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
  row({
    entity: 'TechnicalOfficeRequest',
    status: 'DUAL_WRITE',
    cutoverPhase: 'TEMPORARY',
    readCutover: false,
    writeCutover: false,
    localStorageAuthority: true,
    localStorageCompatibilityMirror: true,
    verifiedAt: null,
    verifiedBy: null,
    keyClass: 'B_TEMPORARY',
    notes:
      'Governed mapping lives in PG TechnicalOfficeRequest / engineering APIs. energya_v2_technical_requests is a transactional/queue LS store — do not auto-migrate without classification (04B).',
    gates: { A: false, B: false, C: false, D: false, E: false, F: false, G: false, H: true, I: false, J: true },
  }),
  row({
    entity: 'CustomMasterParams',
    status: 'LOCALSTORAGE_PRIMARY',
    cutoverPhase: 'TEMPORARY',
    readCutover: false,
    writeCutover: false,
    localStorageAuthority: true,
    localStorageCompatibilityMirror: false,
    verifiedAt: null,
    verifiedBy: null,
    keyClass: 'B_TEMPORARY',
    notes: 'energya_v2_custom_master_params — temporary configurator params; not class A; do not migrate in 04A.',
    gates: { A: false, B: false, C: false, D: false, E: false, F: false, G: false, H: true, I: false, J: true },
  }),
  row({
    entity: 'DrumCompatibility',
    status: 'BLOCKED',
    cutoverPhase: 'BLOCKED',
    readCutover: false,
    writeCutover: false,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: false,
    verifiedAt: null,
    verifiedBy: null,
    notes: 'CONFIGURATION_REQUIRED — do not fabricate compatibility rows.',
    gates: { A: false, B: false, C: false, D: false, E: true, F: true, G: true, H: true, I: false, J: true },
  }),
  row({
    entity: 'ExcelMethodBCableBomUpload',
    status: 'POSTGRESQL_PRIMARY',
    cutoverPhase: 'LS_NON_AUTHORITATIVE',
    readCutover: true,
    writeCutover: true,
    localStorageAuthority: false,
    localStorageCompatibilityMirror: true,
    verifiedAt: VERIFIED_AT,
    verifiedBy: VERIFIED_BY,
    notes:
      '04B-9: Excel Method-B routes through POST /api/master/boms/excel-commit + server AuditEvent; LS mirror only after PG success.',
    gates: { A: true, B: true, C: true, D: true, E: true, F: true, G: true, H: true, I: true, J: true },
  }),
];

/** localStorage key classification (Task 04A §9–11). */
export const MASTER_DATA_KEY_CLASSIFICATION: Array<{
  keyPattern: string;
  domain: string;
  class: 'A_GOVERNED' | 'B_TEMPORARY' | 'C_UI_STATE' | 'D_OBSOLETE' | 'LEGACY_TELEMETRY';
  migrateIn04B: boolean;
  notes: string;
}> = [
  {
    keyPattern: 'energya_master_cable_catalog_v3',
    domain: 'Cable',
    class: 'A_GOVERNED',
    migrateIn04B: false,
    notes: 'Non-authoritative mirror of CableMaster; retain until 04B removes dual paths.',
  },
  {
    keyPattern: 'energya_cable_boms_v3',
    domain: 'BOM',
    class: 'A_GOVERNED',
    migrateIn04B: false,
    notes: 'Non-authoritative mirror of CableBomLine.',
  },
  {
    keyPattern: 'energya_raw_material_master_v1',
    domain: 'RawMaterial',
    class: 'A_GOVERNED',
    migrateIn04B: false,
    notes:
      'NON_AUTHORITATIVE_MIRROR after 04B-2 RawMaterial POSTGRESQL_SOT. Retain key; do not delete browser data; never override PG.',
  },
  {
    keyPattern: 'energya_drum_master_v1',
    domain: 'Drum',
    class: 'A_GOVERNED',
    migrateIn04B: false,
    notes: 'Non-authoritative mirror of DrumMaster.',
  },
  {
    keyPattern: 'energya_import_batches_v1',
    domain: 'ImportBatch',
    class: 'A_GOVERNED',
    migrateIn04B: false,
    notes: 'NON_AUTHORITATIVE_MIRROR after 04B-3 ImportBatch POSTGRESQL_SOT. Retain key; do not delete browser data; never override PG.',
  },
  {
    keyPattern: 'energya_cable_parameter_masters_v1_*',
    domain: 'CableParameter',
    class: 'D_OBSOLETE',
    migrateIn04B: false,
    notes: 'Class D obsolete vs seeded PG CableParameter; do not migrate content — PG seed is SoT for reference params.',
  },
  {
    keyPattern: 'energya_v2_custom_master_params',
    domain: 'CustomMasterParams',
    class: 'B_TEMPORARY',
    migrateIn04B: false,
    notes: 'Class B temporary — not governed MD; do not migrate in 04A/04B cutover of masters.',
  },
  {
    keyPattern: 'energya_v2_technical_requests',
    domain: 'TechnicalOfficeRequest',
    class: 'B_TEMPORARY',
    migrateIn04B: false,
    notes: 'Transactional/queue LS — separate from governed mapping; classify before any migrate.',
  },
  {
    keyPattern: 'energya_platform_audit_v1',
    domain: 'AuditEvent',
    class: 'LEGACY_TELEMETRY',
    migrateIn04B: false,
    notes: 'Client audit telemetry; AuditEvent is authoritative. Do not delete yet.',
  },
  {
    keyPattern: 'energya_inquiry_* / energya_iq_home_saved_views_v1 / energya_configurator_version',
    domain: 'UI',
    class: 'C_UI_STATE',
    migrateIn04B: false,
    notes: 'UI prefs — not master data.',
  },
];

export function sotStatusForEntity(entity: string): MasterDataSoTStatus | undefined {
  return MASTER_DATA_SOT_STATUS.find((r) => r.entity === entity);
}

export function postgresSoTEntities(): MasterDataSoTStatus[] {
  return MASTER_DATA_SOT_STATUS.filter((r) => r.postgresSoT);
}

export function postgresqlPrimaryOrSotEntities(): MasterDataSoTStatus[] {
  return MASTER_DATA_SOT_STATUS.filter(
    (r) => r.status === 'POSTGRESQL_SOT' || r.status === 'POSTGRESQL_PRIMARY'
  );
}

/**
 * Policy: when PostgreSQL read succeeded, its payload wins — including empty arrays.
 * Stale localStorage must never override a successful PG response.
 * When PG is unavailable, localStorage may be returned only as a non-authoritative
 * degraded fallback — callers must not treat it as SoT.
 */
export function preferPostgresMasterData<T>(
  pg: { ok: true; data: T } | { ok: false; error?: string },
  localFallback: T
): {
  data: T;
  source: 'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK';
  staleLocalIgnored: boolean;
  /** False when serving LS because PG failed — never silent SoT. */
  authoritative: boolean;
} {
  if (pg.ok) {
    return {
      data: pg.data,
      source: 'POSTGRESQL',
      staleLocalIgnored: true,
      authoritative: true,
    };
  }
  return {
    data: localFallback,
    source: 'LOCALSTORAGE_FALLBACK',
    staleLocalIgnored: false,
    authoritative: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Task 04B-1 — Cutover framework (planning only; no entity cutover executed) */
/* -------------------------------------------------------------------------- */

export const MASTER_DATA_CUTOVER_GATE_DEFINITIONS: Record<
  MasterDataCutoverGateId,
  { name: string; requirement: string }
> = {
  A: {
    name: 'DATA',
    requirement: 'PostgreSQL contains the required governed records.',
  },
  B: {
    name: 'READ',
    requirement: 'All authoritative application read paths use PostgreSQL.',
  },
  C: {
    name: 'WRITE',
    requirement: 'All authoritative application writes use PostgreSQL.',
  },
  D: {
    name: 'V1/V2',
    requirement: 'V1 and V2 use the same underlying authoritative service/data.',
  },
  E: {
    name: 'LOCALSTORAGE',
    requirement:
      'localStorage is removed, non-authoritative mirror, explicitly temporary, UI state, or blocked — no hidden LS authority.',
  },
  F: {
    name: 'STALE DATA',
    requirement: 'Stale localStorage cannot override PostgreSQL.',
  },
  G: {
    name: 'FAILURE',
    requirement:
      'PostgreSQL failure cannot create a successful localStorage-only authoritative state.',
  },
  H: {
    name: 'SECURITY',
    requirement: 'All access remains server-side authenticated/authorized.',
  },
  I: {
    name: 'AUDIT',
    requirement: 'Authoritative writes produce server AuditEvent where applicable.',
  },
  J: {
    name: 'REGRESSION',
    requirement: 'Existing tests remain green.',
  },
};

export const MASTER_DATA_CUTOVER_STOP_CONDITIONS: Array<{
  entity: string;
  stop: string;
}> = [
  {
    entity: 'CableMaster',
    stop: '04B-7 COMPLETE (POSTGRESQL_SOT). Retained stop text: PG must remain sole authority; LS mirror must never regain write or authoritative read.',
  },
  {
    entity: 'CableBomLine',
    stop: 'STOP if Excel Method-B remains authoritative or BOM governance/versioning is bypassed.',
  },
  {
    entity: 'DrumMaster',
    stop: '04B-12 COMPLETE (POSTGRESQL_SOT). Retained stop text: PG must remain sole authority; LS mirror must never regain write or authoritative read. DrumCompatibility is a separate BLOCKED entity — not a Drum Master prerequisite.',
  },
  {
    entity: 'CableParameter',
    stop: 'STOP until governed engineering parameters vs temporary custom parameters are formally resolved.',
  },
  {
    entity: 'TechnicalOfficeRequest',
    stop: 'STOP migration of the temporary request queue until lifecycle and persistence authority are explicitly decided.',
  },
  {
    entity: 'DrumCompatibility',
    stop: 'REMAIN BLOCKED. Do not fabricate compatibility rules or engineering data.',
  },
  {
    entity: 'RawMaterial',
    stop: '04B-2 COMPLETE (POSTGRESQL_SOT). Retained stop text: Costing+MD must remain on same PG records; LS must never regain authority.',
  },
  {
    entity: 'ImportBatch',
    stop: '04B-3 COMPLETE (POSTGRESQL_SOT). Retained stop text: PG transaction must precede LS mirror; LS must never regain authority.',
  },
  {
    entity: 'AuditEvent',
    stop: '04B-4 COMPLETE (AUTHORITATIVE_SERVER_AUDIT). Legacy client telemetry retained; do not promote to POSTGRESQL_SOT or mass-migrate LS→PG.',
  },
];

/** Recommended safe order — document only; Task 04B-1 does NOT execute. */
export const MASTER_DATA_CUTOVER_ORDER: Array<{
  order: number;
  entity: string;
  band: 'ALREADY_SOT' | 'NEAR' | 'COMPLEX' | 'SEPARATE' | 'BLOCKED';
  note: string;
}> = [
  { order: 1, entity: 'Customer', band: 'ALREADY_SOT', note: 'Already POSTGRESQL_SOT (04A).' },
  { order: 2, entity: 'RawMaterialPrice', band: 'ALREADY_SOT', note: 'Already POSTGRESQL_SOT; costing freeze untouched.' },
  { order: 3, entity: 'CostingCurrency', band: 'ALREADY_SOT', note: 'Already POSTGRESQL_SOT.' },
  { order: 4, entity: 'CostingExchangeRate', band: 'ALREADY_SOT', note: 'Already POSTGRESQL_SOT.' },
  { order: 5, entity: 'CostingScrapRule', band: 'ALREADY_SOT', note: 'Already POSTGRESQL_SOT.' },
  { order: 6, entity: 'CommercialPricingRule', band: 'ALREADY_SOT', note: 'Already POSTGRESQL_SOT.' },
  { order: 7, entity: 'CableEngineeringMapping', band: 'ALREADY_SOT', note: 'Already POSTGRESQL_SOT.' },
  {
    order: 8,
    entity: 'RawMaterial',
    band: 'ALREADY_SOT',
    note: '04B-2 cutover accepted — POSTGRESQL_SOT; LS mirror retained non-authoritative.',
  },
  {
    order: 9,
    entity: 'ImportBatch',
    band: 'ALREADY_SOT',
    note: '04B-3 cutover accepted — POSTGRESQL_SOT; LS mirror retained non-authoritative.',
  },
  {
    order: 10,
    entity: 'AuditEvent',
    band: 'ALREADY_SOT',
    note: '04B-4 audit authority accepted — AUTHORITATIVE_SERVER_AUDIT; LS telemetry retained.',
  },
  {
    order: 11,
    entity: 'CableMaster',
    band: 'ALREADY_SOT',
    note: '04B-7 cutover accepted — POSTGRESQL_SOT; LS mirror retained non-authoritative.',
  },
  { order: 12, entity: 'CableBomLine', band: 'COMPLEX', note: '04B-9 persistence remediated; 81 governance conflicts STOP promotion.' },
  {
    order: 13,
    entity: 'DrumMaster',
    band: 'ALREADY_SOT',
    note: '04B-12 cutover accepted — POSTGRESQL_SOT; LS mirror retained non-authoritative.',
  },
  { order: 14, entity: 'CableParameter', band: 'COMPLEX', note: 'Governed vs custom params distinction STOP.' },
  { order: 15, entity: 'TechnicalOfficeRequest', band: 'SEPARATE', note: 'TCR queue separately controlled.' },
  { order: 16, entity: 'CustomMasterParams', band: 'SEPARATE', note: 'TEMPORARY — not governed MD cutover.' },
  { order: 17, entity: 'DrumCompatibility', band: 'BLOCKED', note: 'CONFIGURATION_REQUIRED — do not invent.' },
  { order: 18, entity: 'ExcelMethodBCableBomUpload', band: 'COMPLEX', note: '04B-9 PG write path; CableBomLine promotion still STOP.' },
];

export type CutoverEvidenceFlag = boolean | 'PARTIAL' | 'N/A';

/** Durable entity cutover matrix (§3) — evidence from 04A registry + docs 18/19; no invented completion. */
export interface MasterDataCutoverMatrixRow {
  entity: string;
  registryEntity: string;
  currentSoTStatus: MasterDataAuthorityStatus;
  targetStatus: MasterDataAuthorityStatus | 'DOCUMENT_ONLY';
  cutoverPhase: MasterDataCutoverPhase;
  pgDataVerified: CutoverEvidenceFlag;
  pgReadComplete: CutoverEvidenceFlag;
  pgWriteComplete: CutoverEvidenceFlag;
  v1ReadPath: CutoverEvidenceFlag;
  v2ReadPath: CutoverEvidenceFlag;
  v1V2Converged: CutoverEvidenceFlag;
  lsReadPathsRemaining: CutoverEvidenceFlag;
  lsWritePathsRemaining: CutoverEvidenceFlag;
  lsAuthoritative: boolean;
  mirrorAllowed: boolean;
  auditVerified: CutoverEvidenceFlag;
  staleLsTest: CutoverEvidenceFlag;
  pgFailureTest: CutoverEvidenceFlag;
  cutoverReady: boolean;
  blockingReason: string | null;
  gate04B: string;
  ownerNotes: string;
  evidenceAt: string;
  evidenceBy: string;
}

function matrixFromRegistry(
  registryEntity: string,
  displayName: string,
  extras: Omit<
    MasterDataCutoverMatrixRow,
    | 'entity'
    | 'registryEntity'
    | 'currentSoTStatus'
    | 'cutoverPhase'
    | 'lsAuthoritative'
    | 'mirrorAllowed'
    | 'evidenceAt'
    | 'evidenceBy'
  > &
    Partial<Pick<MasterDataCutoverMatrixRow, 'lsAuthoritative' | 'mirrorAllowed' | 'evidenceAt' | 'evidenceBy'>>
): MasterDataCutoverMatrixRow {
  const sot = sotStatusForEntity(registryEntity);
  if (!sot) {
    throw new Error(`Cutover matrix references missing SoT entity: ${registryEntity}`);
  }
  const { evidenceAt, evidenceBy, ...rest } = extras;
  return {
    ...rest,
    entity: displayName,
    registryEntity,
    currentSoTStatus: sot.status,
    cutoverPhase: sot.cutoverPhase ?? defaultCutoverPhase(sot.status),
    lsAuthoritative: extras.lsAuthoritative ?? sot.localStorageAuthority,
    mirrorAllowed: extras.mirrorAllowed ?? sot.localStorageCompatibilityMirror,
    evidenceAt: evidenceAt ?? FRAMEWORK_AT,
    evidenceBy: evidenceBy ?? FRAMEWORK_BY,
  };
}

export const MASTER_DATA_CUTOVER_MATRIX: MasterDataCutoverMatrixRow[] = [
  matrixFromRegistry('Customer', 'Customer', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: false,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'Complete (already SoT in 04A)',
    ownerNotes: 'No hidden LS Customer master; V1/V2 admin APIs share PG.',
  }),
  matrixFromRegistry('RawMaterial', 'Raw Material', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: true,
    lsWritePathsRemaining: true,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'COMPLETE — 04B-2 Raw Material POSTGRESQL_SOT (LS = NON_AUTHORITATIVE_MIRROR)',
    ownerNotes:
      'Hub+Costing+Import PG SoT (04B-2). Mirror key retained. Costing Option B / Decision 5 untouched.',
    evidenceAt: RM_CUTOVER_AT,
    evidenceBy: RM_CUTOVER_BY,
  }),
  matrixFromRegistry('RawMaterialPrice', 'Raw Material Prices', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: false,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'Complete (already SoT in 04A)',
    ownerNotes: 'Persistence SoT only — no metal-price semantic changes.',
  }),
  matrixFromRegistry('CostingCurrency', 'Currency', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: false,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'Complete (already SoT in 04A)',
    ownerNotes: 'Admin costing currency APIs — PG only.',
  }),
  matrixFromRegistry('CostingExchangeRate', 'FX', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: false,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'Complete (already SoT in 04A)',
    ownerNotes: 'Governed FX table — PG only.',
  }),
  matrixFromRegistry('CostingScrapRule', 'Scrap', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: false,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'Complete (already SoT in 04A)',
    ownerNotes: 'Costing scrap rules — PG only.',
  }),
  matrixFromRegistry('CommercialPricingRule', 'Commercial Pricing', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: false,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'Complete (already SoT in 04A)',
    ownerNotes: 'Commercial pricing rules — PG only.',
  }),
  matrixFromRegistry('CableEngineeringMapping', 'Engineering Mappings', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: false,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'Complete (already SoT in 04A)',
    ownerNotes: 'Engineering mapping APIs — PG only.',
  }),
  matrixFromRegistry('ImportBatch', 'Import Batches', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: true,
    lsWritePathsRemaining: true,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'COMPLETE — 04B-3 Import Batch POSTGRESQL_SOT (LS = NON_AUTHORITATIVE_MIRROR)',
    ownerNotes:
      'Import Center PG txn authoritative; LS mirror only after success. Imported entity promotion (Cable/BOM/etc.) out of scope.',
    evidenceAt: IB_CUTOVER_AT,
    evidenceBy: IB_CUTOVER_BY,
  }),
  matrixFromRegistry('AuditEvent', 'Audit', {
    targetStatus: 'POSTGRESQL_PRIMARY',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: true,
    lsWritePathsRemaining: true,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'COMPLETE — 04B-4 AUTHORITATIVE_SERVER_AUDIT (LS = LEGACY_TELEMETRY retained)',
    ownerNotes: 'Not POSTGRESQL_SOT — platform immutable audit. Do not delete client telemetry yet.',
    evidenceAt: AUDIT_CUTOVER_AT,
    evidenceBy: AUDIT_CUTOVER_BY,
  }),
  matrixFromRegistry('CableMaster', 'Cable Master', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: true,
    lsWritePathsRemaining: true,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'COMPLETE — 04B-7 Cable Master POSTGRESQL_SOT (LS = NON_AUTHORITATIVE_MIRROR)',
    ownerNotes:
      'Hub/Import/Configurator/V1/V2/TO PG SoT (04B-7). Mirror key retained. BOM/Drum/params cutovers unchanged.',
    evidenceAt: CABLE_CUTOVER_AT,
    evidenceBy: CABLE_CUTOVER_BY,
  }),
  matrixFromRegistry('CableBomLine', 'BOM', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: 'PARTIAL',
    pgWriteComplete: 'PARTIAL',
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: true,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: false,
    blockingReason:
      '81 unresolved BomDuplicateObservation groups — 04B-13 OUTCOME B (ENGINEERING_REVIEW_REQUIRED); cutoverPhase not CUTOVER_READY — entity not promoted.',
    gate04B: 'STOP — 04B-13 governance register established; POSTGRESQL_PRIMARY retained',
    ownerNotes: 'energya_cable_boms_v3 mirror only (04A).',
  }),
  matrixFromRegistry('DrumMaster', 'Drum Master', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: true,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: true,
    lsReadPathsRemaining: true,
    lsWritePathsRemaining: false,
    auditVerified: true,
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: true,
    blockingReason: null,
    gate04B: 'COMPLETE — 04B-12 Drum Master POSTGRESQL_SOT (LS = NON_AUTHORITATIVE_MIRROR)',
    ownerNotes:
      'Hub/Import/inquiry/optimization PG SoT (04B-12). Mirror key retained. DrumCompatibility separate BLOCKED (downstream ranking tables).',
    evidenceAt: DRUM_CUTOVER_AT,
    evidenceBy: DRUM_CUTOVER_BY,
  }),
  matrixFromRegistry('CableParameter', 'Cable Parameters', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: true,
    pgReadComplete: true,
    pgWriteComplete: false,
    v1ReadPath: true,
    v2ReadPath: true,
    v1V2Converged: 'PARTIAL',
    lsReadPathsRemaining: true,
    lsWritePathsRemaining: true,
    auditVerified: 'PARTIAL',
    staleLsTest: true,
    pgFailureTest: true,
    cutoverReady: false,
    blockingReason: 'Governed PG seed vs CustomMasterParams (LS temporary) distinction unresolved for cutover.',
    gate04B: 'STOP — params class distinction',
    ownerNotes: 'Legacy LS param keys D_OBSOLETE; custom params separate TEMPORARY entity.',
  }),
  matrixFromRegistry('TechnicalOfficeRequest', 'Technical Office Requests / TCR', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: 'PARTIAL',
    pgReadComplete: false,
    pgWriteComplete: false,
    v1ReadPath: 'PARTIAL',
    v2ReadPath: 'PARTIAL',
    v1V2Converged: false,
    lsReadPathsRemaining: true,
    lsWritePathsRemaining: true,
    auditVerified: false,
    staleLsTest: false,
    pgFailureTest: false,
    cutoverReady: false,
    blockingReason: 'LS queue energya_v2_technical_requests is B_TEMPORARY; lifecycle undecided.',
    gate04B: 'STOP — separate queue classification',
    ownerNotes: 'Do not auto-migrate TCR in 04B-1.',
  }),
  matrixFromRegistry('DrumCompatibility', 'DrumCompatibility', {
    targetStatus: 'POSTGRESQL_SOT',
    pgDataVerified: false,
    pgReadComplete: false,
    pgWriteComplete: false,
    v1ReadPath: 'N/A',
    v2ReadPath: 'N/A',
    v1V2Converged: false,
    lsReadPathsRemaining: false,
    lsWritePathsRemaining: false,
    auditVerified: false,
    staleLsTest: 'N/A',
    pgFailureTest: 'N/A',
    cutoverReady: false,
    blockingReason: 'CONFIGURATION_REQUIRED — table empty; do not fabricate rows.',
    gate04B: 'BLOCKED',
    ownerNotes: 'Remain BLOCKED until business seeds real compatibility.',
  }),
];

export function cutoverMatrixForEntity(entityOrDisplay: string): MasterDataCutoverMatrixRow | undefined {
  return MASTER_DATA_CUTOVER_MATRIX.find(
    (r) => r.entity === entityOrDisplay || r.registryEntity === entityOrDisplay
  );
}

export function entitiesNotCutoverReady(): MasterDataCutoverMatrixRow[] {
  return MASTER_DATA_CUTOVER_MATRIX.filter((r) => !r.cutoverReady);
}

/** Framework metadata for HTTP / docs. */
export const MASTER_DATA_CUTOVER_FRAMEWORK = {
  task: '04B-1',
  title: 'Master Data SoT Cutover Framework',
  /** True once any entity cutover (04B-2+) has been executed. */
  entityCutoversExecuted: true,
  entityCutoversCompleted: ['RawMaterial', 'ImportBatch', 'CableMaster', 'DrumMaster'] as const,
  auditAuthorityEstablished: ['AuditEvent'] as const,
  nextEntityCutover: 'CableBomLine' as const,
  frameworkAt: FRAMEWORK_AT,
  frameworkBy: FRAMEWORK_BY,
  frozen04A: '57caf852067fea4b29efdfd4d73733499a0ba4f0',
  frozen04B1: 'fb03a3c8ccc2d339f021aac1950ec06959305d2e',
  frozen04B2: '611c083754a616d4991f86dd27036583ae129e43',
  frozen04B3: '34b76450f2e8ab325ef73ffde6d18271bbb92ff2',
  policy:
    'Entities may move POSTGRESQL_PRIMARY → POSTGRESQL_SOT only after cutoverPhase=CUTOVER_READY and gates A–J. AuditEvent uses AUTHORITATIVE_SERVER_AUDIT (04B-4) — not POSTGRESQL_SOT. 04B-2 = RawMaterial; 04B-3 = ImportBatch; 04B-7 = CableMaster; 04B-12 = DrumMaster; BOM/params NOT STARTED.',
} as const;
