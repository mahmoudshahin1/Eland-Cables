import React from 'react';
import { Check } from 'lucide-react';
import type { InquiryLifecycleStepItem } from './customerInquiryDetailPresentation';

export interface InquiryLifecycleStepperProps {
  steps: InquiryLifecycleStepItem[];
  className?: string;
}

export const InquiryLifecycleStepper: React.FC<InquiryLifecycleStepperProps> = ({
  steps,
  className = '',
}) => {
  return (
    <div
      className={`inline-flex items-center gap-0 select-none ${className}`}
      role="progressbar"
      aria-label="Inquiry lifecycle stage"
    >
      {steps.map((step, idx) => {
        const isComplete = step.state === 'complete';
        const isCurrent = step.state === 'current';
        const hasNext = idx < steps.length - 1;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1.5 w-16 sm:w-20 text-center">
              <div
                className={`relative flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300 ${
                  isComplete
                    ? 'bg-white text-brand-900 border-2 border-white shadow-xs'
                    : isCurrent
                      ? 'bg-white text-brand-900 border-2 border-white ring-4 ring-white/25 shadow-xs font-bold'
                      : 'bg-transparent border-2 border-white/35 text-white/50'
                }`}
              >
                {isComplete ? (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                ) : (
                  <span className={`text-[10px] font-bold ${isCurrent ? 'text-brand-900' : 'text-white/60'}`}>
                    {idx + 1}
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] font-semibold tracking-tight transition-opacity ${
                  isCurrent ? 'text-white font-bold opacity-100' : isComplete ? 'text-white/90 opacity-90' : 'text-white/50 opacity-60'
                }`}
              >
                {step.label}
              </span>
            </div>
            {hasNext && (
              <div
                className={`w-6 sm:w-8 h-0.5 mb-5 transition-colors ${
                  isComplete ? 'bg-white/80' : 'bg-white/20'
                }`}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
