export type PlatformMode = 'customer' | 'internal' | 'ai_assistant';

export type CustomerPortalTab =
  | 'dashboard'
  | 'products'
  | 'journey'
  | 'process'
  | 'configurator'
  | 'drum_optimizer'
  | 'price_estimation'
  | 'sales_orders'
  | 'statement'
  | 'production_tracking'
  | 'shipment_tracking'
  | 'invoices'
  | 'tds_library'
  | 'support';

export type InternalPortalTab =
  | 'overview'
  | 'technical_office'
  | 'cable_configurator'
  | 'costing_pricing'
  | 'sales_quotations'
  | 'sales_orders'
  | 'orders_production'
  | 'shipments_logistics'
  | 'finance_collections'
  | 'user_management'
  | 'master_data'
  | 'reports_analytics';

export interface ErpAttachment {
  id: string;
  fileName: string;
  fileSizeKb: number;
  uploadedBy: string;
  uploadedAt: string;
  fileUrl?: string;
}

export interface DrumScheduleEntry {
  drumNo: number;
  drumType: string;
  lengthMeters: number;
  grossWeightKg: number;
  netWeightKg?: number;
  notes?: string;
  /** Optional ENERGYA Drum Master code (EWD*). Does not replace prototype drumType. */
  drumMasterCode?: string;
}

export interface ErpRequestItem {
  serial: number;
  itemCode: string; // Existing ERP Item Code
  cableCode?: string; // Energya Cable Code
  customerCode?: string; // Customer Item / Specification Code
  itemDescription: string;
  uom: 'KM' | 'M' | 'Reel' | 'PCS';
  qty: number;
  unitPriceUsd?: number;
  drumDetails?: {
    drumType: string;
    noOfDrums: number;
    cuttingLengthMeters: number;
    totalLengthKm: number;
    grossWeightPerDrumKg: number;
    netWeightPerDrumKg: number;
    cableTolerancePercent?: number;
    scheduleRows?: Array<{
      drumCode: string;
      noOfDrums: number;
      cuttingLengthM: number;
      drumTolerancePercent: number;
    }>;
    drumsList: DrumScheduleEntry[];
  };
  bomDetails?: {
    copperKgKm: number;
    insulationType: string;
    insulationThicknessMm: number;
    armourType: string;
    sheathType: string;
    grossWeightKgKm: number;
  };
}

export interface ErpStatusLog {
  id: string;
  date: string;
  previousStatus: string;
  newStatus: string;
  changedBy: string;
  notes: string;
}

export interface ErpComment {
  id: string;
  date: string;
  author: string;
  text: string;
}

/** Immutable snapshot of a prior inquiry revision (V1, V2, …). */
export interface InquiryVersionSnapshot {
  versionNo: number;
  status: 'Opened' | 'Approved' | 'In Progress' | 'Submitted' | 'Closed';
  quotationStatus: 'Sent To Technical' | 'Pricing Done' | 'Offered' | 'Under Review' | 'Approved' | 'Draft';
  modifiedDate: string;
  modifiedBy: string;
  items: ErpRequestItem[];
  remarks: string;
  projectName: string;
  deliveryDate: string;
  salesComments: string;
  technicalComments: string;
  submittedAt?: string;
}

