import { CostingV3Page } from '../costingV3Nav';
import { WorkspaceData } from '../useCostingWorkspaceData';
import { CostingBulkImportKind } from '../../../../services/costingBulkImportService';

export type PanelIntent = {
  action?: 'add';
  bulkKind?: CostingBulkImportKind;
  bulkStep?: number;
  auditEntity?: string;
};

export type CostingPanelProps = {
  token: string | null;
  lang: 'en' | 'ar';
  data: WorkspaceData;
  loading: boolean;
  refresh: () => Promise<void>;
  setError: (msg: string | null) => void;
  onNavigate: (page: CostingV3Page, intent?: PanelIntent) => void;
  intent?: PanelIntent;
  onIntentConsumed?: () => void;
};
