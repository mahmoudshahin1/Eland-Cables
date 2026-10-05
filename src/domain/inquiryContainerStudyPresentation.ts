/**
 * Version A inquiry Container Study presentation.
 * Pure mapping only — no I/O, no invented dimensions/capacity/cost, no new packing algorithm.
 */

import { evaluateConfirmReadiness } from './containerStudyValidation';
import { grossLoadedDrumWeightKg } from './drumCapacityCalculator';
import { expandPhysicalDrumRequirements } from './drumOptimizationPresentation';
import { cableWeightKgFromCuttingLength } from '../services/drumMasterService';
import {
  matchIncotermMaster,
  resolveCurrentInquiryIncotermCode,
  selectableGlobalIncoterms,
  type GlobalIncotermRecord,
} from './globalIncotermMaster';
import {
  matchCustomerDeliveryCombination,
  matchCustomerDestinationPort,
  type CustomerDeliveryCombinationView,
} from './customerDeliveryCombination';

export type InquiryContainerStudyIssue = {
  code: string;
  field?: string;
  message: string;
};

export type CuttingLengthRequirementInput = {
  requirementId: string;
  inquiryLineId: string;
  sequenceNo: number;
  cuttingLengthM: number;
  requestedDrumCount: number;
  drumPlanId?: string | null;
  drumPlanStatus?: string | null;
  drumCode?: string | null;
};

export type DrumPlanLineInput = {
  id: string;
  drumPlanId: string;
  inquiryLineId: string;
  requirementId?: string | null;
  drumCode: string;
  numberOfDrums: number;
  cuttingLengthM: number;
  emptyDrumNetWeightKg?: number | null;
  grossLoadedDrumWeightKg?: number | null;
  packedLengthMm?: number | null;
  packedWidthMm?: number | null;
  packedHeightMm?: number | null;
};

export type PhysicalDrumMasterView = {
  drumCode: string;
  description?: string | null;
  drumType?: string | null;
  emptyDrumNetWeightKg?: number | null;
};

export type PhysicalDrumForStudy = {
  physicalDrumKey: string;
  sourceLineId: string;
  inquiryId?: string;
  inquiryLineId?: string;
  inquiryLineNumber?: number;
  cuttingRequirementId?: string;
  cuttingPlanId?: string;
  requirementId?: string;
  drumPlanId?: string;
  drumPlanVersion?: number;
  drumPlanLineId?: string;
  drumCode: string;
  drumDescription: string | null;
  drumLabel: string;
  instanceIndex: number;
  cuttingLengthM: number;
  cableNetWeightKg?: number | null;
  emptyDrumNetWeightKg?: number | null;
  grossWeightKg: number | null;
};

export type PhysicalPopulationIdentityRow = {
  inquiryLineId: string;
  drumCode: string;
  cuttingLengthM: number;
  instanceCount: number;
};

export type ContainerTypeMasterView = {
  code: string;
  description: string;
  active: boolean;
  currentVersionId?: string | null;
  dimensionsStatus?: 'PENDING_APPROVAL' | 'APPROVED' | null;
  usableLengthMm?: number | null;
  internalWidthMm?: number | null;
  internalHeightMm?: number | null;
  payloadCapacityKg?: number | null;
  volumeM3?: number | null;
};

export type CalculatedContainerInstance = {
  typeCode: string;
  containerIndex: number;
  usableLengthMm: number;
  payloadCapacityKg: number;
  loadedWeightKg: number;
  utilizationWeightPct: number;
  utilizationLengthPct: number;
  drumCountQ3: number;
};

export type CalculatedUnallocatedDrum = {
  physicalDrumKey: string;
  sourceLineId: string;
  instanceIndex: number;
  reasonCode: string;
  detail: string;
};

export type ApprovedShippingRate = {
  destinationPortCode: string;
  incotermCode: string;
  containerTypeCode: string;
  rateAmount: number;
  currencyCode: string;
};

export type ContainerOptionRow = {
  typeCode: string;
  description: string;
  internalDimensionsLabel: string;
  maxPayloadLabel: string;
  volumeLabel: string;
  requiredContainersLabel: string;
  utilizationLabel: string;
  allocationStatus: 'ALLOCATED' | 'PARTIAL' | 'UNALLOCATED' | 'NOT_READY' | 'NOT_USED';
  selectable: boolean;
  recommended: boolean;
  selected: boolean;
  costLabel: string | null;
  notReadyReason?: string;
};

export type InquiryContainerStudyReadiness = {
  ok: boolean;
  issues: InquiryContainerStudyIssue[];
};

export const DESTINATION_PORT_NOT_CONFIGURED_MESSAGE =
  'Not configured — shipping cost will be calculated later.';
export const CUSTOMER_MASTER_DESTINATION_NOT_CONFIGURED_MESSAGE =
  'From Customer Master — Not yet configured';
export const UNRESOLVED_DESTINATION_MASTER_MESSAGE =
  'This destination is not available in the approved Destination Port Master.';
export const INCOTERM_NOT_CONFIGURED_MESSAGE = 'Incoterm is not configured.';
export const UNRESOLVED_INCOTERM_MASTER_MESSAGE =
  'This incoterm is not available in the approved Incoterm Master.';
export const SHIPPING_COST_BLOCKED_UNTIL_CUSTOMER_DESTINATION_MESSAGE =
  DESTINATION_PORT_NOT_CONFIGURED_MESSAGE;
