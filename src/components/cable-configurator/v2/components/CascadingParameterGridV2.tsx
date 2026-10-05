import React from 'react';
import {
  SelectionStateV2,
  AvailableOptionsV2,
  CableRecordV2,
} from '../types';
import { SimpleParameterGridV2 } from './SimpleParameterGridV2';

interface CascadingParameterGridV2Props {
  selections: SelectionStateV2;
  availableOptions: AvailableOptionsV2;
  filteredRecords: CableRecordV2[];
  totalMasterCount: number;
  onUpdateParam: (field: keyof SelectionStateV2, value: any) => void;
  onUpdateCoreColor?: (coreIndex: number, color: string) => void;
  onToggleSpecialAdditive?: (additive: string) => void;
}

/** Cable Technical Parameter grid — simple dropdowns and Yes/No checkboxes. */
export const CascadingParameterGridV2: React.FC<CascadingParameterGridV2Props> = (props) => (
  <SimpleParameterGridV2 {...props} />
);
