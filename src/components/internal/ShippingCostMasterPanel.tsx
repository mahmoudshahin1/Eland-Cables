import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

type OptionCustomer = { id: string; code: string; name: string };
type OptionIncoterm = { id: string; code: string; name: string };
type RateRow = {
  id: string;
  customerId: string;
  customerCode: string | null;
  customerName: string | null;
  deliveryPoint: string;
  incotermId: string;
  incotermCode: string | null;
  containerType: string;
  amount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
};

const inputClass =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs';

export function ShippingCostMasterPanel() {
  const { jwtToken } = useAuth();
  const headers = { Authorization: `Bearer ${jwtToken}`, 'Content-Type': 'application/json' };
  const [customers, setCustomers] = useState<OptionCustomer[]>([]);
  const [incoterms, setIncoterms] = useState<OptionIncoterm[]>([]);
  const [deliveryPoints, setDeliveryPoints] = useState<string[]>([]);
  const [containerTypes, setContainerTypes] = useState<string[]>([]);
  const [rates, setRates] = useState<RateRow[]>([]);
  const [history, setHistory] = useState<RateRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    deliveryPoint: '',
    incotermId: '',
    containerType: '',
    amount: '',
    currency: 'USD',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
    status: 'ACTIVE',
  });

  const load = useCallback(async () => {
    if (!jwtToken) return;
    const [optionsRes, ratesRes] = await Promise.all([
      fetch('/api/v2/customer-shipping-cost-rates/options', { headers }),
      fetch('/api/v2/customer-shipping-cost-rates', { headers }),
    ]);
    if (optionsRes.ok) {
      const options = await optionsRes.json();
      setCustomers(options.customers || []);
      setIncoterms(options.incoterms || []);
      setDeliveryPoints(options.deliveryPoints || []);
      setContainerTypes(options.containerTypes || []);
    }
    if (ratesRes.ok) {
      const data = await ratesRes.json();
      setRates(data.rates || []);
    } else {
      const data = await ratesRes.json().catch(() => ({}));
      setMessage(data.error || 'Could not load shipping cost rates.');
    }
  }, [jwtToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await fetch('/api/v2/customer-shipping-cost-rates', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
        effectiveTo: form.effectiveTo || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || 'Could not save the rate.');
      return;
    }
    setMessage(`Saved version ${data.version}.`);
    setForm((prev) => ({ ...prev, amount: '' }));
    await load();
  };

  const openHistory = async (row: RateRow) => {
    const params = new URLSearchParams({
      customerId: row.customerId,
      deliveryPoint: row.deliveryPoint,
      incotermId: row.incotermId,
      containerType: row.containerType,
    });
    const res = await fetch(`/api/v2/customer-shipping-cost-rates/history?${params}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || 'Could not load history.');
      return;
    }
    setHistory(data.versions || []);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <h3 className="text-sm font-bold">Shipping Cost Master</h3>
        <p className="text-[11px] text-slate-500">
          Save New Rate creates the next version. Historical amounts stay unchanged.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-[11px] font-semibold text-slate-600">
            Customer
            <select className={inputClass} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">Select customer</option>
              {customers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Delivery Point
            <select className={inputClass} value={form.deliveryPoint} onChange={(e) => setForm({ ...form, deliveryPoint: e.target.value })}>
              <option value="">Select delivery point</option>
              {deliveryPoints.map((point) => (
                <option key={point} value={point}>
                  {point}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Incoterm
            <select className={inputClass} value={form.incotermId} onChange={(e) => setForm({ ...form, incotermId: e.target.value })}>
              <option value="">Select incoterm</option>
              {incoterms.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Container Type
            <select className={inputClass} value={form.containerType} onChange={(e) => setForm({ ...form, containerType: e.target.value })}>
              <option value="">Select container</option>
              {containerTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Shipping Cost
            <input className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Currency
            <input className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Effective From
            <input className={inputClass} type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Effective To
            <input className={inputClass} type="date" value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Status
            <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUPERSEDED">SUPERSEDED</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50"
        >
          Save New Rate
        </button>
        {message ? <p className="text-xs font-semibold text-slate-700">{message}</p> : null}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left">
            <tr>
              {['Customer', 'Delivery Point', 'Incoterm', 'Container', 'Cost', 'Currency', 'Effective From', 'Status', 'Version', 'Actions'].map((label) => (
                <th key={label} className="px-3 py-2 font-bold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rates.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2">{row.customerName || row.customerCode}</td>
                <td className="px-3 py-2">{row.deliveryPoint}</td>
                <td className="px-3 py-2">{row.incotermCode}</td>
                <td className="px-3 py-2">{row.containerType}</td>
                <td className="px-3 py-2">{row.amount}</td>
                <td className="px-3 py-2">{row.currency}</td>
                <td className="px-3 py-2">{row.effectiveFrom}</td>
                <td className="px-3 py-2">{row.status}</td>
                <td className="px-3 py-2">{row.version}</td>
                <td className="px-3 py-2">
                  <button type="button" className="font-bold text-blue-700" onClick={() => void openHistory(row)}>
                    History
                  </button>
                </td>
              </tr>
            ))}
            {rates.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-500" colSpan={10}>
                  No current shipping cost rates.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {history ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">History</h3>
            <button type="button" className="text-xs font-bold" onClick={() => setHistory(null)}>
              Close
            </button>
          </div>
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left">
                {['Version', 'Cost', 'Currency', 'Effective From', 'Effective To', 'Status', 'Changed by'].map((label) => (
                  <th key={label} className="px-2 py-1 font-bold">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-2 py-1">{row.version}</td>
                  <td className="px-2 py-1">{row.amount}</td>
                  <td className="px-2 py-1">{row.currency}</td>
                  <td className="px-2 py-1">{row.effectiveFrom}</td>
                  <td className="px-2 py-1">{row.effectiveTo || '—'}</td>
                  <td className="px-2 py-1">{row.status}</td>
                  <td className="px-2 py-1">{row.updatedBy || row.createdBy || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