export const CONTAINER_STUDY_SNAPSHOT_CONSTRUCT_FAILED_MESSAGE =
  'Cannot construct a valid Container Study input snapshot from the confirmed Drum Plan.';
export const CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE =
  'Container Study requires a confirmed drum plan. Please complete and confirm the Cutting & Drum schedule.';
export const CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE =
  'Physical drums are available, but the drum plan must be confirmed before container calculation.';
export const CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE =
  'No physical drum schedule is available for this inquiry.';
export const CONTAINER_STUDY_DRUM_PLAN_LINEAGE_UNRESOLVED_MESSAGE =
  'Container Study could not resolve the drum-plan lineage. Please contact support.';

export type ApprovedShipmentMasterRecord = { code: string; name: string; active?: boolean };

export function formatUnresolvedDestinationPortLabel(requested: string): string {
  const value = String(requested || '').trim();
  return value ? `${value} — Not Configured` : 'Not Configured';
}

export function formatUnresolvedMasterLabel(requested: string): string {
  const value = String(requested || '').trim();
  return value ? `${value} — Not Configured` : 'Not Configured';
}

export function describeInquiryShipmentDestination(input: {
  requestedDestination?: string | null;
  destinationPortCode?: string | null;
  destinationPortName?: string | null;
  customerMasterConfigured?: boolean;
}): {
  configured: boolean;
  requestedDestination: string | null;
  destinationPortCode: string | null;
  label: string;
  message: string | null;
  calculationBlocked: boolean;
  shippingCostBlocked: boolean;
} {
  const requested = String(input.requestedDestination || '').trim() || null;
  const destinationPortCode = String(input.destinationPortCode || '').trim() || null;
  const destinationPortName = String(input.destinationPortName || '').trim() || null;
  void input.customerMasterConfigured;
  if (destinationPortCode) {
    return {
      configured: true,
      requestedDestination: requested,
      destinationPortCode,
      label: destinationPortName || destinationPortCode,
      message: null,
      calculationBlocked: false,
      shippingCostBlocked: false,
    };
  }
  if (requested) {
    return {
      configured: false,
      requestedDestination: requested,
      destinationPortCode: null,
      label: formatUnresolvedDestinationPortLabel(requested),
      message: DESTINATION_PORT_NOT_CONFIGURED_MESSAGE,
      calculationBlocked: false,
      shippingCostBlocked: true,
    };
  }
  return {
    configured: false,
    requestedDestination: null,
    destinationPortCode: null,
    label: DESTINATION_PORT_NOT_CONFIGURED_MESSAGE,
    message: DESTINATION_PORT_NOT_CONFIGURED_MESSAGE,
    calculationBlocked: false,
    shippingCostBlocked: true,
  };
}

/**
 * Transactional Container Study destination.
 * Priority: saved destinationPortCode, then a valid selected delivery combination,
 * then a valid Destination Port master match, then legacy free-text.
 * Never auto-selects a default combination, first option, or customer-master default.
 * Shipment-group destination must not replace a valid saved inquiry destination.
 */
export function resolveInquiryCanonicalDestination(input: {
  destinationPortCode?: string | null;
  deliveryDestination?: string | null;
  shipmentGroupDestinationPortCode?: string | null;
  customerDefaultDestinationPortCode?: string | null;
  destinationPortMaster: ApprovedShipmentMasterRecord[];
  deliveryCombinations?: readonly CustomerDeliveryCombinationView[];
  requestedIncoterm?: string | null;
}): {
  destinationPortCode: string | null;
  requestedDestination: string | null;
  unmatchedRequested: string | null;
  displayName: string | null;
} {
  void input.customerDefaultDestinationPortCode;
  const savedCode = String(input.destinationPortCode || '').trim() || null;
  const deliveryDestination = String(input.deliveryDestination || '').trim() || null;
  const combinations = input.deliveryCombinations || [];
  const master = input.destinationPortMaster || [];

  const fromMaster = (code: string | null) => (code ? matchActiveMasterByCodeOrName(code, master) : null);

  if (savedCode) {
    const matched = fromMaster(savedCode);
    if (matched) {
      return {
        destinationPortCode: matched.code,
        requestedDestination: savedCode,
        unmatchedRequested: null,
        displayName: String(matched.name || '').trim() || matched.code,
      };
    }
    const comboBySavedCode = matchCustomerDestinationPort(savedCode, combinations);
    if (comboBySavedCode) {
      const comboMaster = fromMaster(comboBySavedCode.destinationPortCode);
      return {
        destinationPortCode: comboMaster?.code || comboBySavedCode.destinationPortCode,
        requestedDestination: savedCode,
        unmatchedRequested: null,
        displayName:
          String(comboMaster?.name || comboBySavedCode.destinationPortName || '').trim() ||
          comboBySavedCode.destinationPortCode,
      };
    }
  }

  const requestedForCombo = savedCode || deliveryDestination;
  if (requestedForCombo) {
    const combo =
      matchCustomerDestinationPort(requestedForCombo, combinations) ||
      matchCustomerDeliveryCombination({
        requestedDestination: requestedForCombo,
        requestedIncoterm: input.requestedIncoterm,
        combinations,
      });
    if (combo) {
      const comboMaster = fromMaster(combo.destinationPortCode);
      return {
        destinationPortCode: comboMaster?.code || combo.destinationPortCode,
        requestedDestination: requestedForCombo,
        unmatchedRequested: null,
        displayName: String(comboMaster?.name || combo.destinationPortName || '').trim() || combo.destinationPortCode,
      };
    }
  }

  if (deliveryDestination) {
    const matched = fromMaster(deliveryDestination);
    if (matched) {
      return {
        destinationPortCode: matched.code,
        requestedDestination: deliveryDestination,
        unmatchedRequested: null,
        displayName: String(matched.name || '').trim() || matched.code,
      };
    }
  }

  void input.shipmentGroupDestinationPortCode;
  const requested = savedCode || deliveryDestination;
  return {
    destinationPortCode: null,
    requestedDestination: requested,
    unmatchedRequested: requested,
    displayName: null,
  };
}

