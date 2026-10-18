export type MasterRecordStatus = 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';

export interface DrumMasterRecord {
  id: string;
  drumCode: string;
  drumType?: string;
  description?: string;
  flange: number;
  barrel: number;
  barrelWidth?: number | null;
  innerWidth: number;
  outerWidth: number;
  usableWidth?: number | null;
  capacity: number;
  maxWeight?: number | null;
  clearanceMm?: number | null;
  emptyDrumNetWeightKg?: number | null;
  dimensionUnitNote?: 'SOURCE_UNIT_NOT_IN_FILE';
  capacityUom?: 'CONFIGURATION_REQUIRED';
  status: MasterRecordStatus;
  sourceBatch?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type MasterImportKind = 'cables' | 'boms' | 'drums' | 'rawMaterials' | 'engineeringMappings';

export interface CableBomRawMaterial {
  cableMaterialNumber: string;
  rawMaterialCode: string;
  weightGPerM: number;
  status?: 'ACTIVE' | 'INACTIVE';
}
