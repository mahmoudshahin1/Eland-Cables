import { useCallback, useEffect, useState } from 'react';
import { costingApi } from './costingV3Api';

export type WorkspaceDashboard = {
  currencies: { active: number };
  exchangeRates: { active: number };
  rawMaterials: { total: number; copper: number; aluminium: number; standard: number };
  rawMaterialPrices: { active: number; pendingApproval: number };
  bom: { cables: number; governed: number; pendingApproval: number };
  scrapRules: { active: number; underCreation: number };
  imports: { successful: number; failed: number };
  costingRuns: { completed: number; failed: number };
};

export type WorkspaceData = {
  dashboard: WorkspaceDashboard | null;
  currencies: Record<string, unknown>[];
  exchangeRates: Record<string, unknown>[];
  rawMaterials: Record<string, unknown>[];
  rmPrices: Record<string, unknown>[];
  boms: Record<string, unknown>[];
  scrapRules: Record<string, unknown>[];
  metalCostComponents: Record<string, unknown>[];
  marketMetalPriceDefaults: Record<string, unknown>[];
  audit: Record<string, unknown>[];
};

const empty: WorkspaceData = {
  dashboard: null,
  currencies: [],
  exchangeRates: [],
  rawMaterials: [],
  rmPrices: [],
  boms: [],
  scrapRules: [],
  metalCostComponents: [],
  marketMetalPriceDefaults: [],
  audit: [],
};

export function useCostingWorkspaceData(token: string | null) {
  const [data, setData] = useState<WorkspaceData>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [dash, cur, fx, rm, prices, bom, scrap, metals, marketMetals, audit] = await Promise.all([
        costingApi(token, '/api/admin/costing/workspace/dashboard').catch(() => ({ dashboard: null })),
        costingApi(token, '/api/admin/costing/currencies').catch(() => ({ currencies: [] })),
        costingApi(token, '/api/admin/costing/exchange-rates'),
        costingApi(token, '/api/master/raw-materials'),
        costingApi(token, '/api/admin/costing/raw-material-prices'),
        costingApi(token, '/api/master/boms'),
        costingApi(token, '/api/admin/costing/scrap-rules'),
        costingApi(token, '/api/admin/costing/metal-cost-components'),
        costingApi(token, '/api/admin/costing/market-metal-price-defaults').catch(() => ({ defaults: [] })),
        costingApi(token, '/api/admin/costing/audit?limit=20'),
      ]);
      setData({
        dashboard: (dash.dashboard as WorkspaceDashboard) || null,
        currencies: (cur.currencies as Record<string, unknown>[]) || [],
        exchangeRates: (fx.exchangeRates as Record<string, unknown>[]) || [],
        rawMaterials: (rm.rawMaterials as Record<string, unknown>[]) || [],
        rmPrices: (prices.prices as Record<string, unknown>[]) || [],
        boms: (bom.boms as Record<string, unknown>[]) || [],
        scrapRules: (scrap.rules as Record<string, unknown>[]) || [],
        metalCostComponents: (metals.components as Record<string, unknown>[]) || [],
        marketMetalPriceDefaults: (marketMetals.defaults as Record<string, unknown>[]) || [],
        audit: (audit.events as Record<string, unknown>[]) || [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load costing workspace');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh, setError };
}
