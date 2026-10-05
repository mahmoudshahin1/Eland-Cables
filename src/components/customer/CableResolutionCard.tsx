import React, { useState } from 'react';
import { ResolvedCableStructure, CustomerPortalTab } from '../../types';
import {
  CheckCircle2,
  Copy,
  Check,
  FileText,
  Boxes,
  Layers,
  ArrowRight,
  Code,
  Download,
  Share2,
  Database,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Table,
} from 'lucide-react';

interface CableResolutionCardProps {
  resolvedCable: ResolvedCableStructure;
  onNavigateTab: (tab: CustomerPortalTab) => void;
  onSelectAnotherCable?: () => void;
}

export const CableResolutionCard: React.FC<CableResolutionCardProps> = ({
  resolvedCable,
  onNavigateTab,
  onSelectAnotherCable,
}) => {
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [showJsonModal, setShowJsonModal] = useState<boolean>(false);

  // Formatted Resolution Block corresponding to exact User Prompt requirements
  const formattedResolutionBlock = `Material Number: ${resolvedCable.cableMaterialNumber}
Item Code: ${resolvedCable.itemCode}

${resolvedCable.conductor === 'Copper' ? 'Cu' : 'Al'} / ${resolvedCable.insulation} / ${resolvedCable.sheathing}
${resolvedCable.voltage}
${resolvedCable.core.replace(' Core', 'X')}${resolvedCable.conductorCSA.replace(' mm²', '')}${resolvedCable.screenCSA && resolvedCable.screenCSA !== 'None' ? '/' + resolvedCable.screenCSA.replace(' mm²', '') : ''} mm²
${resolvedCable.standard}

Diameter: ${resolvedCable.cableDiameter.toFixed(2)} mm
Weight: ${resolvedCable.totalCableWeight.toLocaleString()} kg/km`;

  const handleCopyFormatted = () => {
    navigator.clipboard.writeText(formattedResolutionBlock);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(resolvedCable, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(resolvedCable, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `Cable_${resolvedCable.cableMaterialNumber}_${resolvedCable.itemCode}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // The 18 mandated Cable Resolution properties
  const technicalSpecs = [
    { label: 'Customer Code', value: resolvedCable.customerCode, highlight: true },
    { label: 'Cable Family', value: resolvedCable.cableFamily, highlight: false },
    { label: 'Voltage', value: resolvedCable.voltage, highlight: true },
    { label: 'Conductor', value: resolvedCable.conductor, highlight: false },
    { label: 'Conductor Class', value: resolvedCable.conductorClass, highlight: false },
    { label: 'Conductor CSA', value: resolvedCable.conductorCSA, highlight: true },
    { label: 'Core', value: resolvedCable.core, highlight: false },
    { label: 'Insulation', value: resolvedCable.insulation, highlight: false },
    { label: 'Screen', value: resolvedCable.screen, highlight: false },
    { label: 'Armour', value: resolvedCable.armour, highlight: false },
    { label: 'Sheathing', value: resolvedCable.sheathing, highlight: false },
    { label: 'Sheathing Color', value: resolvedCable.sheathingColor, highlight: false },
    { label: 'Standard', value: resolvedCable.standard, highlight: true },
    { label: 'Cable Material Number', value: resolvedCable.cableMaterialNumber, highlight: true, mono: true },
    { label: 'Item Code', value: resolvedCable.itemCode, highlight: true, mono: true },
    { label: 'Cable Description', value: resolvedCable.cableDescription, highlight: false, fullWidth: true },
    { label: 'Cable Diameter', value: `${resolvedCable.cableDiameter.toFixed(2)} mm`, highlight: true },
    { label: 'Total Cable Weight', value: `${resolvedCable.totalCableWeight.toLocaleString()} kg/km`, highlight: true },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-500/60 dark:border-emerald-700/80 shadow-xl overflow-hidden transition-all">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-emerald-900 text-white p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-white/20 text-white shadow-inner backdrop-blur-md">
              <CheckCircle2 className="h-6 w-6 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest bg-emerald-950/60 text-emerald-200 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                  Master Catalog Match
                </span>
                <span className="text-xs text-emerald-200 font-mono">
                  {resolvedCable.customerCode}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight mt-0.5">
                Cable Successfully Resolved
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowJsonModal(!showJsonModal)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-950 text-emerald-100 border border-emerald-400/40 flex items-center gap-1.5 transition-colors"
            >
              <Code className="h-3.5 w-3.5" />
              <span>{showJsonModal ? 'Hide JSON' : 'Structured JSON'}</span>
            </button>

            {onSelectAnotherCable && (
              <button
                onClick={onSelectAnotherCable}
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
              >
                Change Selection
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6 space-y-6">
        {/* EXACT PROMPT FORMATTED BLOCK */}
        <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 border border-slate-800 relative shadow-inner">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                Resolved Engineering Spec Sheet
              </span>
            </div>
            <button
              onClick={handleCopyFormatted}
              className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
              title="Copy formatted block"
            >
              {copiedText ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Spec</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-sm leading-relaxed">
            <div className="space-y-1">
              <p>
                <span className="text-slate-400">Material Number: </span>
                <span className="text-amber-400 font-bold">{resolvedCable.cableMaterialNumber}</span>
              </p>
              <p>
                <span className="text-slate-400">Item Code: </span>
                <span className="text-emerald-400 font-bold">{resolvedCable.itemCode}</span>
              </p>
              <div className="pt-2 text-white font-semibold">
                <p>{resolvedCable.conductor === 'Copper' ? 'Cu' : 'Al'} / {resolvedCable.insulation} / {resolvedCable.sheathing}</p>
                <p>{resolvedCable.voltage}</p>
                <p>{resolvedCable.core.replace(' Core', 'X')}{resolvedCable.conductorCSA.replace(' mm²', '')}{resolvedCable.screenCSA && resolvedCable.screenCSA !== 'None' ? '/' + resolvedCable.screenCSA.replace(' mm²', '') : ''} mm²</p>
                <p className="text-blue-400">{resolvedCable.standard}</p>
              </div>
            </div>

            <div className="sm:border-l sm:border-slate-800 sm:pl-4 flex flex-col justify-end space-y-2">
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Diameter:</span>
                  <span className="text-white font-bold">{resolvedCable.cableDiameter.toFixed(2)} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Weight:</span>
                  <span className="text-white font-bold">{resolvedCable.totalCableWeight.toLocaleString()} kg/km</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 font-sans italic truncate">
                {resolvedCable.cableDescription}
              </p>
            </div>
          </div>
        </div>

        {/* JSON Structured Object View (Collapsible) */}
        {showJsonModal && (
          <div className="bg-slate-950 rounded-2xl p-4 border border-blue-900/60 space-y-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-blue-400 flex items-center gap-1.5">
                <Code className="h-3.5 w-3.5" />
                Structured Object Payload (Ready for Inquiry, TDS & D365 ERP Integration)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyJson}
                  className="text-[11px] font-bold px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
                >
                  {copiedJson ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedJson ? 'Copied' : 'Copy JSON'}
                </button>
                <button
                  onClick={handleDownloadJson}
                  className="text-[11px] font-bold px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  Download .json
                </button>
              </div>
            </div>
            <pre className="text-[11px] font-mono text-emerald-400 bg-slate-900 p-3 rounded-xl overflow-x-auto max-h-60 border border-slate-800 leading-tight">
              {JSON.stringify(resolvedCable, null, 2)}
            </pre>
          </div>
        )}

        {/* 18 MANDATED TECHNICAL CONSTRUCTION PARAMETERS GRID */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Table className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Resolved Technical Construction Parameters (18 Attributes)</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">Fully Verified Against Energya Master Catalog</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {technicalSpecs.map((spec, index) => (
              <div
                key={index}
                className={`p-3 rounded-xl border ${
                  spec.fullWidth ? 'col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-6' : ''
                } ${
                  spec.highlight
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  {spec.label}
                </span>
                <span
                  className={`text-xs block mt-1 break-words font-semibold ${
                    spec.mono ? 'font-mono' : ''
                  } ${
                    spec.highlight
                      ? 'text-emerald-900 dark:text-emerald-200 font-extrabold'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {spec.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* DOWNSTREAM PROCESS ACTIONS */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Downstream Workflows & Integration
            </span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Data Pipeline Ready
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              onClick={() => onNavigateTab('drum_optimizer')}
              className="p-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex flex-col items-center justify-center text-center gap-1"
            >
              <div className="flex items-center gap-1">
                <span>Drum Optimization</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] opacity-80 font-normal">Ø {resolvedCable.cableDiameter.toFixed(1)}mm • {resolvedCable.totalCableWeight}kg/km</span>
            </button>

            <button
              onClick={() => onNavigateTab('price_estimation')}
              className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex flex-col items-center justify-center text-center gap-1"
            >
              <div className="flex items-center gap-1">
                <span>Pricing & Quotation</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] opacity-80 font-normal">Instant cost estimate</span>
            </button>

            <button
              onClick={() => onNavigateTab('tds_library')}
              className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex flex-col items-center justify-center text-center gap-1"
            >
              <div className="flex items-center gap-1">
                <span>Technical TDS Sheet</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
              <span className="text-[10px] opacity-80 font-normal">Standard {resolvedCable.standard}</span>
            </button>

            <button
              onClick={() => onNavigateTab('statement')}
              className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex flex-col items-center justify-center text-center gap-1 border border-slate-700"
            >
              <div className="flex items-center gap-1">
                <span>D365 F&O Integration</span>
                <Database className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <span className="text-[10px] text-slate-300 font-mono font-normal">Item: {resolvedCable.itemCode}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
