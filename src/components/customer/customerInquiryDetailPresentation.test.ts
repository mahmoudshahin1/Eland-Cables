import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  customerCableTypeLabel,
  customerCoresSizeLabel,
  customerInquiryBreadcrumbLabel,
  customerInquiryDetailTitle,
  customerInquiryPresentationTabs,
  customerLineQuantityMeters,
  customerLineUnitLabel,
  inquiryCuttingDrumsWorkspace,
  isCustomerCuttingDrumsTab,
  lineHasV2SnapshotLineage,
  presentationTabFromWorkspace,
  resolveInquiryV2TabBridges,
  shouldMountInquiryV2BridgeInCutting,
  shouldMountInquiryV2BridgeInPacking,
  shouldRenderV2EngineChrome,
  snapshotConflictLabel,
  v2EngineSectionsForBridgeTab,
  workspaceTabForPresentation,
} from './customerInquiryDetailPresentation';
import type { CommercialInquiryLineDto } from '../../services/commercialInquiryApiService';
import { resolveInquiryLineDrumsQuantity } from '../../services/commercialInquiryApiService';
import type { InquiryWorkspaceTab } from '../inquiry-quotation/inquiryWorkspaceTabs';
import { InquiryDrumsTable } from '../inquiry-quotation/InquiryDrumsTable';

describe('customerInquiryDetailPresentation', () => {
  it('groups drums and cutting into Cutting & Drums and keeps costing', () => {
    const tabs = customerInquiryPresentationTabs([
      { id: 'overview', label: 'Overview' },
      { id: 'lines', label: 'Cables', count: 3 },
      { id: 'costing', label: 'Costing' },
      { id: 'drum_plan', label: 'Drums' },
      { id: 'cutting', label: 'Cutting' },
      { id: 'container_study', label: 'Container Study' },
      { id: 'documents', label: 'Documents', count: 2 },
      { id: 'quotation', label: 'Quotation', count: 0 },
      { id: 'activity', label: 'Activity' },
    ]);
    assert.deepEqual(
      tabs.filter((tab) => !tab.overflow).map((tab) => tab.id),
      ['lines', 'cutting_drums', 'container_study', 'documents', 'costing', 'activity']
    );
    assert.equal(tabs.find((tab) => tab.id === 'lines')?.count, 3);
    assert.equal(tabs.find((tab) => tab.id === 'quotation')?.overflow, true);
    assert.equal(tabs.find((tab) => tab.id === 'overview')?.overflow, true);
  });

  it('maps presentation tabs back to existing workspace modules', () => {
    assert.equal(workspaceTabForPresentation('cutting_drums'), 'drum_plan');
    assert.equal(workspaceTabForPresentation('lines'), 'lines');
    assert.equal(presentationTabFromWorkspace('cutting'), 'cutting_drums');
    assert.equal(presentationTabFromWorkspace('drum_plan'), 'cutting_drums');
    assert.equal(isCustomerCuttingDrumsTab('drum_plan'), true);
    assert.equal(isCustomerCuttingDrumsTab('container_study' as InquiryWorkspaceTab), false);
  });

  it('titles draft inquiries as New Inquiry', () => {
    assert.equal(
      customerInquiryDetailTitle({ inquiryNumber: 'INQ-20260914-001', status: 'DRAFT' }),
      'New Inquiry / INQ-20260914-001'
    );
    assert.equal(
      customerInquiryDetailTitle({ inquiryNumber: 'INQ-20260914-001', status: 'SUBMITTED' }),
      'Inquiry / INQ-20260914-001'
    );
    assert.equal(customerInquiryBreadcrumbLabel('DRAFT'), 'New Inquiry');
  });

  it('derives type, cores x size, quantity and unit from real line data', () => {
    const line = {
      id: 'l1',
      lineNumber: 1,
      cableDescription: 'Cu / XLPE / LSHF Power Cable 1C x 150 mm²',
      requestedQuantity: 9,
      requestedLengthMeters: 5000,
      quantityUom: 'M',
    } as CommercialInquiryLineDto;
    assert.equal(customerCableTypeLabel(line), 'Power Cable');
    assert.equal(customerCoresSizeLabel(line), '1C x 150 mm²');
    assert.equal(customerLineQuantityMeters(line), 5000);
    assert.equal(customerLineUnitLabel(line), 'm');
  });
});

