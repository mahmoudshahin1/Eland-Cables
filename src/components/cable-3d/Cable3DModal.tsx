import React from 'react';
import { X } from 'lucide-react';
import { Cable3DStudio, Cable3DStudioProps } from './Cable3DStudio';

export interface Cable3DModalProps extends Cable3DStudioProps {
  open: boolean;
  onClose: () => void;
}

export const Cable3DModal: React.FC<Cable3DModalProps> = ({
  open,
  onClose,
  initialConfig,
  onAddToInquiry,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 md:p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-7xl h-[92vh] max-h-[900px] bg-slate-950 rounded-2xl border border-cyan-500/30 shadow-2xl flex flex-col overflow-hidden">
        {/* Close Button Top Right */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 shadow-lg transition-colors"
          aria-label="Close 3D Studio"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex-1 overflow-y-auto">
          <Cable3DStudio
            initialConfig={initialConfig}
            onAddToInquiry={onAddToInquiry}
            onClose={onClose}
            isModal={true}
          />
        </div>
      </div>
    </div>
  );
};
