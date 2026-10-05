import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdvancedCableSearchPanel } from '../components/common/AdvancedCableSearchPanel';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

function readSrc(rel: string): string {
  return readFileSync(join(repoRoot, 'src', rel), 'utf8');
}

describe('V2 Advanced Cable Search UI', () => {
  it('keeps Standard Search first and opens Advanced Search by user action', () => {
    const modal = readSrc('components/common/CableSearchSelectModal.tsx');
    assert.match(modal, /Standard Search first/);
    assert.match(modal, /No cable items found matching Standard Search/);
    assert.match(modal, /Open Advanced Search/);
    assert.match(modal, /setShowAdvancedSearch\(true\)/);
    assert.match(modal, /AdvancedCableSearchPanel/);
    assert.doesNotMatch(modal, /Advanced Search using Technical Parameters/);
    assert.match(modal, /Build via Parameters/);
    assert.match(modal, /CableConfiguratorV2/);
  });

  it('renders discovery copy, Select Cable, and Technical Office handoff', () => {
    const customerHtml = renderToStaticMarkup(
      React.createElement(AdvancedCableSearchPanel, {
        actorKind: 'customer',
        onSelect: () => undefined,
      })
    );
    assert.match(customerHtml, /Search existing Cable Master records/);
    assert.match(customerHtml, /not an engineering compatibility engine/);
    assert.match(customerHtml, />Search</);
    assert.match(customerHtml, />Clear</);
    assert.doesNotMatch(customerHtml, /Customer \/ spec code/);
    assert.doesNotMatch(customerHtml, /standardPriceUsdPerM/);
    assert.doesNotMatch(customerHtml, /unitPriceUsd/);

    const internalHtml = renderToStaticMarkup(
      React.createElement(AdvancedCableSearchPanel, {
        actorKind: 'internal',
        onSelect: () => undefined,
      })
    );
    assert.match(internalHtml, /Customer \/ spec code/);

    const panel = readSrc('components/common/AdvancedCableSearchPanel.tsx');
    assert.match(panel, /Select Cable/);
    assert.match(panel, /Required cable was not found in the existing Cable Master/);
    assert.match(panel, /Request Technical Office Review/);
    assert.match(panel, /ADVANCED_CABLE_SEARCH_NO_MATCH|submitCableNotFoundTechnicalOfficeRequest/);
  });

  it('does not wire V3 dependency files as a runtime engine', () => {
    const panel = readSrc('components/common/AdvancedCableSearchPanel.tsx');
    const routes = readSrc('server/v2CableSearchRoutes.ts');
    assert.doesNotMatch(panel, /Cable Selection with Dependencies/);
    assert.doesNotMatch(routes, /V3_TECHNICAL_OFFICE_DEPENDENCY/);
    assert.doesNotMatch(routes, /compatibility engine/i);
    assert.match(routes, /read-only/);
  });
});