const INQ26_06065_LINES: CommercialInquiryLineDto[] = [
  {
    id: 'l1',
    lineNumber: 1,
    cableDescription: 'INQ26-06065 line 1',
    requestedQuantity: 6,
    requestedLengthMeters: 4650,
    drumSchedule: {
      cableTolerancePercent: 1,
      rows: [
        { drumCode: 'EWD220', noOfDrums: 3, cuttingLengthM: 800, drumTolerancePercent: 1 },
        { drumCode: 'EWD220', noOfDrums: 3, cuttingLengthM: 750, drumTolerancePercent: 1 },
      ],
    },
  },
  {
    id: 'l2',
    lineNumber: 2,
    cableDescription: 'INQ26-06065 line 2',
    requestedQuantity: 1,
    requestedLengthMeters: 800,
    drumSchedule: {
      cableTolerancePercent: 1,
      rows: [{ drumCode: 'EWD220', noOfDrums: 1, cuttingLengthM: 800, drumTolerancePercent: 1 }],
    },
  },
  {
    id: 'l3',
    lineNumber: 3,
    cableDescription: 'INQ26-06065 line 3',
    requestedQuantity: 8,
    requestedLengthMeters: 8600,
    drumSchedule: {
      cableTolerancePercent: 1,
      rows: [
        { drumCode: 'EWD220', noOfDrums: 5, cuttingLengthM: 1000, drumTolerancePercent: 1 },
        { drumCode: 'EWD220', noOfDrums: 3, cuttingLengthM: 1200, drumTolerancePercent: 1 },
      ],
    },
  },
];

