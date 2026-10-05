import { writeAudit } from './identityService';
import type { RequestActor } from './auth';
import { requirePrisma } from './identityService';
import { listCustomersMatching } from './customerAdminRepository';
import { listDestinationPorts, listIncoterms } from './shippingCostRepository';
import {
  appendFrozenSheet,
  createWorkbook,
  excelDate,
  excelNumber,
  isSecretExportField,
  workbookToBuffer,
} from './excelWorkbook';
import { resolveCustomerCommercialProfile } from '../domain/customerMasterProfile';
import { issue } from '../platform/errors/domainError';

export type MasterExportEntity =
  | 'customers'
  | 'drums'
  | 'cables'
  | 'cable-boms'
  | 'raw-materials'
  | 'raw-material-prices'
  | 'destination-ports'
  | 'incoterms'
  | 'payment-terms'
  | 'payment-methods'
  | 'classifications'
  | 'segments';

function containsSecretHeader(headers: string[]) {
  return headers.some((h) => isSecretExportField(h));
}

async function auditExport(
  actor: RequestActor,
  entity: string,
  scope: Record<string, unknown>,
  rowCounts: Record<string, number>
) {
  await writeAudit({
    actor,
    entity: 'Export',
    entityId: entity,
    action: 'EXPORT_EXCEL',
    newValue: { entity, scope, rowCounts },
    message: `Exported ${entity}`,
  });
}