/**
 * Current Container Study Incoterm is the inquiry's selected Incoterm.
 * Stale shipment groups, snapshots, localStorage, customer preferences, and DAP defaults
 * must not overwrite an explicit inquiry value and must not invent a current identity.
 */
export function resolveCurrentInquiryIncotermRequested(input: {
  inquiryIncoterms?: string | null;
  metadataIncoterms?: string | null;
  shipmentGroupIncoterm?: string | null;
  snapshotIncoterm?: string | null;
  localStorageIncoterm?: string | null;
  customerPreferenceIncoterm?: string | null;
  defaultIncoterm?: string | null;
}): string | null {
  return resolveCurrentInquiryIncotermCode(input);
}

export function presentCurrentInquiryIncoterm(input: {
  inquiryIncoterms?: string | null;
  metadataIncoterms?: string | null;
  shipmentGroupIncoterm?: string | null;
  snapshotIncoterm?: string | null;
  localStorageIncoterm?: string | null;
  customerPreferenceIncoterm?: string | null;
  defaultIncoterm?: string | null;
  incotermMaster: ApprovedShipmentMasterRecord[];
}): ReturnType<typeof describeInquiryShipmentIncoterm> & {
  unmatchedRequested: string | null;
} {
  const requested = resolveCurrentInquiryIncotermRequested(input);
  const matched = matchIncotermMaster(requested, input.incotermMaster, { allowInactive: true });
  const presented = describeInquiryShipmentIncoterm({
    requestedIncoterm: requested,
    incotermCode: matched?.code ?? null,
  });
  return {
    ...presented,
    unmatchedRequested: requested && !matched ? requested : null,
  };
}

export function describeInquiryShipmentIncoterm(input: {
  requestedIncoterm?: string | null;
  incotermCode?: string | null;
}): {
  configured: boolean;
  requestedIncoterm: string | null;
  incotermCode: string | null;
  label: string;
  message: string | null;
  calculationBlocked: boolean;
} {
  const requested = String(input.requestedIncoterm || '').trim() || null;
  const incotermCode = String(input.incotermCode || '').trim() || null;
  if (incotermCode) {
    return {
      configured: true,
      requestedIncoterm: requested,
      incotermCode,
      label: incotermCode,
      message: null,
      calculationBlocked: false,
    };
  }
  if (requested) {
    return {
      configured: false,
      requestedIncoterm: requested,
      incotermCode: null,
      label: formatUnresolvedMasterLabel(requested),
      message: UNRESOLVED_INCOTERM_MASTER_MESSAGE,
      calculationBlocked: false,
    };
  }
  return {
    configured: false,
    requestedIncoterm: null,
    incotermCode: null,
    label: 'Not Configured',
    message: INCOTERM_NOT_CONFIGURED_MESSAGE,
    calculationBlocked: false,
  };
}

export function matchActiveMasterByCodeOrName<T extends { code: string; name: string; active?: boolean }>(
  requested: string | null | undefined,
  records: T[]
): T | null {
  return matchIncotermMaster(requested, records as GlobalIncotermRecord[]) as T | null;
}

export function buildApprovedMasterSelectState(input: {
  currentValue?: string | null;
  records: ApprovedShipmentMasterRecord[];
}): {
  selectedCode: string;
  configured: boolean;
  unresolvedCurrent: string | null;
  options: Array<{ value: string; label: string }>;
} {
  const current = String(input.currentValue || '').trim();
  const selectable = selectableGlobalIncoterms(input.records || []);
  const historical = matchIncotermMaster(current, input.records || [], { allowInactive: true });
  const options = selectable.map((record) => {
    const code = String(record.code).trim();
    const name = String(record.name || '').trim();
    return {
      value: code,
      label: name && name.toUpperCase() !== code.toUpperCase() ? `${code} — ${name}` : code,
    };
  });
  if (historical && historical.active === false) {
    const code = String(historical.code).trim();
    if (!options.some((opt) => opt.value === code)) {
      const name = String(historical.name || '').trim();
      options.unshift({
        value: code,
        label: `${name && name.toUpperCase() !== code.toUpperCase() ? `${code} — ${name}` : code} (inactive)`,
      });
    }
  }
  if (historical) {
    return { selectedCode: String(historical.code).trim(), configured: true, unresolvedCurrent: null, options };
  }
  return {
    selectedCode: '',
    configured: false,
    unresolvedCurrent: current || null,
    options,
  };
}

export function expandPhysicalDrumsFromRequirements(
  requirements: CuttingLengthRequirementInput[]
): Array<{ requirementId: string; inquiryLineId: string; cuttingLengthM: number }> {
  const rows = requirements.map((requirement) => ({
    cuttingLengthM: requirement.cuttingLengthM,
    numberOfDrums: requirement.requestedDrumCount,
  }));
  const expanded = expandPhysicalDrumRequirements(rows);
  const out: Array<{ requirementId: string; inquiryLineId: string; cuttingLengthM: number }> = [];
  let cursor = 0;
  for (const requirement of requirements) {
    const count = Math.max(0, Math.floor(Number(requirement.requestedDrumCount) || 0));
    for (let i = 0; i < count; i += 1) {
      const physical = expanded[cursor];
      if (!physical) break;
      out.push({
        requirementId: requirement.requirementId,
        inquiryLineId: requirement.inquiryLineId,
        cuttingLengthM: physical.cuttingLengthM,
      });
      cursor += 1;
    }
  }
  return out;
}

