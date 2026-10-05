import React from 'react';
import { INITIAL_PRODUCTION_ORDERS } from '../../data/mockData';
import { Factory, CheckCircle2, AlertCircle, Play, Eye } from 'lucide-react';

export const ProductionMonitoring: React.FC = () => {
  const orders = INITIAL_PRODUCTION_ORDERS;

  return (
    <div className="space-y-6">
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-red-300 uppercase tracking-widest bg-red-800/60 px-2.5 py-1 rounded-md border border-red-600/40">
            PRODUCTION & ORDERS MONITORING
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">
            Factory Floor OEE & Advaris MES Scheduling
          </h1>
          <p className="text-xs text-amber-200 mt-1 font-bold">NOT_CONNECTED — Advaris MES is not integrated. Rows below are sample UI only.</p>
        </div>
        <button
          disabled
          className="px-4 py-2.5 rounded-xl bg-slate-500 text-white font-bold text-xs cursor-not-allowed"
        >
          NOT_CONNECTED
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          Active Factory Production Orders Ledger
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <th className="p-3">Order No.</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Cable Spec Code</th>
                <th className="p-3">Qty (m)</th>
                <th className="p-3">Current Stage</th>
                <th className="p-3">OEE Progress</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
              {orders.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                    {po.orderNo}
                  </td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">{po.customerName}</td>
                  <td className="p-3 font-mono text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                    {po.cableCode}
                  </td>
                  <td className="p-3 font-bold">{po.orderQtyM.toLocaleString()} m</td>
                  <td className="p-3 font-semibold text-amber-600 dark:text-amber-400">
                    {po.currentStage}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-16 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-600"
                          style={{ width: `${po.progressPercent}%` }}
                        />
                      </div>
                      <span className="font-bold text-[11px]">{po.progressPercent}%</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      {po.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      disabled
                      title="NOT_CONNECTED"
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