export interface ErpRequestHeader {
  id: string;
  transactionType: 'Customer Request' | 'Sales Quotation' | 'Tender Inquiry';
  trxDate: string; // e.g. 22/06/2026
  refNo: string; // e.g. 26/002594
  organization: string; // e.g. 1 - Energya Cables
  customerName: string; // e.g. Madkour
  contactPerson: string;
  salesAgent: string; // e.g. Osama Hassanien
  projectName: string; // e.g. ABO QIR Project - 220/3
  currency: 'LE' | 'USD' | 'EUR' | 'SAR';
  exchangeRate: number; // e.g. 1
  rawMaterialCurrency: 'USD' | 'EUR' | 'EGP';
  rawMaterialExchangeRate: number; // e.g. 56
  copperPriceRate: number; // e.g. 14500
  aluminiumPriceRate: number; // e.g. 240000
  aluminiumAlloyPriceRate: number; // e.g. 3600
  deliveryDate: string;
  deliveryTerms?: string;
  versionNo: number; // e.g. 1
  status: 'Opened' | 'Approved' | 'In Progress' | 'Submitted' | 'Closed';
  quoteNo?: string; // e.g. QUO-2026-8841
  quotationRefNo?: string;
  creationDate?: string;
  modifiedDate?: string; // e.g. 22/06/2026 11:30 AM
  modifiedBy?: string; // e.g. Salah Mohamed
  quotationOwner: string; // e.g. Salah Mohamed
  quotationStatus: 'Sent To Technical' | 'Pricing Done' | 'Offered' | 'Under Review' | 'Approved' | 'Draft';
  remarks: string;
  technicalComments: string;
  salesComments: string;
  hasAttachments: boolean;
  attachments: ErpAttachment[];
  items: ErpRequestItem[];
  statusLogs: ErpStatusLog[];
  comments: ErpComment[];
  /** Prior submitted revisions preserved when customer clicks Update after submit. */
  versionHistory?: InquiryVersionSnapshot[];
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'quotation' | 'approval' | 'email' | 'system';
  refNo?: string;
  entityType?: string | null;
  entityId?: string | null;
}

export interface CableBomRawMaterial {
  id?: string;
  customerCode: string; // e.g. N2XH
  itemCode?: string;
  cableMaterialNumber: string; // e.g. 10009487
  rawMaterial: string; // e.g. CR01, XL08, CX05, TP01, LH02
  rawMaterialName?: string; // e.g. Copper Rod / Wire, XLPE Insulation, LSHF Sheath Compound
  weight: number; // e.g. 135.23
  unitKm: string; // e.g. kg — BOM consumption UOM (kg | m2 | PCS). Do not convert PCS to kg.
  /** Standard scrap % from governed BOM (costing). Not stored on Cable Master. */
  scrapPercent?: number | null;
  sourceBatch?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
}

export interface MasterCableCatalogItem {
  id: string;
  itemCode: string; // ERP Item Code (e.g. ICO117X101C0002)
  cableCode: string; // Cable Material Number / Energya Cable Code (e.g. 10009487)
  customerCode: string; // Customer Code / Cable Type (e.g. N2XH, N2XS2Y, NA2XS(FL)2Y)
  code: string; // Display / standard code
  description: string;
  voltageClass: 'LV' | 'MV' | 'HV' | 'Control' | 'Special';
  conductor: 'Copper' | 'Aluminum';
  cores: string;
  crossSectionMm2: number;
  outerDiameterMm: number;
  approxWeightKgKm: number;
  standardPriceUsdPerM: number;
  /** When false, price is PRICE_NOT_CONFIGURED — never treat as zero. Legacy rows omit this (treated as configured). */
  priceConfigured?: boolean;
  elandItemNumber?: string;
  sourceBatch?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
  family?: string | null;
  insulation?: string | null;
  screen?: string | null;
  armour?: string | null;
  sheath?: string | null;
  sheathColour?: string | null;
  coreColour?: string | null;
  standard?: string | null;
  uom?: string;
  /** When set, PostgreSQL Cable Master uses these values (null means not provided — not invented). */
  authorityFields?: {
    family?: string | null;
    voltage?: string | null;
    conductor?: string | null;
    conductorSize?: string | null;
    cores?: string | null;
    insulation?: string | null;
    screen?: string | null;
    armour?: string | null;
    sheath?: string | null;
    sheathColour?: string | null;
    coreColour?: string | null;
    standard?: string | null;
    uom?: string | null;
  };
  screenMm2?: number;
  bomRawMaterials?: CableBomRawMaterial[];
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

export interface CableFamily {
  id: string;
  name: string;
  code: string;
  voltageClass: 'LV' | 'MV' | 'HV' | 'EHV' | 'Control';
  description: string;
  standards: string[];
}

export interface CableConfigOptions {
  customerCode?: string;
  family: string;
  voltage: string;
  conductorMaterial: 'Copper' | 'Aluminum';
  conductorSize: string; // e.g., '240 mm²'
  conductorClass?: string;
  noOfCores: '1 Core' | '2 Core' | '3 Core' | '4 Core' | '5 Core' | 'Multi-Core' | 'Single Core' | string;
  insulation: 'XLPE' | 'PVC' | 'EPR' | string;
  screenType?: string;
  innerSheath: 'PVC' | 'PE' | 'LSZH' | 'None' | string;
  armour: 'SWA' | 'STA' | 'AWA' | 'Unarmoured' | 'No Armour' | 'Steel Wire Armour' | 'Steel Tape Armour' | 'Aluminum Wire Armour' | string;
  outerSheath: 'PVC' | 'PE' | 'MDPE' | 'HDPE' | 'LSZH' | 'LSHF' | string;
  standard: string;
  color: string;
  specialRequirement: string;
}

export interface CableSpecs {
  cableCode: string;
  shortDescription: string;
  approxDiameterMm: number;
  approxWeightKgKm: number;
  maxConductorResistance20C: number; // Ohm/km
  currentRatingGroundAmps: number;
  currentRatingAirAmps: number;
  voltageRating: string;
  insulationThicknessMm: number;
  outerSheathThicknessMm: number;
  standardRef: string;
}

export interface ResolvedCableStructure {
  // 1-5: Commercial & Family Definition
  customerCode: string;
  cableFamily: string;
  cableType?: string;
  standard: string;
  voltage: string;

