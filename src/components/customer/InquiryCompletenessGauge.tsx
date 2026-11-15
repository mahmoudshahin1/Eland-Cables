import React from 'react';
import type { InquiryCompletenessResult } from './customerInquiryDetailPresentation';

export interface InquiryCompletenessGaugeProps {
  completeness: InquiryCompletenessResult;
  className?: string;
}

export const InquiryCompletenessGauge: React.FC<InquiryCompletenessGaugeProps> = ({
  completeness,
  className = '',
}) => {
  const { percentage, label } = completeness;
  const radius = 26;
  const circumference = 2 * Math.PI * radius; // ~163.36
  const strokeDashoffset = circumference - (circumference * Math.min(Math.max(percentage, 0), 100)) / 100;

  return (
    <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
      <div className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] flex items-center justify-center">
        <svg
          className="w-full h-full transform -rotate-90"
          viewBox="0 0 64 64"
          role="img"
          aria-label={`Inquiry completeness ${percentage} percent`}
        >
          {/* Background circle */}
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="5"
          />
          {/* Progress circle */}
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="#ffffff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-white text-sm sm:text-base tracking-tight">
          {percentage}%
        </span>
      </div>
      <span className="text-[11px] font-medium text-white/80 mt-1 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
};
