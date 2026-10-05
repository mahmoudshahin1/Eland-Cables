/**
 * Engineering / Cable master service boundary.
 * Cable Engineering + CableMaster + Drum packaging — not separate top-level apps.
 */

import { ownershipForEntity } from '../dataOwnershipMatrix';

export const ENGINEERING_MASTER_BOUNDARY = {
  moduleId: 'ENGINEERING' as const,
  cableMasterModuleId: 'CABLE_MASTER' as const,
  entities: [
    'CableEngineeringMapping',
    'TechnicalOfficeRequest',
    'CableMaster',
    'CableParameter',
    'DrumMaster',
  ] as const,
  writeApiPrefixes: [
    '/api/technical-office',
    '/api/master/engineering-mappings',
    '/api/master/cables',
    '/api/master/drums',
    '/api/cables',
  ] as const,
  masterSurfaces: [
    { id: 'cables', entity: 'CableMaster', v1Path: '/internal/master-data' },
    { id: 'parameters', entity: 'CableParameter', v1Path: '/internal/cable-parameters' },
    { id: 'drums', entity: 'DrumMaster', v1Path: '/internal/master-data' },
  ] as const,
  ownership: {
    CableEngineeringMapping: ownershipForEntity('CableEngineeringMapping'),
    CableMaster: ownershipForEntity('CableMaster'),
    DrumMaster: ownershipForEntity('DrumMaster'),
  },
  invariants: [
    'One engineering model',
    'Drum optimization is packaging under Cable/Engineering — not a separate module',
    'No silent zeros',
  ],
} as const;
