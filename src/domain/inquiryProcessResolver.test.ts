import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyInquiryProcessToMetadata,
  preserveImmutableInquiryProcess,
  resolveInquiryProcessFromCustomer,
  readInquiryProcessFromMetadata,
  stripClientInquiryProcessOverrides,
  SYSTEM_DEFAULT_INQUIRY_PROCESS,
} from './inquiryProcessResolver';
import {
  assertStandardSubmitAllowed,
  assertVipCalculateAllowed,
  canCalculateInquiry,
  canSubmitInquiry,
  getInquiryProcessCode,
} from './inquiryProcessCommands';

describe('inquiryProcessResolver', () => {
  it('1. customer override resolves VIP_FAST_TRACK', () => {
    const resolved = resolveInquiryProcessFromCustomer({
      defaultInquiryProcessCode: 'VIP_FAST_TRACK',
      customerGroup: { defaultInquiryProcessCode: 'STANDARD_WORKFLOW' },
    });
    assert.equal(resolved.processCode, 'VIP_FAST_TRACK');
    assert.equal(resolved.source, 'CUSTOMER_OVERRIDE');
  });

  it('2. customer override resolves STANDARD_WORKFLOW', () => {
    const resolved = resolveInquiryProcessFromCustomer({
      defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      customerGroup: { defaultInquiryProcessCode: 'VIP_FAST_TRACK' },
    });
    assert.equal(resolved.processCode, 'STANDARD_WORKFLOW');
    assert.equal(resolved.source, 'CUSTOMER_OVERRIDE');
  });

  it('3. customer group default resolves when customer has no override', () => {
    const resolved = resolveInquiryProcessFromCustomer({
      customerGroup: { defaultInquiryProcessCode: 'VIP_FAST_TRACK' },
    });
    assert.equal(resolved.processCode, 'VIP_FAST_TRACK');
    assert.equal(resolved.source, 'CUSTOMER_GROUP');
  });

  it('4. system default when customer and group unset', () => {
    const resolved = resolveInquiryProcessFromCustomer({});
    assert.deepEqual(resolved, SYSTEM_DEFAULT_INQUIRY_PROCESS);
  });

  it('4b. classification resolves before group when customer has no override', () => {
    const resolved = resolveInquiryProcessFromCustomer({
      classification: { defaultInquiryProcessCode: 'STANDARD_WORKFLOW' },
      customerGroup: { defaultInquiryProcessCode: 'VIP_FAST_TRACK' },
    });
    assert.equal(resolved.processCode, 'STANDARD_WORKFLOW');
    assert.equal(resolved.source, 'CUSTOMER_CLASSIFICATION');
  });

  it('4c. segment resolves after classification miss and before group', () => {
    const resolved = resolveInquiryProcessFromCustomer({
      segment: { defaultInquiryProcessCode: 'STANDARD_WORKFLOW' },
      customerGroup: { defaultInquiryProcessCode: 'VIP_FAST_TRACK' },
    });
    assert.equal(resolved.processCode, 'STANDARD_WORKFLOW');
    assert.equal(resolved.source, 'CUSTOMER_SEGMENT');
  });

  it('4d. customer override still wins over classification and segment', () => {
    const resolved = resolveInquiryProcessFromCustomer({
      defaultInquiryProcessCode: 'VIP_FAST_TRACK',
      classification: { defaultInquiryProcessCode: 'STANDARD_WORKFLOW' },
      segment: { defaultInquiryProcessCode: 'STANDARD_WORKFLOW' },
    });
    assert.equal(resolved.processCode, 'VIP_FAST_TRACK');
    assert.equal(resolved.source, 'CUSTOMER_OVERRIDE');
  });

  it('5. customer override wins over customer group', () => {
    const resolved = resolveInquiryProcessFromCustomer({
      defaultInquiryProcessCode: 'STANDARD_WORKFLOW',
      customerGroup: { defaultInquiryProcessCode: 'VIP_FAST_TRACK' },
    });
    assert.equal(resolved.processCode, 'STANDARD_WORKFLOW');
    assert.equal(resolved.source, 'CUSTOMER_OVERRIDE');
  });

  it('6. strips client process overrides from metadata', () => {
    const stripped = stripClientInquiryProcessOverrides({
      copperPriceRate: 9000,
      inquiryProcessCode: 'VIP_FAST_TRACK',
      inquiryProcessSource: 'CUSTOMER_OVERRIDE',
      inquiryProcessAssignedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(stripped.copperPriceRate, 9000);
    assert.equal(stripped.inquiryProcessCode, undefined);
    assert.equal(stripped.inquiryProcessSource, undefined);
  });

  it('7. applyInquiryProcessToMetadata pins immutable fields', () => {
    const meta = applyInquiryProcessToMetadata(
      { workflowChannel: 'V2_CONFIGURATION' },
      { processCode: 'VIP_FAST_TRACK', source: 'CUSTOMER_GROUP' },
      new Date('2026-09-09T12:00:00.000Z')
    );
    assert.equal(meta.workflowChannel, 'V2_CONFIGURATION');
    assert.equal(meta.inquiryProcessCode, 'VIP_FAST_TRACK');
    assert.equal(meta.inquiryProcessSource, 'CUSTOMER_GROUP');
    assert.equal(meta.inquiryProcessAssignedAt, '2026-09-09T12:00:00.000Z');
  });

  it('8. preserveImmutableInquiryProcess blocks client re-assignment on update', () => {
    const merged = preserveImmutableInquiryProcess(
      {
        inquiryProcessCode: 'STANDARD_WORKFLOW',
        inquiryProcessSource: 'SYSTEM_DEFAULT',
        copperPriceRate: 8000,
      },
      {
        inquiryProcessCode: 'VIP_FAST_TRACK',
        inquiryProcessSource: 'CUSTOMER_OVERRIDE',
        copperPriceRate: 9100,
      }
    );
    assert.equal(merged.inquiryProcessCode, 'STANDARD_WORKFLOW');
    assert.equal(merged.inquiryProcessSource, 'SYSTEM_DEFAULT');
    assert.equal(merged.copperPriceRate, 9100);
  });
});

describe('inquiryProcessCommands', () => {
  const standardInquiry = {
    commercialMetadata: {
      inquiryProcessCode: 'STANDARD_WORKFLOW',
      inquiryProcessSource: 'SYSTEM_DEFAULT',
    },
  };
  const vipInquiry = {
    commercialMetadata: {
      inquiryProcessCode: 'VIP_FAST_TRACK',
      inquiryProcessSource: 'CUSTOMER_OVERRIDE',
    },
  };

  it('9. getInquiryProcessCode reads metadata', () => {
    assert.equal(getInquiryProcessCode(vipInquiry), 'VIP_FAST_TRACK');
  });

  it('10. getInquiryProcessCode defaults to STANDARD_WORKFLOW', () => {
    assert.equal(getInquiryProcessCode({}), 'STANDARD_WORKFLOW');
  });

  it('11. canSubmitInquiry true for STANDARD_WORKFLOW', () => {
    assert.equal(canSubmitInquiry(standardInquiry), true);
  });

  it('12. canSubmitInquiry false for VIP_FAST_TRACK', () => {
    assert.equal(canSubmitInquiry(vipInquiry), false);
  });

  it('13. canCalculateInquiry true for VIP_FAST_TRACK', () => {
    assert.equal(canCalculateInquiry(vipInquiry), true);
  });

  it('14. canCalculateInquiry false for STANDARD_WORKFLOW', () => {
    assert.equal(canCalculateInquiry(standardInquiry), false);
  });

  it('15. assertVipCalculateAllowed throws for STANDARD_WORKFLOW', () => {
    assert.throws(() => assertVipCalculateAllowed(standardInquiry), /VIP Fast Track/);
  });

  it('16. assertStandardSubmitAllowed throws for VIP_FAST_TRACK', () => {
    assert.throws(() => assertStandardSubmitAllowed(vipInquiry), /Standard Workflow/);
  });

  it('readInquiryProcessFromMetadata round-trips assigned process', () => {
    const meta = applyInquiryProcessToMetadata({}, {
      processCode: 'VIP_FAST_TRACK',
      source: 'CUSTOMER_GROUP',
    });
    const read = readInquiryProcessFromMetadata(meta);
    assert.deepEqual(read, { processCode: 'VIP_FAST_TRACK', source: 'CUSTOMER_GROUP' });
  });
});
