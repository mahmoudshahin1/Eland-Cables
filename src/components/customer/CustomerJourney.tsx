import React from 'react';
import { CustomerPortalTab } from '../../types';
import { ElandProcessFlowDiagram } from './ElandProcessFlowDiagram';

interface CustomerJourneyProps {
  onNavigateTab: (tab: CustomerPortalTab) => void;
}

export const CustomerJourney: React.FC<CustomerJourneyProps> = ({ onNavigateTab }) => {
  const handleSelectStep = (stepNumber: number) => {
    if (stepNumber === 9) {
      onNavigateTab('support');
    } else {
      onNavigateTab('price_estimation');
    }
  };

  return (
    <div className="space-y-4">
      <ElandProcessFlowDiagram onSelectStep={handleSelectStep} />
    </div>
  );
};