export function resolvePhysicalDrumDescription(master: PhysicalDrumMasterView | null | undefined): string | null {
  if (!master) return null;
  const description = String(master.description || '').trim();
  if (description) return description;
  const drumType = String(master.drumType || '').trim();
  return drumType || null;
}

export function formatPhysicalDrumLabel(drumCode: string, description: string | null | undefined): string {
  const code = String(drumCode || '').trim();
  const desc = String(description || '').trim();
  if (desc && code && desc.toUpperCase() !== code.toUpperCase() && !desc.toUpperCase().includes(code.toUpperCase())) {
    return `${desc} (${code})`;
  }
  return desc || code;
}

export function computePhysicalDrumGrossWeightKg(input: {
  cuttingLengthM: number;
  cableWeightKgPerKm?: number | null;
  emptyDrumNetWeightKg?: number | null;
}): number | null {
  const cutting = Number(input.cuttingLengthM);
  const kgKm = input.cableWeightKgPerKm;
  const empty = input.emptyDrumNetWeightKg;
  if (!(cutting > 0)) return null;
  if (kgKm == null || !Number.isFinite(kgKm) || !(kgKm > 0)) return null;
  if (empty == null || !Number.isFinite(empty)) return null;
  const cableKg = cableWeightKgFromCuttingLength(cutting, kgKm);
  if (!(cableKg > 0)) return null;
  return grossLoadedDrumWeightKg(cableKg, empty);
}

export function enrichPhysicalDrumsForStudy(
  drums: PhysicalDrumForStudy[],
  masters: PhysicalDrumMasterView[],
  cableWeightKgPerKmByLine: Record<string, number | null | undefined>
): PhysicalDrumForStudy[] {
  const masterByCode = new Map<string, PhysicalDrumMasterView>();
  for (const master of masters) {
    const code = String(master.drumCode || '').trim().toUpperCase();
    if (code) masterByCode.set(code, master);
  }
  return drums.map((drum) => {
    const master = masterByCode.get(String(drum.drumCode || '').trim().toUpperCase());
    const drumDescription = resolvePhysicalDrumDescription(master);
    const emptyDrumNetWeightKg =
      master?.emptyDrumNetWeightKg != null && Number.isFinite(master.emptyDrumNetWeightKg)
        ? master.emptyDrumNetWeightKg
        : drum.emptyDrumNetWeightKg != null && Number.isFinite(drum.emptyDrumNetWeightKg)
          ? drum.emptyDrumNetWeightKg
          : null;
    const lineId = drum.inquiryLineId || drum.sourceLineId;
    const kgKm = lineId ? cableWeightKgPerKmByLine[lineId] : null;
    const cableNetWeightKg =
      kgKm != null && Number.isFinite(kgKm) && kgKm > 0
        ? cableWeightKgFromCuttingLength(drum.cuttingLengthM, kgKm)
        : null;
    const computedGross = computePhysicalDrumGrossWeightKg({
      cuttingLengthM: drum.cuttingLengthM,
      cableWeightKgPerKm: kgKm,
      emptyDrumNetWeightKg,
    });
    return {
      ...drum,
      drumDescription,
      drumLabel: formatPhysicalDrumLabel(drum.drumCode, drumDescription),
      cableNetWeightKg: cableNetWeightKg != null && cableNetWeightKg > 0 ? cableNetWeightKg : null,
      emptyDrumNetWeightKg,
      grossWeightKg: computedGross,
    };
  });
}

export function expandPhysicalDrumsFromPlanLines(lines: DrumPlanLineInput[]): PhysicalDrumForStudy[] {
  const out: PhysicalDrumForStudy[] = [];
  for (const line of lines) {
    const count = Math.floor(Number(line.numberOfDrums) || 0);
    const cutting = Number(line.cuttingLengthM);
    if (!count || !(cutting > 0)) continue;
    for (let i = 0; i < count; i += 1) {
      out.push({
        physicalDrumKey: `${line.id}#${i + 1}`,
        sourceLineId: line.id,
        inquiryLineId: line.inquiryLineId,
        requirementId: line.requirementId ?? undefined,
        drumPlanId: line.drumPlanId,
        drumCode: line.drumCode,
        drumDescription: null,
        drumLabel: formatPhysicalDrumLabel(line.drumCode, null),
        instanceIndex: i + 1,
        cuttingLengthM: cutting,
        emptyDrumNetWeightKg:
          line.emptyDrumNetWeightKg != null && Number.isFinite(line.emptyDrumNetWeightKg)
            ? line.emptyDrumNetWeightKg
            : null,
        grossWeightKg:
          line.grossLoadedDrumWeightKg != null && Number.isFinite(line.grossLoadedDrumWeightKg)
            ? line.grossLoadedDrumWeightKg
            : null,
      });
    }
  }
  return out;
}

export function totalNetWeightKg(drums: Array<{ grossWeightKg: number | null }>): number | null {
  if (!drums.length) return null;
  if (drums.some((d) => d.grossWeightKg == null || !(d.grossWeightKg > 0))) return null;
  return drums.reduce((sum, d) => sum + (d.grossWeightKg || 0), 0);
}

