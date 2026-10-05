import { MasterCableCatalogItem, CableFamily } from '../types';

export interface CableBomComponent {
  component: string;
  materialCode: string;
  unit: string;
  qty: number;
}

export interface DetailedMasterCableItem extends MasterCableCatalogItem {
  bomBreakdown?: CableBomComponent[];
  bomDetails?: {
    copperKgKm: number;
    aluminumKgKm: number;
    insulationType: string;
    insulationThicknessMm: number;
    armourType: string;
    sheathType: string;
    grossWeightKgKm: number;
  };
}
