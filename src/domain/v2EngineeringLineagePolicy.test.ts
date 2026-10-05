import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DomainError } from '../platform/errors/domainError';
import { assertCanConfirmDrumPlan } from './v2DrumPlanService';
import { assertV2EngineeringHardDeleteForbidden } from './v2EngineeringLineagePolicy';

describe('v2EngineeringLineagePolicy', () => {
  it('forbids hard-delete of a requirement referenced downstream', () => {
    assert.throws(
      () => assertV2EngineeringHardDeleteForbidden('V2CuttingLengthRequirement', true),
      (err: unknown) => err instanceof DomainError && err.code === 'VALIDATION_FAILED'
    );
  });

  it('forbids hard-delete of cutting and drum plans even without a downstream pin', () => {
    for (const entity of ['V2CuttingLengthPlan', 'V2DrumPlan', 'V2DrumPlanLine'] as const) {
      assert.throws(
        () => assertV2EngineeringHardDeleteForbidden(entity, false),
        (err: unknown) => err instanceof DomainError && /must not be hard-deleted/.test(err.message)
      );
    }
  });

  it('CONFIRMED drum plans are immutable — replacement supersedes rather than deletes', () => {
    assert.throws(
      () => assertCanConfirmDrumPlan({ lifecycleStatus: 'CONFIRMED', validationStatus: 'VALID' }),
      (err: Error & { code?: string }) => err.code === 'INVALID_STATE'
    );
    assert.throws(
      () => assertCanConfirmDrumPlan({ lifecycleStatus: 'SUPERSEDED', validationStatus: 'VALID' }),
      (err: Error & { code?: string }) => err.code === 'INVALID_STATE'
    );
  });

  it('production V2 repositories and routes do not hard-delete engineering records', () => {
    const files = [
      'src/server/v2DrumPlanRepository.ts',
      'src/server/v2CuttingLengthRepository.ts',
      'src/server/v2InquiryConfigurationRepository.ts',
      'src/server/v2InquiryConfigurationRoutes.ts',
    ];
    const forbidden =
      /v2(?:DrumPlanLine|DrumPlan|CuttingLengthPlan|CuttingLengthRequirement)\.delete(?:Many)?\s*\(/;
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      assert.equal(forbidden.test(src), false, `${rel} must not hard-delete V2 engineering records`);
    }
  });
});