export function totalPhysicalCuttingLengthM(drums: Array<{ cuttingLengthM: number }>): number {
  return drums.reduce((sum, drum) => sum + (Number(drum.cuttingLengthM) || 0), 0);
}

export function physicalPopulationIdentity(
  drums: Array<{ inquiryLineId?: string; sourceLineId?: string; drumCode: string; cuttingLengthM: number }>
): PhysicalPopulationIdentityRow[] {
  const grouped = new Map<string, PhysicalPopulationIdentityRow>();
  for (const drum of drums) {
    const inquiryLineId = String(drum.inquiryLineId || drum.sourceLineId || '').trim();
    const drumCode = String(drum.drumCode || '').trim();
    const cuttingLengthM = Number(drum.cuttingLengthM);
    if (!inquiryLineId || !drumCode || !Number.isFinite(cuttingLengthM) || cuttingLengthM < 0) continue;
    const key = `${inquiryLineId}|${drumCode}|${cuttingLengthM}`;
    const existing = grouped.get(key);
    if (existing) existing.instanceCount += 1;
    else grouped.set(key, { inquiryLineId, drumCode, cuttingLengthM, instanceCount: 1 });
  }
  return [...grouped.values()].sort((a, b) =>
    a.inquiryLineId.localeCompare(b.inquiryLineId) ||
    a.drumCode.localeCompare(b.drumCode) ||
    a.cuttingLengthM - b.cuttingLengthM
  );
}

export function snapshotPopulationIdentity(
  drums: ReadonlyArray<{ sourceLineId: string; drumCode?: string | null; quantity: number; cuttingLengthM?: number | null }>
): PhysicalPopulationIdentityRow[] {
  const expanded: Array<{ inquiryLineId: string; drumCode: string; cuttingLengthM: number }> = [];
  for (const drum of drums) {
    const inquiryLineId = String(drum.sourceLineId || '').split('#')[0] || '';
    const drumCode = String(drum.drumCode || '').trim();
    const quantity = Math.floor(Number(drum.quantity) || 0);
    const cuttingLengthM = Number(drum.cuttingLengthM);
    if (!inquiryLineId || !drumCode || quantity < 1) continue;
    for (let i = 0; i < quantity; i += 1) {
      expanded.push({
        inquiryLineId,
        drumCode,
        cuttingLengthM: cuttingLengthM > 0 ? cuttingLengthM : 0,
      });
    }
  }
  return physicalPopulationIdentity(expanded);
}

export function compactPhysicalPopulationIdentity(
  rows: PhysicalPopulationIdentityRow[]
): Array<{ inquiryLineId: string; drumCode: string; instanceCount: number }> {
  const grouped = new Map<string, { inquiryLineId: string; drumCode: string; instanceCount: number }>();
  for (const row of rows) {
    const key = `${row.inquiryLineId}|${row.drumCode}`;
    const existing = grouped.get(key);
    if (existing) existing.instanceCount += row.instanceCount;
    else grouped.set(key, { inquiryLineId: row.inquiryLineId, drumCode: row.drumCode, instanceCount: row.instanceCount });
  }
  return [...grouped.values()].sort((a, b) => a.inquiryLineId.localeCompare(b.inquiryLineId) || a.drumCode.localeCompare(b.drumCode));
}

export function physicalPopulationIdentitiesEqual(
  left: PhysicalPopulationIdentityRow[],
  right: PhysicalPopulationIdentityRow[]
): boolean {
  return JSON.stringify(compactPhysicalPopulationIdentity(left)) === JSON.stringify(compactPhysicalPopulationIdentity(right));
}

/**
 * Signals that a new DF-B capture is required because live drums drifted from the snapshot.
 * Calculate must not recapture from this flag; SUPERSEDE + recapture is a separate command.
 */
export function inquiryCalculateMustCaptureInputSnapshot(input: {
  currentSnapshotId?: string | null;
  snapshotIdentity?: PhysicalPopulationIdentityRow[] | null;
  physicalIdentity: PhysicalPopulationIdentityRow[];
}): boolean {
  if (!String(input.currentSnapshotId || '').trim()) return true;
  if (!input.physicalIdentity.length) return false;
  if (!input.snapshotIdentity || input.snapshotIdentity.length === 0) return true;
  return !physicalPopulationIdentitiesEqual(input.snapshotIdentity, input.physicalIdentity);
}

/** After snapshot capture, calculation dest/incoterm come from lineage, not live inquiry fields. */
export function resolveInquiryContainerStudyCalculationIdentity(input: {
  hasImmutableInputSnapshot?: boolean;
  snapshotDestinationPortCode?: string | null;
  snapshotIncotermCode?: string | null;
  liveDestinationPortCode?: string | null;
  liveIncotermCode?: string | null;
}): { destinationPortCode: string | null; incotermCode: string | null } {
  if (input.hasImmutableInputSnapshot) {
    return {
      destinationPortCode: String(input.snapshotDestinationPortCode || '').trim() || null,
      incotermCode: String(input.snapshotIncotermCode || '').trim() || null,
    };
  }
  return {
    destinationPortCode: String(input.liveDestinationPortCode || '').trim() || null,
    incotermCode: String(input.liveIncotermCode || '').trim() || null,
  };
}

