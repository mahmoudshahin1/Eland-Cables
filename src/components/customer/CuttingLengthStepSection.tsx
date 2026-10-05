import React, { useState, useEffect, useMemo } from 'react';
import { ResolvedCableStructure, CustomerPortalTab, FinalCableProductionResult } from '../../types';
import {
  validateCuttingLength,
  buildFinalCableProductionResult,
} from '../../services/cuttingLengthValidationService';
import {
  Ruler,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowDown,
  ArrowRight,
  Box,
  Truck,
  Layers,
  FileCheck2,
  Send,
  HelpCircle,
  RefreshCw,
  Scale,
  Sparkles,
  Info,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface CuttingLengthStepSectionProps {
  resolvedCable: ResolvedCableStructure;
  initialCuttingLength?: number;
  onNavigateTab: (tab: CustomerPortalTab) => void;
  onUpdateProductionResult?: (result: FinalCableProductionResult) => void;
}

export const CuttingLengthStepSection: React.FC<CuttingLengthStepSectionProps> = ({
  resolvedCable,
  initialCuttingLength = 500,
  onNavigateTab,
  onUpdateProductionResult,
}) => {
  const [lengthInput, setLengthInput] = useState<string>(String(initialCuttingLength));

  // Compute validation and final result in real-time
  const validation = useMemo(() => {
    return validateCuttingLength(lengthInput, resolvedCable);
  }, [lengthInput, resolvedCable]);

  const finalProductionResult = useMemo(() => {
    return buildFinalCableProductionResult(resolvedCable, lengthInput);
  }, [resolvedCable, lengthInput]);

  useEffect(() => {
    if (onUpdateProductionResult) {
      onUpdateProductionResult(finalProductionResult);
    }
  }, [finalProductionResult, onUpdateProductionResult]);

  const presetLengths = [100, 250, 500, 1000, 1500, 2000];

  const handlePresetClick = (len: number) => {
    setLengthInput(String(len));
  };

  // Status Badge for Final Result
  const renderValidationStatusBadge = () => {
    if (validation.validationStatus === 'VALID') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Production Verified (VALID)
        </span>
      );
    }
    if (validation.validationStatus === 'WARNING') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Conditional Approval (WARNING)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
        <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
        Non-Compliant Length (INVALID)
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden transition-all space-y-6 p-5 sm:p-6">
      
      {/* ------------------------------------------------------------- */}
      {/* STEP FLOW DIAGRAM (Prompt 9 Requirement)                       */}
      {/* Resolved Cable -> Cutting Length -> Production Validation -> Ready for Inquiry */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 text-center sm:text-left">
          Production & Inquiry Lifecycle Workflow
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-1 items-center">
          {/* Step 1: Resolved Cable */}
          <div className="flex items-center justify-between sm:justify-start gap-2 p-2.5 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 leading-tight">Step 1</div>
                <div className="text-xs font-extrabold">Resolved Cable</div>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-emerald-200/80 dark:bg-emerald-900 px-1.5 py-0.5 rounded text-emerald-800 dark:text-emerald-100">
              {resolvedCable.cableMaterialNumber}
            </span>
          </div>

          <div className="hidden sm:flex justify-center text-slate-400">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* Step 2: Cutting Length */}
          <div className="flex items-center justify-between sm:justify-start gap-2 p-2.5 rounded-xl bg-blue-100/70 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200">
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <div className="text-[10px] uppercase font-bold text-blue-700 dark:text-blue-400 leading-tight">Step 2</div>
                <div className="text-xs font-extrabold">Cutting Length</div>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-blue-200/80 dark:bg-blue-900 px-1.5 py-0.5 rounded text-blue-800 dark:text-blue-100">
              {validation.cuttingLength.toLocaleString()} m
            </span>
          </div>

          <div className="hidden sm:flex justify-center text-slate-400">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* Step 3: Production Validation */}
          <div className={`flex items-center justify-between sm:justify-start gap-2 p-2.5 rounded-xl border ${
            validation.validationStatus === 'VALID'
              ? 'bg-emerald-100/70 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : validation.validationStatus === 'WARNING'
              ? 'bg-amber-100/70 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : 'bg-rose-100/70 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}>
            <div className="flex items-center gap-2">
              {validation.validationStatus === 'VALID' ? (
                <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <div>
                <div className="text-[10px] uppercase font-bold leading-tight opacity-80">Step 3</div>
                <div className="text-xs font-extrabold">Production Validation</div>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/60 dark:bg-black/40">
              {validation.validationStatus}
            </span>
          </div>

          <div className="hidden sm:flex justify-center text-slate-400">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* Step 4: Ready for Inquiry */}
          <div className={`flex items-center justify-between sm:justify-start gap-2 p-2.5 rounded-xl border ${
            validation.readyForInquiry
              ? 'bg-indigo-100/70 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
          }`}>
            <div className="flex items-center gap-2">
              <FileCheck2 className={`h-4 w-4 shrink-0 ${validation.readyForInquiry ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
              <div>
                <div className="text-[10px] uppercase font-bold leading-tight opacity-80">Step 4</div>
                <div className="text-xs font-extrabold">Ready for Inquiry</div>
              </div>
            </div>
            {validation.readyForInquiry ? (
              <span className="text-[10px] font-extrabold uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded animate-pulse">
                Ready
              </span>
            ) : (
              <span className="text-[10px] text-slate-500">Pending</span>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CUTTING LENGTH INPUT SECTION                                  */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Input Panel (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Ruler className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>Cutting Length</span>
                <span className="text-rose-500 text-xs font-bold" title="Required Field">*</span>
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Specify the required continuous cut length in meters (decimal supported).
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">
                Unit
              </span>
              <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                Meter (m)
              </span>
            </div>
          </div>

          {/* Input field with unit badge */}
          <div className="relative">
            <input
              type="number"
              step="any"
              min={validation.minProductionLengthM}
              max={validation.maxContinuousLengthM}
              value={lengthInput}
              onChange={(e) => setLengthInput(e.target.value)}
              placeholder="e.g. 500.00"
              className={`w-full text-lg font-bold font-mono pl-4 pr-16 py-3 rounded-2xl bg-white dark:bg-slate-800 border-2 transition-all shadow-sm focus:outline-none focus:ring-4 ${
                validation.validationStatus === 'VALID'
                  ? 'border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/20 text-slate-900 dark:text-white'
                  : validation.validationStatus === 'WARNING'
                  ? 'border-amber-400 dark:border-amber-600 focus:border-brand-500 focus:ring-brand-500/20 text-amber-900 dark:text-amber-100'
                  : 'border-rose-400 dark:border-rose-600 focus:border-rose-500 focus:ring-rose-500/20 text-rose-900 dark:text-rose-100'
              }`}
            />
            <div className="absolute right-3 top-3 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-mono font-bold">
              meters
            </div>
          </div>

          {/* Preset Quick-Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mr-1">
              Presets:
            </span>
            {presetLengths.map((len) => (
              <button
                key={len}
                type="button"
                onClick={() => handlePresetClick(len)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                  parseFloat(lengthInput) === len
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {len.toLocaleString()} m
              </button>
            ))}
          </div>

          {/* Production Boundaries Badges */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Min Configurable Production Run
              </span>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 font-mono mt-0.5 block">
                {validation.minProductionLengthM.toFixed(1)} m
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Max Continuous Line Run
              </span>
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 font-mono mt-0.5 block">
                {validation.maxContinuousLengthM.toLocaleString()} m
              </span>
            </div>
          </div>
        </div>

        {/* Right Production & Drum Validation Result Panel (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Production & Packaging Check
              </span>
            </div>
            {renderValidationStatusBadge()}
          </div>

          {/* Validation Feedback Messages */}
          {validation.errors.length > 0 && (
            <div className="p-3 rounded-xl bg-rose-100/80 dark:bg-rose-950/70 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-1">
              {validation.errors.map((err, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{err}</span>
                </div>
              ))}
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-100/80 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1">
              {validation.warnings.map((warn, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          )}

          {validation.isValid && validation.warnings.length === 0 && (
            <div className="p-3 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="font-medium">
                Cutting length complies with continuous extrusion, spark-test limits, and customer packaging rules.
              </span>
            </div>
          )}

          {/* Drum & Weight Summary */}
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">Recommended Drum</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                {validation.recommendedDrum}
              </span>
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                Cap: ~{validation.drumCapacityM.toLocaleString()} m
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">Total Net Cable Weight</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                {validation.totalCableWeightKg.toLocaleString()} kg
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                ({(validation.totalCableWeightKg / 1000).toFixed(3)} Tonnes)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FINAL RESULT CARD (Prompt 9 Mandated 7 Properties)             */}
      {/* Show:                                                         */}
      {/* Cable Material                                                */}
      {/* Item Code                                                     */}
      {/* Cable Description                                             */}
      {/* Cutting Length                                                */}
      {/* Cable Diameter                                                */}
      {/* Cable Weight                                                  */}
      {/* Validation Status                                             */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400">
                Final Resolved Cable & Production Specification
              </span>
              <h3 className="text-lg font-extrabold text-white tracking-tight">
                Consolidated Production Record
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {renderValidationStatusBadge()}
          </div>
        </div>

        {/* 7 MANDATED FIELDS GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 font-sans">
          
          {/* 1. Cable Material */}
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Cable Material
            </span>
            <span className="text-xs font-mono font-extrabold text-amber-400 block mt-1 truncate">
              {finalProductionResult.cableMaterial}
            </span>
          </div>

          {/* 2. Item Code */}
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Item Code
            </span>
            <span className="text-xs font-mono font-extrabold text-emerald-400 block mt-1 truncate">
              {finalProductionResult.itemCode}
            </span>
          </div>

          {/* 3. Cable Description */}
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 col-span-2 sm:col-span-1 lg:col-span-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Cable Description
            </span>
            <span className="text-xs font-semibold text-white block mt-1 truncate" title={finalProductionResult.cableDescription}>
              {finalProductionResult.cableDescription}
            </span>
          </div>

          {/* 4. Cutting Length */}
          <div className="p-3 rounded-xl bg-blue-950/80 border border-blue-700/80">
            <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider block">
              Cutting Length
            </span>
            <span className="text-xs font-mono font-extrabold text-blue-300 block mt-1">
              {finalProductionResult.cuttingLength.toLocaleString()} m
            </span>
          </div>

          {/* 5. Cable Diameter */}
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Cable Diameter
            </span>
            <span className="text-xs font-mono font-bold text-slate-200 block mt-1">
              Ø {finalProductionResult.cableDiameter.toFixed(2)} mm
            </span>
          </div>

          {/* 6. Cable Weight */}
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Cable Weight
            </span>
            <span className="text-xs font-mono font-bold text-slate-200 block mt-1">
              {finalProductionResult.cableWeight.toLocaleString()} kg/km
            </span>
          </div>
        </div>

        {/* 7. Validation Status Banner */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800/80">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Validation Status:</span>
            <span className={`font-bold font-mono ${
              finalProductionResult.validationStatus === 'VALID'
                ? 'text-emerald-400'
                : finalProductionResult.validationStatus === 'WARNING'
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}>
              {finalProductionResult.validationStatus} — {finalProductionResult.statusDetails}
            </span>
          </div>

          {/* Downstream Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab('price_estimation')}
              disabled={!finalProductionResult.readyForInquiry}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                finalProductionResult.readyForInquiry
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg hover:shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              <span>Instant Quotation & Inquiry</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => onNavigateTab('drum_optimizer')}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all flex items-center gap-1.5"
            >
              <Box className="h-3.5 w-3.5" />
              <span>Optimize Drums</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
