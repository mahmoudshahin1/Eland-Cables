import React from 'react';
import { Building2, Wrench, CheckCircle2 } from 'lucide-react';
import { SelectionModeV2 } from '../types';
import { Badge } from '../../../ui/Badge';

interface SelectionModeCardV2Props {
  currentMode: SelectionModeV2 | null;
  onSelectMode: (mode: SelectionModeV2) => void;
}

export const SelectionModeCardV2: React.FC<SelectionModeCardV2Props> = ({
  currentMode,
  onSelectMode,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-display">
          Step 1: Select Cable Selection Method
        </h4>
        {currentMode && (
          <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />
            Mode Selected
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mode 1: Existing Customer Cable */}
        <div
          onClick={() => onSelectMode('CUSTOMER')}
          className={`p-4 sm:p-5 rounded-2xl border-2 cursor-pointer transition-all ${
            currentMode === 'CUSTOMER'
              ? 'bg-brand-50/90 dark:bg-brand-950/60 border-brand-500 shadow-sm ring-2 ring-brand-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-800'
          }`}
        >
          <div className="flex items-start space-x-3.5">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                currentMode === 'CUSTOMER'
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
                  EXISTING CUSTOMER CABLE
                </h3>
                {currentMode === 'CUSTOMER' && (
                  <Badge tone="brand">
                    Active Mode
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Filter approved master records by Customer Specification Standard (e.g.{' '}
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">N2XS2Y</span>,{' '}
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">NA2XS(F)2Y</span>,{' '}
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">N2XH</span>,{' '}
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">BS5467</span>).
              </p>
            </div>
          </div>
        </div>

        {/* Mode 2: Technical Configuration */}
        <div
          onClick={() => onSelectMode('TECHNICAL')}
          className={`p-4 sm:p-5 rounded-2xl border-2 cursor-pointer transition-all ${
            currentMode === 'TECHNICAL'
              ? 'bg-brand-50/90 dark:bg-brand-950/60 border-brand-500 shadow-sm ring-2 ring-brand-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-800'
          }`}
        >
          <div className="flex items-start space-x-3.5">
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                currentMode === 'TECHNICAL'
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Wrench className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
                  TECHNICAL CONFIGURATION
                </h3>
                {currentMode === 'TECHNICAL' && (
                  <Badge tone="brand">
                    Active Mode
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Filter approved master records directly by technical layers: Family → Voltage → Conductor → Core → Insulation → Screening → Armour → Sheath.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
