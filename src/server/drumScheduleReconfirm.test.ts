import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import dotenv from 'dotenv';
import { confirmInquiryDrumSchedule } from './commercialRepository';
import { checkDatabase, disconnectPrisma, getPrisma } from './db';

dotenv.config();

describe('drum schedule reconfirm', () => {
  const stamp = `DSR${Date.now().toString(36)}`;
  const customerId = `cust-${stamp}`;
  const actor = {
    id: 'drum-reconfirm-test',
    name: 'Drum Reconfirm',
    email: 'drum-reconfirm@example.com',
    userType: 'internal' as const,
  };

  before(async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
  });

  after(async () => {
    const prisma = getPrisma();
    if (prisma) {
      await prisma.commercialInquiry.deleteMany({ where: { customerId } });
    }
    await disconnectPrisma();
  });

  it('rewrites a confirmed drum schedule in place, then rejects the change after cancel', async () => {
    const prisma = getPrisma();
    assert.ok(prisma);
    const drum = await prisma.drumMaster.findFirst({
      where: { status: 'ACTIVE' },
      select: { drumCode: true },
    });
    assert.ok(drum?.drumCode, 'an active drum master row is required');
    const drumCode = drum.drumCode;

    const inquiry = await prisma.commercialInquiry.create({
      data: {
        inquiryNumber: `INQ-${stamp}`,
        customerId,
        customerName: `Drum Reconfirm ${stamp}`,
        status: 'DRAFT',
        currency: 'USD',
        isCurrent: true,
        commercialMetadata: { portalLifecycle: 'OPEN' },
        lines: {
          create: {
            lineNumber: 1,
            cableDescription: 'Reconfirm cable',
            requestedQuantity: 5,
            requestedLengthMeters: 2500,
            cuttingLengthMeters: 500,
            drumType: drumCode,
            drumSchedule: {
              cableTolerancePercent: 0,
              lifecycleStatus: 'CONFIRMED',
              versionNo: 3,
              confirmedAt: '2026-01-01T00:00:00.000Z',
              rows: [
                {
                  drumCode,
                  noOfDrums: 5,
                  cuttingLengthM: 500,
                  drumTolerancePercent: 5,
                  drumTolerancePositivePercent: 5,
                  drumToleranceNegativePercent: 0,
                },
              ],
            },
          },
        },
      },
      include: { lines: true },
    });

    const nextRows = [
      {
        drumCode,
        noOfDrums: 5,
        cuttingLengthM: 500,
        drumTolerancePercent: 5,
        drumTolerancePositivePercent: 5,
        drumToleranceNegativePercent: 0,
      },
      {
        drumCode,
        noOfDrums: 2,
        cuttingLengthM: 200,
        drumTolerancePercent: 5,
        drumTolerancePositivePercent: 5,
        drumToleranceNegativePercent: 0,
      },
    ];

    const result = await confirmInquiryDrumSchedule(
      inquiry.id,
      inquiry.lines[0].id,
      { rows: nextRows, cableTolerancePercent: 0 },
      actor
    );
    assert.equal(result.line.id, inquiry.lines[0].id);
    assert.equal(result.schedule.lifecycleStatus, 'CONFIRMED');
    assert.equal(result.schedule.versionNo, 3);
    assert.equal(result.schedule.rows.length, 2);
    assert.equal(Number(result.line.requestedQuantity), 7);
    assert.equal(Number(result.line.requestedLengthMeters), 2900);
    assert.equal(result.line.costingReadinessStatus, 'STALE');

    const again = await confirmInquiryDrumSchedule(
      inquiry.id,
      inquiry.lines[0].id,
      { rows: nextRows, cableTolerancePercent: 0 },
      actor
    );
    assert.equal(again.schedule.versionNo, 3);
    assert.equal(again.schedule.confirmedAt, result.schedule.confirmedAt);

    await prisma.commercialInquiry.update({
      where: { id: inquiry.id },
      data: { status: 'CANCELLED', commercialMetadata: { portalLifecycle: 'CANCELED' } },
    });
    await assert.rejects(
      () =>
        confirmInquiryDrumSchedule(
          inquiry.id,
          inquiry.lines[0].id,
          {
            rows: [
              {
                drumCode,
                noOfDrums: 1,
                cuttingLengthM: 100,
                drumTolerancePercent: 0,
                drumTolerancePositivePercent: 0,
                drumToleranceNegativePercent: 0,
              },
            ],
          },
          actor
        ),
      /cannot be modified|cannot be edited/i
    );
  });
});
