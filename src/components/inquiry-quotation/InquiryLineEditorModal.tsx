import React, { useMemo, useState } from 'react';
import {
  Cable,
  ChevronLeft,
  ChevronRight,
  Layers,
  Ruler,
  Scale,
  Settings2,
  ShoppingBag,
  X,
} from 'lucide-react';
import { CommercialInquiryDto, CommercialInquiryLineDto, resolveInquiryLineTotalLengthMeters } from '../../services/commercialInquiryApiService';
import { validateCuttingLength } from '../../domain/drumPlanService';
import { CableConfiguratorV2 } from '../cable-configurator/v2/components/CableConfiguratorV2';

export type InquiryLineEditorStep = 'cable' | 'technical' | 'length' | 'cutting' | 'drum' | 'commercial';

const STEPS: { id: InquiryLineEditorStep; label: string; icon: React.ElementType }[] = [
  { id: 'cable', label: 'Cable', icon: Cable },
  { id: 'technical', label: 'Technical', icon: Settings2 },
  { id: 'length', label: 'Length', icon: Scale },
  { id: 'cutting', label: 'Cutting', icon: Ruler },
  { id: 'drum', label: 'Drum', icon: Layers },
  { id: 'commercial', label: 'Commercial', icon: ShoppingBag },
];

export interface InquiryLineEditorFormState {
  requestedQuantity: string;
  requestedLengthMeters: string;
  cuttingLengthMeters: string;
  drumType: string;
  cableDescription: string;
}

interface InquiryLineEditorModalProps {
  line: CommercialInquiryLineDto;
  inquiry: CommercialInquiryDto;
  form: InquiryLineEditorFormState;
  isEditable: boolean;
  isV2Inquiry: boolean;
  cuttingError: string | null;
  onChange: (patch: Partial<InquiryLineEditorFormState>) => void;
  onClose: () => void;
  onSave: () => void;
  onOpenSchedule: () => void;
  onOpenCableSearch: () => void;
  onClearCable?: () => void;
  onV2ConfigurationSaved?: () => void;
  initialStep?: InquiryLineEditorStep;
}

export const CLEAR_SELECTED_CABLE_LABEL = 'Clear selected cable';
export const REPLACE_CABLE_LABEL = 'Replace cable';
export const OPEN_CABLE_SEARCH_LABEL = 'Open Cable Search';
export const OPEN_CUTTING_DRUM_SELECTION_LABEL = 'Open Cutting Length and Drum Selection';

