import { MasterCableCatalogItem } from '../../../types';

export type SelectionModeV2 = 'CUSTOMER' | 'TECHNICAL';

export type CableFamilyCode = 'UGC' | 'OHL' | 'ABC' | 'SINGLE' | 'CONTROL' | 'TELECOM' | 'OHTL';
export type VoltageClassCode = 'LV' | 'MV' | 'HV' | 'EHV';

export type TriState = 'Yes' | 'No' | 'N/A';

export interface CableRecordV2 {
  raw: MasterCableCatalogItem;
  id: string;
  materialNumber: string; // Cable Material Number (e.g. 10009557 or TC-2026-000001)
  itemCode: string; // Item Code (e.g. ICO171X201C0UY3)
  customerCode: string; // Customer Code (e.g. N2XS2Y, SEC, ARAMCO, Standard)
  description: string; // Full Technical Description
  
  // 1. Cable Family
  family: CableFamilyCode | string; // UGC, OHL, ABC, SINGLE, CONTROL, TELECOM
  familySubType?: string; // LV, MV, HV/EHV, AAC, AAAC, ACSR, etc.
  
  // 2. Voltage
  voltageClass: VoltageClassCode | string; // LV, MV, HV, EHV
  voltage: string; // U0/U e.g. "0.6/1 kV", "6/10 kV", "12/20 kV", "18/30 kV", "64/110 kV", "76/132 kV", "230/400 kV"
  voltageLevel?: string; // LV, MV, HV, EHV
  u0_u?: string; // 0.6/1 kV, 6/10 kV, 12/20 kV, 18/30 kV, etc.
  um?: string; // Maximum voltage for equipment: 1.2 kV, 12 kV, 24 kV, 36 kV, 123 kV, 145 kV, etc.
  standard: string; // IEC 60502-1, IEC 60502-2, IEC 60840, BS 5467, etc.
  
  // 3. Conductor
  conductorMaterial: 'CU' | 'AL' | string; // Copper (Cu) or Aluminium (Al)
  conductorClass: 'Class 1' | 'Class 2' | 'Class 5' | 'Class 6' | string; // Class 1 Solid, Class 2 Stranded, Class 5 Flexible
  conductorConstruction?: string; // Solid, Stranded Compact, Flexible, Milliken
  conductorShape?: string; // Round (re/rm), Sector (se/sm), Compacted, Segmental / Milliken
  conductorCompacting?: string; // Compacted, Non-compacted
  conductorSize: string; // e.g. "120 mm²" or "120"
  conductorSizeNum: number; // e.g. 120
  conductorWaterTight: TriState; // Conductor Water Blocking (Yes/No/NA)
  cores: string; // 1 Core, 3 Core, 4 Core
  coresCount: number; // 1, 2, 3, 4, etc.
  
  // 4. Insulation
  insulation: string; // XLPE, PVC, LSHF, EPR, LSZH
  insulationColor: string; // Natural, Black, Red, N/A
  insulationThicknessMm: number;
  
  // 5. Semi-Conductive Layer
  semiConApplicable?: TriState; // Applicable / Not Applicable
  innerSemiConductor?: string; // Extruded Bonded Semi-Conductor, None, Strippable
  outerSemiConductor: 'N/A' | 'Non-Strippable' | 'Strippable' | string; // Bonded / Cold Strippable / Easy Strip
  outerSemiConductorType: string; // Bonded, Strippable, N/A
  
  // 6. Screening
  screenType: string; // None, Copper Tape, Copper Wire, Aluminium Tape, Other approved screen, Lead Sheath
  screenMaterial: string; // Copper, Aluminium, Steel, Lead, N/A
  screenCSA: string; // 16 mm², 25 mm², 35 mm², None
  screenWaterTight: TriState; // Yes, No, N/A
  screenConstruction: string;
  
  // 7. Armour
  armour: string; // None, SWA (Steel Wire), STA (Steel Tape), AWA (Aluminium Wire), ATA (Aluminium Tape), DSTA
  armourMaterial: string; // Steel, Aluminium, Copper, N/A
  armourCSA: string; // 1.6 mm Wire, 2.5 mm Wire, 0.5 mm Tape, None
  armourWaterTight: TriState; // Yes, No, N/A
  
  // 8. Sheath
  bedding?: string;
  innerSheath?: string;
  fillerBinder?: string;
  sheathing: string; // PVC, PE, LSHF, MDPE, HDPE, LSZH
  sheathingColor: string; // Black, Red, Blue, Grey, Orange, etc.
  
