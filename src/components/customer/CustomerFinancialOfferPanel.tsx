import React from 'react';
import type { CustomerFinancialOfferProjection } from '../../domain/financialOfferCustomerProjection';

function money(value: string, currency: string) {
  const n = Number(value);
  const amount = Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
  return `${amount} ${currency}`;
}

export const CustomerFinancialOfferPanel: React.FC<{ offer: CustomerFinancialOfferProjection }> = ({ offer }) => {
  return (
    <div className="space-y-4 text-xs">
      <div>
        <h4 className="text-sm font-bold text-slate-900">Cable pricing</h4>
        <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">Cable</th>
                <th className="px-3 py-2 font-semibold">Cutting length</th>
                <th className="px-3 py-2 font-semibold">Drum</th>
                <th className="px-3 py-2 font-semibold">Quantity</th>
                <th className="px-3 py-2 font-semibold">Unit price</th>
                <th className="px-3 py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {offer.cablePricing.map((line, index) => (
                <tr key={`${line.cable}-${index}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{line.cable}</td>
                  <td className="px-3 py-2 font-mono">{line.cuttingLength}</td>
                  <td className="px-3 py-2">{line.drum || '—'}</td>
                  <td className="px-3 py-2 font-mono">{line.quantity}</td>
                  <td className="px-3 py-2 font-mono">{money(line.unitPrice, offer.currency)}</td>
                  <td className="px-3 py-2 font-mono font-semibold">{money(line.total, offer.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-bold text-slate-900">Shipping</h4>
        {offer.shippingNotice ? (
          <p className="mt-1 text-[11px] text-amber-800">{offer.shippingNotice}</p>
        ) : null}
        {offer.shipping.length === 0 ? (
          <p className="mt-2 text-slate-500">No customer shipment lines on this offer.</p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Destination</th>
                  <th className="px-3 py-2 font-semibold">Incoterm</th>
                  <th className="px-3 py-2 font-semibold">Container type</th>
                  <th className="px-3 py-2 font-semibold">Quantity</th>
                  <th className="px-3 py-2 font-semibold">Rate</th>
                  <th className="px-3 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {offer.shipping.map((line, index) => (
                  <tr key={`${line.destination}-${line.containerType}-${index}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{line.destination}</td>
                    <td className="px-3 py-2">{line.incoterm}</td>
                    <td className="px-3 py-2">{line.containerType || '—'}</td>
                    <td className="px-3 py-2 font-mono">{line.quantity}</td>
                    <td className="px-3 py-2 font-mono">{money(line.rate, offer.currency)}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{money(line.total, offer.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Summary</p>
        <div className="flex justify-between">
          <span>Products total</span>
          <span className="font-mono font-semibold">{money(offer.productsTotal, offer.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span>Shipping total</span>
          <span className="font-mono font-semibold">{money(offer.shippingTotal, offer.currency)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 pt-1 text-sm">
          <span className="font-bold">Inquiry total</span>
          <span className="font-mono font-bold text-brand-800">{money(offer.inquiryTotal, offer.currency)}</span>
        </div>
      </div>
    </div>
  );
};