function positiveNumber(value: number | string | null | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const InquiryLineEditorModal: React.FC<InquiryLineEditorModalProps> = ({
  line,
  inquiry,
  form,
  isEditable,
  isV2Inquiry,
  cuttingError,
  onChange,
  onClose,
  onSave,
  onOpenSchedule,
  onOpenCableSearch,
  onClearCable,
  onV2ConfigurationSaved,
  initialStep = 'cable',
}) => {
  const [step, setStep] = useState<InquiryLineEditorStep>(initialStep);
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const requestedQuantity = positiveNumber(form.requestedQuantity);
  const cuttingLength = positiveNumber(form.cuttingLengthMeters);
  const isTotalDerived =
    (requestedQuantity != null && cuttingLength != null) || Boolean(line.drumSchedule);
  const totalLengthValue = isTotalDerived
    ? String(
        resolveInquiryLineTotalLengthMeters({
          requestedQuantity: requestedQuantity ?? 1,
          requestedLengthMeters: form.requestedLengthMeters,
          cuttingLengthMeters: cuttingLength,
          drumSchedule: line.drumSchedule,
        })
      )
    : form.requestedLengthMeters;

  const localCuttingCheck = useMemo(() => {
    const lengthM = resolveInquiryLineTotalLengthMeters({
      requestedQuantity: requestedQuantity ?? 1,
      requestedLengthMeters: form.requestedLengthMeters || line.requestedLengthMeters,
      cuttingLengthMeters: cuttingLength,
    });
    if (lengthM <= 0) return 'Total length must be greater than zero.';
    if (cuttingLength) {
      const check = validateCuttingLength(lengthM, cuttingLength);
      if (!check.valid) return check.message || 'Invalid cutting length';
    }
    return null;
  }, [requestedQuantity, cuttingLength, form.requestedLengthMeters, line.requestedLengthMeters]);

  const openCuttingDrumSelection = () => {
    if (!isEditable) return;
    onOpenSchedule();
  };

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next?.id === 'cutting' && isEditable) {
      openCuttingDrumSelection();
      return;
    }
    if (next) setStep(next.id);
  };
  const goPrev = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-brand-800">Edit Cable Line #{line.lineNumber}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{line.materialNumber || 'Unmapped cable'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-[640px]">
            {STEPS.map((s, index) => {
              const active = s.id === step;
              const done = index < stepIndex;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (s.id === 'cutting' && isEditable) {
                      openCuttingDrumSelection();
                      return;
                    }
                    setStep(s.id);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : done
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-xs space-y-4">
          {step === 'cable' && (
            <div className="space-y-3">
              <p className="text-slate-600">
                Select or confirm the governed cable material for this inquiry line.
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1">
                <p className="font-mono font-bold text-slate-800">{line.materialNumber || '—'}</p>
                <p className="text-slate-700">{line.cableDescription}</p>
              </div>
              {isEditable && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenCableSearch}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-bold hover:bg-blue-100"
                  >
                    {line.materialNumber ? REPLACE_CABLE_LABEL : OPEN_CABLE_SEARCH_LABEL}
                  </button>
                  {line.materialNumber && (
                    <button
                      type="button"
                      onClick={onOpenCableSearch}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-50"
                    >
                      {OPEN_CABLE_SEARCH_LABEL}
                    </button>
                  )}
                  {line.materialNumber && onClearCable && (
                    <button
                      type="button"
                      onClick={onClearCable}
                      className="px-3 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 font-bold hover:bg-amber-100"
                    >
                      {CLEAR_SELECTED_CABLE_LABEL}
                    </button>
                  )}
                </div>
              )}
              <p className="text-[11px] text-slate-500">
                Clears or replaces this inquiry line only. Cable Master is not deleted. Standard Search and Advanced
                Search are inside Cable Search.
              </p>
            </div>
          )}

          {step === 'technical' && (
            <div className="space-y-3">
              <p className="text-slate-600">
                V2 configuration validation runs inside the inquiry line workflow — not as a separate app journey.
              </p>
              {isV2Inquiry ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <CableConfiguratorV2
                    v2InquiryId={inquiry.id}
                    v2LineId={line.id}
                    onConfigurationSaved={onV2ConfigurationSaved}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  Legacy inquiry line — technical parameters are inherited from Cable Master mapping.
                  Status: <span className="font-bold">{line.cableAuthorityStatus || '—'}</span>
                </div>
              )}
            </div>
          )}

          {step === 'length' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Drums (Qty)</label>
                <input
                  type="number"
                  min="1"
                  disabled={!isEditable}
                  value={form.requestedQuantity}
                  onChange={(e) => onChange({ requestedQuantity: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Total Length (m) {isTotalDerived ? '(cutting length × number of drums)' : ''}
                </label>
                <input
                  type="number"
                  readOnly={isTotalDerived}
                  disabled={!isEditable}
                  value={totalLengthValue}
                  onChange={(e) => onChange({ requestedLengthMeters: e.target.value })}
                  className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-slate-800 outline-none ${
                    isTotalDerived ? 'bg-slate-50 font-bold' : 'bg-white focus:border-blue-500'
                  }`}
                />
              </div>
            </div>
          )}

          {step === 'cutting' && (
            <div className="space-y-3">
              <p className="text-slate-600">
                Cutting lengths, drum quantities, and drum selection use one editor: Manual Selection and Automatic
                Optimization.
              </p>
              {isEditable ? (
                <button
                  type="button"
                  onClick={openCuttingDrumSelection}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/70 text-blue-700 font-bold hover:bg-blue-100"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  {OPEN_CUTTING_DRUM_SELECTION_LABEL}
                </button>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  Cutting length: {form.cuttingLengthMeters || '—'} m
                </div>
              )}
            </div>
          )}

          {step === 'drum' && (
            <div className="space-y-2">
              <label className="block font-semibold text-slate-700 mb-1">Drum Required</label>
              <input
                disabled={!isEditable}
                value={form.drumType}
                onChange={(e) => onChange({ drumType: e.target.value })}
                placeholder="Drum code or schedule reference"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50"
              />
              {isEditable && (
                <button
                  type="button"
                  onClick={openCuttingDrumSelection}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50/70 text-blue-700 font-bold hover:bg-blue-100"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  {OPEN_CUTTING_DRUM_SELECTION_LABEL}
                </button>
              )}
              <p className="text-[11px] text-slate-500">
                Drum type, quantities, and cutting lengths are edited together in Cutting Length and Drum Selection.
                Manual Selection and Automatic Optimization stay on that popup.
              </p>
            </div>
          )}

          {step === 'commercial' && (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Commercial Description</label>
              <textarea
                rows={4}
                disabled={!isEditable}
                value={form.cableDescription}
                onChange={(e) => onChange({ cableDescription: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-50"
              />
              <p className="text-[11px] text-slate-500 mt-2">
                Inquiry currency: <span className="font-bold">{inquiry.currency}</span>
              </p>
            </div>
          )}

          {(cuttingError || localCuttingCheck) && (
            <div className="p-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs">
              {cuttingError || localCuttingCheck}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
          <button
            type="button"
            onClick={goPrev}
            disabled={stepIndex <= 0}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-white"
            >
              Cancel
            </button>
            {stepIndex < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              isEditable && (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={Boolean(localCuttingCheck)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50"
                >
                  Save Line
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
