import React from 'react';
import { CustomerPortalTab } from '../../types';
import { CableConfiguratorV2 } from './v2/components/CableConfiguratorV2';

interface CableConfiguratorHubProps {
  onNavigateTab: (tab: CustomerPortalTab) => void;
  onSetGeneratedCableCode?: (code: string) => void;
}

/** Internal cable configurator entry — Technical Parameters V2 only. */
export const CableConfiguratorHub: React.FC<CableConfiguratorHubProps> = ({
  onNavigateTab,
  onSetGeneratedCableCode,
}) => (
  <CableConfiguratorV2
    onNavigateTab={onNavigateTab}
    onSetGeneratedCableCode={onSetGeneratedCableCode}
  />
);
