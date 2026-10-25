import React, { useState } from 'react';
import { CustomerPortalTab } from '../../types';
import { ElandProcessFlowDiagram } from './ElandProcessFlowDiagram';
import { VipCustomerJourneyWizard } from './VipCustomerJourneyWizard';
import { Button } from '../ui/Button';
import { Sparkles, Map } from 'lucide-react';

import { ErrorBoundary } from '../common/ErrorBoundary';

interface CustomerJourneyProps {
  onNavigateTab: (tab: CustomerPortalTab) => void;
}

export const CustomerJourney: React.FC<CustomerJourneyProps> = ({ onNavigateTab }) => {
  const [viewMode, setViewMode] = useState<'wizard' | 'diagram'>('wizard');

  const handleSelectStep = (stepNumber: number) => {
    if (stepNumber === 9) {
      onNavigateTab('support');
    } else {
      setViewMode('wizard');
    }
  };

  return (
    <div className="space-y-4">
      {/* View Switcher Controls */}
      <div className="flex justify-end items-center gap-2">
        <Button
          variant={viewMode === 'wizard' ? 'primary' : 'secondary'}
          size="sm"
          className="text-xs font-bold"
          onClick={() => setViewMode('wizard')}
        >
          <Sparkles className="w-3.5 h-3.5 me-1 text-amber-300" />
          Interactive 9-Step Wizard
        </Button>
        <Button
          variant={viewMode === 'diagram' ? 'primary' : 'secondary'}
          size="sm"
          className="text-xs font-bold"
          onClick={() => setViewMode('diagram')}
        >
          <Map className="w-3.5 h-3.5 me-1" />
          Process Flow Overview
        </Button>
      </div>

      {viewMode === 'wizard' ? (
        <ErrorBoundary fallbackTitle="VIP Customer Journey Encountered an Error">
          <VipCustomerJourneyWizard
            onBackToInquiries={() => onNavigateTab('price_estimation')}
            onCompletedSubmission={() => onNavigateTab('price_estimation')}
          />
        </ErrorBoundary>
      ) : (
        <ElandProcessFlowDiagram onSelectStep={handleSelectStep} />
      )}
    </div>
  );
};
