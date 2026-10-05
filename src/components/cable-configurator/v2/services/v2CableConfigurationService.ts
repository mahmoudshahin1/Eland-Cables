/**
 * Task 05A — V2 Cable Configuration production readiness helpers.
 * Single authority path: PG Cable Master + cableAuthority evaluate; no V1 imports.
 */
import { EXPECTED_OFFICIAL_CONFLICT_COUNT } from '../../../../server/bomConflictGovernanceService';
import { sotStatusForEntity } from '../../../../platform/masterDataSoT';
import type {
  CableRecordV2,
  SelectionStateV2,
  TechnicalValidationResultV2,
  ValidationOutcomeStatus,
} from '../types';
import { selectionsToConfig, type CableMasterSnapshotV2 } from '../../../../api/cableAuthorityMapping';

/** Governed configuration flow states (Task 05A §4). */
export type V2CableConfigurationFlowState =
  | 'VALID'
  | 'INVALID'
  | 'INCOMPLETE_ENGINEERING_DATA'
  | 'BLOCKED_ENGINEERING_APPROVAL'
  | 'CONFIGURATION_REQUIRED'
  | 'ENGINEERING_DATA_BLOCKED';

export type V2DownstreamStage =
  | 'cuttingLength'
  | 'drumSelection'
  | 'drumPlanSnapshot'
  | 'costing'
  | 'commercialPricing'
  | 'quotation';

export interface V2ActorContext {
  userId?: string | null;
  email?: string | null;
  role?: string | null;
  customerCode?: string | null;
}

export interface V2CableConfigurationSnapshot {
  snapshotId: string;
  capturedAt: string;
  cableMaterialNumber: string | null;
  itemCode: string | null;
  customerCode: string | null;
  selections: SelectionStateV2;
  configInput: ReturnType<typeof selectionsToConfig>;
  validationStatus: ValidationOutcomeStatus;
  flowState: V2CableConfigurationFlowState;
  engineeringStatus: string;
  summaryDescription: string;
  estimatedDiameterMm: number;
  estimatedWeightKgKm: number;
  catalogSource: 'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK';
  catalogAuthoritative: boolean;
  actorContext?: V2ActorContext;
  bomGovernanceBlocked: boolean;
  unresolvedBomConflictCount: number;
  downstreamGates: Record<V2DownstreamStage, boolean>;
}

export type V2LsInventoryClassification =
  | 'UI_STATE'
  | 'CACHE'
  | 'NON_AUTHORITATIVE'
  | 'PROHIBITED';

export interface V2LsInventoryEntry {
  key: string;
  classification: V2LsInventoryClassification;
  notes: string;
}

/** LS keys touched by V2 cable configuration (Task 05A §12). */
export const V2_CABLE_CONFIG_LS_INVENTORY: V2LsInventoryEntry[] = [
  {
    key: 'energya_configurator_version',
    classification: 'UI_STATE',
    notes: 'Legacy hub version toggle (unused); not cable authority.',
  },
  {
    key: 'energya_master_cable_catalog_v3',
    classification: 'NON_AUTHORITATIVE',
    notes: 'PG mirror only; V2 uses loadAuthoritativeCableCatalog.',
  },
  {
    key: 'energya_erp_request_items_v2',
    classification: 'CACHE',
    notes: 'Draft inquiry line items from CuttingLengthSectionV2; not governed MD.',
  },
  {
    key: 'energya_v2_technical_requests',
    classification: 'NON_AUTHORITATIVE',
    notes: 'TCR draft queue; authoritative TCR via POST /api/technical-office/requests.',
  },
  {
    key: 'energya_cable_boms_v3',
    classification: 'PROHIBITED',
    notes: 'BOM LS mirror must not be V2 cable-config authority (81 conflicts unresolved).',
  },
];

export function deriveFlowState(
  validation: Pick<TechnicalValidationResultV2, 'status' | 'isValid'>,
  catalogAuthoritative: boolean,
  bomGovernanceBlocked: boolean
): V2CableConfigurationFlowState {
  if (bomGovernanceBlocked && validation.status === 'EXISTING_APPROVED') {
    return 'ENGINEERING_DATA_BLOCKED';
  }
  switch (validation.status) {
    case 'EXISTING_APPROVED':
    case 'EXISTING_CABLE':
      return catalogAuthoritative ? 'VALID' : 'INCOMPLETE_ENGINEERING_DATA';
    case 'VALID_NEW_CABLE':
    case 'TECHNICALLY_VALID_NOT_MASTER':
      return 'BLOCKED_ENGINEERING_APPROVAL';
    case 'CONFIGURATION_REQUIRED':
      return 'INCOMPLETE_ENGINEERING_DATA';
    case 'INVALID_CONFIGURATION':
    default:
      return 'INVALID';
  }
}