  // 9. Special Properties
  waterTight?: TriState; // Water Tight / Water Blocking
  termiteProtection?: string; // Anti-Termite, Anti-Rodent, Polyamide-12, Pyrethroid, None
  specialAdditives: string[]; // UV Resistant, Flame Retardant, Oil Resistant, Low Smoke, Hydrocarbon Resistant
  cpr: TriState; // CPR compliance
  cprClass: string; // B2ca-s1a,d1,a1, Cca-s1b,d1,a1, Dca-s2,d2,a2, Eca, Fca, N/A
  specialArea?: string; // Direct Burial, Duct, Tray, Tunnel, Wet Location, Subsea/Offshore, Solar PV, Nuclear, Substation
  semiConduct: TriState; // Semi Conductive Sheath
  graphite: TriState; // Graphite Coating
  edr: TriState; // EDR compliance
  
  // 10. Core Identification
  coreColors: string[]; // Individual core colors [Core 1, Core 2, ...]
  coreIdentification: string; // HD 308 S2, Numbering, Customer-specific identification
  coreNumbering?: string; // Numbered, Non-numbered
  customerIdentification?: string; // SEC, Saudi Aramco, DEWA, ADDC, Kahramaa, Standard
  coreConstruction: string; // Laid-up, Single Core, Concentric
  
  // 11. Size / Commercial Parameters
  cuttingLength?: number; // meters
  lengthTolerance?: string; // ±1%, ±2%, Exact
  drumType?: string; // Wooden Drum, Steel Drum, Steel Corrugated Reel, Returnable Steel Drum, Coil
  
  // Technical Physical Data
  outerDiameterMm: number;
  approxWeightKgKm: number;
  minBendingRadiusMm: number;
  operatingTempC: string;
  shortCircuitRatingKa: string;
  approvedStatus: 'Draft' | 'Technical Approved' | 'Commercial Approved' | 'Released' | 'Obsolete';
  isTemporaryId?: boolean;
}

export interface SelectionStateV2 {
  selectionMode: SelectionModeV2 | null;
  
  // 1. Cable Family
  family?: CableFamilyCode | string;
  familySubType?: string; // LV, MV, HV/EHV, AAC, AAAC, ACSR
  
  // 2. Voltage
  voltageId?: string;
  voltageClass?: VoltageClassCode | string;
  voltage?: string;
  voltageLevel?: string;
  u0?: string;
  u?: string;
  u0_u?: string;
  um?: string;
  applicableConstruction?: string;
  standard?: string;
  constructionLogic?: string;
  
  // 3. Conductor
  conductorMaterial?: 'CU' | 'AL' | string;
  conductorClass?: string;
  conductorConstruction?: string;
  conductorShape?: string;
  conductorCompacting?: string;
  conductorSize?: string;
  conductorWaterTight?: TriState;
  cores?: string;
  coresCount?: number;
  
  // 4. Insulation
  insulation?: string;
  insulationColor?: string;
  insulationThicknessMm?: number;
  
  // 5. Semi-Conductive Layer
  semiConApplicable?: TriState;
  innerSemiConductor?: string;
  outerSemiConductor?: 'N/A' | 'Non-Strippable' | 'Strippable' | string;
  outerSemiConductorType?: string;
  
  // 6. Screening
  screenType?: string;
  screenMaterial?: string;
  screenCSA?: string;
  screenWaterTight?: TriState;
  screenConstruction?: string;
  
  // 7. Armour
  fillerBinder?: string;
  bedding?: string;
  armour?: string;
  armourMaterial?: string;
  armourCSA?: string;
  armourWaterTight?: TriState;
  innerSheath?: string;
  
  // 8. Sheath
  sheathing?: string;
  sheathingColor?: string;
  
  // 9. Special Properties
  waterTight?: TriState;
  termiteProtection?: string;
  specialAdditives?: string[];
  cpr?: TriState;
  cprClass?: string;
  specialArea?: string;
  semiConduct?: TriState;
  graphite?: TriState;
  edr?: TriState;
  
  // 10. Core Identification
  coreColors?: Record<number, string>; // { 1: 'Brown', 2: 'Black', 3: 'Grey', 4: 'Blue' }
  coreIdentification?: string;
  coreNumbering?: string;
  customerIdentification?: string;
  coreConstruction?: string;
  
  // 11. Size / Commercial Parameters
  customerCode?: string;
  itemCode?: string;
  materialNumber?: string;
  cuttingLength?: number;
  lengthTolerance?: string;
  drumType?: string;
  specialCustomerRequirements?: string;
}

export interface ValidationErrorV2 {
  field: keyof SelectionStateV2 | string;
  message: string;
  conflictingField?: keyof SelectionStateV2 | string;
  severity: 'error' | 'warning';
}

