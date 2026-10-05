/**
 * Task 05I-DF-B2 — select eligible CONFIRMED drum plans for a shipment group.
 * Pure rules. No Prisma / HTTP. Does not aggregate cutting lengths.
 *
 * After 05I-DRUM-REMEDIATION, eligibility is per CuttingLengthRequirement,
 * not one current drum plan per commercial inquiry line.
 */

import { issue } from '../platform/errors/domainError';
import type { DeliveryAllocationModeCode } from './containerStudyShipmentGroupRules';
import { assertLinePointerIsNotAuthoritativeMultiRequirementSource } from './v2RequirementAuthority';

export type InquiryLineDrumPlanRef = {
  lineId: string;
  lineNumber: number;
  inquiryId: string;
  currentDrumPlanId: string | null;
  currentDrumPlanStatus: string | null;
};

export type RequirementDrumPlanRef = InquiryLineDrumPlanRef & {
  requirementId: string;
  sequenceNo: number;
};

export type EligibleConfirmedDrumPlanSelection = {
  lineIds: string[];
  currentDrumPlanIds: string[];
  requirementIds: string[];
};

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a === b);
}

function asRequirements(
  lines: InquiryLineDrumPlanRef[] | undefined,
  requirements: RequirementDrumPlanRef[] | undefined
): RequirementDrumPlanRef[] {
  if (requirements && requirements.length > 0) return requirements;
  return (lines || []).map((l, idx) => ({
    ...l,
    requirementId: l.currentDrumPlanId || `legacy-${l.lineId}`,
    sequenceNo: idx + 1,
  }));
}

/**
 * ENTIRE_INQUIRY → every cutting-length requirement's current CONFIRMED drum plan.
 * DESTINATION_CLUSTER → CONFIRMED drum plans on member lines only.
 * memberLineIds, when present, is the authoritative membership set (B4-A).
 */
