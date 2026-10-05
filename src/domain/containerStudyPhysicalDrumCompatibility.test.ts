import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  buildInquiryDrumSchedule,
  expandPhysicalDrumsFromInquirySchedule,
} from './inquiryDrumSchedule';
import {
  CONTAINER_STUDY_DRUM_PLAN_LINEAGE_UNRESOLVED_MESSAGE,
  CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE,
  CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE,
  CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE,
  assertCustomerInquiryIsolation,
  evaluateInquiryContainerStudyReadiness,
  expandPhysicalDrumsFromPlanLines,
  totalPhysicalCuttingLengthM,
  type DrumPlanLineInput,
} from './inquiryContainerStudyPresentation';

const dir = dirname(fileURLToPath(import.meta.url));
const approvedType = {
  code: 'T1',
  description: 'Ready',
  active: true,
  currentVersionId: 'T1-v1',
  dimensionsStatus: 'APPROVED' as const,
  usableLengthMm: 12032,
  internalWidthMm: 2350,
  payloadCapacityKg: 26500,
};

const sixDrumSchedule = buildInquiryDrumSchedule(
  [
    { drumCode: 'EWD900-0', noOfDrums: 2, cuttingLengthM: 1500, drumTolerancePercent: 1 },
    { drumCode: 'EWD800-9', noOfDrums: 1, cuttingLengthM: 1000, drumTolerancePercent: 1 },
    { drumCode: 'EWD630-0', noOfDrums: 3, cuttingLengthM: 800, drumTolerancePercent: 1 },
  ],
  1,
  { lifecycleStatus: 'CONFIRMED', versionNo: 1 }
);

function v2PlanLine(
  id: string,
  cuttingLengthM: number,
  numberOfDrums: number
): DrumPlanLineInput {
  return {
    id,
    drumPlanId: 'v2-plan-1',
    inquiryLineId: 'line-v2',
    requirementId: `req-${id}`,
    drumCode: `DRUM-${id}`,
    numberOfDrums,
    cuttingLengthM,
    grossLoadedDrumWeightKg: 1200,
  };
}

