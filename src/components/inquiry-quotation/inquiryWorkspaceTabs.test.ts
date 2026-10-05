import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_INTERNAL_TABS,
  CUSTOMER_PORTAL_TABS,
  normalizeInquiryTab,
  resolveInquiryWorkspaceTabs,
} from './inquiryWorkspaceTabs';
import {
  inquiryCuttingDrumsWorkspace,
  resolveInquiryV2TabBridges,
  shouldMountInquiryV2BridgeInCutting,
  shouldMountInquiryV2BridgeInPacking,
  v2EngineSectionsForBridgeTab,
} from '../customer/customerInquiryDetailPresentation';

describe('inquiryWorkspaceTabs', () => {
  it('exposes canonical inquiry workspace including Container Study after Cutting', () => {
    assert.deepEqual(CANONICAL_INTERNAL_TABS, [
      'overview',
      'lines',
      'costing',
      'drum_plan',
      'cutting',
      'container_study',
      'documents',
      'quotation',
      'activity',
    ]);
  });

  it('exposes the same customer portal workspace including Container Study', () => {
    assert.deepEqual(CUSTOMER_PORTAL_TABS, CANONICAL_INTERNAL_TABS);
    const tabs = resolveInquiryWorkspaceTabs({
      isCustomer: true,
      canViewCosting: false,
      canViewExtendedInternal: false,
      counts: { lineCount: 2, documentCount: 1, quotationCount: 0 },
    });
    assert.equal(tabs.length, 9);
    assert.deepEqual(tabs.map((t) => t.id), CANONICAL_INTERNAL_TABS);
    assert.equal(tabs.find((t) => t.id === 'container_study')?.label, 'Container Study');
  });

  it('hides costing tab for internal users without costing permission', () => {
    const tabs = resolveInquiryWorkspaceTabs({
      isCustomer: false,
      canViewCosting: false,
      canViewExtendedInternal: true,
      counts: { lineCount: 0, documentCount: 0, quotationCount: 0 },
    });
    assert.equal(tabs.some((t) => t.id === 'costing'), false);
    assert.equal(tabs.some((t) => t.id === 'technical_offer'), true);
  });

  it('keeps drums and cutting tabs for internal users without costing permission', () => {
    const tabs = resolveInquiryWorkspaceTabs({
      isCustomer: false,
      canViewCosting: false,
      canViewExtendedInternal: false,
      counts: { lineCount: 0, documentCount: 0, quotationCount: 0 },
    });
    assert.equal(tabs.length, 8);
    assert.deepEqual(
      tabs.map((t) => t.id),
      ['overview', 'lines', 'drum_plan', 'cutting', 'container_study', 'documents', 'quotation', 'activity']
    );
  });

  it('shows canonical internal workspace when costing is allowed', () => {
    const tabs = resolveInquiryWorkspaceTabs({
      isCustomer: false,
      canViewCosting: true,
      canViewExtendedInternal: false,
      counts: { lineCount: 2, documentCount: 1, quotationCount: 0 },
    });
    assert.deepEqual(tabs.map((t) => t.id), CANONICAL_INTERNAL_TABS);
  });

  it('normalizes disallowed tab to first allowed tab', () => {
    const allowed = CUSTOMER_PORTAL_TABS;
    assert.equal(normalizeInquiryTab('costing', allowed), 'costing');
    assert.equal(normalizeInquiryTab('technical_offer', allowed), 'overview');
    assert.equal(normalizeInquiryTab('lines', allowed), 'lines');
  });

  it('CASE C Internal: Drums and Cutting remain separate tabs with separate V2 bridges', () => {
    const tabs = resolveInquiryWorkspaceTabs({
      isCustomer: false,
      canViewCosting: true,
      canViewExtendedInternal: false,
      counts: { lineCount: 1, documentCount: 0, quotationCount: 0 },
    });
    assert.equal(tabs.some((t) => t.id === 'drum_plan'), true);
    assert.equal(tabs.some((t) => t.id === 'cutting'), true);
    assert.equal(tabs.some((t) => (t.id as string) === 'cutting_drums'), false);
    assert.equal(tabs.find((t) => t.id === 'drum_plan')?.label, 'Drums');
    assert.equal(tabs.find((t) => t.id === 'cutting')?.label, 'Cutting');

    const drums = inquiryCuttingDrumsWorkspace({ isCustomer: false, tab: 'drum_plan' });
    assert.equal(drums.showPackingTable, true);
    assert.equal(drums.showCuttingWorkbench, false);
    assert.deepEqual(drums.v2BridgeTabs, ['drums']);
    assert.equal(shouldMountInquiryV2BridgeInPacking(drums), true);
    assert.equal(shouldMountInquiryV2BridgeInCutting(drums), false);
    assert.deepEqual(v2EngineSectionsForBridgeTab('drums'), {
      showCosting: false,
      showCutting: false,
      showDrums: true,
    });

    const cutting = inquiryCuttingDrumsWorkspace({ isCustomer: false, tab: 'cutting' });
    assert.equal(cutting.showPackingTable, false);
    assert.equal(cutting.showCuttingWorkbench, true);
    assert.deepEqual(cutting.v2BridgeTabs, ['cutting']);
    assert.equal(shouldMountInquiryV2BridgeInPacking(cutting), false);
    assert.equal(shouldMountInquiryV2BridgeInCutting(cutting), true);
    assert.deepEqual(v2EngineSectionsForBridgeTab('cutting'), {
      showCosting: false,
      showCutting: true,
      showDrums: false,
    });

    assert.deepEqual(resolveInquiryV2TabBridges({ isCustomer: false, tab: 'drum_plan' }), ['drums']);
    assert.deepEqual(resolveInquiryV2TabBridges({ isCustomer: false, tab: 'cutting' }), ['cutting']);
    assert.equal(
      shouldMountInquiryV2BridgeInPacking(drums) && shouldMountInquiryV2BridgeInCutting(cutting),
      true
    );
    assert.equal(
      shouldMountInquiryV2BridgeInPacking(drums) && shouldMountInquiryV2BridgeInCutting(drums),
      false
    );
  });
});