  // 6-10: Conductor Engineering
  conductor: string;
  conductorClass: string;
  conductorConstruction?: string;
  conductorCSA: string;
  conductorWaterTight?: string;

  // 11-15: Core & Insulation Design
  core: string;
  coreIdentification?: string;
  coreConstruction?: string;
  insulation: string;
  insulationThickness?: number | string;

  // 16-21: Semi-Conductor & Metallic Screen
  outerSemiConductor?: string;
  outerSemiConductorType?: string;
  screen: string;
  screenCSA?: string;
  screenWaterTight?: string;
  screenConstruction?: string;

  // 22-28: Bedding, Filler & Armour
  fillerBinder?: string;
  bedding?: string;
  armour: string;
  armourMaterial?: string;
  armourCSA?: string;
  armourWaterTight?: string;
  innerSheath?: string;

  // 29-35: Outer Sheathing, Additives & CPR
  sheathing: string;
  sheathingColor: string;
  specialAdditives?: string;
  semiConductiveSheath?: string;
  graphiteCoating?: string;
  cpr?: string;
  cprClass?: string;
  edr?: string;

  // 36-40: Auto-Calculated Physical & Electrical Performance
  cableDiameter: number;
  totalCableWeight: number;
  minBendingRadius?: number;
  operatingTemp?: string;
  shortCircuitRating?: string;

  // 41-45: Logistics, Packaging & Special Customer Requirements
  cuttingLengthM?: number;
  lengthTolerance?: string;
  drumType?: string;
  drumCapacityM?: number;
  specialCustomerRequirements?: string;

