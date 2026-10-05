import React, { useState } from 'react';
import {
  CableRecordV2,
  SelectionStateV2,
  TechnicalValidationResultV2,
  TechnicalCableRequest,
} from '../types';
import {
  CheckCircle2,
  Send,
  Sliders,
  Scale,
  CircleDot,
  FileSpreadsheet,
  AlertTriangle,
  XCircle,
  Cpu,
  Layers,
  Sparkles,
  Info,
  ArrowRight,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { SendToTechnicalOfficeModalV2 } from './SendToTechnicalOfficeModalV2';
import { resolveConstructionLogic } from '../services/masterDataServiceV2';
import { Button } from '../../../ui/Button';
import { Badge, StatusBadge } from '../../../ui/Badge';

interface CableResultPanelV2Props {
  selections: SelectionStateV2;
  validationResult: TechnicalValidationResultV2;
  onProceedToCuttingLength: () => void;
  onResetOrModify: () => void;
  onRequestSubmitted?: (tcr: TechnicalCableRequest) => void;
  onSelectCable?: (cable: CableRecordV2) => void;
}

export const CableResultPanelV2: React.FC<CableResultPanelV2Props> = ({
  selections,
  validationResult,
  onProceedToCuttingLength,
  onResetOrModify,
  onRequestSubmitted,
  onSelectCable,
}) => {
  const [showTCRModal, setShowTCRModal] = useState(false);
  const [lastSubmittedTCR, setLastSubmittedTCR] = useState<TechnicalCableRequest | null>(null);

  const {
    status,
    isValid,
    errors,
    warnings,
    matchingCable,
    similarCables,
    summaryDescription,
    estimatedDiameterMm,
    estimatedWeightKgKm,
  } = validationResult;

  if (status === 'CONFIGURATION_REQUIRED') {
    return (
      <div className="p-5 bg-warning-50 dark:bg-amber-950/20 rounded-2xl border border-warning-200 dark:border-amber-800 space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-warning-100 dark:bg-amber-900/60 text-warning-700 dark:text-amber-300 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-display">
              Compatibility Configuration Required
            </h3>
            <p className="text-xs text-warning-800 dark:text-amber-200">
              {errors[0]?.message || 'A required parameter relationship is not configured. Compatibility is not assumed.'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Quotation cannot proceed until this parameter rule is configured in Technical Office governance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleTCRSubmitted = (tcr: TechnicalCableRequest) => {
    setLastSubmittedTCR(tcr);
    if (onRequestSubmitted) onRequestSubmitted(tcr);
  };

  // -------------------------------------------------------------
  // STATE 1: EXISTING APPROVED CABLE FOUND
  // -------------------------------------------------------------
  if ((status === 'EXISTING_APPROVED' || status === 'EXISTING_CABLE') && matchingCable) {
    return (
      <div className="p-6 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30 dark:from-slate-900 dark:via-emerald-950/20 dark:to-slate-900 rounded-2xl border-2 border-emerald-500/80 shadow-md space-y-5 animate-fade-in">
        {/* Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-200 dark:border-emerald-800/80">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-sm">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="success" className="font-extrabold uppercase">
                  State 1: Verified Master Match
                </Badge>
                <Badge tone="info" className="font-bold">
                  {matchingCable.approvedStatus || 'Released'}
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display tracking-tight mt-0.5">
                Existing Approved Cable Found
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {onSelectCable && (
              <Button
                variant="primary"
                size="md"
                onClick={() => onSelectCable(matchingCable)}
                trailingIcon={ArrowRight}
              >
                Select this cable
              </Button>
            )}
            {!onSelectCable && (
              <Button
                variant="primary"
                size="md"
                onClick={onProceedToCuttingLength}
                trailingIcon={ArrowRight}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Continue to Cutting Length
              </Button>
            )}
          </div>
        </div>

        {/* Master Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200/80 dark:border-slate-700 shadow-xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
              Material Number
            </span>
            <span className="text-sm font-bold text-brand-600 dark:text-brand-400 font-mono">
              {matchingCable.materialNumber}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200/80 dark:border-slate-700 shadow-xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
              Item Code
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono truncate block">
              {matchingCable.itemCode}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200/80 dark:border-slate-700 shadow-xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
              Outer Diameter (Ø)
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {matchingCable.outerDiameterMm} mm
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200/80 dark:border-slate-700 shadow-xs">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">
              Approx. Weight
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-white">
              {matchingCable.approxWeightKgKm} kg/km
            </span>
          </div>
        </div>

        {/* Full Cable Description */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-slate-700 space-y-2 shadow-xs">
          <span className="text-[11px] font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
            Approved Master Technical Specification
          </span>
          <p className="text-xs font-mono font-bold text-slate-900 dark:text-white leading-relaxed">
            {matchingCable.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700">
            <span>Customer Code: <strong className="text-slate-900 dark:text-white">{matchingCable.customerCode || 'Standard'}</strong></span>
            <span>•</span>
            <span>Standard: <strong className="text-slate-900 dark:text-white">{matchingCable.standard}</strong></span>
            <span>•</span>
            <span>Conductor: <strong className="text-slate-900 dark:text-white">{matchingCable.conductorMaterial} ({matchingCable.conductorSize})</strong></span>
            <span>•</span>
            <Badge tone="success">
              Logic: {resolveConstructionLogic(matchingCable.family, matchingCable.familySubType, matchingCable.voltageClass).constructionLogic}
            </Badge>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 2: VALID CONFIGURATION — NEW CABLE REQUIRED
  // -------------------------------------------------------------
  if (status === 'VALID_NEW_CABLE') {
    return (
      <div className="p-6 bg-gradient-to-br from-brand-50/60 via-indigo-50/40 to-white dark:from-slate-900 dark:via-brand-950/20 dark:to-slate-900 rounded-2xl border-2 border-brand-500/80 shadow-md space-y-5 animate-fade-in">
        {/* Status Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-brand-200 dark:border-brand-900/80">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-brand-500 text-white rounded-xl shadow-sm">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge tone="brand" className="font-extrabold uppercase">
                  State 2: Valid Technical Design
                </Badge>
                <Badge tone="warning" className="font-bold">
                  New Master Required
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display tracking-tight mt-0.5">
                Valid Configuration — No Existing Cable Master Record
              </h3>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-start sm:self-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={onResetOrModify}
            >
              Modify Configuration
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowTCRModal(true)}
              leadingIcon={Send}
            >
              Send to Technical Office
            </Button>
          </div>
        </div>

        {/* Informational Banner */}
        <div className="p-3.5 bg-brand-50 dark:bg-brand-950/40 rounded-xl border border-brand-200 dark:border-brand-800/80 flex items-start space-x-3 text-xs text-brand-900 dark:text-brand-200">
          <Info className="h-4.5 w-4.5 text-brand-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">
              Engineering parameters pass all IEC / BS validation checks.
            </p>
            <p className="text-[11px] text-brand-800/80 dark:text-brand-300/80">
              Valid engineering configuration — Cable Master record not found. No cable code, item code, or material number is generated. Submit to Technical Office with the full requested configuration.
            </p>
          </div>
        </div>

        {/* Technical Specification Summary */}
        <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 shadow-xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                Generated Engineering Construction
              </span>
              <Badge tone="brand">
                {resolveConstructionLogic(selections.family, selections.familySubType, selections.voltageClass).constructionLogic}
              </Badge>
            </div>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Estimated Ø {estimatedDiameterMm} mm • ~{estimatedWeightKgKm} kg/km
            </span>
          </div>
          <p className="text-xs font-mono font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 leading-relaxed">
            {summaryDescription}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold">Family & Voltage:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{selections.family || 'UGC'} • {selections.voltage}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold">Conductor:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{selections.conductorMaterial} {selections.conductorSize}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold">Screen & Armour:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{selections.screenType || 'None'} / {selections.armour || 'None'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold">Sheathing & CPR:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{selections.sheathing} ({selections.sheathingColor || 'Black'})</span>
            </div>
          </div>
        </div>

        {/* Send to Technical Office Modal */}
        <SendToTechnicalOfficeModalV2
          isOpen={showTCRModal}
          onClose={() => setShowTCRModal(false)}
          selections={selections}
          summaryDescription={summaryDescription}
          estimatedDiameterMm={estimatedDiameterMm}
          estimatedWeightKgKm={estimatedWeightKgKm}
          onRequestSubmitted={handleTCRSubmitted}
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 3: INVALID CONFIGURATION
  // -------------------------------------------------------------
  return (
    <div className="p-6 bg-gradient-to-br from-error-50 via-rose-50/30 to-white dark:from-slate-900 dark:via-red-950/20 dark:to-slate-900 rounded-2xl border-2 border-error-500/80 shadow-md space-y-4 animate-fade-in">
      {/* Status Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-error-200 dark:border-red-900/80">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-error-500 text-white rounded-xl shadow-sm">
            <XCircle className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Badge tone="error" className="font-extrabold uppercase">
                State 3: Conflict Detected
              </Badge>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display tracking-tight mt-0.5">
              Invalid Technical Configuration
            </h3>
          </div>
        </div>

        <Button
          variant="accent"
          size="sm"
          onClick={onResetOrModify}
          leadingIcon={Sliders}
          className="self-start sm:self-auto"
        >
          Correct Configuration
        </Button>
      </div>

      {/* Validation Error List */}
      <div className="space-y-2.5">
        <span className="text-xs font-bold text-error-700 dark:text-red-300 uppercase tracking-wider block">
          Electrical & Standard Violations ({errors.length})
        </span>

        <div className="space-y-2">
          {errors.map((err, idx) => (
            <div
              key={idx}
              className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-error-200 dark:border-red-900/60 flex items-start space-x-3 text-xs text-error-900 dark:text-red-200 shadow-xs"
            >
              <AlertTriangle className="h-4 w-4 text-error-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block text-slate-900 dark:text-white">
                  Parameter: <code className="text-error-600 dark:text-red-400 font-mono bg-error-50 dark:bg-red-950/60 px-1.5 py-0.5 rounded">{err.field}</code>
                  {err.conflictingField && (
                    <span> conflicts with <code className="text-error-600 dark:text-red-400 font-mono bg-error-50 dark:bg-red-950/60 px-1.5 py-0.5 rounded">{err.conflictingField}</code></span>
                  )}
                </span>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                  {err.message}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
