import React from 'react';
import { CostingCard, CostingPageHeader } from '../CostingUiPrimitives';
import { CostingPanelProps } from './types';

export const SettingsPanel: React.FC<CostingPanelProps> = ({ onNavigate }) => (
  <>
    <CostingPageHeader title="Settings" breadcrumb="Costing Configuration > Settings" />
    <div className="grid md:grid-cols-2 gap-4">
      <CostingCard title="Workspace" subtitle="Display preferences for the costing team.">
        <ul className="text-sm text-slate-600 space-y-2">
          <li>Primary target: desktop / laptop administration.</li>
          <li>Tables paginate at 25 rows.</li>
          <li>Add / Edit opens a right-side drawer.</li>
          <li>Arabic / RTL layout follows the selected language.</li>
        </ul>
      </CostingCard>
      <CostingCard title="Pricing rules (reference)" subtitle="Not a second costing engine.">
        <ul className="text-sm text-slate-600 space-y-2">
          <li>
            <strong>Copper</strong> — MARKET_METAL_COPPER uses inquiry header copper price.
          </li>
          <li>
            <strong>Aluminium</strong> — MARKET_METAL_ALUMINIUM uses inquiry header aluminium price.
          </li>
          <li>
            <strong>Standard</strong> — STANDARD_RAW_MATERIAL uses Raw Material Price master.
          </li>
          <li>Scrap is configuration only and is not added to Direct Raw Material Cost.</li>
          <li>
            <strong>Decision 5</strong> — Option B (LME / base only), unsigned. Production sign-off lives under{' '}
            <button
              type="button"
              className="text-brand-700 font-semibold underline"
              onClick={() => onNavigate('production_readiness')}
            >
              Production Readiness
            </button>
            . This does not switch the engine to Option A.
          </li>
        </ul>
      </CostingCard>
    </div>
  </>
);
