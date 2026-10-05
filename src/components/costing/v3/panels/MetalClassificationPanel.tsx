import React, { useMemo, useState } from 'react';
import {
  CostingBadge,
  CostingBtn,
  CostingCard,
  CostingPageHeader,
  CostingTable,
  CostingTd,
  CostingTh,
} from '../CostingUiPrimitives';
import { costingApi } from '../costingV3Api';
import { CostingPanelProps } from './types';
import { suggestedClassificationFromCode } from '../../../../domain/rawMaterialClassification';

const RULES = [
  {
    metal: 'Copper',
    pricingCategory: 'MARKET_METAL_COPPER',
    inquiryPrice: 'Inquiry Header Copper Price',
    tone: 'copper' as const,
  },
  {
    metal: 'Aluminium',
    pricingCategory: 'MARKET_METAL_ALUMINIUM',
    inquiryPrice: 'Inquiry Header Aluminium Price',
    tone: 'aluminium' as const,
  },
  {
    metal: 'Standard',
    pricingCategory: 'STANDARD_RAW_MATERIAL',
    inquiryPrice: 'Approved Raw Material Master Price',
    tone: 'neutral' as const,
  },
];

function rmCode(row: Record<string, unknown>) {
  return String(row.rawMaterialCode || row.code || '');
}

export const MetalClassificationPanel: React.FC<CostingPanelProps> = ({ token, data, refresh, setError }) => {
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    return data.rawMaterials.map((r) => {
      const code = rmCode(r);
      const suggested = suggestedClassificationFromCode(code, String(r.description || ''), String(r.uom || ''));
      const currentCat = String(r.pricingCategory || 'STANDARD_RAW_MATERIAL');
      const currentMetal = String(r.metalType || 'NONE');
      return {
        ...r,
        code,
        currentCat,
        currentMetal,
        suggested,
        mismatch: currentCat !== suggested.pricingCategory || currentMetal !== suggested.metalType,
      };
    });
  }, [data.rawMaterials]);

  const counts = useMemo(
    () => ({
      copper: rows.filter((r) => r.currentCat === 'MARKET_METAL_COPPER').length,
      aluminium: rows.filter((r) => r.currentCat === 'MARKET_METAL_ALUMINIUM').length,
      standard: rows.filter((r) => r.currentCat === 'STANDARD_RAW_MATERIAL').length,
      pending: rows.filter((r) => r.mismatch).length,
    }),
    [rows]
  );

  const applySuggested = async () => {
    if (!token) return;
    const pending = rows.filter((r) => r.mismatch);
    if (pending.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await costingApi(token, '/api/admin/costing/raw-materials/classify-suggested', {
        method: 'POST',
        body: JSON.stringify({ onlyUnclassified: true }),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Classification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CostingPageHeader
        title="Metal Classification"
        breadcrumb="Costing > Metal Classification"
      />
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Classification is defined on the <strong>Raw Material Master</strong> (pricing category + metal type) — not inferred
        from BOM descriptions at costing time.
      </div>
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        {RULES.map((rule) => (
          <div key={rule.metal}>
            <CostingCard title={rule.metal}>
              <div className="space-y-2 text-sm">
                <CostingBadge tone={rule.tone}>{rule.pricingCategory}</CostingBadge>
                <p className="text-slate-700">{rule.inquiryPrice}</p>
                <p className="font-bold text-lg">
                  {rule.metal === 'Copper' ? counts.copper : rule.metal === 'Aluminium' ? counts.aluminium : counts.standard}
                </p>
              </div>
            </CostingCard>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-600">{counts.pending} material(s) differ from the suggested classification.</p>
        <CostingBtn variant="primary" disabled={busy || counts.pending === 0} onClick={() => void applySuggested()}>
          Apply suggested to existing RMs
        </CostingBtn>
      </div>
      <CostingTable>
        <thead>
          <tr>
            <CostingTh>Code</CostingTh>
            <CostingTh>Description</CostingTh>
            <CostingTh>Current category</CostingTh>
            <CostingTh>Suggested</CostingTh>
          </tr>
        </thead>
        <tbody>
          {rows
            .filter((r) => r.mismatch)
            .slice(0, 40)
            .map((r) => (
              <tr key={r.code}>
                <CostingTd className="font-mono font-semibold">{r.code}</CostingTd>
                <CostingTd>{String(r.description || '')}</CostingTd>
                <CostingTd>
                  {r.currentCat} / {r.currentMetal}
                </CostingTd>
                <CostingTd>
                  {r.suggested.pricingCategory} / {r.suggested.metalType}
                </CostingTd>
              </tr>
            ))}
        </tbody>
      </CostingTable>
    </>
  );
};
