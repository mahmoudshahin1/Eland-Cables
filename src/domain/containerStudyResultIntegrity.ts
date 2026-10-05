/**
 * 05I-DF-B3 — pure Container Study result integrity checker.
 * Proves physicalDrumKey SET conservation. No Prisma / HTTP / clocks / randomness / mutation.
 */

import { physicalDrumKey, plannedPhysicalDrumKeys } from './physicalDrumIdentity';
import type { ContainerStudyValidationIssue } from './containerStudyValidation';
import { ALLOCATION_KIND_PHYSICAL } from './containerStudyValidation';
import { evaluateSnapshotInputHardening } from './containerStudyInputHardening';
import { lineagePinForSourceLine, parseContainerStudyLineage } from './containerStudyLineage';

function expectedPhysicalKey(sourceLineId: string, instanceIndex: number): string | null {
  try {
    return physicalDrumKey(sourceLineId, instanceIndex);
  } catch {
    return null;
  }
}

export type IntegritySnapshotDrum = {
  sourceLineId: string;
  quantity: number;
  packedLengthMm?: number | null;
  packedWidthMm?: number | null;
  packedHeightMm?: number | null;
  grossWeightKg?: number | null;
};

export type IntegrityAllocation = {
  physicalDrumKey: string;
  sourceLineId: string;
  instanceIndex: number;
  allocationKind?: string | null;
};

export type IntegrityUnallocated = {
  physicalDrumKey: string;
  sourceLineId: string;
  instanceIndex: number;
};

export type ContainerStudyIntegrityInput = {
  snapshotRecordId: string;
  drums: IntegritySnapshotDrum[];
  lineageProvenanceJson?: unknown;
  result: {
    inputSnapshotId: string;
    allocations: IntegrityAllocation[];
    unallocated: IntegrityUnallocated[];
  };
};

export type ContainerStudyIntegrityReport = {
  ok: boolean;
  issues: ContainerStudyValidationIssue[];
  expectedKeys: string[];
  allocatedKeys: string[];
  unallocatedKeys: string[];
};

function keySet(values: string[]): Set<string> {
  return new Set(values);
}

function expandExpectedKeys(drums: IntegritySnapshotDrum[]): { keys: string[]; issues: ContainerStudyValidationIssue[] } {
  const keys: string[] = [];
  const issues: ContainerStudyValidationIssue[] = [];
  for (const drum of drums) {
    if (!drum.sourceLineId || !Number.isInteger(drum.quantity) || drum.quantity < 1) {
      issues.push({
        code: 'INVALID_PHYSICAL_QUANTITY',
        field: 'quantity',
        message: `Cannot expand physical population for ${drum.sourceLineId || 'drum'}.`,
      });
      continue;
    }
    keys.push(...plannedPhysicalDrumKeys(drum.sourceLineId, drum.quantity));
  }
  return { keys, issues };
}

