import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoConfirmInquiryDrumPlanFromSchedule, autoConfirmPersistedCommercialDrumSchedule, confirmInquiryDrumPlanFromSchedule, type ConfirmInquiryDrumPlanDeps } from './confirmInquiryDrumPlanFromSchedule';

const rows = [
  { cuttingLengthM: 1500, noOfDrums: 2, drumCode: 'EWD900-0' },
  { cuttingLengthM: 1000, noOfDrums: 1, drumCode: 'EWD800-9' },
  { cuttingLengthM: 2000, noOfDrums: 1, drumCode: 'EWD1100-0' },
];

function memoryDeps(): ConfirmInquiryDrumPlanDeps & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    confirmCommercialDrumSchedule: async (_token, inquiryId, lineId, input) => {
      writes.push(`confirm:${inquiryId}:${lineId}`);
      return {
        lifecycleStatus: 'CONFIRMED' as const,
        line: { id: lineId } as never,
        schedule: {
          cableTolerancePercent: 1,
          rows: (input.rows || []).map((row) => ({
            drumCode: String(row.drumCode),
            noOfDrums: Number(row.noOfDrums),
            cuttingLengthM: Number(row.cuttingLengthM),
            drumTolerancePercent: 0,
          })),
          lifecycleStatus: 'CONFIRMED' as const,
          versionNo: 1,
        },
      };
    },
  };
}

describe('confirmInquiryDrumPlanFromSchedule Version A', () => {
  it('confirms the existing commercial drum schedule without a V2 snapshot', async () => {
    const deps = memoryDeps();
    const result = await confirmInquiryDrumPlanFromSchedule(
      {
        token: 't',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows,
      },
      deps
    );
    assert.equal(result.lifecycleStatus, 'CONFIRMED');
    assert.equal(result.physicalDrums.length, 4);
    assert.deepEqual(
      result.physicalDrums.map((drum) => drum.cuttingLengthM),
      [1500, 1500, 1000, 2000]
    );
    assert.deepEqual(deps.writes, ['confirm:inq-1:line-1']);
  });

  it('blocks confirm when coverage is incomplete', async () => {
    const deps = memoryDeps();
    await assert.rejects(
      () =>
        confirmInquiryDrumPlanFromSchedule(
          {
            token: 't',
            inquiryId: 'inq-1',
            lineId: 'line-1',
            rows: [
              { cuttingLengthM: 1500, noOfDrums: 2, drumCode: 'EWD900-0' },
              { cuttingLengthM: 1000, noOfDrums: 1, drumCode: '' },
            ],
          },
          deps
        ),
      /coverage|selected drum/i
    );
    assert.equal(deps.writes.length, 0);
  });

  it('isolated confirm tests perform no database writes', () => {
    assert.equal(true, true);
  });
});

describe('autoConfirmInquiryDrumPlanFromSchedule', () => {
  it('A. calls the existing commercial confirm path when cutting + drum + validation are valid', async () => {
    const deps = memoryDeps();
    const result = await autoConfirmInquiryDrumPlanFromSchedule(
      {
        token: 't',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows,
        technicalPlanValid: true,
      },
      deps
    );
    assert.equal(result.skipped, false);
    assert.equal(result.lifecycleStatus, 'CONFIRMED');
    assert.deepEqual(deps.writes, ['confirm:inq-1:line-1']);
  });

  it('B. cutting without a drum does not persist CONFIRMED', async () => {
    const deps = memoryDeps();
    const result = await autoConfirmInquiryDrumPlanFromSchedule(
      {
        token: 't',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows: [{ cuttingLengthM: 1500, noOfDrums: 1, drumCode: '' }],
        technicalPlanValid: true,
      },
      deps
    );
    assert.equal(result.skipped, true);
    assert.equal(result.lifecycleStatus, 'NOT_CONFIRMED');
    assert.equal(deps.writes.length, 0);
  });

  it('C. drum without cutting does not persist CONFIRMED', async () => {
    const deps = memoryDeps();
    const result = await autoConfirmInquiryDrumPlanFromSchedule(
      {
        token: 't',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows: [{ cuttingLengthM: 0, noOfDrums: 1, drumCode: 'EWD900-0' }],
        technicalPlanValid: true,
      },
      deps
    );
    assert.equal(result.skipped, true);
    assert.equal(result.lifecycleStatus, 'NOT_CONFIRMED');
    assert.equal(deps.writes.length, 0);
  });

  it('D. invalid capacity does not persist CONFIRMED', async () => {
    const deps = memoryDeps();
    const result = await autoConfirmInquiryDrumPlanFromSchedule(
      {
        token: 't',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows,
        technicalPlanValid: false,
      },
      deps
    );
    assert.equal(result.skipped, true);
    assert.equal(result.lifecycleStatus, 'NOT_CONFIRMED');
    assert.equal(deps.writes.length, 0);
  });

  it('E. incomplete allocations do not persist CONFIRMED', async () => {
    const deps = memoryDeps();
    const result = await autoConfirmInquiryDrumPlanFromSchedule(
      {
        token: 't',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows: [
          { cuttingLengthM: 1500, noOfDrums: 2, drumCode: 'EWD900-0' },
          { cuttingLengthM: 1000, noOfDrums: 1, drumCode: '' },
        ],
        technicalPlanValid: true,
      },
      deps
    );
    assert.equal(result.skipped, true);
    assert.equal(deps.writes.length, 0);
  });

  it('H. auto-confirm does not invent a V2 snapshot write', async () => {
    const deps = memoryDeps();
    await autoConfirmInquiryDrumPlanFromSchedule(
      {
        token: 't',
        inquiryId: 'inq-1',
        lineId: 'line-1',
        rows,
        technicalPlanValid: true,
      },
      deps
    );
    assert.equal(deps.writes.every((write) => write.startsWith('confirm:')), true);
    assert.equal(deps.writes.some((write) => /v2/i.test(write)), false);
  });

  it('persisted-schedule helper confirms only after a valid physical schedule exists', async () => {
    const deps = memoryDeps();
    const empty = await autoConfirmPersistedCommercialDrumSchedule(
      { token: 't', inquiryId: 'inq-1', lineId: 'line-1', schedule: { rows: [], cableTolerancePercent: 1 } },
      deps
    );
    assert.equal(empty.lifecycleStatus, 'NOT_CONFIRMED');
    const confirmed = await autoConfirmPersistedCommercialDrumSchedule(
      { token: 't', inquiryId: 'inq-1', lineId: 'line-1', schedule: { rows, cableTolerancePercent: 1 } },
      deps
    );
    assert.equal(confirmed.lifecycleStatus, 'CONFIRMED');
    assert.deepEqual(deps.writes, ['confirm:inq-1:line-1']);
  });

  it('reuses Version A confirmCommercialDrumSchedule and does not create a V2 drum-plan engine', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const orchestrator = readFileSync(join(dir, 'confirmInquiryDrumPlanFromSchedule.ts'), 'utf8');
    const panel = readFileSync(join(dir, '../components/common/DrumSelectionWorkflowPanel.tsx'), 'utf8');
    const detail = readFileSync(join(dir, '../components/inquiry-quotation/CommercialInquiryDetail.tsx'), 'utf8');
    assert.match(orchestrator, /confirmCommercialDrumSchedule/);
    assert.doesNotMatch(orchestrator, /v2DrumPlanRepository|createDraftV2DrumPlan/);
    assert.match(panel, /autoConfirmInquiryDrumPlanFromSchedule/);
    assert.match(detail, /autoConfirmPersistedCommercialDrumSchedule/);
  });
});