/** Platform BOM governance boundary — no silent LS BOM fallback (Task 05A §5). */
export function assessBomGovernanceBoundary(
  unresolvedConflictCount: number = EXPECTED_OFFICIAL_CONFLICT_COUNT
): {
  blocked: boolean;
  reason: string;
  cableBomAuthority: string;
} {
  const bom = sotStatusForEntity('CableBomLine');
  const authority = bom?.status ?? 'POSTGRESQL_PRIMARY';
  const blocked = authority !== 'POSTGRESQL_SOT' && unresolvedConflictCount > 0;
  return {
    blocked,
    reason: blocked
      ? `ENGINEERING DATA BLOCKED — ${unresolvedConflictCount} unresolved Cable BOM governance conflicts; CableBomLine remains ${authority}.`
      : 'BOM governance clear for downstream costing.',
    cableBomAuthority: authority,
  };
}

export function evaluateDownstreamGates(input: {
  flowState: V2CableConfigurationFlowState;
  validationStatus: ValidationOutcomeStatus;
  catalogAuthoritative: boolean;
  bomGovernanceBlocked: boolean;
  matchingCable: CableRecordV2 | null;
}): Record<V2DownstreamStage, boolean> {
  const { catalogAuthoritative, bomGovernanceBlocked, matchingCable, validationStatus } = input;
  const hasResolvedCable = Boolean(matchingCable?.materialNumber);
  const cableResolved =
    (validationStatus === 'EXISTING_APPROVED' || validationStatus === 'EXISTING_CABLE') &&
    catalogAuthoritative &&
    hasResolvedCable;

  return {
    cuttingLength: cableResolved,
    drumSelection: cableResolved,
    drumPlanSnapshot: cableResolved,
    costing: cableResolved && !bomGovernanceBlocked,
    commercialPricing: cableResolved && !bomGovernanceBlocked,
    quotation: cableResolved && !bomGovernanceBlocked,
  };
}

export function buildConfigurationSnapshot(input: {
  selections: SelectionStateV2;
  validation: TechnicalValidationResultV2;
  catalogSource: 'POSTGRESQL' | 'LOCALSTORAGE_FALLBACK';
  catalogAuthoritative: boolean;
  actorContext?: V2ActorContext;
  unresolvedBomConflictCount?: number;
  capturedAt?: string;
  snapshotId?: string;
}): V2CableConfigurationSnapshot {
  const bom = assessBomGovernanceBoundary(input.unresolvedBomConflictCount);
  const flowState = deriveFlowState(input.validation, input.catalogAuthoritative, bom.blocked);
  const matching = input.validation.matchingCable;

  return {
    snapshotId: input.snapshotId ?? `v2cfg-${Date.now()}`,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    cableMaterialNumber: matching?.materialNumber ?? null,
    itemCode: matching?.itemCode ?? null,
    customerCode: matching?.customerCode ?? input.selections.customerCode ?? null,
    selections: input.selections,
    configInput: selectionsToConfig(input.selections),
    validationStatus: input.validation.status,
    flowState,
    engineeringStatus:
      flowState === 'VALID'
        ? matching?.approvedStatus ?? 'Released'
        : flowState === 'ENGINEERING_DATA_BLOCKED'
          ? 'ENGINEERING_DATA_BLOCKED'
          : input.validation.status,
    summaryDescription: input.validation.summaryDescription,
    estimatedDiameterMm: input.validation.estimatedDiameterMm,
    estimatedWeightKgKm: input.validation.estimatedWeightKgKm,
    catalogSource: input.catalogSource,
    catalogAuthoritative: input.catalogAuthoritative,
    actorContext: input.actorContext,
    bomGovernanceBlocked: bom.blocked,
    unresolvedBomConflictCount: input.unresolvedBomConflictCount ?? EXPECTED_OFFICIAL_CONFLICT_COUNT,
    downstreamGates: evaluateDownstreamGates({
      flowState,
      validationStatus: input.validation.status,
      catalogAuthoritative: input.catalogAuthoritative,
      bomGovernanceBlocked: bom.blocked,
      matchingCable: matching,
    }),
  };
}