export function filterPhysicalDrumsByMemberLineIds<T extends { inquiryLineId?: string | null }>(
  drums: T[],
  memberLineIds: string[]
): T[] {
  const members = new Set(memberLineIds.map((id) => String(id || '').trim()).filter(Boolean));
  if (!members.size) return [];
  return drums.filter((drum) => members.has(String(drum.inquiryLineId || '').trim()));
}

export function groupPhysicalDrumsByInquiryLine(
  drums: Array<{ inquiryLineId?: string; inquiryLineNumber?: number; cuttingLengthM: number }>
): Array<{ inquiryLineId: string; inquiryLineNumber: number | null; drumCount: number; totalCuttingLengthM: number }> {
  const grouped = new Map<
    string,
    { inquiryLineId: string; inquiryLineNumber: number | null; drumCount: number; totalCuttingLengthM: number }
  >();
  for (const drum of drums) {
    const inquiryLineId = String(drum.inquiryLineId || '').trim();
    if (!inquiryLineId) continue;
    const existing = grouped.get(inquiryLineId);
    const cutting = Number(drum.cuttingLengthM) || 0;
    if (existing) {
      existing.drumCount += 1;
      existing.totalCuttingLengthM += cutting;
      if (existing.inquiryLineNumber == null && drum.inquiryLineNumber != null) {
        existing.inquiryLineNumber = drum.inquiryLineNumber;
      }
    } else {
      grouped.set(inquiryLineId, {
        inquiryLineId,
        inquiryLineNumber: drum.inquiryLineNumber ?? null,
        drumCount: 1,
        totalCuttingLengthM: cutting,
      });
    }
  }
  return [...grouped.values()].sort((a, b) => {
    const left = a.inquiryLineNumber ?? Number.MAX_SAFE_INTEGER;
    const right = b.inquiryLineNumber ?? Number.MAX_SAFE_INTEGER;
    return left - right || a.inquiryLineId.localeCompare(b.inquiryLineId);
  });
}

export function evaluateInquiryContainerStudyReadiness(input: {
  inquiryId?: string | null;
  customerScopeValid?: boolean;
  confirmedDrumPlans: Array<{ id: string; lifecycleStatus: string }>;
  physicalDrums: PhysicalDrumForStudy[];
  approvedContainerTypes: ContainerTypeMasterView[];
  algorithmSupported?: boolean;
  configurationReady?: boolean;
  destinationPortCode?: string | null;
  unresolvedDestination?: string | null;
  incotermCode?: string | null;
  unresolvedIncoterm?: string | null;
  region?: 'Europe' | 'Africa' | null;
  hasUnconfirmedPhysicalPopulation?: boolean;
  hasCuttingWithoutDrums?: boolean;
  lineageUnresolved?: boolean;
  hasImmutableInputSnapshot?: boolean;
}): InquiryContainerStudyReadiness {
  const issues: InquiryContainerStudyIssue[] = [];
  const snapshotAuthoritative = Boolean(input.hasImmutableInputSnapshot);
  if (!input.inquiryId) {
    issues.push({ code: 'INQUIRY_REQUIRED', field: 'inquiryId', message: 'Inquiry is required before Container Study.' });
  }
  if (input.customerScopeValid === false) {
    issues.push({
      code: 'CUSTOMER_SCOPE_INVALID',
      field: 'customerId',
      message: 'Customer scope is not valid for this inquiry.',
    });
  }
  if (!snapshotAuthoritative) {
    if (input.lineageUnresolved) {
      issues.push({
        code: 'DRUM_PLAN_LINEAGE_UNRESOLVED',
        field: 'drumPlan',
        message: CONTAINER_STUDY_DRUM_PLAN_LINEAGE_UNRESOLVED_MESSAGE,
      });
    } else if (!input.confirmedDrumPlans.length && !input.physicalDrums.length) {
      if (input.hasCuttingWithoutDrums) {
        issues.push({
          code: 'DRUM_PLAN_REQUIRED',
          field: 'drumPlan',
          message: CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE,
        });
      } else {
        issues.push({
          code: 'PHYSICAL_DRUMS_REQUIRED',
          field: 'physicalDrums',
          message: CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE,
        });
      }
    } else if (!input.confirmedDrumPlans.length || input.confirmedDrumPlans.some((p) => p.lifecycleStatus !== 'CONFIRMED')) {
      issues.push({
        code: 'DRUM_PLAN_NOT_CONFIRMED',
        field: 'drumPlan',
        message: input.physicalDrums.length
          ? CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE
          : CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE,
      });
    }
  }
  if (
    !snapshotAuthoritative &&
    !input.physicalDrums.length &&
    input.confirmedDrumPlans.some((p) => p.lifecycleStatus === 'CONFIRMED')
  ) {
    issues.push({
      code: 'PHYSICAL_DRUMS_REQUIRED',
      field: 'physicalDrums',
      message: CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE,
    });
  }
  if (
    !snapshotAuthoritative &&
    input.hasUnconfirmedPhysicalPopulation &&
    !issues.some((issue) => issue.code === 'DRUM_PLAN_NOT_CONFIRMED' || issue.code === 'DRUM_PLAN_LINEAGE_UNRESOLVED')
  ) {
    issues.push({
      code: 'DRUM_PLAN_NOT_CONFIRMED',
      field: 'drumPlan',
      message: CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE,
    });
  }
  if (!snapshotAuthoritative && !input.approvedContainerTypes.length) {
    issues.push({
      code: 'INCOMPLETE_CONTAINER_MASTER',
      field: 'containerTypes',
      message: 'Container type is not approved/configured.',
    });
  }
  if (input.algorithmSupported === false) {
    issues.push({
      code: 'ALGORITHM_NOT_SUPPORTED',
      field: 'algorithm',
      message: 'The configured container algorithm is not supported.',
    });
  }
  if (input.configurationReady === false) {
    issues.push({
      code: 'CONFIGURATION_NOT_READY',
      field: 'configuration',
      message: 'An ACTIVE algorithm configuration is required before calculation.',
    });
  }
  if (!input.region) {
    issues.push({
      code: 'REGION_REQUIRED',
      field: 'region',
      message: 'Container Study region must be Europe or Africa.',
    });
  }
  void input.destinationPortCode;
  void input.unresolvedDestination;
  void input.incotermCode;
  void input.unresolvedIncoterm;
  return { ok: issues.length === 0, issues };
}

