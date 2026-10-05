import React from 'react';
import { Factory, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { INITIAL_PRODUCTION_ORDERS } from '../../data/mockData';
import { CUSTOMER_HOME_PATH } from '../../app/shellRoutes';
import { CustomerPageHero } from './CustomerPageHero';

export const ProductionTracker: React.FC = () => {
  const orders = INITIAL_PRODUCTION_ORDERS;
  const stages = ['Drawing', 'Stranding', 'Insulation', 'Armoring', 'Sheathing', 'Testing', 'Packing'];

  return (
    <div className="space-y-6">
      <CustomerPageHero
        breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Production' }]}
        title="Production"
        subtitle="Live feed synced from Advaris Cable MES Engine across 7 core production stages."
      />

      <div className="space-y-4">
        {orders.map((po) => {
          const activeStageIdx = stages.indexOf(po.currentStage);
          return (
            <div
              key={po.id}
              className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-lg space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm font-extrabold text-blue-600 dark:text-blue-400">
                      {po.orderNo}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold">
                      {po.status}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-1 break-all">
                    {po.cableCode}
                  </p>
                </div>
                <div className="text-left sm:text-right text-xs">
                  <span className="text-slate-500">Order Qty:</span>{' '}
                  <strong className="text-slate-900 dark:text-white font-bold">{po.orderQtyM.toLocaleString()} m</strong>
                  <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                    Est. Completion: {po.estimatedCompletionDate}
                  </p>
                </div>
              </div>

              {/* Progress bar & MES stage pipeline */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                  <span>Manufacturing Flow Stage</span>
                  <span className="text-blue-600 dark:text-blue-400">{po.progressPercent}% Completed</span>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {stages.map((st, idx) => {
                    const isDone = idx < activeStageIdx;
                    const isCurrent = idx === activeStageIdx;
                    return (
                      <div key={st} className="space-y-1">
                        <div
                          className={`h-2.5 rounded-full transition-all ${
                            isDone
                              ? 'bg-emerald-500'
                              : isCurrent
                              ? 'bg-blue-600 animate-pulse'
                              : 'bg-slate-200 dark:bg-slate-800'
                          }`}
                        />
                        <span
                          className={`text-[10px] block font-medium ${
                            isCurrent
                              ? 'text-blue-600 dark:text-blue-400 font-bold'
                              : isDone
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {st}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