  // Identification & ERP References
  cableMaterialNumber: string;
  itemCode: string;
  cableDescription: string;
  rawCatalogItem?: MasterCableCatalogItem;
  resolvedAt?: string;
  d365ItemRef?: string;
  productionValidation?: CuttingLengthValidation;
}

export interface CuttingLengthValidation {
  cuttingLength: number; // in meters, decimal supported
  unit: 'meter';
  isValid: boolean;
  validationStatus: 'VALID' | 'WARNING' | 'INVALID';
  statusMessage: string;
  minProductionLengthM: number;
  maxContinuousLengthM: number;
  recommendedDrum?: string;
  drumCapacityM?: number;
  drumWeightLimitKg?: number;
  totalCableWeightKg: number;
  totalGrossWeightKg?: number;
  exceedsDrumCapacity: boolean;
  exceedsContinuousLimit: boolean;
  belowMinProductionLimit: boolean;
  customerCompliance: boolean;
  warnings: string[];
  errors: string[];
  readyForInquiry: boolean;
}

export interface FinalCableProductionResult {
  cableMaterial: string;
  itemCode: string;
  cableDescription: string;
  cuttingLength: number;
  cableDiameter: number;
  cableWeight: number; // kg/km
  totalWeightForLengthKg: number;
  validationStatus: 'VALID' | 'WARNING' | 'INVALID';
  statusDetails: string;
  readyForInquiry: boolean;
  resolvedStructure: ResolvedCableStructure;
  validation: CuttingLengthValidation;
}

export interface DrumItem {
  id: string;
  drumType: string;
  flangeDiameterMm: number;
  barrelDiameterMm: number;
  overallWidthMm: number;
  maxCapacityLengthM: number;
  maxWeightKg: number;
  tareWeightKg: number;
  material: 'Wooden' | 'Steel' | 'Reel';
}

export interface OptimizationResult {
  drumNo: number;
  cableLengthM: number;
  noOfDrums?: number;
  totalLengthM?: number;
  drumType: string;
  drumWeightKg: number;
  cableWeightKg?: number;
  totalWeightKg: number;
}

export interface MetalLmeRates {
  copperLmeUsdMt: number;
  aluminumLmeUsdMt: number;
  exchangeRateUsdEgp: number;
  xlpeUsdKg: number;
  pvcUsdKg: number;
  steelTapeUsdKg: number;
  updatedAt: string;
}

export interface PriceEstimate {
  id: string;
  cableCode: string;
  totalLengthM: number;
  currency: 'USD' | 'EUR' | 'EGP';
  copperCost: number;
  aluminumCost: number;
  insulationCost: number;
  sheathCost: number;
  armourCost: number;
  drumsCost: number;
  packingCost: number;
  transportationCost: number;
  marginCost: number;
  unitPricePerKm: number;
  totalEstimatedPrice: number;
  estimatedDeliveryDays: number;
  validityDays: number;
  version: 'Estimate V1' | 'Estimate V2' | 'Estimate V3';
  createdAt: string;
}

export interface CustomerTransaction {
  id: string;
  type: 'Invoice' | 'Payment' | 'Credit Note';
  documentNo: string;
  documentDate: string;
  dueDate: string;
  amountUsd: number;
  balanceUsd: number;
  status: 'Open' | 'Paid' | 'Overdue';
}

export interface CustomerStatementSummary {
  customerName: string;
  customerCode: string;
  creditLimitUsd: number;
  availableCreditUsd: number;
  outstandingBalanceUsd: number;
  overdueAmountUsd: number;
  aging: {
    currentUsd: number;
    days1_30Usd: number;
    days31_60Usd: number;
    days61_90Usd: number;
    days90PlusUsd: number;
  };
}

export type SalesOrderStatus = 'Open' | 'Invoiced' | 'Delivered' | 'Closed' | 'Canceled';

export interface SalesOrderItem {
  serial: number;
  itemCode: string;
  cableCode: string;
  description: string;
  uom: 'KM' | 'M' | 'Reel' | 'PCS';
  qty: number;
  unitPriceUsd: number;
  totalPriceUsd: number;
}

export interface SalesOrder {
  id: string;
  soNumber: string;
  customerPoRef: string;
  customerName: string;
  customerCode?: string;
  projectName: string;
  salesAgent: string;
  orderDate: string;
  deliveryDate: string;
  currency: 'USD' | 'EGP' | 'SAR' | 'EUR';
  totalAmountUsd: number;
  status: SalesOrderStatus;
  invoiceRef?: string;
  paymentStatus?: 'Unpaid' | 'Partially Paid' | 'Fully Paid';
  items: SalesOrderItem[];
  remarks?: string;
  deliveryAddress?: string;
}

export interface ProductionOrder {
  id: string;
  orderNo: string;
  customerName: string;
  cableCode: string;
  orderQtyM: number;
  producedQtyM: number;
  progressPercent: number;
  currentStage: 'Drawing' | 'Stranding' | 'Insulation' | 'Armoring' | 'Sheathing' | 'Testing' | 'Packing';
  status: 'In Production' | 'Testing' | 'Completed' | 'Planned' | 'Delayed';
  estimatedCompletionDate: string;
}

export type UserType = 'customer' | 'internal';

export interface ModulePermissions {
  overview: boolean;
  technicalOffice: boolean;
  costingPricing: boolean;
  salesQuotations: boolean;
  ordersProduction: boolean;
  financeCollections: boolean;
  userManagement: boolean;
  masterData: boolean;
  reportsAnalytics: boolean;
  customerPortalAccess: boolean;
}

export interface JwtTokenClaims {
  sub: string; // User ID
  name: string;
  email: string;
  userType: UserType;
  role: string;
  department: string;
  companyName?: string;
  permissions: ModulePermissions;
  iss: string; // Issuer (e.g. "EnergyaDotNet9JwtAuthority")
  aud: string; // Audience (e.g. "EnergyaConnectApi")
  iat: number; // Issued at timestamp
  exp: number; // Expiration timestamp
  nbf?: number; // Not before timestamp
}

export interface AuthJwtResponse {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  refreshToken: string;
  user: UserAccount;
  claims: JwtTokenClaims;
}

export interface RoleDefinition {
  id: string;
  name: string; // e.g. "System Administrator", "Sales Representative", "Technical Office Manager", "Customer Portal Client"
  normalizedName: string;
  description: string;
  userType: UserType;
  defaultPermissions: ModulePermissions;
  isSystemRole?: boolean;
}

export interface PasswordResetToken {
  email: string;
  token: string;
  expiresAt: string;
  status: 'Pending' | 'Used' | 'Expired';
}

export interface UserAccount {
  id: string;
  userType: UserType;
  userName: string;
  fullName: string;
  email: string;
  department: string; // e.g. 'Sales', 'Technical Office', 'Costing', 'Customer Account - SEC'
  role: string; // e.g. 'Sales Manager', 'IT Administrator', 'Purchasing Lead'
  status: 'Active' | 'Inactive' | 'Pending Approval' | 'Locked';
  permissions: ModulePermissions;
  companyName?: string;
  /** Customer Master legal name when it differs from the trading name. */
  companyLegalName?: string;
  /** Customer Master logo URL/path. Never the Energya lockup. */
  companyLogoUrl?: string;
  /** Customer Master membership/marketing tagline shown under the company name. */
  companyTagline?: string;
  customerCode?: string;
  /** Legacy/denormalized customer key. Canonical scope is CustomerUser → Customer. */
  customerId?: string;
  /** Active CustomerUser master ids from the authenticated session (getMe). */
  customerMasterIds?: string[];
  lastLogin?: string;
  passwordHash?: string;
  jwtToken?: string;
  refreshToken?: string;
  username?: string;
  roles?: string[];
  mobile?: string;
  employeeNumber?: string;
  jobTitle?: string;
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  suggestedAction?: {
    label: string;
    payload?: any;
  };
}

// ==========================================
// CABLE CONFIGURATOR PARAMETER MASTERS
// ==========================================

export interface BaseCableParameterMaster {
  id: string;
  code: string;
  description: string;
  active: boolean;
  sortOrder: number;
  // Relationship & Contextual Attributes
  cableFamilyId?: string;
  familyCode?: string;
  voltageClass?: 'LV' | 'MV' | 'HV' | 'EHV' | 'OHTL' | 'Control' | 'Special' | string;
  applicableFamilies?: string[];
  applicableVoltages?: string[];
  applicableStandards?: string[];
  customerCode?: string;
  metadata?: Record<string, any>;
}

export interface CableFamilyMaster extends BaseCableParameterMaster {
  parentId?: string | null; // For hierarchical multi-level family structuring
  isCategory?: boolean;
  standardPrefix?: string;
}

export interface VoltageMaster extends BaseCableParameterMaster {
  nominalVoltageKv?: number;
  ratedU0_U?: string; // e.g. "0.6/1 kV", "18/30 (36) kV"
  voltageClass: 'LV' | 'MV' | 'HV' | 'EHV' | 'Control' | 'Special' | string;
}

export interface ConductorMaterialMaster extends BaseCableParameterMaster {
  symbol: 'Cu' | 'Al' | 'Other' | string;
  densityGcm3?: number;
  conductivityIacs?: number;
}

export interface ConductorClassMaster extends BaseCableParameterMaster {
  classNumber: 1 | 2 | 5 | 6 | number;
  flexibilityType: 'Solid' | 'Stranded' | 'Compacted' | 'Flexible' | 'Extra Flexible' | string;
}

export interface CoreConfigurationMaster extends BaseCableParameterMaster {
  coreCount: number | string;
  coreType: 'Single' | 'Multi-Core' | 'Sector' | 'Triplex' | string;
}

export interface InsulationMaterialMaster extends BaseCableParameterMaster {
  shortCode: 'XLPE' | 'PVC' | 'EPR' | 'Other' | string;
  maxContinuousTempC?: number;
  maxShortCircuitTempC?: number;
}

export interface ScreenTypeMaster extends BaseCableParameterMaster {
  screenCategory: 'Copper Wire Screen' | 'Copper Tape Screen' | 'Lead Sheath' | 'Aluminum Screen' | 'Metallic Screen' | 'No Screen' | 'Other' | string;
  isMetallic?: boolean;
}

export interface ArmourTypeMaster extends BaseCableParameterMaster {
  armourCategory: 'No Armour' | 'Steel Wire Armour' | 'Copper Wire Armour' | 'Steel Tape Armour' | 'Aluminum Wire Armour' | 'Other' | string;
  shortCode?: string; // 'SWA' | 'STA' | 'AWA' | 'CWA' | 'None'
}

export interface SheathingMaterialMaster extends BaseCableParameterMaster {
  polymerType: 'MDPE' | 'LSHF' | 'PVC' | 'PE' | 'Other' | string;
  isHalogenFree?: boolean;
  isFlameRetardant?: boolean;
  uvResistant?: boolean;
}

export interface SheathingColorMaster extends BaseCableParameterMaster {
  colorName: string;
  hexCode: string;
}

export interface CableStandardMaster extends BaseCableParameterMaster {
  organization: 'IEC' | 'BS' | 'DIN' | 'ASTM' | 'BASEC' | string;
  title: string;
}

export interface AllCableParameterMasters {
  families: CableFamilyMaster[];
  voltages: VoltageMaster[];
  conductorMaterials: ConductorMaterialMaster[];
  conductorClasses: ConductorClassMaster[];
  cores: CoreConfigurationMaster[];
  insulations: InsulationMaterialMaster[];
  screenTypes: ScreenTypeMaster[];
  armours: ArmourTypeMaster[];
  sheathings: SheathingMaterialMaster[];
  sheathingColors: SheathingColorMaster[];
  standards: CableStandardMaster[];
}

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
  /** MaxLoad = permitted cable payload (kg). Not gross weight. */
  maxWeight?: number | null;
  /** Flange clearance (mm); required for Ø ≤ 50 mm capacity calc. */
  clearanceMm?: number | null;
  /** Empty drum net weight (kg) for logistics; excluded from payload capacity. */
  emptyDrumNetWeightKg?: number | null;
  /** Absent in source workbook — do not invent mm vs m. */
  dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE';
  capacityUom: 'CONFIGURATION_REQUIRED';
  status: MasterRecordStatus;
  sourceBatch?: string;
  createdAt: string;
  updatedAt: string;
}

