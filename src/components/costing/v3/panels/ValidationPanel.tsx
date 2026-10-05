import React, { useState } from 'react';
import {
  CostingBadge,
  CostingBtn,
  CostingCard,
  CostingField,
  CostingInput,
  CostingOptionBBanner,
  CostingPageHeader,
  CostingSelect,
  CostingTable,
  CostingTd,
  CostingTh,
  gateStatusBadge,
} from '../CostingUiPrimitives';
import { costingApi } from '../costingV3Api';
import { formatPricingSourceDisplay } from '../costingUiUtils';
import { CostingPanelProps } from './types';

type Gate = { label: string; status: 'PASS' | 'BLOCKED' | 'WARN'; detail?: string };

export const ValidationPanel: React.FC<CostingPanelProps> = ({ token, setError }) => {
  const [form, setForm] = useState({
    materialNumber: '10009487',
    quantity: '1',
    lengthMeters: '1000',
    currency: 'USD',
    costingDate: new Date().toISOString().slice(0, 10),
    copperPrice: '14600',
    aluminiumPrice: '3300',
  });
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await costingApi(token, '/api/admin/costing/validate', {
        method: 'POST',
        body: JSON.stringify({
          materialNumber: form.materialNumber,
          quantity: Number(form.quantity),
          lengthMeters: Number(form.lengthMeters),
          currency: form.currency,
          commercialMetadata: {
            copperPriceRate: Number(form.copperPrice),
            copperPriceUom: 'MT',
            copperPriceCurrency: 'USD',
            aluminiumPriceRate: Number(form.aluminiumPrice),
            aluminiumPriceUom: 'MT',
            aluminiumPriceCurrency: 'USD',
          },
        }),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation failed');
    } finally {
      setBusy(false);
    }
  };

  const preview = (result?.preview as Record<string, unknown>) || null;
  const gates: Gate[] = preview
    ? [
        { label: 'Engineering', status: preview.status === 'READY' ? 'PASS' : 'BLOCKED' },
        { label: 'Governed BOM', status: preview.bomStatus === 'READY' ? 'PASS' : 'BLOCKED' },
        { label: 'Raw Materials', status: 'PASS' },
        { label: 'Raw Material Prices', status: preview.status === 'READY' ? 'PASS' : 'BLOCKED', detail: String((result?.blockingReasons as string[])?.[0] || '') },
        { label: 'Currency / FX', status: preview.fxStatus === 'READY' ? 'PASS' : 'BLOCKED' },
      ]
    : [];

  const breakdown =
    (preview?.materialBreakdown as Record<string, unknown>[]) ||
    (preview?.lineItems as Record<string, unknown>[]) ||
    [];
  const totals = (preview?.totals as Record<string, unknown>) || {};
  const directRm = totals.materialCost ?? preview?.directRawMaterialCost;

  return (
    <>
      <CostingPageHeader title="Costing Validation" breadcrumb="Costing > Validation" />
      <CostingOptionBBanner className="mb-4" />
      <CostingCard title="Test costing readiness">
        <div className="grid md:grid-cols-3 gap-3">
          <CostingField label="Cable Material Number">
            <CostingInput value={form.materialNumber} onChange={(e) => setForm({ ...form, materialNumber: e.target.value })} />
          </CostingField>
          <CostingField label="Quantity">
            <CostingInput value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </CostingField>
          <CostingField label="Length (m)">
            <CostingInput value={form.lengthMeters} onChange={(e) => setForm({ ...form, lengthMeters: e.target.value })} />
          </CostingField>
          <CostingField label="Currency">
            <CostingSelect value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {['USD', 'EUR', 'GBP', 'LE'].map((c) => <option key={c} value={c}>{c}</option>)}
            </CostingSelect>
          </CostingField>
          <CostingField label="Costing Date">
            <CostingInput type="date" value={form.costingDate} onChange={(e) => setForm({ ...form, costingDate: e.target.value })} />
          </CostingField>
          <CostingField label="Copper Price">
            <div className="flex items-center gap-2">
              <CostingInput value={form.copperPrice} onChange={(e) => setForm({ ...form, copperPrice: e.target.value })} />
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">USD/MT</span>
            </div>
          </CostingField>
          <CostingField label="Aluminium Price">
            <div className="flex items-center gap-2">
              <CostingInput value={form.aluminiumPrice} onChange={(e) => setForm({ ...form, aluminiumPrice: e.target.value })} />
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">USD/MT</span>
            </div>
          </CostingField>
        </div>
        <div className="mt-4">
          <CostingBtn variant="primary" onClick={() => void run()} disabled={busy}>
            Run Costing Validation
          </CostingBtn>
        </div>
      </CostingCard>

      {gates.length > 0 && (
        <CostingCard title="Readiness gates (1–5)" className="mt-4">
          <div className="space-y-2">
            {gates.map((g, i) => (
              <div key={g.label} className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 text-xs font-bold inline-flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{g.label}</p>
                    {g.detail && <p className="text-xs text-slate-500">{g.detail}</p>}
                  </div>
                </div>
                {gateStatusBadge(g.status)}
              </div>
            ))}
          </div>
        </CostingCard>
      )}

      {preview && (
        <CostingCard title="DIRECT RAW MATERIAL COST" className="mt-4">
          <p className="text-3xl font-bold text-slate-900">
            {directRm != null
              ? `${Number(directRm).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${preview.resultCurrency || form.currency}`
              : '—'}
          </p>
          {breakdown.length > 0 && (
            <CostingTable>
              <thead>
                <tr>
                  <CostingTh>Raw Material</CostingTh>
                  <CostingTh>Consumption</CostingTh>
                  <CostingTh>UOM</CostingTh>
                  <CostingTh>Applied Unit Price</CostingTh>
                  <CostingTh>Price Currency</CostingTh>
                  <CostingTh>Pricing Source</CostingTh>
                  <CostingTh>Metal Type</CostingTh>
                  <CostingTh>FX Rate</CostingTh>
                  <CostingTh>Txn Currency</CostingTh>
                  <CostingTh>Final Line Cost</CostingTh>
                </tr>
              </thead>
              <tbody>
                {breakdown.slice(0, 50).map((row, i) => (
                  <tr key={i}>
                    <CostingTd className="font-mono">{String(row.rawMaterialCode || '—')}</CostingTd>
                    <CostingTd className="text-right">{String(row.baseConsumptionPerKm ?? row.totalConsumption ?? '—')}</CostingTd>
                    <CostingTd>{String(row.consumptionUom || '—')}</CostingTd>
                    <CostingTd className="text-right">{String(row.unitPrice ?? '—')}</CostingTd>
                    <CostingTd>{String(row.priceCurrency || '—')}</CostingTd>
                    <CostingTd className="text-xs font-semibold">{formatPricingSourceDisplay(String(row.pricingSource || ''))}</CostingTd>
                    <CostingTd>{String(row.metalType || 'NONE')}</CostingTd>
                    <CostingTd className="text-right">{row.fxRate != null ? String(row.fxRate) : '1'}</CostingTd>
                    <CostingTd>{String(preview.resultCurrency || form.currency)}</CostingTd>
                    <CostingTd className="text-right font-semibold">{String(row.lineCost ?? '—')}</CostingTd>
                  </tr>
                ))}
              </tbody>
            </CostingTable>
          )}
        </CostingCard>
      )}
    </>
  );
};
