/**
 * Machine-readable data ownership matrix.
 * Write ownership is exclusive to the owning module; others read via published APIs.
 */

export type OwnershipKind = 'WRITE' | 'READ' | 'SHARED_READ';

export interface DataOwnershipRow {
  entity: string;
  ownerModuleId: string;
  writeApiPrefixes: string[];
  readModules: string[];
  notes?: string;
  frozen?: boolean;
}

export const DATA_OWNERSHIP_MATRIX: DataOwnershipRow[] = [
  {
    entity: 'Customer',
    ownerModuleId: 'CUSTOMER',
    writeApiPrefixes: ['/api/admin/customers'],
    readModules: ['INQUIRY_QUOTATION', 'SALES', 'COMMERCIAL', 'PRICING', 'ADMIN'],
  },
  {
    entity: 'CustomerUser',
    ownerModuleId: 'CUSTOMER',
    writeApiPrefixes: ['/api/admin/customers'],
    readModules: ['SECURITY', 'ADMIN'],
  },
  {
    entity: 'CableMaster',
    ownerModuleId: 'CABLE_MASTER',
    writeApiPrefixes: ['/api/master/cables', '/api/cables'],
    readModules: ['ENGINEERING', 'BOM', 'COSTING', 'INQUIRY_QUOTATION', 'MASTER_DATA'],
  },
  {
    entity: 'DrumMaster',
    ownerModuleId: 'CABLE_MASTER',
    writeApiPrefixes: ['/api/master/drums'],
    readModules: ['INQUIRY_QUOTATION', 'ENGINEERING', 'COSTING'],
    notes: 'Drum optimization compute is CABLE_MASTER packaging, not a separate module.',
  },
  {
    entity: 'CableBomLine',
    ownerModuleId: 'BOM',
    writeApiPrefixes: ['/api/master/boms', '/api/master/bom-conflicts'],
    readModules: ['COSTING', 'ENGINEERING', 'CABLE_MASTER'],
  },
  {
    entity: 'GovernedBomLine',
    ownerModuleId: 'BOM',
    writeApiPrefixes: ['/api/master/bom-conflicts'],
    readModules: ['COSTING', 'ENGINEERING'],
  },
  {
    entity: 'CableEngineeringMapping',
    ownerModuleId: 'ENGINEERING',
    writeApiPrefixes: ['/api/master/engineering-mappings', '/api/technical-office'],
    readModules: ['BOM', 'CABLE_MASTER', 'COSTING'],
  },
  {
    entity: 'RawMaterial',
    ownerModuleId: 'MASTER_DATA',
    writeApiPrefixes: ['/api/master/raw-materials'],
    readModules: ['COSTING', 'BOM', 'PRICE'],
    notes: 'Price proposals owned by costing price workflow (PRICE permissions).',
  },
  {
    entity: 'RawMaterialPrice',
    ownerModuleId: 'COSTING',
    writeApiPrefixes: ['/api/master/raw-material-prices'],
    readModules: ['COSTING', 'ENGINEERING'],
    notes: 'TO cannot approve; Costing Team / policy roles approve.',
  },
  {
    entity: 'CommercialInquiry',
    ownerModuleId: 'INQUIRY_QUOTATION',
    writeApiPrefixes: ['/api/inquiries'],
    readModules: ['COSTING', 'PRICING', 'COMMERCIAL', 'SALES'],
  },
  {
    entity: 'CommercialQuotation',
    ownerModuleId: 'INQUIRY_QUOTATION',
    writeApiPrefixes: ['/api/quotations'],
    readModules: ['COMMERCIAL', 'SALES', 'PRICING'],
  },
  {
    entity: 'CommercialPricingRule',
    ownerModuleId: 'PRICING',
    writeApiPrefixes: ['/api/commercial-pricing', '/api/master/commercial-pricing-rules'],
    readModules: ['INQUIRY_QUOTATION'],
  },
  {
    entity: 'CommercialCommitment',
    ownerModuleId: 'COMMERCIAL',
    writeApiPrefixes: ['/api/commercial-commitments'],
    readModules: ['SALES'],
    frozen: true,
  },
  {
    entity: 'EpcSalesOrder',
    ownerModuleId: 'SALES',
    writeApiPrefixes: ['/api/sales-orders'],
    readModules: ['COMMERCIAL', 'INQUIRY_QUOTATION'],
    frozen: true,
  },
  {
    entity: 'SalesAgreement',
    ownerModuleId: 'SALES',
    writeApiPrefixes: ['/api/sales-agreements'],
    readModules: ['COMMERCIAL'],
    frozen: true,
  },
  {
    entity: 'AgreementRelease',
    ownerModuleId: 'SALES',
    writeApiPrefixes: ['/api/agreement-releases'],
    readModules: ['COMMERCIAL'],
    frozen: true,
  },
  {
    entity: 'CostingFormula',
    ownerModuleId: 'COSTING',
    writeApiPrefixes: ['/api/admin/costing'],
    readModules: ['INQUIRY_QUOTATION'],
  },
  {
    entity: 'CostingMetalCostComponent',
    ownerModuleId: 'COSTING',
    writeApiPrefixes: ['/api/admin/costing'],
    readModules: [],
    notes: 'Option B / Decision 5 freeze — semantics must not change.',
    frozen: true,
  },
  {
    entity: 'CostingDocumentSequence',
    ownerModuleId: 'COSTING',
    writeApiPrefixes: ['/api/admin/costing'],
    readModules: ['PLATFORM'],
    notes: 'Wrapped by platform NumberSequence service; cursor remains authoritative for SC/FM/FX.',
  },
  {
    entity: 'NumberSequence',
    ownerModuleId: 'PLATFORM',
    writeApiPrefixes: ['/api/v2/number-sequences'],
    readModules: ['ADMIN', 'COSTING', 'INQUIRY_QUOTATION'],
  },
  {
    entity: 'PlatformFieldDefinition',
    ownerModuleId: 'PLATFORM',
    writeApiPrefixes: ['/api/admin/platform/fields', '/api/v2/metadata'],
    readModules: ['INQUIRY_QUOTATION', 'ADMIN'],
    notes: 'Configures typed entities — not EAV transaction storage.',
  },
  {
    entity: 'AuditEvent',
    ownerModuleId: 'PLATFORM',
    writeApiPrefixes: ['(append-only via repositories)'],
    readModules: ['ADMIN', 'SECURITY', 'COSTING'],
    notes: 'Server AuditEvent is authoritative; client localStorage is compatibility-only.',
  },
  {
    entity: 'UserAccount',
    ownerModuleId: 'ADMIN',
    writeApiPrefixes: ['/api/admin/users'],
    readModules: ['SECURITY'],
  },
  {
    entity: 'Role',
    ownerModuleId: 'SECURITY',
    writeApiPrefixes: ['/api/admin/roles'],
    readModules: ['ADMIN'],
    notes: 'Role doubles as PermissionSet in V1 compatibility mode.',
  },
  {
    entity: 'SecurityGroup',
    ownerModuleId: 'SECURITY',
    writeApiPrefixes: ['/api/v2/security/groups'],
    readModules: ['ADMIN'],
  },
  {
    entity: 'Permission',
    ownerModuleId: 'SECURITY',
    writeApiPrefixes: ['(seed / catalog only)'],
    readModules: ['ADMIN'],
    notes: 'Controlled catalog — administrators cannot invent triples.',
  },
  {
    entity: 'ContainerType',
    ownerModuleId: 'LOGISTICS',
    writeApiPrefixes: ['/api/v2/container-types'],
    readModules: ['INQUIRY_QUOTATION', 'COSTING', 'ENGINEERING'],
    notes: 'Dimensions require Technical Office / Logistics approval. Excel sample sizes are not production truth.',
  },
  {
    entity: 'ContainerStudy',
    ownerModuleId: 'LOGISTICS',
    writeApiPrefixes: ['/api/v2/container-studies', '/api/v2/inquiries'],
    readModules: ['INQUIRY_QUOTATION', 'COMMERCIAL'],
    notes: 'customerScope isolation. Calculation engine not implemented (05I-DD).',
  },
  {
    entity: 'DrumPackingProfile',
    ownerModuleId: 'LOGISTICS',
    writeApiPrefixes: ['/api/v2/packing-profiles'],
    readModules: ['ENGINEERING', 'INQUIRY_QUOTATION'],
    notes: 'Flange is not inferred as shipping envelope.',
  },
  {
    entity: 'DestinationPort',
    ownerModuleId: 'LOGISTICS',
    writeApiPrefixes: ['/api/v2/destination-ports'],
    readModules: ['INQUIRY_QUOTATION', 'COMMERCIAL'],
    notes: 'Canonical code is identity. Shared platform master — not a shipping-only copy.',
  },
  {
    entity: 'Incoterm',
    ownerModuleId: 'LOGISTICS',
    writeApiPrefixes: ['/api/v2/incoterms'],
    readModules: ['INQUIRY_QUOTATION', 'COMMERCIAL'],
    notes: 'Canonical code is identity. Do not reuse CostingLogisticsRule.',
  },
  {
    entity: 'ShippingCostRate',
    ownerModuleId: 'LOGISTICS',
    writeApiPrefixes: ['/api/v2/shipping-cost-rates'],
    readModules: ['INQUIRY_QUOTATION', 'COMMERCIAL'],
    notes: 'Customer shipment rate. Not metal shipping. No FX. Customers cannot view or manage.',
  },
  {
    entity: 'ShipmentCostSnapshot',
    ownerModuleId: 'LOGISTICS',
    writeApiPrefixes: ['/api/v2/shipment-cost-snapshots'],
    readModules: ['INQUIRY_QUOTATION', 'COMMERCIAL'],
    notes: 'Immutable customer-shipment proof bound to a CONFIRMED ContainerStudyResult. No CostingRun FK. No FX.',
  },
  {
    entity: 'FinancialOfferSnapshot',
    ownerModuleId: 'INQUIRY_QUOTATION',
    writeApiPrefixes: ['/api/v2/financial-offer-snapshots'],
    readModules: ['COMMERCIAL', 'SALES'],
    notes:
      'Financial aggregation SoT (B4-D). Does not write CommercialQuotation.commercialOfferSnapshot. Consumes CommercialPricingSnapshot + ShipmentCostSnapshot. No FX. No CostingRun FK.',
  },
];

export function ownershipForEntity(entity: string): DataOwnershipRow | undefined {
  return DATA_OWNERSHIP_MATRIX.find((r) => r.entity === entity);
}

export function entitiesOwnedBy(moduleId: string): DataOwnershipRow[] {
  return DATA_OWNERSHIP_MATRIX.filter((r) => r.ownerModuleId === moduleId);
}

export function assertWriteOwner(entity: string, moduleId: string): boolean {
  const row = ownershipForEntity(entity);
  return Boolean(row && row.ownerModuleId === moduleId);
}