export function selectEligibleConfirmedDrumPlans(input: {
  deliveryAllocationMode: DeliveryAllocationModeCode;
  inquiryId: string;
  shipmentGroupInquiryLineId?: string | null;
  memberLineIds?: string[] | null;
  lines?: InquiryLineDrumPlanRef[];
  requirements?: RequirementDrumPlanRef[];
  clientDrumPlanId?: string | null;
  clientInquiryLineId?: string | null;
}): EligibleConfirmedDrumPlanSelection {
  const scoped = asRequirements(input.lines, input.requirements)
    .filter((l) => l.inquiryId === input.inquiryId)
    .slice()
    .sort(
      (a, b) =>
        a.lineNumber - b.lineNumber ||
        a.sequenceNo - b.sequenceNo ||
        a.requirementId.localeCompare(b.requirementId)
    );

  if (scoped.length === 0) {
    throw issue('VALIDATION_FAILED', 'Shipment group inquiry has no cutting-length requirements to snapshot.');
  }

  const memberLineIds = (input.memberLineIds || []).map((id) => id.trim()).filter(Boolean);
  const memberSet = memberLineIds.length > 0 ? new Set(memberLineIds) : null;
  const eligibilityLines = memberSet
    ? (input.lines || []).filter((l) => l.inquiryId === input.inquiryId && memberSet.has(l.lineId))
    : input.deliveryAllocationMode === 'ENTIRE_INQUIRY'
      ? input.lines
      : input.lines;

  if (
    (input.deliveryAllocationMode === 'ENTIRE_INQUIRY' ||
      input.deliveryAllocationMode === 'DESTINATION_CLUSTER' ||
      memberSet) &&
    eligibilityLines &&
    eligibilityLines.length > 0 &&
    input.requirements
  ) {
    const reqLineIds = new Set(scoped.filter((r) => !memberSet || memberSet.has(r.lineId)).map((r) => r.lineId));
    const missingLines = eligibilityLines.filter(
      (l) => l.inquiryId === input.inquiryId && !reqLineIds.has(l.lineId)
    );
    if (missingLines.length > 0) {
      throw issue(
        'VALIDATION_FAILED',
        `Every eligible inquiry line must have at least one cutting-length requirement. Missing on line(s): ${missingLines
          .map((l) => l.lineNumber)
          .join(', ')}.`
      );
    }
  }

  let selected = memberSet ? scoped.filter((l) => memberSet.has(l.lineId)) : scoped;
  if (memberSet && selected.length === 0) {
    throw issue('VALIDATION_FAILED', 'Shipment group membership does not match any inquiry cutting-length requirements.');
  }
  if (input.deliveryAllocationMode === 'PER_INQUIRY_LINE' && !memberSet) {
    if (!input.shipmentGroupInquiryLineId) {
      throw issue('VALIDATION_FAILED', 'PER_INQUIRY_LINE shipment group requires inquiryLineId.');
    }
    selected = scoped.filter((l) => l.lineId === input.shipmentGroupInquiryLineId);
    if (selected.length === 0) {
      throw issue('VALIDATION_FAILED', 'Shipment group inquiry line does not belong to this inquiry.');
    }
    if (input.clientInquiryLineId && input.clientInquiryLineId !== input.shipmentGroupInquiryLineId) {
      throw issue('VALIDATION_FAILED', 'inquiryLineId does not match the shipment group inquiry line.');
    }
  } else if (input.clientInquiryLineId) {
    const allowed = memberSet ?? new Set(selected.map((l) => l.lineId));
    if (!allowed.has(input.clientInquiryLineId) && !scoped.some((l) => l.lineId === input.clientInquiryLineId)) {
      throw issue('VALIDATION_FAILED', 'inquiryLineId does not belong to this inquiry.');
    }
    if (memberSet && !memberSet.has(input.clientInquiryLineId)) {
      throw issue('VALIDATION_FAILED', 'inquiryLineId is not a member of this shipment group.');
    }
    if (
      input.deliveryAllocationMode === 'PER_INQUIRY_LINE' &&
      input.shipmentGroupInquiryLineId &&
      input.clientInquiryLineId !== input.shipmentGroupInquiryLineId
    ) {
      throw issue('VALIDATION_FAILED', 'inquiryLineId does not match the shipment group inquiry line.');
    }
  }

  const missing = selected.filter(
    (l) => !l.currentDrumPlanId || l.currentDrumPlanStatus !== 'CONFIRMED'
  );
  if (missing.length > 0) {
    throw issue(
      'VALIDATION_FAILED',
      `Every eligible cutting-length requirement must have a current CONFIRMED drum plan. Missing on line(s): ${[
        ...new Set(missing.map((l) => l.lineNumber)),
      ].join(', ')}.`
    );
  }

  const currentDrumPlanIds = selected.map((l) => l.currentDrumPlanId!);
  if (input.clientDrumPlanId) {
    const match = currentDrumPlanIds.some((id) => sameId(id, input.clientDrumPlanId));
    if (!match) {
      throw issue(
        'VALIDATION_FAILED',
        'drumPlanId is not among the eligible CONFIRMED drum plans for this shipment group.'
      );
    }
  }

  if (input.requirements && input.requirements.length > 0 && input.lines) {
    for (const line of input.lines) {
      const reqsOnLine = selected.filter((s) => s.lineId === line.lineId);
      if (reqsOnLine.length === 0) continue;
      assertLinePointerIsNotAuthoritativeMultiRequirementSource({
        lineCurrentDrumPlanId: line.currentDrumPlanId,
        selectedDrumPlanIds: reqsOnLine.map((r) => r.currentDrumPlanId!),
        requirementCurrentDrumPlanIds: input.requirements
          .filter((r) => r.lineId === line.lineId)
          .map((r) => r.currentDrumPlanId),
      });
    }
  }

  return {
    lineIds: [...new Set(selected.map((l) => l.lineId))],
    currentDrumPlanIds,
    requirementIds: selected.map((l) => l.requirementId),
  };
}

export function assertCuttingLengthsNotAggregated(pins: Array<{ cuttingLengthM: number }>): number {
  return pins.reduce((sum, p) => sum + p.cuttingLengthM, 0);
}