export function canProceedToDownstream(
  snapshot: V2CableConfigurationSnapshot,
  stage: V2DownstreamStage
): boolean {
  return snapshot.downstreamGates[stage] === true;
}

/** Map server cableAuthority snapshots for evaluate API merge. */
export function mergeServerCableMatches(
  decisionMatches: CableMasterSnapshotV2[] | undefined,
  decisionCable: CableMasterSnapshotV2 | undefined
): CableMasterSnapshotV2[] {
  if (decisionMatches?.length) return decisionMatches;
  if (decisionCable) return [decisionCable];
  return [];
}

export type V2ProductionReadinessArea =
  | 'routes'
  | 'cableMasterAuthority'
  | 'technicalParameterEngine'
  | 'flowStates'
  | 'bomGovernanceBoundary'
  | 'configurationSnapshot'
  | 'customerRbac'
  | 'internalRbac'
  | 'customerIsolation'
  | 'cuttingLengthHandoff'
  | 'drumSelectionHandoff'
  | 'costingHandoff'
  | 'lsInventory'
  | 'serverAudit'
  | 'uxClarity'
  | 'v1Exclusion';

export type V2ProductionReadinessClassification =
  | 'LIVE'
  | 'PARTIAL'
  | 'BLOCKED'
  | 'MISSING'
  | 'MOCK';

export const V2_CABLE_CONFIGURATION_READINESS: Record<
  V2ProductionReadinessArea,
  { classification: V2ProductionReadinessClassification; evidence: string }
> = {
  routes: {
    classification: 'LIVE',
    evidence: 'CableConfiguratorV2 via CableConfiguratorHub; /api/cables/* + /api/master/cables',
  },
  cableMasterAuthority: {
    classification: 'LIVE',
    evidence: 'loadAuthoritativeCableCatalog + POST /api/cables/evaluate',
  },
  technicalParameterEngine: {
    classification: 'LIVE',
    evidence: 'POST /api/cables/evaluate; server technicalValidationEngineV2 still uses evaluateCableAuthority',
  },
  flowStates: {
    classification: 'LIVE',
    evidence: 'deriveFlowState maps validation outcomes to governed flow states',
  },
  bomGovernanceBoundary: {
    classification: 'BLOCKED',
    evidence: '81 unresolved BomDuplicateObservation — ENGINEERING_DATA_BLOCKED for costing path',
  },
  configurationSnapshot: {
    classification: 'LIVE',
    evidence: 'buildConfigurationSnapshot preserves identity, params, engineering status, actor',
  },
  customerRbac: {
    classification: 'PARTIAL',
    evidence: 'Cable evaluate/search open; master writes require assertCanWriteCableMaster',
  },
  internalRbac: {
    classification: 'LIVE',
    evidence: 'Technical Office list requires assertCanProcessTechnicalOffice',
  },
  customerIsolation: {
    classification: 'PARTIAL',
    evidence: 'Cable search supports customerCode filter; full customerScope on commercial APIs',
  },
  cuttingLengthHandoff: {
    classification: 'PARTIAL',
    evidence: 'CuttingLengthSectionV2 gated on VALID + authoritative catalog; LS draft items',
  },
  drumSelectionHandoff: {
    classification: 'PARTIAL',
    evidence: 'Gate defined; drum optimizer is separate module (frozen drum rules)',
  },
  costingHandoff: {
    classification: 'BLOCKED',
    evidence: 'Costing gates verify only; BOM governance blocks until 04B-13 resolved',
  },
  lsInventory: {
    classification: 'LIVE',
    evidence: 'V2_CABLE_CONFIG_LS_INVENTORY classifies UI_STATE/CACHE/NON_AUTHORITATIVE/PROHIBITED',
  },
  serverAudit: {
    classification: 'PARTIAL',
    evidence: 'TCR POST persists via createTechnicalOfficeRequest; LS TCR mirror is non-authoritative',
  },
  uxClarity: {
    classification: 'PARTIAL',
    evidence: 'Authority label + flow-state badges; no cosmetic redesign',
  },
  v1Exclusion: {
    classification: 'LIVE',
    evidence: 'V2 path does not import V1 SmartConfigurator or legacy modal configurator',
  },
};