export function inquiryCalculateMustAutoCaptureSnapshot(currentSnapshotId?: string | null): boolean {
  return !String(currentSnapshotId || '').trim();
}

export function containerStudyResultContainsShippingCost(result: {
  costLabel?: string | null;
  shippingCost?: unknown;
  freightCost?: unknown;
  shippingCostRateId?: unknown;
  rateAmount?: unknown;
  shipmentCostSnapshotId?: unknown;
}): boolean {
  return [
    result.costLabel,
    result.shippingCost,
    result.freightCost,
    result.shippingCostRateId,
    result.rateAmount,
    result.shipmentCostSnapshotId,
  ].some((value) => value != null && value !== '');
}

export function evaluateDownstreamShippingConsumerReadiness(input: {
  containerStudyStatus?: string | null;
  currentResultId?: string | null;
  unallocatedCount?: number;
  destinationPortCode?: string | null;
  incotermCode?: string | null;
  snapshotDestinationPortCode?: string | null;
  snapshotIncotermCode?: string | null;
}): {
  packingResultConsumable: boolean;
  shippingCalculationReady: boolean;
  issues: InquiryContainerStudyIssue[];
} {
  const issues: InquiryContainerStudyIssue[] = [];
  const packingResultConsumable =
    String(input.containerStudyStatus || '').trim() === 'CONFIRMED' &&
    Boolean(String(input.currentResultId || '').trim()) &&
    !(Number(input.unallocatedCount) > 0);
  if (!packingResultConsumable) {
    issues.push({
      code: 'CONTAINER_STUDY_RESULT_REQUIRED',
      field: 'currentResultId',
      message: 'Downstream shipping consumes a CONFIRMED Container Study packing result.',
    });
  }
  const shippingIdentity = resolveInquiryContainerStudyCalculationIdentity({
    hasImmutableInputSnapshot: Boolean(
      String(input.snapshotDestinationPortCode || '').trim() || String(input.snapshotIncotermCode || '').trim()
    ),
    snapshotDestinationPortCode: input.snapshotDestinationPortCode,
    snapshotIncotermCode: input.snapshotIncotermCode,
    liveDestinationPortCode: input.destinationPortCode,
    liveIncotermCode: input.incotermCode,
  });
  const destinationPortCode = String(shippingIdentity.destinationPortCode || '').trim();
  const incotermCode = String(shippingIdentity.incotermCode || '').trim();
  const shippingCalculationReady = packingResultConsumable && Boolean(destinationPortCode) && Boolean(incotermCode);
  if (packingResultConsumable && !shippingCalculationReady) {
    issues.push({
      code: 'SHIPPING_DEFERRED',
      field: destinationPortCode ? 'incotermCode' : 'destinationPortCode',
      message: DESTINATION_PORT_NOT_CONFIGURED_MESSAGE,
    });
  }
  return { packingResultConsumable, shippingCalculationReady, issues };
}

export function formatInternalDimensions(type: ContainerTypeMasterView): string {
  const length = type.usableLengthMm;
  const width = type.internalWidthMm;
  const height = type.internalHeightMm;
  if (length == null || width == null || !(length > 0) || !(width > 0)) {
    return 'Not Available';
  }
  const lengthM = length / 1000;
  const widthM = width / 1000;
  if (height != null && height > 0) {
    return `${lengthM.toFixed(3)} × ${widthM.toFixed(3)} × ${(height / 1000).toFixed(3)} m`;
  }
  return `${lengthM.toFixed(3)} × ${widthM.toFixed(3)} m`;
}

export function formatVolume(type: ContainerTypeMasterView): string {
  if (type.volumeM3 == null || !(type.volumeM3 > 0)) return 'Not Available';
  return `${type.volumeM3.toLocaleString()} m³`;
}

export function formatPayload(type: ContainerTypeMasterView): string {
  if (type.payloadCapacityKg == null || !(type.payloadCapacityKg > 0)) return 'Not Available';
  return `${type.payloadCapacityKg.toLocaleString()} kg`;
}

export function recommendContainerTypeFromResult(
  containers: CalculatedContainerInstance[]
): string | null {
  if (!containers.length) return null;
  const byType = new Map<string, { drums: number; containers: number; utilization: number }>();
  for (const container of containers) {
    const current = byType.get(container.typeCode) || { drums: 0, containers: 0, utilization: 0 };
    current.drums += container.drumCountQ3;
    current.containers += 1;
    current.utilization += container.utilizationWeightPct;
    byType.set(container.typeCode, current);
  }
  return [...byType.entries()]
    .map(([typeCode, stats]) => ({
      typeCode,
      drums: stats.drums,
      containers: stats.containers,
      avgUtilization: stats.utilization / stats.containers,
    }))
    .sort((a, b) => {
      if (b.drums !== a.drums) return b.drums - a.drums;
      if (a.containers !== b.containers) return a.containers - b.containers;
      if (a.avgUtilization !== b.avgUtilization) return b.avgUtilization - a.avgUtilization;
      return a.typeCode.localeCompare(b.typeCode);
    })[0]?.typeCode ?? null;
}

