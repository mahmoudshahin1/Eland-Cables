import React from 'react';
import { BrandLogo } from '../BrandLogo';

interface EnergyaLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'standard' | 'connect';
  lightText?: boolean;
  showPartnerBar?: boolean;
}

const heightClass = {
  sm: 'h-10',
  md: 'h-[52px]',
  lg: 'h-[72px]',
} as const;

/** Thin wrapper around BrandLogo for existing call sites. */
export const EnergyaLogo: React.FC<EnergyaLogoProps> = ({
  className = '',
  size = 'md',
  variant = 'standard',
  lightText = false,
}) => {
  return (
    <div className={`flex items-center select-none ${className}`}>
      <BrandLogo className={heightClass[size]} />
      {variant === 'connect' ? (
        <span className={`ml-2 text-[11px] font-semibold ${lightText ? 'text-white/80' : 'text-brand-500'}`}>
          Connect
        </span>
      ) : null}
    </div>
  );
};