function filename(entity: string) {
  return `${entity.replace(/-/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export async function exportMasterDataExcel(
  actor: RequestActor,
  entity: MasterExportEntity,
  filter: { q?: string; status?: string; type?: string } = {}
): Promise<{ buffer: Buffer; filename: string; rowCounts: Record<string, number> }> {
  const prisma = requirePrisma();
  const wb = createWorkbook();
  const q = String(filter.q || '').trim().toLowerCase();
  const matches = (value: unknown) => !q || String(value || '').toLowerCase().includes(q);
  let rowCounts: Record<string, number> = {};

  if (entity === 'customers') {
    const rows = await listCustomersMatching(filter);
    const headers = [
      'Customer Code',
      'Customer Name',
      'Legal Name',
      'Country',
      'Status',
      'Type',
      'Classification',
      'Segment',
      'Currency',
      'Customer Group',
      'Payment Terms',
      'Payment Method',
      'Tax/VAT',
      'External Mappings',
      'Remarks',
      'Created At',
      'Updated At',
    ];
    if (containsSecretHeader(headers)) throw issue('VALIDATION_FAILED', 'Secret fields cannot be exported.');
    appendFrozenSheet(
      wb,
      'Customer_Master',
      headers,
      rows.map((row) => {
        const profile = resolveCustomerCommercialProfile({
          defaultCurrency: row.defaultCurrency,
          type: row.type,
          paymentTerms: row.paymentTerms,
          paymentTerm: row.paymentTerm,
          paymentMethod: row.paymentMethod,
          classification: row.classification,
          segment: row.segment,
        });
        return [
          row.code,
          row.name,
          row.legalName,
          row.countryCode,
          row.status,
          row.type,
          profile.classificationName,
          profile.segmentName,
          profile.currencyCode,
          row.customerGroup?.name || null,
          profile.paymentTermName,
          profile.paymentMethodName,
          row.taxVatNumber,
          row.externalMappings
            .filter((m) => m.active)
            .map((m) => `${m.system}:${m.externalCustomerCode}`)
            .join(', ') || null,
          row.remarks,
          excelDate(row.createdAt),
          excelDate(row.updatedAt),
        ];
      })
    );
    appendFrozenSheet(
      wb,
      'Customer_Addresses',
      [
        'Customer Code',
        'Address Code',
        'Address Name',
        'Address Type',
        'Line 1',
        'Line 2',
        'City',
        'State / Region',
        'Country',
        'Postal Code',
        'Is Default',
        'Active',
      ],
      rows.flatMap((row) =>
        row.addresses.map((addr) => [
          row.code,
          addr.code,
          addr.name,
          addr.addressType,
          addr.line1,
          addr.line2,
          addr.city,
          addr.stateRegion,
          addr.countryCode,
          addr.postalCode,
          addr.isDefault,
          addr.active,
        ])
      )
    );
    appendFrozenSheet(
      wb,
      'Customer_Contacts',
      ['Customer Code', 'Contact Name', 'Job Title', 'Email', 'Phone', 'Mobile', 'Department', 'Is Primary', 'Active'],
      rows.flatMap((row) =>
        row.contacts.map((c) => [
          row.code,
          c.name,
          c.jobTitle,
          c.email,
          c.phone,
          c.mobile,
          c.department,
          c.isPrimary,
          c.active,
        ])
      )
    );
    appendFrozenSheet(
      wb,
      'Customer_Delivery_Preferences',
      ['Customer Code', 'Country', 'Country Code', 'Incoterm', 'Destination Port Code', 'Destination Port Name', 'Default', 'Active'],
      rows.flatMap((row) =>
        row.deliveryCombinations.map((pref) => [
          row.code,
          pref.countryLabel,
          pref.countryCode,
          pref.incotermCode,
          pref.destinationPortCode,
          pref.destinationPort.name,
          pref.isDefault,
          pref.active,
        ])
      )
    );
    rowCounts = {
      customers: rows.length,
      addresses: rows.reduce((n, r) => n + r.addresses.length, 0),
      contacts: rows.reduce((n, r) => n + r.contacts.length, 0),
      deliveryPreferences: rows.reduce((n, r) => n + r.deliveryCombinations.length, 0),
    };
  } else if (entity === 'drums') {
    const drums = (
      await prisma.drumMaster.findMany({ orderBy: { drumCode: 'asc' } })
    ).filter(
      (row) =>
        matches(`${row.drumCode} ${row.description || ''}`) &&
        (!filter.status || filter.status === 'ALL' || filter.status === 'all' || row.status === filter.status)
    );
    appendFrozenSheet(
      wb,
      'Drum_Master',
      [
        'Drum Code',
        'Description',
        'Flange',
        'Barrel',
        'Inner Width',
        'Outer Width',
        'Capacity',
        'Clearance Mm',
        'Max Load Kg',
        'Empty Drum Net Weight Kg',
        'Status',
        'Updated At',
      ],
      drums.map((row) => [
        row.drumCode,
        row.description,
        excelNumber(row.flange),
        excelNumber(row.barrel),
        excelNumber(row.innerWidth),
        excelNumber(row.outerWidth),
        excelNumber(row.capacity),
        excelNumber(row.clearanceMm),
        excelNumber(row.maxWeight),
        excelNumber(row.emptyDrumNetWeightKg),
        row.status,
        excelDate(row.updatedAt),
      ])
    );
    rowCounts = { drums: drums.length };
  } else if (entity === 'cables') {
    const cables = (
      await prisma.cableMaster.findMany({ orderBy: { materialNumber: 'asc' } })
    ).filter((row) =>
      matches(`${row.materialNumber} ${row.itemCode} ${row.customerCode} ${row.description} ${row.family || ''}`)
    );
    appendFrozenSheet(
      wb,
      'Cable_Master',
      [
        'Material Number',
        'Item Code',
        'Customer Code',
        'Description',
        'Family',
        'Voltage',
        'Conductor',
        'Size',
        'Cores',
        'Insulation',
        'Armour',
        'Sheath',
        'Diameter',
        'Weight',
        'Status',
      ],
      cables.map((row) => [
        row.materialNumber,
        row.itemCode,
        row.customerCode,
        row.description,
        row.family,
        row.voltage,
        row.conductor,
        row.conductorSize,
        row.cores,
        row.insulation,
        row.armour,
        row.sheath,
        excelNumber(row.diameter),
        excelNumber(row.weight),
        row.status,
      ])
    );
    rowCounts = { cables: cables.length };
  } else if (entity === 'cable-boms') {
    const boms = (
      await prisma.cableBomLine.findMany({
        orderBy: [{ cableMaterialNumber: 'asc' }, { rawMaterialCode: 'asc' }],
      })
    ).filter((row) => matches(`${row.cableMaterialNumber} ${row.rawMaterialCode} ${row.itemCode || ''}`));
    appendFrozenSheet(
      wb,
      'Cable_BOM',
      ['Cable Material Number', 'Raw Material Code', 'Item Code', 'Consumption', 'UOM', 'Scrap', 'BOM Version', 'Status'],
      boms.map((row) => [
        row.cableMaterialNumber,
        row.rawMaterialCode,
        row.itemCode,
        excelNumber(row.consumption),
        row.uom,
        excelNumber(row.scrap),
        excelNumber(row.bomVersion),
        row.status,
      ])
    );
    rowCounts = { boms: boms.length };
  } else if (entity === 'raw-materials') {
    const rms = (
      await prisma.rawMaterial.findMany({ orderBy: { code: 'asc' } })
    ).filter((row) => matches(`${row.code} ${row.description} ${row.category || ''}`));
    appendFrozenSheet(
      wb,
      'Raw_Materials',
      ['Code', 'Description', 'Category', 'Metal Type', 'UOM', 'Currency', 'Price Status', 'Status'],
      rms.map((row) => [
        row.code,
        row.description,
        row.category,
        row.metalType,
        row.uom,
        row.currency,
        row.priceStatus,
        row.status,
      ])
    );
    rowCounts = { rawMaterials: rms.length };
  } else if (entity === 'raw-material-prices') {
    const prices = (
      await prisma.rawMaterialPrice.findMany({ orderBy: [{ rawMaterialCode: 'asc' }, { createdAt: 'desc' }] })
    ).filter((row) => matches(`${row.rawMaterialCode} ${row.currency || ''}`));
    appendFrozenSheet(
      wb,
      'Raw_Material_Prices',
      [
        'Raw Material Code',
        'Price',
        'Currency',
        'UOM',
        'Price Date',
        'Effective From',
        'Effective To',
        'Workflow Status',
        'Current',
        'Revision',
      ],
      prices.map((row) => [
        row.rawMaterialCode,
        excelNumber(row.price),
        row.currency,
        row.uom,
        excelDate(row.priceDate),
        excelDate(row.effectiveFrom),
        excelDate(row.effectiveTo),
        row.workflowStatus,
        row.isCurrent,
        excelNumber(row.revision),
      ])
    );
    rowCounts = { prices: prices.length };
  } else if (entity === 'destination-ports') {
    const ports = (await listDestinationPorts()).filter((row) => matches(`${row.code} ${row.name} ${row.countryCode}`));
    appendFrozenSheet(
      wb,
      'Destination_Ports',
      ['Code', 'Name', 'Country', 'Active', 'Notes'],
      ports.map((row) => [row.code, row.name, row.countryCode, row.active, row.notes])
    );
    rowCounts = { ports: ports.length };
  } else if (entity === 'incoterms') {
    const incoterms = (await listIncoterms()).filter((row) => matches(`${row.code} ${row.name}`));
    appendFrozenSheet(
      wb,
      'Incoterms',
      ['Code', 'Name', 'Description', 'Active'],
      incoterms.map((row) => [row.code, row.name, row.description, row.active])
    );
    rowCounts = { incoterms: incoterms.length };
  } else if (entity === 'payment-terms') {
    const rows = await prisma.paymentTerm.findMany({ orderBy: { code: 'asc' } });
    appendFrozenSheet(
      wb,
      'Payment_Terms',
      ['Code', 'Name', 'Description', 'Active'],
      rows.filter((row) => matches(`${row.code} ${row.name}`)).map((row) => [row.code, row.name, row.description, row.active])
    );
    rowCounts = { paymentTerms: rows.length };
  } else if (entity === 'payment-methods') {
    const rows = await prisma.paymentMethod.findMany({ orderBy: { code: 'asc' } });
    appendFrozenSheet(
      wb,
      'Payment_Methods',
      ['Code', 'Name', 'Description', 'Active'],
      rows.filter((row) => matches(`${row.code} ${row.name}`)).map((row) => [row.code, row.name, row.description, row.active])
    );
    rowCounts = { paymentMethods: rows.length };
  } else if (entity === 'classifications') {
    const rows = await prisma.customerClassification.findMany({ orderBy: { code: 'asc' } });
    appendFrozenSheet(
      wb,
      'Classifications',
      ['Code', 'Name', 'Description', 'Active'],
      rows.filter((row) => matches(`${row.code} ${row.name}`)).map((row) => [row.code, row.name, row.description, row.active])
    );
    rowCounts = { classifications: rows.length };
  } else if (entity === 'segments') {
    const rows = await prisma.customerSegment.findMany({ orderBy: { code: 'asc' } });
    appendFrozenSheet(
      wb,
      'Segments',
      ['Code', 'Name', 'Description', 'Active'],
      rows.filter((row) => matches(`${row.code} ${row.name}`)).map((row) => [row.code, row.name, row.description, row.active])
    );
    rowCounts = { segments: rows.length };
  } else {
    throw issue('VALIDATION_FAILED', `Unknown master export entity: ${entity}`);
  }

  await auditExport(actor, entity, filter, rowCounts);
  return { buffer: workbookToBuffer(wb), filename: filename(entity), rowCounts };
}
