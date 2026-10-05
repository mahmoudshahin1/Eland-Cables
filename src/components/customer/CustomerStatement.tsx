import React from 'react';
import { INITIAL_STATEMENT, INITIAL_TRANSACTIONS } from '../../data/mockData';
import {
  CreditCard,
  Download,
  Banknote,
  AlertTriangle,
  Calendar,
  CheckCircle,
} from 'lucide-react';
import { DashboardStatCard } from '../common/DashboardStatCard';
import { CUSTOMER_HOME_PATH } from '../../app/shellRoutes';
import { CustomerPageHero } from './CustomerPageHero';
import { useLocation } from 'react-router-dom';

export const CustomerStatement: React.FC = () => {
  const statement = INITIAL_STATEMENT;
  const transactions = INITIAL_TRANSACTIONS;
  const location = useLocation();
  const isInvoices = /\/invoices\/?$/.test(location.pathname);

  return (
    <div className="space-y-6">
      <CustomerPageHero
        breadcrumbs={[
          { label: 'Home', to: CUSTOMER_HOME_PATH },
          { label: isInvoices ? 'Invoices' : 'Statement' },
        ]}
        title={isInvoices ? 'Invoices' : 'Statement'}
        subtitle={
          isInvoices
            ? 'Review issued invoices and payment status.'
            : 'Review account balance, credit aging, and statement activity.'
        }
        actions={
          <button
            type="button"
            disabled
            className="px-4 py-2.5 rounded-xl bg-slate-500 text-white font-bold text-xs cursor-not-allowed flex items-center space-x-1.5"
          >
            <Download className="h-4 w-4" />
            <span>PDF NOT_IMPLEMENTED</span>
          </button>
        }
      />

      {/* Top Statement Info Bar matching Section 7 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs text-slate-400 font-semibold uppercase">Customer</span>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
            {statement.customerName}
          </h2>
          <p className="text-xs text-slate-500">Account Code: {statement.customerCode}</p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span className="text-slate-500 font-medium">As of Date:</span>
          <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl">
            02 May 2026
          </span>
        </div>
      </div>

      {/* Credit Metric Cards matching Section 7 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardStatCard
          icon={CreditCard}
          label="Credit Limit"
          value={`USD ${statement.creditLimitUsd.toLocaleString()}`}
        />
        <DashboardStatCard
          icon={CheckCircle}
          label="Available Credit"
          value={`USD ${statement.availableCreditUsd.toLocaleString()}`}
        />
        <DashboardStatCard
          icon={Banknote}
          label="Outstanding Balance"
          value={`USD ${statement.outstandingBalanceUsd.toLocaleString()}`}
        />
        <DashboardStatCard
          icon={AlertTriangle}
          label="Overdue Amount"
          value={`USD ${statement.overdueAmountUsd.toLocaleString()}`}
        />
      </div>

      {/* Aging Summary Buckets matching Section 7 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">
          Aging Summary (USD)
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center text-xs">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800">
            <span className="text-slate-500 font-medium block">Current</span>
            <p className="text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-1">
              ${statement.aging.currentUsd.toLocaleString()}
            </p>
          </div>

          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <span className="text-slate-500 font-medium block">1 - 30 Days</span>
            <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              ${statement.aging.days1_30Usd.toLocaleString()}
            </p>
          </div>

          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800">
            <span className="text-slate-500 font-medium block">31 - 60 Days</span>
            <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-1">
              ${statement.aging.days31_60Usd.toLocaleString()}
            </p>
          </div>

          <div className="p-3 bg-accent-100 dark:bg-brand-900/40 rounded-xl border border-accent-100 dark:border-accent-700">
            <span className="text-slate-500 font-medium block">61 - 90 Days</span>
            <p className="text-lg font-extrabold text-accent-600 dark:text-accent-300 mt-1">
              ${statement.aging.days61_90Usd.toLocaleString()}
            </p>
          </div>

          <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800">
            <span className="text-slate-500 font-medium block">90+ Days</span>
            <p className="text-lg font-extrabold text-red-600 dark:text-red-400 mt-1">
              ${statement.aging.days90PlusUsd.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Transactions Ledger Table matching Section 7 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Financial Transactions</h3>
          <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold cursor-pointer hover:underline">
            View Full Ledger
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                <th className="p-3">Type</th>
                <th className="p-3">Document No.</th>
                <th className="p-3">Document Date</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Amount (USD)</th>
                <th className="p-3">Balance (USD)</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-semibold">{tx.type}</td>
                  <td className="p-3 font-mono text-blue-600 dark:text-blue-400 font-bold">{tx.documentNo}</td>
                  <td className="p-3 text-slate-500">{tx.documentDate}</td>
                  <td className="p-3 text-slate-500">{tx.dueDate}</td>
                  <td className="p-3 font-bold">
                    {tx.amountUsd < 0 ? (
                      <span className="text-emerald-600">-${Math.abs(tx.amountUsd).toLocaleString()}</span>
                    ) : (
                      <span>${tx.amountUsd.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="p-3 font-bold">${tx.balanceUsd.toLocaleString()}</td>
                  <td className="p-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        tx.status === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : tx.status === 'Open'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}
                    >
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