export type ValidationOutcomeStatus =
  | 'EXISTING_APPROVED'
  | 'EXISTING_CABLE'
  | 'VALID_NEW_CABLE'
  | 'TECHNICALLY_VALID_NOT_MASTER'
  | 'INVALID_CONFIGURATION'
  | 'CONFIGURATION_REQUIRED';

export interface TechnicalValidationResultV2 {
  status: ValidationOutcomeStatus;
  isValid: boolean;
  errors: ValidationErrorV2[];
  warnings: ValidationErrorV2[];
  matchingCable: CableRecordV2 | null;
  similarCables: CableRecordV2[];
  summaryDescription: string;
  estimatedDiameterMm: number;
  estimatedWeightKgKm: number;
}

export interface AvailableOptionsV2 {
  customerCodes: string[];
  families: string[];
  voltageClasses: string[];
  voltages: string[];
  standards: string[];
  conductorMaterials: string[];
  conductorClasses: string[];
  conductorSizes: string[];
  conductorWaterTights: TriState[];
  cores: string[];
  coreColors: string[];
  insulations: string[];
  insulationColors: string[];
  outerSemiConductors: string[];
  screenTypes: string[];
  screenMaterials: string[];
  screenCSAs: string[];
  screenWaterTights: TriState[];
  armours: string[];
  armourMaterials: string[];
  armourCSAs: string[];
  armourWaterTights: TriState[];
  sheathings: string[];
  sheathingColors: string[];
  specialAdditives: string[];
  semiConducts: TriState[];
  graphites: TriState[];
  cprs: TriState[];
  cprClasses: string[];
  edrs: TriState[];
}

export type TechnicalRequestStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Technical Review'
  | 'Need More Information'
  | 'Technical Design'
  | 'Pending Approval'
  | 'Approved'
  | 'Released'
  | 'Rejected'
  | 'Returned'
  | 'Cable Created'
  | 'Closed';

export interface AuditTrailEntry {
  id: string;
  timestamp: string;
  author: string;
  action: string;
  oldStatus?: TechnicalRequestStatus | string;
  newStatus?: TechnicalRequestStatus | string;
  comments?: string;
}

export interface TechnicalCableRequest {
  id: string; // e.g. TCR-2026-000001
  requestNumber: string; // TCR-2026-000001
  requestDate: string;
  requesterName: string;
  requesterEmail: string;
  companyName: string;
  customerCode: string;
  status: TechnicalRequestStatus;
  assignedEngineer?: string;
  selections: SelectionStateV2;
  generatedDescription: string;
  estimatedDiameterMm: number;
  estimatedWeightKgKm: number;
  technicalNotes?: string;
  manufacturingNotes?: string;
  customerRequirements?: string;
  applicableStandards?: string;
  revision: number;
  approvalDate?: string;
  approvedBy?: string;
  rejectionReason?: string;
  temporaryTechnicalId?: string; // TC-2026-000001
  erpMaterialNumber?: string;
  auditTrail: AuditTrailEntry[];
}

export interface ExcelRowValidationResult {
  rowNumber: number;
  itemCode?: string;
  materialNumber?: string;
  customerCode?: string;
  description?: string;
  isValid: boolean;
  isExisting: boolean;
  errors: string[];
  suggestedCorrections: string[];
  parsedRecord?: CableRecordV2;
}

export interface ExcelPreImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  existingCableRows: number;
  newCableRows: number;
  rowResults: ExcelRowValidationResult[];
}

// -------------------------------------------------------------
// VOLTAGE MASTER RECORD (TECHNICAL OFFICE CONTROLLED)
// -------------------------------------------------------------
export type VoltageMasterStatus = 'Active' | 'Draft' | 'Deprecated' | 'Restricted';

export interface VoltageMasterRecord {
  id: string; // e.g. "VOLT-MV-002"
  voltageLevel: 'LV' | 'MV' | 'HV' | 'EHV' | string; // Voltage Level (LV, MV, HV, EHV)
  u0: string; // e.g. "6 kV" or "0.6 kV"
  u: string; // e.g. "10 kV" or "1 kV"
  u0_u: string; // e.g. "6/10 kV"
  um: string; // Equipment max voltage e.g. "12 kV"
  applicableConstruction: string; // e.g. "XLPE + semi-conductive layers + screen"
  applicableCableFamilies: (CableFamilyCode | string)[]; // ['UGC', 'SINGLE', 'ABC']
  applicableStandards: string[]; // ['IEC 60502-2', 'BS 6622', 'SEC 01-TMSS-01']
  status: VoltageMasterStatus; // Active | Draft | Deprecated | Restricted
  effectiveDate: string; // YYYY-MM-DD
  revision?: string; // e.g. "Rev 1.2"
  managedBy?: string; // e.g. "Technical Office / HV Engineering"
  notes?: string;
}

