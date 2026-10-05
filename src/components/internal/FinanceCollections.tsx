import React from 'react';
import { INITIAL_TRANSACTIONS } from '../../data/mockData';
import { DollarSign, AlertCircle, FileText, CheckCircle } from 'lucide-react';

export const FinanceCollections: React.FC = () => {
  const transactions = INITIAL_TRANSACTIONS;

  return (
    <div className="space-y-6">
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-red-300 uppercase tracking-widest bg-red-800/60 px-2.5 py-1 rounded-md border border-red-600/40">
            FINANCE & AR COLLECTIONS LEDGER
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">
            Accounts Receivable & Credit Limits
          </h1>
          <p className="text-xs text-amber-200 mt-1 font-bold">NOT_IMPLEMENTED — ledger is sample UI, not live AR.</p>
        </div>
        <button
          disabled
          className="px-4 py-2.5 rounded-xl bg-slate-500 text-white font-bold text-xs cursor-not-allowed"
        >
          NOT_IMPLEMENTED
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
          AR Customer Invoices & Payment Receipts
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <th className="p-3">Doc No.</th>
                <th className="p-3">Type</th>
                <th className="p-3">Date</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Amount (USD)</th>
                <th className="p-3">Balance (USD)</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{tx.documentNo}</td>
                  <td className="p-3 font-semibold text-slate-900 dark:text-white">{tx.type}</td>
                  <td className="p-3 text-slate-500">{tx.documentDate}</td>
                  <td className="p-3 text-slate-500">{tx.dueDate}</td>
                  <td className="p-3 font-bold">${tx.amountUsd.toLocaleString()}</td>
                  <td className="p-3 font-bold">${tx.balanceUsd.toLocaleString()}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      {tx.status}
                    </span>
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