export type DrumSelectionMethod = 'MANUAL' | 'AUTOMATIC';

export type DrumSelectionStatus =
  | 'SELECTED_MANUAL_PROTOTYPE'
  | 'SELECTED_MANUAL_EWD'
  | 'SELECTED_AUTOMATIC_EWD'
  | 'CONFIGURATION_REQUIRED'
  | 'DRUM_NOT_FOUND'
  | 'DRUM_INACTIVE'
  | 'MASTER_EMPTY';

export interface DrumSelectionInput {
  method: DrumSelectionMethod;
  drumMaster: DrumMasterRecord[];
  selectedDrumCode?: string;
  prototypeDrumType?: string;
  cuttingLengthMeters?: number;
  cableDiameterMm?: number;
  cableWeightKgKm?: number;
}

export interface DrumSelectionResult {
  method: DrumSelectionMethod;
  status: DrumSelectionStatus;
  selectedDrum: DrumMasterRecord | null;
  prototypeDrumType?: string;
  /** Unranked Drum Master rows for lookup only. Never an automatic pick. */
  referenceDrums: DrumMasterRecord[];
  blockingReasons: string[];
  warnings: string[];
}

export interface RawMaterialMasterRecord {
  id: string;
  rawMaterialCode: string;
  description: string;
  shortDescription?: string;
  uom: string;
  materialType?: string;
  category?: string;
  pricingCategory?: 'MARKET_METAL_COPPER' | 'MARKET_METAL_ALUMINIUM' | 'STANDARD_RAW_MATERIAL';
  metalType?: 'COPPER' | 'ALUMINIUM' | 'NONE';
  notes?: string;
  supplier?: string;
  /** Always null when source price is blank. Never store 0 as a fake price. */
  price: number | null;
  currency?: string;
  priceStatus: 'CONFIGURED' | 'PRICE_NOT_CONFIGURED';
  /** DATA_REQUIRED when a numeric price has no source effective dates. */
  priceTemporalStatus?: 'EFFECTIVE' | 'DATA_REQUIRED' | 'PRICE_NOT_CONFIGURED';
  priceEffectiveFrom?: string | null;
  priceEffectiveTo?: string | null;
  status: MasterRecordStatus;
  sourceBatch?: string;
  createdAt: string;
  updatedAt: string;
}

