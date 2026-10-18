import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma.service.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';
import { writeAudit } from '../../shared/infra/legacy-ports.js';
import {
  appendFrozenSheet,
  createWorkbook,
  excelDate,
  excelNumber,
  isSecretExportField,
  workbookToBuffer,
} from '../../shared/infra/excelWorkbook.js';
import { resolveCustomerCommercialProfile } from '../../shared/domain/customerMasterProfile.js';

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

export const VALID_EXPORT_ENTITIES = new Set<string>([
  'customers',
  'drums',
  'cables',
  'cable-boms',
  'raw-materials',
  'raw-material-prices',
  'destination-ports',
  'incoterms',
  'payment-terms',
  'payment-methods',
  'classifications',
  'segments',
]);

@Injectable()
export class ExportsRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async exportEntity(
    actor: RequestActor,
    entity: MasterExportEntity,
    filter: { q?: string; status?: string; type?: string } = {},
  ): Promise<{ buffer: Buffer; filename: string; rowCounts: Record<string, number> }> {
    const wb = createWorkbook();
    const q = String(filter.q || '').trim().toLowerCase();
    const matches = (value: unknown) => !q || String(value || '').toLowerCase().includes(q);
    let rowCounts: Record<string, number> = {};

    if (entity === 'customers') {
      const where: any = {};
      if (filter.q) {
        where.OR = [
          { code: { contains: filter.q, mode: 'insensitive' } },
          { name: { contains: filter.q, mode: 'insensitive' } },
          { legalName: { contains: filter.q, mode: 'insensitive' } },
        ];
      }
      if (filter.status && filter.status !== 'all') where.status = filter.status;
      if (filter.type && filter.type !== 'all') where.type = filter.type;

      const rows = await this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        include: {
          addresses: true,
          contacts: true,
          externalMappings: true,
          deliveryCombinations: { include: { destinationPort: true, incoterm: true } },
          classification: true,
          segment: true,
          paymentTerm: true,
          paymentMethod: true,
          customerGroup: true,
        },
      });

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
      if (headers.some((h) => isSecretExportField(h))) {
        throw new BadRequestException('Secret fields cannot be exported.');
      }
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
        }),
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
          ]),
        ),
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
          ]),
        ),
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
          ]),
        ),
      );
      rowCounts = {
        customers: rows.length,
        addresses: rows.reduce((n, r) => n + r.addresses.length, 0),
        contacts: rows.reduce((n, r) => n + r.contacts.length, 0),
        deliveryPreferences: rows.reduce((n, r) => n + r.deliveryCombinations.length, 0),
      };
    } else if (entity === 'drums') {
      const drums = (
        await this.prisma.drumMaster.findMany({ orderBy: { drumCode: 'asc' } })
      ).filter(
        (row) =>
          matches(`${row.drumCode} ${row.description || ''}`) &&
          (!filter.status || filter.status === 'ALL' || filter.status === 'all' || row.status === filter.status),
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
        ]),
      );
      rowCounts = { drums: drums.length };
    } else if (entity === 'cables') {
      const cables = (
        await this.prisma.cableMaster.findMany({ orderBy: { materialNumber: 'asc' } })
      ).filter((row) =>
        matches(`${row.materialNumber} ${row.itemCode} ${row.customerCode} ${row.description} ${row.family || ''}`),
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
        ]),
      );
      rowCounts = { cables: cables.length };
    } else if (entity === 'cable-boms') {
      const boms = (
        await this.prisma.cableBomLine.findMany({
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
        ]),
      );
      rowCounts = { boms: boms.length };
    } else if (entity === 'raw-materials') {
      const rms = (
        await this.prisma.rawMaterial.findMany({ orderBy: { code: 'asc' } })
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
        ]),
      );
      rowCounts = { rawMaterials: rms.length };
    } else if (entity === 'raw-material-prices') {
      const prices = (
        await this.prisma.rawMaterialPrice.findMany({ orderBy: [{ rawMaterialCode: 'asc' }, { createdAt: 'desc' }] })
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
        ]),
      );
      rowCounts = { prices: prices.length };
    } else if (entity === 'destination-ports') {
      const ports = (
        await this.prisma.destinationPort.findMany({ orderBy: { code: 'asc' } })
      ).filter((row) => matches(`${row.code} ${row.name} ${row.countryCode}`));
      appendFrozenSheet(
        wb,
        'Destination_Ports',
        ['Code', 'Name', 'Country', 'Active', 'Notes'],
        ports.map((row) => [row.code, row.name, row.countryCode, row.active, row.notes]),
      );
      rowCounts = { ports: ports.length };
    } else if (entity === 'incoterms') {
      const incoterms = (
        await this.prisma.incoterm.findMany({ orderBy: { code: 'asc' } })
      ).filter((row) => matches(`${row.code} ${row.name}`));
      appendFrozenSheet(
        wb,
        'Incoterms',
        ['Code', 'Name', 'Description', 'Active'],
        incoterms.map((row) => [row.code, row.name, row.description, row.active]),
      );
      rowCounts = { incoterms: incoterms.length };
    } else if (entity === 'payment-terms') {
      const rows = await this.prisma.paymentTerm.findMany({ orderBy: { code: 'asc' } });
      appendFrozenSheet(
        wb,
        'Payment_Terms',
        ['Code', 'Name', 'Description', 'Active'],
        rows.filter((row) => matches(`${row.code} ${row.name}`)).map((row) => [row.code, row.name, row.description, row.active]),
      );
      rowCounts = { paymentTerms: rows.length };
    } else if (entity === 'payment-methods') {
      const rows = await this.prisma.paymentMethod.findMany({ orderBy: { code: 'asc' } });
      appendFrozenSheet(
        wb,
        'Payment_Methods',
        ['Code', 'Name', 'Description', 'Active'],
        rows.filter((row) => matches(`${row.code} ${row.name}`)).map((row) => [row.code, row.name, row.description, row.active]),
      );
      rowCounts = { paymentMethods: rows.length };
    } else if (entity === 'classifications') {
      const rows = await this.prisma.customerClassification.findMany({ orderBy: { code: 'asc' } });
      appendFrozenSheet(
        wb,
        'Classifications',
        ['Code', 'Name', 'Description', 'Active'],
        rows.filter((row) => matches(`${row.code} ${row.name}`)).map((row) => [row.code, row.name, row.description, row.active]),
      );
      rowCounts = { classifications: rows.length };
    } else if (entity === 'segments') {
      const rows = await this.prisma.customerSegment.findMany({ orderBy: { code: 'asc' } });
      appendFrozenSheet(
        wb,
        'Segments',
        ['Code', 'Name', 'Description', 'Active'],
        rows.filter((row) => matches(`${row.code} ${row.name}`)).map((row) => [row.code, row.name, row.description, row.active]),
      );
      rowCounts = { segments: rows.length };
    } else {
      throw new BadRequestException(`Unknown master export entity: ${entity}`);
    }

    await writeAudit({
      actor,
      entity: 'Export',
      entityId: entity,
      action: 'EXPORT_EXCEL',
      newValue: { entity, scope: filter, rowCounts },
      message: `Exported ${entity}`,
    });

    const file = `${entity.replace(/-/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { buffer: workbookToBuffer(wb), filename: file, rowCounts };
  }

  async exportRawMaterialPrices(filter?: {
    rawMaterialCode?: string;
    workflowStatus?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    const where: any = {};
    if (filter?.rawMaterialCode) {
      where.rawMaterialCode = { contains: filter.rawMaterialCode, mode: 'insensitive' };
    }
    if (filter?.workflowStatus && filter.workflowStatus !== 'ALL') {
      where.workflowStatus = filter.workflowStatus;
    }

    const prices = await this.prisma.rawMaterialPrice.findMany({
      where,
      orderBy: [{ rawMaterialCode: 'asc' }, { createdAt: 'desc' }],
      include: { rawMaterial: { select: { description: true } } },
    });

    const headers = [
      'Raw Material Code',
      'Description',
      'Price',
      'Currency',
      'UOM',
      'Effective From',
      'Effective To',
      'Status',
      'Approval Status',
      'Supplier',
      'Source',
      'Price Basis',
      'Comment',
    ];

    const data = prices.map((p) => [
      p.rawMaterialCode,
      p.rawMaterial?.description || '',
      p.price != null ? Number(p.price) : '',
      p.currency || '',
      p.uom || '',
      p.effectiveFrom ? new Date(p.effectiveFrom).toISOString().slice(0, 10) : '',
      p.effectiveTo ? new Date(p.effectiveTo).toISOString().slice(0, 10) : '',
      p.status || 'ACTIVE',
      p.workflowStatus || 'APPROVED',
      p.supplier || '',
      p.source || '',
      p.priceBasis || 'PER_KG',
      p.comment || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Raw Material Prices');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return { buffer, filename: 'Raw_Material_Prices_Template.xlsx' };
  }

  async exportCableScrapTemplate(options?: {
    metal?: string;
    family?: string;
    search?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    const metalFilter = options?.metal ? options.metal.toUpperCase() : undefined;
    const familyFilter = options?.family ? options.family.trim().toUpperCase() : undefined;
    const search = options?.search ? options.search.trim() : undefined;

    const bomLines = await this.prisma.governedBomLine.findMany({
      select: { cableMaterialNumber: true },
      distinct: ['cableMaterialNumber'],
    });
    const materialNumbers = bomLines.map((b) => b.cableMaterialNumber);

    const cables = await this.prisma.cableMaster.findMany({
      where: {
        materialNumber: { in: materialNumbers },
        ...(search
          ? {
              OR: [
                { materialNumber: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { itemCode: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        engineeringMappings: {
          where: { isCurrent: true },
          take: 1,
        },
        governedBomLines: true,
      },
      orderBy: [{ family: 'asc' }, { materialNumber: 'asc' }],
    });

    const rows: Array<any> = [];
    for (const cable of cables) {
      const mapping = cable.engineeringMappings[0];
      const family = mapping?.family || cable.family || '';
      const conductor = mapping?.conductor || cable.conductor || '';
      const metal = conductor.toUpperCase().includes('AL') ? 'AL' : 'CU';

      if (metalFilter && metalFilter !== 'ALL' && metal !== metalFilter) continue;
      if (familyFilter && familyFilter !== 'ALL' && family.toUpperCase() !== familyFilter) continue;

      const firstScrap = cable.governedBomLines.find((l) => l.scrapPercentage != null)?.scrapPercentage;
      const scrapPercent = firstScrap != null ? Number(firstScrap) : null;

      rows.push({
        specificationCode: cable.customerCode || '',
        itemCode: cable.itemCode || '',
        cableMaterialNumber: cable.materialNumber,
        elandItemNumber: cable.elandItemNumber || '',
        cableDescription: cable.description || '',
        totalCableWeight: cable.weight != null ? Number(cable.weight) : null,
        cableDiameter: cable.diameter != null ? Number(cable.diameter) : null,
        metal,
        family,
        qtyMeters: 1000,
        scrapPercent,
      });
    }

    const cableMasterHeaders = [
      'Specification Code',
      'Item Code',
      'Cable Material Number',
      'Eland Item Number',
      'Cable Description',
      'Total Cable Weight',
      'Cable Diameter',
      'Metal',
      'Family',
    ];
    const cableMasterData = [
      cableMasterHeaders,
      ...rows.map((r) => [
        r.specificationCode,
        r.itemCode,
        r.cableMaterialNumber,
        r.elandItemNumber,
        r.cableDescription,
        r.totalCableWeight != null ? r.totalCableWeight : '',
        r.cableDiameter != null ? r.cableDiameter : '',
        r.metal,
        r.family,
      ]),
    ];
    const cableMasterSheet = XLSX.utils.aoa_to_sheet(cableMasterData);

    const cableBomData = [
      ['Cable Material Number', 'Metal', 'Family', 'Scrap %'],
      ...rows.map((r) => [
        r.cableMaterialNumber,
        r.metal,
        r.family,
        r.scrapPercent != null ? `${r.scrapPercent}%` : '',
      ]),
    ];
    const cableBomSheet = XLSX.utils.aoa_to_sheet(cableBomData);

    const costingRefData = [
      ['Cable Material Number', 'Qty (Meter)', 'Metal Cost / Km', 'Polymer Cost / Km', 'Other Cost / Km', 'Total Direct RM Cost / Km'],
      ...rows.map((r) => [r.cableMaterialNumber, r.qtyMeters, '', '', '', '']),
    ];
    const costingRefSheet = XLSX.utils.aoa_to_sheet(costingRefData);

    const instructionsSheet = XLSX.utils.aoa_to_sheet([
      ['Costing Reference Workbook — Data Ownership'],
      [''],
      ['Sheet responsibilities'],
      ['Cable_Master', 'Reference only. Import cable identity via Import Center (Master Data → Import).'],
      ['Cable_BOM', 'Scrap % upload for Costing Configuration. Only Scrap % is imported.'],
      ['Costing_Reference', 'Validation targets only. Direct RM costs are never imported.'],
      [''],
      ['Scrap rules'],
      ['1. Cable Material Number is the primary key on Cable_BOM.'],
      ['2. Scrap % updates GovernedBomLine.scrapPercentage (all BOM lines for that cable).'],
      ['3. Scrap is not written to Cable Master and is not included in Direct RM Cost today.'],
      ['4. Enter Scrap % as 1.5 or 1.5%. Leave blank to skip a row.'],
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, cableMasterSheet, 'Cable_Master');
    XLSX.utils.book_append_sheet(wb, cableBomSheet, 'Cable_BOM');
    XLSX.utils.book_append_sheet(wb, costingRefSheet, 'Costing_Reference');
    XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const suffix = [options?.metal, options?.family].filter(Boolean).join('_') || 'All';
    return { buffer, filename: `Cable_Scrap_Rates_${suffix}.xlsx` };
  }

  async exportEngineeringMappings(filter?: {
    status?: string;
    workflowStatus?: string;
    q?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    const andList: any[] = [{ isCurrent: true }];
    if (filter?.status) andList.push({ mappingStatus: filter.status });
    if (filter?.workflowStatus) andList.push({ status: filter.workflowStatus });
    if (filter?.q) {
      andList.push({
        OR: [
          { materialNumber: { contains: filter.q, mode: 'insensitive' } },
          { cable: { description: { contains: filter.q, mode: 'insensitive' } } },
        ],
      });
    }

    const mappings = await this.prisma.cableEngineeringMapping.findMany({
      where: andList.length ? { AND: andList } : {},
      orderBy: { materialNumber: 'asc' },
      include: { cable: true },
    });

    const headers = [
      'Cable Material Number',
      'Description',
      'Family',
      'Voltage',
      'Conductor',
      'Conductor Size',
      'Cores',
      'Insulation',
      'Screen',
      'Armour',
      'Sheath',
      'Sheath Colour',
      'Core Colour',
      'Standard',
      'Special Additives',
      'Comment',
    ];

    const data = mappings.map((m) => [
      m.materialNumber,
      m.cable?.description || '',
      m.family || '',
      m.voltage || '',
      m.conductor || '',
      m.conductorSize || '',
      m.cores || '',
      m.insulation || '',
      m.screen || '',
      m.armour || '',
      m.sheath || '',
      m.sheathColour || '',
      m.coreColour || '',
      m.standard || '',
      m.specialAdditives || '',
      m.comments || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Engineering Mapping');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return { buffer, filename: 'Engineering_Mapping_Export.xlsx' };
  }

  async exportBomConflicts(filter?: {
    investigationStatus?: string;
    classification?: string;
    q?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    const andList: any[] = [{ conflictId: { startsWith: 'BOM-CONF-' } }];
    if (filter?.investigationStatus) andList.push({ investigationStatus: filter.investigationStatus });
    if (filter?.classification) andList.push({ classification: filter.classification });
    if (filter?.q) {
      andList.push({
        OR: [
          { conflictId: { contains: filter.q, mode: 'insensitive' } },
          { cableMaterialNumber: { contains: filter.q, mode: 'insensitive' } },
          { rawMaterialCode: { contains: filter.q, mode: 'insensitive' } },
        ],
      });
    }

    const conflicts = await this.prisma.bomDuplicateObservation.findMany({
      where: { AND: andList },
      orderBy: { conflictId: 'asc' },
    });

    const headers = [
      'Conflict ID',
      'Cable Material Number',
      'Cable Description',
      'Customer Code',
      'Raw Material Code',
      'Raw Material Description',
      'Weight A (Source)',
      'Weight B (Source)',
      'Selected Weight (Governed)',
      'UOM',
      'Source Rows',
      'Occurrence Count',
      'Classification',
      'Investigation Status',
      'BOM Version',
      'Plant',
      'Manufacturing Route',
      'Effective From',
      'Reviewer',
      'Decision',
      'Comment',
      'Approved By',
      'Approved Date',
    ];

    const data = conflicts.map((c) => [
      c.conflictId,
      c.cableMaterialNumber,
      c.cableDescription || '',
      c.customerCode || '',
      c.rawMaterialCode,
      c.rawMaterialDesc || '',
      Number(c.weightA),
      Number(c.weightB),
      c.selectedWeight != null ? Number(c.selectedWeight) : '',
      c.uom,
      Array.isArray(c.sourceRows) ? (c.sourceRows as any[]).join(', ') : '',
      c.occurrenceCount,
      c.classification,
      c.investigationStatus,
      c.bomVersion || '',
      c.plant || '',
      c.manufacturingRoute || '',
      c.effectiveFrom ? new Date(c.effectiveFrom).toISOString().slice(0, 10) : '',
      c.reviewer || '',
      c.decision || '',
      c.comment || '',
      c.approvedBy || '',
      c.approvedAt ? new Date(c.approvedAt).toISOString().slice(0, 10) : '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOM Conflicts');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return { buffer, filename: 'BOM_Conflicts_Register.xlsx' };
  }

  async exportCommercialPricingRules(): Promise<{ buffer: Buffer; filename: string }> {
    const rules = await this.prisma.commercialPricingRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    const headers = [
      'Rule Code',
      'Rule Name',
      'Scope',
      'Rule Type',
      'Percentage Value (%)',
      'Currency',
      'Priority',
      'Customer ID',
      'Customer Group ID',
      'Customer Tier Code',
      'Cable Material Number',
      'Cable Family',
      'Effective From',
      'Effective To',
      'Workflow Status',
      'Record Status',
      'Revision',
      'Min Margin Threshold (%)',
      'Max Discount Allowed (%)',
      'Comment',
    ];

    const data = rules.map((r) => [
      r.ruleCode,
      r.ruleName,
      r.scope,
      r.ruleType,
      Number(r.percentageValue),
      r.currency,
      r.priority,
      r.customerId || '',
      r.customerGroupId || '',
      r.customerTierCode || '',
      r.cableMaterialNumber || '',
      r.cableFamily || '',
      r.effectiveFrom ? new Date(r.effectiveFrom).toISOString().slice(0, 10) : '',
      r.effectiveTo ? new Date(r.effectiveTo).toISOString().slice(0, 10) : '',
      r.workflowStatus,
      r.status,
      r.revision,
      r.minMarginThreshold != null ? Number(r.minMarginThreshold) : '',
      r.maxDiscountAllowed != null ? Number(r.maxDiscountAllowed) : '',
      r.comment || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pricing Rules');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    return { buffer, filename: 'Commercial_Pricing_Rules.xlsx' };
  }
}