describe('customer Cutting & Drums workspace', () => {
  it('CASE A INQ26-06065: one combined workspace, packing once, 15 drums, no V2 chrome without snapshot', () => {
    const presentationTab = workspaceTabForPresentation('cutting_drums');
    const workspace = inquiryCuttingDrumsWorkspace({ isCustomer: true, tab: presentationTab });
    assert.equal(workspace.showPackingTable, true);
    assert.equal(workspace.showCuttingWorkbench, true);
    assert.deepEqual(workspace.v2BridgeTabs, ['cutting_drums']);
    assert.equal(workspace.v2BridgeTabs.length, 1);
    assert.equal(workspace.v2BridgeTabs.includes('drums') && workspace.v2BridgeTabs.includes('cutting'), false);
    assert.equal(shouldMountInquiryV2BridgeInPacking(workspace), true);
    assert.equal(shouldMountInquiryV2BridgeInCutting(workspace), false);
    assert.equal(
      shouldMountInquiryV2BridgeInPacking(workspace) && shouldMountInquiryV2BridgeInCutting(workspace),
      false
    );

    const totalDrums = INQ26_06065_LINES.reduce((sum, line) => sum + resolveInquiryLineDrumsQuantity(line), 0);
    assert.equal(INQ26_06065_LINES.length, 3);
    assert.equal(totalDrums, 15);

    const html = renderToStaticMarkup(
      React.createElement(InquiryDrumsTable, {
        lines: INQ26_06065_LINES,
        drumMaster: [],
        isEditable: true,
        onConfigureDrums: () => undefined,
      })
    );
    assert.equal((html.match(/Drum Packing/g) || []).length, 0);
    assert.equal((html.match(/<tbody/g) || []).length, 1);
    assert.match(html, /INQ26-06065 line 1/);
    assert.match(html, /INQ26-06065 line 2/);
    assert.match(html, /INQ26-06065 line 3/);
    assert.match(html, />6</);
    assert.match(html, />1</);
    assert.match(html, />8</);
    assert.match(html, /4,650/);
    assert.match(html, /800/);
    assert.match(html, /8,600/);
    assert.equal((html.match(/Configure Drums/g) || []).length, 3);
    assert.doesNotMatch(html, /V2 Engine/);
    assert.doesNotMatch(html, /No V2 configuration snapshot/);

    const noSnapshotLine = { v2CurrentSnapshotId: null, snapshots: [] };
    assert.equal(lineHasV2SnapshotLineage(noSnapshotLine), false);
    assert.equal(
      shouldRenderV2EngineChrome({ workflowChannel: 'V2_CONFIGURATION', line: noSnapshotLine }),
      false
    );
    assert.equal(snapshotConflictLabel({ snapshots: [] }), null);
  });

  it('CASE B genuine V2 snapshot: V2 UI available as one section on customer Cutting & Drums', () => {
    const workspace = inquiryCuttingDrumsWorkspace({ isCustomer: true, tab: 'drum_plan' });
    assert.deepEqual(workspace.v2BridgeTabs, ['cutting_drums']);
    assert.equal(workspace.v2BridgeTabs.length, 1);
    assert.equal(workspace.showPackingTable, true);
    assert.equal(workspace.showCuttingWorkbench, true);
    assert.equal(shouldMountInquiryV2BridgeInPacking(workspace), true);
    assert.equal(shouldMountInquiryV2BridgeInCutting(workspace), false);
    assert.deepEqual(v2EngineSectionsForBridgeTab('cutting_drums'), {
      showCosting: false,
      showCutting: true,
      showDrums: true,
    });

    const snapLine = {
      v2CurrentSnapshotId: 'snap-1',
      snapshots: [
        {
          snapshotId: 'snap-1',
          versionNo: 1,
          inquiryLineId: 'l1',
          cableMaterialNumber: '10009487',
          itemCode: null,
          customerCode: null,
          validationStatus: 'VALID',
          flowState: 'READY',
          engineeringStatus: 'OK',
          summaryDescription: null,
          catalogSource: 'MASTER',
          catalogAuthoritative: true,
          bomGovernanceBlocked: false,
          unresolvedBomConflictCount: 0,
          capturedAt: '2026-09-24T00:00:00.000Z',
        },
      ],
    };
    assert.equal(lineHasV2SnapshotLineage(snapLine), true);
    assert.equal(shouldRenderV2EngineChrome({ workflowChannel: 'V2_CONFIGURATION', line: snapLine }), true);
    assert.equal(lineHasV2SnapshotLineage({ v2CurrentSnapshotId: null, snapshots: [{}] }), true);
    assert.equal(
      snapshotConflictLabel({
        snapshots: [{ bomGovernanceBlocked: true, unresolvedBomConflictCount: 2 }],
      }),
      'BOM governance blocked — 2 unresolved conflict(s) (incl. BOM 81 when applicable).'
    );
  });

  it('never mounts both drums and cutting V2 bridges for customer Cutting & Drums', () => {
    for (const tab of ['drum_plan', 'cutting'] as const) {
      const bridges = resolveInquiryV2TabBridges({ isCustomer: true, tab });
      assert.equal(bridges.length, 1);
      assert.deepEqual(bridges, ['cutting_drums']);
      assert.equal(bridges.includes('drums'), false);
      assert.equal(bridges.includes('cutting'), false);
    }
  });

  it('does not show V2 Engine chrome from workflowChannel === V2_CONFIGURATION alone', () => {
    assert.equal(
      shouldRenderV2EngineChrome({
        workflowChannel: 'V2_CONFIGURATION',
        line: { v2CurrentSnapshotId: null, snapshots: [] },
      }),
      false
    );
    assert.equal(
      snapshotConflictLabel({ snapshots: [] }),
      null
    );
  });

  it('static: CommercialInquiryDetail no longer dual-mounts customer V2 bridges', () => {
    const detailPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../inquiry-quotation/CommercialInquiryDetail.tsx'
    );
    const src = readFileSync(detailPath, 'utf8');
    assert.equal(src.includes('isCustomer && isCustomerCuttingDrumsTab(tab)'), false);
    assert.equal(src.includes('tab="drums"'), false);
    const bridgeMounts = src.match(/<InquiryV2TabBridge/g) || [];
    assert.equal(bridgeMounts.length, 3);
    assert.match(src, /shouldMountInquiryV2BridgeInPacking/);
    assert.match(src, /shouldMountInquiryV2BridgeInCutting/);
    assert.equal((src.match(/tab=\{v2CuttingDrumsBridgeTab\}/g) || []).length, 2);
  });

  it('static: InquiryV2TabBridge gates V2 Engine chrome on snapshot lineage, not workflowChannel', () => {
    const bridgePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../inquiry-quotation/InquiryV2TabBridge.tsx'
    );
    const src = readFileSync(bridgePath, 'utf8');
    assert.match(src, /shouldRenderV2EngineChrome/);
    assert.match(src, /v2EngineSectionsForBridgeTab/);
    assert.equal(src.includes('No V2 configuration snapshot saved for this line'), false);
    assert.match(src, /workflowChannel: inquiry\.workflowChannel/);
  });
});
