/**
 * Approved BOM service boundary — single BOM authority.
 */

import { ownershipForEntity } from '../dataOwnershipMatrix';

export const BOM_MASTER_BOUNDARY = {
  moduleId: 'BOM' as const,
  entities: ['CableBomLine', 'GovernedBomLine', 'BomDuplicateObservation'] as const,
  writeApiPrefixes: ['/api/master/boms', '/api/master/bom-conflicts'] as const,
  ownership: {
    CableBomLine: ownershipForEntity('CableBomLine'),
    GovernedBomLine: ownershipForEntity('GovernedBomLine'),
  },
  invariants: ['Governance stays code-protected', 'Not EAV', 'One Approved BOM authority'],
} as const;
