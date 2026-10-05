/**
 * Pricing Engine service boundary — distinct from Costing; one Pricing Engine.
 */

import { ownershipForEntity } from '../dataOwnershipMatrix';

export const PRICING_MASTER_BOUNDARY = {
  moduleId: 'PRICING' as const,
  entities: [
    'CustomerPricingTier',
    'CommercialPricingRule',
    'CommercialDiscountRule',
    'CommercialPricingSnapshot',
  ] as const,
  writeApiPrefixes: ['/api/commercial-pricing', '/api/master/commercial-pricing-rules'] as const,
  ownership: {
    CommercialPricingRule: ownershipForEntity('CommercialPricingRule'),
  },
  invariants: ['Distinct from Costing Engine — one Pricing Engine'],
} as const;