export type MasterImportKind = 'cables' | 'boms' | 'drums' | 'raw_materials';

export interface ImportRowError {
  rowNumber: number;
  field?: string;
  code: string;
  message: string;
}

export interface ImportBatchRecord {
  batchNumber: string;
  sourceFile: string;
  importedBy: string;
  importedDate: string;
  dataType: MasterImportKind;
  rowCount: number;
  successCount: number;
  errorCount: number;
  warningCount: number;
  skippedCount?: number;
  duplicateCount?: number;
  status: 'COMMITTED' | 'REJECTED' | 'PARTIAL' | 'PREVIEWED';
  errors: ImportRowError[];
  warnings: ImportRowError[];
  information?: ImportRowError[];
  skipped?: ImportRowError[];
}

export interface MasterDataQualityKpi {
  totalCables: number;
  activeCables: number;
  cablesWithoutBom: number;
  bomsWithMissingRawMaterials: number;
  rawMaterialsWithoutPrice: number;
  activeDrums: number;
  inactiveDrums: number;
  cablesMissingDiameter: number;
  cablesMissingWeight: number;
  duplicateCables: number;
  duplicateBoms: number;
  invalidReferences: number;
  missingCostingConfiguration: number;
}

export type QualitySeverity = 'VALID' | 'WARNING' | 'ERROR';

export interface MasterDataQualityIssue {
  severity: QualitySeverity;
  domain: string;
  key: string;
  message: string;
}
