import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_OFFICIAL_CONFLICT_COUNT } from '../server/bomConflictGovernanceService';
import { canPromoteToPostgresqlSot, sotStatusForEntity } from './masterDataSoT';
import { listInformationalModules } from './moduleIa';
import { getModuleById, listNavigableModules } from './moduleRegistry';
import { isGenericBiEngineEnabled } from './reporting/reportRuntime';
import { isGenericWorkflowEngineEnabled, vipUsesStandardInquiryTemplate } from './workflow/workflowPresentationMetadata';
import { salesOrderIntegrationAdapter } from './integration/d365Adapters';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('V2 Phases 1–11 closure evidence', () => {
  it('Phase 2 keeps CableBomLine off POSTGRESQL_SOT while 81 conflicts remain', () => {
    const bom = sotStatusForEntity('CableBomLine');
    assert.ok(bom);
    assert.equal(bom.status, 'POSTGRESQL_PRIMARY');
    assert.equal(canPromoteToPostgresqlSot(bom), false);
    assert.equal(EXPECTED_OFFICIAL_CONFLICT_COUNT, 81);
    assert.equal(sotStatusForEntity('CableMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('DrumMaster')?.status, 'POSTGRESQL_SOT');
    assert.equal(sotStatusForEntity('RawMaterial')?.status, 'POSTGRESQL_SOT');
  });

  it('Phase 3 navigator excludes PLANNED/STUB/NOT_IMPLEMENTED fakes', () => {
    for (const m of listNavigableModules()) {
      assert.ok(['LIVE', 'PARTIAL', 'FROZEN'].includes(m.status));
    }
    const info = listInformationalModules();
    assert.ok(info.some((m) => m.moduleId === 'INVENTORY' && m.status === 'NOT_IMPLEMENTED'));
    assert.equal(getModuleById('SALES')?.status, 'FROZEN');
  });

  it('Phase 6 / 15 keep D365 honest', async () => {
    const posted = await salesOrderIntegrationAdapter.postSalesOrder('SO-CLOSURE');
    assert.equal(posted.status, 'NOT_IMPLEMENTED');
    assert.match(getModuleById('SALES')?.invariants.join(' ') || '', /FROZEN/);
  });

  it('Phase 10–11 keep BI and generic workflow engines off', () => {
    assert.equal(isGenericBiEngineEnabled(), false);
    assert.equal(isGenericWorkflowEngineEnabled(), false);
    assert.equal(vipUsesStandardInquiryTemplate(), false);
    assert.ok(getModuleById('REPORTING')?.ownedApis.some((a) => a.includes('/run')));
  });

  it('npm test still registers dedicated domain suites', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: { test: string } };
    assert.match(pkg.scripts.test, /runRegisteredTests/);
    const registered = readFileSync(join(root, 'scripts', 'registered-tests.txt'), 'utf8');
    const required = [
      'src/server/rbac.test.ts',
      'src/platform/masterDataSoT.test.ts',
      'src/platform/moduleIa.test.ts',
      'src/server/increment11.commercial.test.ts',
      'src/domain/costingEngine.test.ts',
      'src/server/phase1.quoteToCash.test.ts',
      'src/platform/cableBomConflictGovernance.test.ts',
      'src/domain/drumPlanConfirmReadiness.test.ts',
      'src/server/increment12.pricing.test.ts',
      'src/platform/reportRuntime.test.ts',
      'src/platform/workflowPresentationMetadata.test.ts',
      'src/platform/v2Phase12LowCode.test.ts',
      'src/platform/ceoDemoJourney.e2e.test.ts',
      'src/platform/containerStudyDfb.test.ts',
      'src/platform/containerStudyDff2.test.ts',
      'src/platform/containerStudy05i.e2e.test.ts',
    ];
    for (const file of required) {
      assert.ok(registered.includes(file), `missing suite ${file}`);
    }
  });
});