function typeReady(type: ContainerTypeMasterView): { ok: boolean; reason?: string } {
  if (!type.active) return { ok: false, reason: 'Inactive container type.' };
  if (type.dimensionsStatus !== 'APPROVED') {
    return { ok: false, reason: 'Dimensions are PENDING_APPROVAL or missing.' };
  }
  if (type.usableLengthMm == null || type.internalWidthMm == null || type.payloadCapacityKg == null) {
    return { ok: false, reason: 'Required dimensions or payload are incomplete.' };
  }
  return { ok: true };
}

export function mapContainerOptions(input: {
  types: ContainerTypeMasterView[];
  containers: CalculatedContainerInstance[];
  unallocated: CalculatedUnallocatedDrum[];
  selectedTypeCode?: string | null;
  shippingRates?: ApprovedShippingRate[];
  destinationPortCode?: string | null;
  incotermCode?: string | null;
  customerMasterDestinationConfigured?: boolean;
}): ContainerOptionRow[] {
  const recommended = recommendContainerTypeFromResult(input.containers);
  const byType = new Map<string, CalculatedContainerInstance[]>();
  for (const container of input.containers) {
    const list = byType.get(container.typeCode) || [];
    list.push(container);
    byType.set(container.typeCode, list);
  }
  return input.types.map((type) => {
    const ready = typeReady(type);
    const instances = byType.get(type.code) || [];
    void input.shippingRates;
    void input.destinationPortCode;
    void input.incotermCode;
    void input.customerMasterDestinationConfigured;
    let allocationStatus: ContainerOptionRow['allocationStatus'] = 'NOT_USED';
    if (!ready.ok) allocationStatus = 'NOT_READY';
    else if (input.unallocated.length && instances.length) allocationStatus = 'PARTIAL';
    else if (input.unallocated.length && !instances.length && input.containers.length === 0) {
      allocationStatus = 'UNALLOCATED';
    } else if (instances.length) allocationStatus = 'ALLOCATED';
    const utilization =
      instances.length > 0
        ? `${Math.round(instances.reduce((sum, c) => sum + c.utilizationWeightPct, 0) / instances.length)}%`
        : ready.ok
          ? '—'
          : 'Not Available';
    return {
      typeCode: type.code,
      description: type.description,
      internalDimensionsLabel: formatInternalDimensions(type),
      maxPayloadLabel: formatPayload(type),
      volumeLabel: formatVolume(type),
      requiredContainersLabel: ready.ok
        ? instances.length
          ? String(instances.length)
          : input.containers.length
            ? '0'
            : '—'
        : '—',
      utilizationLabel: utilization,
      allocationStatus,
      selectable: ready.ok && instances.length > 0,
      recommended: recommended === type.code,
      selected: input.selectedTypeCode === type.code,
      costLabel: null,
      notReadyReason: ready.ok ? undefined : ready.reason,
    };
  });
}

export function applyContainerOptionSelection<
  T extends { drums: PhysicalDrumForStudy[]; cuttingLengths: number[]; selectedTypeCode?: string | null },
>(state: T, typeCode: string): T {
  return {
    ...state,
    selectedTypeCode: typeCode,
    drums: state.drums.map((drum) => ({ ...drum })),
    cuttingLengths: [...state.cuttingLengths],
  };
}

export function assertCustomerInquiryIsolation(input: {
  actorUserType?: string | null;
  actorCustomerKeys: string[];
  inquiryCustomerId: string;
  inquiryCustomerMasterId?: string | null;
}): boolean {
  if (input.actorUserType !== 'customer') return true;
  const keys = new Set(input.actorCustomerKeys.filter(Boolean));
  return keys.has(input.inquiryCustomerId) || Boolean(input.inquiryCustomerMasterId && keys.has(input.inquiryCustomerMasterId));
}

export function confirmationBlockedByUnallocated(unallocatedCount: number): boolean {
  return evaluateConfirmReadiness({
    shipmentGroupId: 'sg-1',
    stuffingMethod: 'Rolling',
    algorithmVersionCode: 'LEGACY_FIRST_FIT_V1',
    configurationVersion: 'v1',
    configurationStatus: 'ACTIVE',
    drums: [{ sourceLineId: 'd1', quantity: 1, packedLengthMm: 1, packedWidthMm: 1, grossWeightKg: 1 }],
    pinnedContainerTypes: [
      {
        code: 'TYPE-A',
        parityLabel: 'HQ',
        versionId: 'v',
        versionNo: 1,
        usableLengthMm: 12000,
        internalWidthMm: 2350,
        payloadCapacityKg: 26500,
        dimensionsStatus: 'APPROVED',
      },
    ],
    hasResult: true,
    resultAccountsForAllDrums: true,
    unallocatedCount,
  }).issues.some((issue) => issue.code === 'UNALLOCATED_DRUMS_PRESENT');
}

export function nextHistoricalResultIds(existingResultIds: string[], newResultId: string): string[] {
  return [...existingResultIds, newResultId];
}

export function calculationDidNotMutateDrumPlan<T>(before: T, after: T): boolean {
  return JSON.stringify(before) === JSON.stringify(after);
}
