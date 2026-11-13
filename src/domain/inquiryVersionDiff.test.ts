import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildInquiryVersionSnapshot,
  buildInquiryVersionTimeline,
  diffInquiryVersions,
  formatVersionChangeLines,
} from './inquiryVersionDiff';

describe('inquiry version diff', () => {
  it('lists length, drum, and header changes and ignores an unchanged confirm stamp', () => {
    const before = buildInquiryVersionSnapshot({
      incoterms: 'FOB',
      currency: 'USD',
      commercialMetadata: { copperPriceRate: '8.1', destinationPortCode: 'AEJEA' },
      totalValue: 1000,
      lines: [
        {
          materialNumber: '10009491',
          cableDescription: 'Power cable',
          requestedQuantity: 6,
          requestedLengthMeters: 4000,
          drumSchedule: {
            rows: [{ drumCode: 'EWD900-0', noOfDrums: 4, cuttingLengthM: 500, drumTolerancePercent: 5 }],
          },
        },
      ],
    });
    const after = buildInquiryVersionSnapshot({
      incoterms: 'CFR',
      currency: 'USD',
      commercialMetadata: { copperPriceRate: '8.4', destinationPortCode: 'AEJEA' },
      totalValue: 1500,
      lines: [
        {
          materialNumber: '10009491',
          cableDescription: 'Power cable',
          requestedQuantity: 8,
          requestedLengthMeters: 5500,
          drumSchedule: {
            lifecycleStatus: 'CONFIRMED',
            confirmedAt: '2026-11-13T00:00:00.000Z',
            rows: [
              { drumCode: 'EWD900-0', noOfDrums: 5, cuttingLengthM: 500, drumTolerancePercent: 5 },
              { drumCode: 'EWD630-0', noOfDrums: 2, cuttingLengthM: 200, drumTolerancePercent: 0 },
            ],
          },
        },
      ],
    });
    const items = diffInquiryVersions(before, after);
    const lines = formatVersionChangeLines(items);
    assert.ok(lines.some((line) => line.includes('Incoterm') && line.includes('FOB') && line.includes('CFR')));
    assert.ok(lines.some((line) => line.includes('total length') && line.includes('4000') && line.includes('5500')));
    assert.ok(lines.some((line) => line.includes('drum schedule') && line.includes('EWD630-0')));
    assert.ok(lines.some((line) => line.includes('Total value') && line.includes('1000') && line.includes('1500')));
    assert.equal(lines.some((line) => line.includes('confirmedAt')), false);
  });

  it('builds the version story without treating a draft cancel as a calculation', () => {
    const events = buildInquiryVersionTimeline([
      {
        id: 'v1',
        versionNo: 1,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-02T00:00:00.000Z',
        commercialMetadata: {
          portalLifecycle: 'CANCELED',
          cancelReason: 'SUPERSEDED',
          supersededByVersion: 2,
          supersededAt: '2026-11-02T00:00:00.000Z',
          calculatedLineFingerprint: 'abc',
          supersededChangeSummary: [
            { kind: 'changed', label: 'Line 1 total length', from: '4000 m', to: '5500 m' },
          ],
        },
      },
      {
        id: 'v2',
        versionNo: 2,
        createdAt: '2026-11-02T00:00:00.000Z',
        updatedAt: '2026-11-03T00:00:00.000Z',
        commercialMetadata: {
          portalLifecycle: 'ACCEPTED',
          calculatedAt: '2026-11-02T01:00:00.000Z',
          acceptedAt: '2026-11-03T00:00:00.000Z',
        },
      },
    ]);
    const messages = events.map((event) => event.message);
    assert.match(messages[0], /Created V1/);
    assert.ok(messages.some((message) => message.includes('Calculated V1')));
    assert.ok(messages.some((message) => message.includes('Superseded by V2') && message.includes('4000 m')));
    assert.ok(messages.some((message) => message.includes('Approved V2')));
  });
});
