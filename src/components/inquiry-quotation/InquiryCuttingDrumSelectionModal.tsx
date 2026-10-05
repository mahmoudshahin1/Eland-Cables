import React, { useEffect, useState } from 'react';
import { Ruler, X } from 'lucide-react';
import { CommercialInquiryLineDto } from '../../services/commercialInquiryApiService';
import { loadAuthoritativeCableCatalog } from '../../services/masterDataApiService';
import type { DrumMasterRecord } from '../../types';
import {
  InquiryDrumPlanWorkflow,
  resolveLineCableEngineering,
} from './InquiryDrumPlanWorkflow';

export const CUTTING_LENGTH_AND_DRUM_SELECTION_TITLE = 'Cutting Length and Drum Selection';

export interface InquiryCuttingDrumSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  inquiryId: string;
  line: CommercialInquiryLineDto;
  drums: DrumMasterRecord[];
  jwtToken?: string | null;
  onConfirmed?: () => void;
}

export const InquiryCuttingDrumSelectionModal: React.FC<InquiryCuttingDrumSelectionModalProps> = ({
  isOpen,
  onClose,
  inquiryId,
  line,
  drums,
  jwtToken,
  onConfirmed,
}) => {
  const [engineering, setEngineering] = useState(() => resolveLineCableEngineering(line));

  useEffect(() => {
    setEngineering(resolveLineCableEngineering(line));
    const materialNumber = line.materialNumber?.trim();
    if (!materialNumber) return;
    let ignore = false;
    void loadAuthoritativeCableCatalog(jwtToken).then((catalog) => {
      if (ignore) return;
      const match = catalog.data.find((row) => row.cableCode === materialNumber);
      if (!match) return;
      const diameter = Number(match.outerDiameterMm);
      const weight = Number(match.approxWeightKgKm);
      setEngineering({
        cableDiameterMm: Number.isFinite(diameter) && diameter > 0 ? diameter : 0,
        approxWeightKgKm: Number.isFinite(weight) && weight > 0 ? weight : 0,
      });
    });
    return () => {
      ignore = true;
    };
  }, [line, jwtToken]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl p-5 space-y-4 text-xs max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-brand-500 text-white shrink-0">
              <Ruler className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white font-display">
                {CUTTING_LENGTH_AND_DRUM_SELECTION_TITLE}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {line.materialNumber || 'Unmapped cable'}
                {line.cableDescription ? ` · ${line.cableDescription}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
            aria-label="Close cutting length and drum selection"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <InquiryDrumPlanWorkflow
          inquiryId={inquiryId}
          line={line}
          drums={drums}
          jwtToken={jwtToken}
          cableDiameterMm={engineering.cableDiameterMm}
          approxWeightKgKm={engineering.approxWeightKgKm}
          onConfirmed={() => {
            onConfirmed?.();
          }}
        />
      </div>
    </div>
  );
};