export function evaluateContainerStudyResultIntegrity(
  input: ContainerStudyIntegrityInput
): ContainerStudyIntegrityReport {
  const snapshotIssues = evaluateSnapshotInputHardening({
    drums: input.drums,
    lineageProvenanceJson: input.lineageProvenanceJson,
    requireLineage: true,
  });
  const issues: ContainerStudyValidationIssue[] = [...snapshotIssues.issues];

  if (input.result.inputSnapshotId !== input.snapshotRecordId) {
    issues.push({
      code: 'RESULT_SNAPSHOT_MISMATCH',
      field: 'inputSnapshotId',
      message: 'Calculation result does not belong to the current input snapshot.',
    });
  }

  const expanded = expandExpectedKeys(input.drums);
  issues.push(...expanded.issues);
  const expectedKeys = expanded.keys;
  const expected = keySet(expectedKeys);

  const allocatedKeys: string[] = [];
  const allocatedSet = new Set<string>();
  for (const a of input.result.allocations) {
    if (a.allocationKind && a.allocationKind !== ALLOCATION_KIND_PHYSICAL) {
      issues.push({
        code: 'VIRTUAL_ALLOCATION_NOT_SUPPORTED',
        field: 'allocationKind',
        message: `Allocation ${a.physicalDrumKey} is ${a.allocationKind}; only PHYSICAL is supported.`,
      });
    }
    const expectedKey = expectedPhysicalKey(a.sourceLineId, a.instanceIndex);
    if (expectedKey == null || a.physicalDrumKey !== expectedKey) {
      issues.push({
        code: 'INVALID_ALLOCATION',
        field: 'physicalDrumKey',
        message: `Allocation key ${a.physicalDrumKey} does not match sourceLineId/instanceIndex.`,
      });
    }
    const drum = input.drums.find((d) => d.sourceLineId === a.sourceLineId);
    if (!drum) {
      issues.push({
        code: 'UNACCOUNTED_PHYSICAL_DRUM',
        field: 'sourceLineId',
        message: `Allocation ${a.physicalDrumKey} references unknown snapshot sourceLineId ${a.sourceLineId}.`,
      });
    } else if (!Number.isInteger(a.instanceIndex) || a.instanceIndex < 0 || a.instanceIndex >= drum.quantity) {
      issues.push({
        code: 'INVALID_ALLOCATION',
        field: 'instanceIndex',
        message: `instanceIndex ${a.instanceIndex} is invalid for ${a.sourceLineId} quantity ${drum.quantity}.`,
      });
    }
    if (allocatedSet.has(a.physicalDrumKey)) {
      issues.push({
        code: 'DUPLICATE_PHYSICAL_DRUM',
        field: 'physicalDrumKey',
        message: `Physical drum ${a.physicalDrumKey} is allocated more than once.`,
      });
    }
    allocatedSet.add(a.physicalDrumKey);
    allocatedKeys.push(a.physicalDrumKey);
    if (!expected.has(a.physicalDrumKey)) {
      issues.push({
        code: 'UNACCOUNTED_PHYSICAL_DRUM',
        field: 'physicalDrumKey',
        message: `Allocated key ${a.physicalDrumKey} is not in the snapshot physical population.`,
      });
    }
  }

  const unallocatedKeys: string[] = [];
  const unallocatedSet = new Set<string>();
  for (const u of input.result.unallocated) {
    const expectedKey = expectedPhysicalKey(u.sourceLineId, u.instanceIndex);
    if (expectedKey == null || u.physicalDrumKey !== expectedKey) {
      issues.push({
        code: 'INVALID_ALLOCATION',
        field: 'physicalDrumKey',
        message: `Unallocated key ${u.physicalDrumKey} does not match sourceLineId/instanceIndex.`,
      });
    }
    const drum = input.drums.find((d) => d.sourceLineId === u.sourceLineId);
    if (!drum) {
      issues.push({
        code: 'UNACCOUNTED_PHYSICAL_DRUM',
        field: 'sourceLineId',
        message: `Unallocated ${u.physicalDrumKey} references unknown snapshot sourceLineId ${u.sourceLineId}.`,
      });
    } else if (!Number.isInteger(u.instanceIndex) || u.instanceIndex < 0 || u.instanceIndex >= drum.quantity) {
      issues.push({
        code: 'INVALID_ALLOCATION',
        field: 'instanceIndex',
        message: `Unallocated instanceIndex ${u.instanceIndex} is invalid for ${u.sourceLineId}.`,
      });
    }
    if (unallocatedSet.has(u.physicalDrumKey)) {
      issues.push({
        code: 'DUPLICATE_PHYSICAL_DRUM',
        field: 'physicalDrumKey',
        message: `Physical drum ${u.physicalDrumKey} is unallocated more than once.`,
      });
    }
    unallocatedSet.add(u.physicalDrumKey);
    unallocatedKeys.push(u.physicalDrumKey);
    if (!expected.has(u.physicalDrumKey)) {
      issues.push({
        code: 'UNACCOUNTED_PHYSICAL_DRUM',
        field: 'physicalDrumKey',
        message: `Unallocated key ${u.physicalDrumKey} is not in the snapshot physical population.`,
      });
    }
    if (allocatedSet.has(u.physicalDrumKey)) {
      issues.push({
        code: 'DUPLICATE_PHYSICAL_DRUM',
        field: 'physicalDrumKey',
        message: `Physical drum ${u.physicalDrumKey} is both allocated and unallocated.`,
      });
    }
  }

  for (const key of expectedKeys) {
    if (!allocatedSet.has(key) && !unallocatedSet.has(key)) {
      issues.push({
        code: 'UNACCOUNTED_PHYSICAL_DRUM',
        field: 'physicalDrumKey',
        message: `Physical drum ${key} is neither allocated nor explicitly unallocated.`,
      });
    }
  }

  if (allocatedKeys.length + unallocatedKeys.length !== expectedKeys.length) {
    issues.push({
      code: 'UNACCOUNTED_PHYSICAL_DRUM',
      field: 'physicalDrumKey',
      message: 'Allocated + unallocated count does not equal the snapshot physical population.',
    });
  }

  const lineage = parseContainerStudyLineage(input.lineageProvenanceJson);
  if (lineage) {
    for (const drum of input.drums) {
      if (!lineagePinForSourceLine(lineage, drum.sourceLineId)) {
        issues.push({
          code: 'MISSING_LINEAGE',
          field: 'sourceLineId',
          message: `Physical drum line ${drum.sourceLineId} has no requirement/drum-plan provenance.`,
        });
      }
    }
  }

  const unique = new Map(issues.map((i) => [`${i.code}:${i.field}:${i.message}`, i]));
  return {
    ok: unique.size === 0,
    issues: [...unique.values()],
    expectedKeys,
    allocatedKeys,
    unallocatedKeys,
  };
}