describe('Container Study physical-drum compatibility', () => {
  it('V2 confirmed plan still expands to physical drums', () => {
    const physical = expandPhysicalDrumsFromPlanLines([
      v2PlanLine('a', 1500, 2),
      v2PlanLine('b', 1000, 1),
    ]);
    assert.equal(physical.length, 3);
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-v2',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'v2-plan-1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: physical,
      approvedContainerTypes: [approvedType],
      algorithmSupported: true,
      configurationReady: true,
      region: 'Europe',
    });
    assert.equal(readiness.ok, true);
  });

  it('legacy/current physical schedule via compatibility path expands 1500×2+1000×1+800×3 to 6 drums / 6400 m', () => {
    const physical = expandPhysicalDrumsFromInquirySchedule(sixDrumSchedule, 'line-1');
    assert.equal(physical.length, 6);
    assert.equal(totalPhysicalCuttingLengthM(physical), 6400);
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-version-a',
      customerScopeValid: true,
      confirmedDrumPlans: [{ id: 'commercial-schedule:line-1:v1', lifecycleStatus: 'CONFIRMED' }],
      physicalDrums: physical,
      approvedContainerTypes: [approvedType],
      algorithmSupported: true,
      configurationReady: true,
      region: 'Africa',
    });
    assert.equal(readiness.ok, true);
  });

  it('cutting without drums requires a confirmed drum plan', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-cutting',
      customerScopeValid: true,
      confirmedDrumPlans: [],
      physicalDrums: [],
      approvedContainerTypes: [approvedType],
      algorithmSupported: true,
      configurationReady: true,
      region: 'Europe',
      hasCuttingWithoutDrums: true,
    });
    assert.equal(readiness.ok, false);
    assert.equal(readiness.issues[0]?.code, 'DRUM_PLAN_REQUIRED');
    assert.equal(readiness.issues[0]?.message, CONTAINER_STUDY_DRUM_PLAN_REQUIRED_MESSAGE);
  });

  it('unconfirmed physical drums are visible but blocked until confirm', () => {
    const physical = expandPhysicalDrumsFromInquirySchedule(
      { ...sixDrumSchedule, lifecycleStatus: 'DRAFT' },
      'line-1'
    );
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-unconfirmed',
      customerScopeValid: true,
      confirmedDrumPlans: [],
      physicalDrums: physical,
      approvedContainerTypes: [approvedType],
      algorithmSupported: true,
      configurationReady: true,
      region: 'Europe',
      hasUnconfirmedPhysicalPopulation: true,
    });
    assert.equal(physical.length, 6);
    assert.equal(readiness.ok, false);
    assert.equal(readiness.issues[0]?.code, 'DRUM_PLAN_NOT_CONFIRMED');
    assert.equal(readiness.issues[0]?.message, CONTAINER_STUDY_DRUM_PLAN_UNCONFIRMED_MESSAGE);
  });

  it('empty schedule does not calculate and uses a clear missing-schedule message', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-empty',
      customerScopeValid: true,
      confirmedDrumPlans: [],
      physicalDrums: [],
      approvedContainerTypes: [approvedType],
      algorithmSupported: true,
      configurationReady: true,
      region: 'Europe',
    });
    assert.equal(readiness.ok, false);
    assert.equal(readiness.issues[0]?.code, 'PHYSICAL_DRUMS_REQUIRED');
    assert.equal(readiness.issues[0]?.message, CONTAINER_STUDY_PHYSICAL_SCHEDULE_MISSING_MESSAGE);
  });

  it('true lineage failure uses a support message, never V2 workflow wording', () => {
    const readiness = evaluateInquiryContainerStudyReadiness({
      inquiryId: 'inq-lineage',
      customerScopeValid: true,
      confirmedDrumPlans: [],
      physicalDrums: [],
      approvedContainerTypes: [approvedType],
      algorithmSupported: true,
      configurationReady: true,
      region: 'Europe',
      lineageUnresolved: true,
    });
    assert.equal(readiness.ok, false);
    assert.equal(readiness.issues[0]?.message, CONTAINER_STUDY_DRUM_PLAN_LINEAGE_UNRESOLVED_MESSAGE);
    assert.equal(readiness.issues.some((issue) => /V2 configuration workflow record/i.test(issue.message)), false);
  });

  it('customer isolation helper still rejects a foreign customer key', () => {
    assert.equal(
      assertCustomerInquiryIsolation({
        actorUserType: 'customer',
        actorCustomerKeys: ['cust-a'],
        inquiryCustomerId: 'cust-b',
        inquiryCustomerMasterId: 'master-b',
      }),
      false
    );
    assert.equal(
      assertCustomerInquiryIsolation({
        actorUserType: 'customer',
        actorCustomerKeys: ['cust-a', 'master-a'],
        inquiryCustomerId: 'user-a',
        inquiryCustomerMasterId: 'master-a',
      }),
      true
    );
  });

  it('customer-facing Container Study paths do not mention V2 configuration workflow records', () => {
    const service = readFileSync(join(dir, '../server/inquiryContainerStudyService.ts'), 'utf8');
    const resolver = readFileSync(join(dir, '../server/containerStudyPhysicalDrumResolver.ts'), 'utf8');
    const api = readFileSync(join(dir, '../services/inquiryContainerStudyApiService.ts'), 'utf8');
    for (const src of [service, resolver, api]) {
      assert.equal(src.includes('is not a V2 configuration workflow record'), false);
    }
    assert.match(resolver, /resolveContainerStudyPhysicalDrums/);
    assert.match(service, /loadContainerStudyInquiryScoped/);
    assert.equal(service.includes('loadV2InquiryScoped'), false);
  });
});
