import React from 'react';
import { CableCrossSection2D, CableCrossSectionProps } from './CableCrossSection2D';

export interface CableCrossSectionViewerProps extends CableCrossSectionProps {
  defaultMode?: '2D' | 'photoreal' | 'schematic';
  allowToggle?: boolean;
}

export const CableCrossSectionViewer: React.FC<CableCrossSectionViewerProps> = ({
  defaultMode = '2D',
  allowToggle = true,
  className = '',
  ...props
}) => {
  return (
    <div className={`flex flex-col space-y-2.5 ${className}`}>
      <CableCrossSection2D {...props} />
    </div>
  );
};
