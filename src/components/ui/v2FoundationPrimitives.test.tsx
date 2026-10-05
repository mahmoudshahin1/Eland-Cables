import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { PermissionState } from './PermissionState';
import { SnapshotBanner, snapshotBannerFreezeCopy } from './SnapshotBanner';
import { resolveStepperState, Stepper } from './Stepper';
import { ValidationSummary } from './ValidationSummary';

describe('P1.5-02A additive foundation primitives', () => {
  it('does not render complete without an artifact', () => {
    assert.equal(resolveStepperState({ state: 'complete', hasArtifact: true }), 'complete');
    assert.equal(resolveStepperState({ state: 'complete' }), 'in_progress');
    const html = renderToStaticMarkup(
      React.createElement(Stepper, {
        steps: [{ id: 'cfg', label: 'Configuration', state: 'complete' }],
      }),
    );
    assert.match(html, /Configuration/);
    assert.match(html, /In progress/);
    assert.doesNotMatch(html, />Complete</);
  });

  it('renders journey state labels, not color-only status', () => {
    const html = renderToStaticMarkup(
      React.createElement(Stepper, {
        steps: [
          { id: 'a', label: 'Cutting', state: 'complete', hasArtifact: true },
          { id: 'b', label: 'Drum plan', state: 'blocked' },
        ],
      }),
    );
    assert.match(html, /Cutting/);
    assert.match(html, /Complete/);
    assert.match(html, /Drum plan/);
    assert.match(html, /Blocked/);
    assert.match(html, /aria-label="Journey stages"/);
  });

  it('builds snapshot freeze copy and shows identity fields plus lifecycle text', () => {
    assert.equal(
      snapshotBannerFreezeCopy('2026-09-12', 'B4-C'),
      'Frozen on 2026-09-12 from B4-C. Changing Customer Master or live rates does not change this document.',
    );
    const html = renderToStaticMarkup(
      React.createElement(SnapshotBanner, {
        artifactType: 'FinancialOfferSnapshot',
        artifactId: 'fos-1',
        version: 2,
        source: 'quotation-line',
        createdAt: '2026-09-12',
        createdBy: 'pricing.user',
        lifecycle: 'superseded',
        successorLabel: 'current offer',
        lockedValues: 'Incoterm CIF',
      }),
    );
    assert.match(html, /FinancialOfferSnapshot/);
    assert.match(html, /fos-1/);
    assert.match(html, /quotation-line/);
    assert.match(html, /pricing.user/);
    assert.match(html, /Superseded/);
    assert.match(html, /current offer/);
    assert.match(html, /Incoterm CIF/);
    assert.match(html, /does not change this document/);
  });

  it('renders validation what / why / next / owner', () => {
    const html = renderToStaticMarkup(
      React.createElement(ValidationSummary, {
        happened: 'Cannot create Financial Offer',
        why: 'DRAFT quotation not priced',
        next: 'Price quotation',
        owner: 'Pricing / Sales',
      }),
    );
    assert.match(html, /What happened/);
    assert.match(html, /Cannot create Financial Offer/);
    assert.match(html, /DRAFT quotation not priced/);
    assert.match(html, /Price quotation/);
    assert.match(html, /Pricing \/ Sales/);
    assert.match(html, /role="alert"/);
  });

  it('renders permission denial with module and role text', () => {
    const html = renderToStaticMarkup(
      React.createElement(PermissionState, {
        moduleName: 'Costing',
        requiredRole: 'costing_admin',
        userLabel: 'customer@example.com',
      }),
    );
    assert.match(html, /Access denied/);
    assert.match(html, /Costing/);
    assert.match(html, /costing_admin/);
    assert.match(html, /customer@example.com/);
  });

  it('renders empty and honest error stubs without success language', () => {
    const empty = renderToStaticMarkup(
      React.createElement(EmptyState, { title: 'No inquiries', hint: 'Create an inquiry to start.' }),
    );
    assert.match(empty, /No inquiries/);
    assert.match(empty, /Create an inquiry/);

    const stub = renderToStaticMarkup(
      React.createElement(ErrorState, {
        title: 'D365 posting',
        kind: 'not_connected',
        message: 'Adapter is not live.',
        next: 'Use in-app fulfillment status only.',
      }),
    );
    assert.match(stub, /NOT_CONNECTED/);
    assert.match(stub, /D365 posting/);
    assert.match(stub, /not live/);
    assert.doesNotMatch(stub, /SUCCESS|connected live/i);
  });
});
