/**
 * Costing Engine service boundary — one authority.
 * Does NOT change Option B / Decision 5 metal semantics.
 */

import { ownershipForEntity } from '../dataOwnershipMatrix';

export const COSTING_MASTER_BOUNDARY = {
  moduleId: 'COSTING' as const,
  entities: [
    'CostingConfiguration',
    'CostingFormula',
    'CostingCalculation',
    'CostingScrapRule',
    'CostingExchangeRate',
    'CostingMetalCostComponent',
    'CostingDocumentSequence',
    'RawMaterialPrice',
  ] as const,
  writeApiPrefixes: ['/api/costing', '/api/admin/costing', '/api/master/raw-material-prices'] as const,
  ownership: {
    CostingFormula: ownershipForEntity('CostingFormula'),
    CostingMetalCostComponent: ownershipForEntity('CostingMetalCostComponent'),
    RawMaterialPrice: ownershipForEntity('RawMaterialPrice'),
  },
  freezes: [
    'Option B metal / Decision 5 — CostingMetalCostComponent semantics unchanged',
    'TO cannot approve RM prices',
  ],
  readinessSummaryApi: '/api/admin/costing/readiness/summary',
} as const;
