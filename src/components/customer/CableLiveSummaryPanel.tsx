import React from 'react';
import { CableConfiguration, ParameterApplicability } from '../../services/cableSelectionService';
import { ValidationResult } from '../../services/cableConstraintEngine';
import { Sliders, Zap, ShieldCheck, CheckCircle2, Filter, AlertTriangle, Check, Layers, Cpu, Compass } from 'lucide-react';

interface CableLiveSummaryPanelProps {
  config: CableConfiguration;
  validationResult: ValidationResult;
  onResetFilters: () => void;
  onSelectFamily?: (family: string) => void;
}

export const CableLiveSummaryPanel: React.FC<CableLiveSummaryPanelProps> = ({
  config,
  validationResult,
  onResetFilters,
}) => {
  const matchBadge = () => {
    if (validationResult.status === 'RESOLVED_SINGLE') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Single Match Resolved
        </span>
      );
    }
    if (validationResult.status === 'MATCHES_MULTIPLE') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
          <Filter className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
          {validationResult.matchCount} Matches Available
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
        <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        No Master Match
      </span>
    );
  };

  const summaryItems = [
    { label: 'Customer Code', value: config.customerCode || 'None (Technical)', isKey: true },
    { label: 'Family', value: config.family || 'Not Selected', isKey: true },
    { label: 'Voltage', value: config.voltage || 'Not Selected', isKey: true },
    { label: 'Conductor', value: config.conductor ? `${config.conductor}${config.conductorClass ? ` (${config.conductorClass})` : ''}` : 'Not Selected' },
    { label: 'Core & Size', value: config.conductorSize ? `${config.core || '1 Core'} × ${config.conductorSize}` : (config.core || 'Not Selected'), isKey: true },
    { label: 'Insulation', value: config.insulation || '—' },
    { label: 'Outer Semi-Con', value: config.outerSemiConductor || '—' },
    { label: 'Screen', value: config.screen && config.screen !== 'No Screen' ? `${config.screen}${config.screenCSA && config.screenCSA !== 'None' ? ` (${config.screenCSA})` : ''}` : (config.screen || '—') },
    { label: 'Armour', value: config.armour || '—' },
    { label: 'Sheath', value: config.sheathing ? `${config.sheathing}${config.sheathingColor ? ` • ${config.sheathingColor}` : ''}` : '—' },
    { label: 'Standard', value: config.standard || '—' },
    { label: 'Certifications', value: config.cpr === 'Yes' ? `CPR (${config.cprClass || 'Cca'})` : (config.cpr || '—') },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span>Live Configuration Summary</span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Synchronized Realtime" />
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Synchronized parameters actively evaluated by Constraint Engine
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {matchBadge()}
        </div>
      </div>

      {/* Grid of Active Configuration Parameters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 pt-3">
        {summaryItems.map((item, idx) => (
          <div
            key={idx}
            className={`p-2 rounded-xl text-left border ${
              item.isKey
                ? 'bg-blue-50/60 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/80'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800'
            }`}
          >
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">
              {item.label}
            </span>
            <span className={`text-xs font-semibold block truncate mt-0.5 ${
              item.isKey
                ? 'text-blue-900 dark:text-blue-200 font-extrabold'
                : 'text-slate-800 dark:text-slate-200'
            }`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
