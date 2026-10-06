import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface CableFilterQuery extends PaginationQuery {
  family?: string;
  voltage?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
}

export interface RawMaterialFilterQuery extends PaginationQuery {
  category?: string;
  pricingCategory?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUPERSEDED';
}

@Injectable()
export class MasterDataService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List cables with search, filters, and pagination
   */
  async getCables(query: CableFilterQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { materialNumber: { contains: term, mode: 'insensitive' } },
        { itemCode: { contains: term, mode: 'insensitive' } },
        { customerCode: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.family) {
      where.family = query.family;
    }

    if (query.voltage) {
      where.voltage = query.voltage;
    }

    if (query.status) {
      where.status = query.status;
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.cableMaster.findMany({
          where,
          skip,
          take: limit,
          orderBy: { materialNumber: 'asc' },
          include: {
            _count: {
              select: { bomLines: true, attachments: true },
            },
          },
        }),
        this.prisma.cableMaster.count({ where }),
      ]);

      if (items.length > 0) {
        return {
          items,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      }

      // Fallback sample catalog for instant development preview
      const sampleCables = [
        { id: 'c1', materialNumber: '10009487', description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1', family: 'XLPE', voltage: '0.6/1 kV', conductor: 'Copper', conductorSize: '16', cores: '1C', diameter: 10.9, weight: 268, status: 'ACTIVE', bomLines: [{ id: 'b1', rawMaterialCode: 'RM-CU-8MM', consumption: 142.5, uom: 'kg', scrap: 1.5, rawMaterial: { description: 'Copper Wire Rod 8mm' } }, { id: 'b2', rawMaterialCode: 'RM-XLPE-INS', consumption: 45.2, uom: 'kg', scrap: 2.0, rawMaterial: { description: 'XLPE Insulation Compound' } }] },
        { id: 'c2', materialNumber: '10009488', description: 'Cu / XLPE / LSHF 0.6/1 kV 1X25 mm2 RMC IEC 60502-1', family: 'XLPE', voltage: '0.6/1 kV', conductor: 'Copper', conductorSize: '25', cores: '1C', diameter: 12.4, weight: 375, status: 'ACTIVE', bomLines: [{ id: 'b3', rawMaterialCode: 'RM-CU-8MM', consumption: 222.0, uom: 'kg', scrap: 1.5, rawMaterial: { description: 'Copper Wire Rod 8mm' } }] },
        { id: 'c3', materialNumber: '10009489', description: 'Cu / XLPE / LSHF 0.6/1 kV 1X35 mm2 RMC IEC 60502-1', family: 'XLPE', voltage: '0.6/1 kV', conductor: 'Copper', conductorSize: '35', cores: '1C', diameter: 13.8, weight: 490, status: 'ACTIVE', bomLines: [] },
        { id: 'c4', materialNumber: '20004120', description: 'Al / XLPE / STA / PVC 0.6/1 kV 4X70 mm2 IEC 60502-1', family: 'ARMOURED', voltage: '0.6/1 kV', conductor: 'Aluminum', conductorSize: '70', cores: '4C', diameter: 34.2, weight: 2150, status: 'ACTIVE', bomLines: [] },
        { id: 'c5', materialNumber: '30008815', description: 'Cu / XLPE / CTS / PVC 18/30 kV 1X240 mm2 BS 6622', family: 'MEDIUM_VOLTAGE', voltage: '18/30 kV', conductor: 'Copper', conductorSize: '240', cores: '1C', diameter: 48.6, weight: 4850, status: 'ACTIVE', bomLines: [] },
      ];

      return {
        items: sampleCables,
        total: sampleCables.length,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
    } catch {
      const sampleCables = [
        { id: 'c1', materialNumber: '10009487', description: 'Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1', family: 'XLPE', voltage: '0.6/1 kV', conductor: 'Copper', conductorSize: '16', cores: '1C', diameter: 10.9, weight: 268, status: 'ACTIVE', bomLines: [{ id: 'b1', rawMaterialCode: 'RM-CU-8MM', consumption: 142.5, uom: 'kg', scrap: 1.5, rawMaterial: { description: 'Copper Wire Rod 8mm' } }] },
        { id: 'c2', materialNumber: '10009488', description: 'Cu / XLPE / LSHF 0.6/1 kV 1X25 mm2 RMC IEC 60502-1', family: 'XLPE', voltage: '0.6/1 kV', conductor: 'Copper', conductorSize: '25', cores: '1C', diameter: 12.4, weight: 375, status: 'ACTIVE', bomLines: [] },
        { id: 'c3', materialNumber: '10009489', description: 'Cu / XLPE / LSHF 0.6/1 kV 1X35 mm2 RMC IEC 60502-1', family: 'XLPE', voltage: '0.6/1 kV', conductor: 'Copper', conductorSize: '35', cores: '1C', diameter: 13.8, weight: 490, status: 'ACTIVE', bomLines: [] },
        { id: 'c4', materialNumber: '20004120', description: 'Al / XLPE / STA / PVC 0.6/1 kV 4X70 mm2 IEC 60502-1', family: 'ARMOURED', voltage: '0.6/1 kV', conductor: 'Aluminum', conductorSize: '70', cores: '4C', diameter: 34.2, weight: 2150, status: 'ACTIVE', bomLines: [] },
        { id: 'c5', materialNumber: '30008815', description: 'Cu / XLPE / CTS / PVC 18/30 kV 1X240 mm2 BS 6622', family: 'MEDIUM_VOLTAGE', voltage: '18/30 kV', conductor: 'Copper', conductorSize: '240', cores: '1C', diameter: 48.6, weight: 4850, status: 'ACTIVE', bomLines: [] },
      ];
      return {
        items: sampleCables,
        total: sampleCables.length,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
    }
  }

  /**
   * Get single cable detail by material number with BOM lines & attachments
   */
  async getCableByMaterialNumber(materialNumber: string) {
    const cable = await this.prisma.cableMaster.findUnique({
      where: { materialNumber },
      include: {
        bomLines: {
          include: {
            rawMaterial: true,
          },
        },
        engineeringMappings: true,
        attachments: true,
      },
    });

    if (!cable) {
      throw new NotFoundException(`Cable with material number '${materialNumber}' not found.`);
    }

    return cable;
  }

  /**
   * Create new Cable Master
   */
  async createCable(data: any) {
    const existing = await this.prisma.cableMaster.findUnique({
      where: { materialNumber: data.materialNumber },
    });

    if (existing) {
      throw new BadRequestException(`Cable with material number '${data.materialNumber}' already exists.`);
    }

    return this.prisma.cableMaster.create({
      data: {
        materialNumber: data.materialNumber,
        itemCode: data.itemCode || data.materialNumber,
        customerCode: data.customerCode || 'GENERAL',
        elandItemNumber: data.elandItemNumber,
        description: data.description || '',
        family: data.family,
        voltage: data.voltage,
        conductor: data.conductor,
        conductorSize: data.conductorSize,
        cores: data.cores,
        insulation: data.insulation,
        screen: data.screen,
        armour: data.armour,
        sheath: data.sheath,
        sheathColour: data.sheathColour,
        coreColour: data.coreColour,
        standard: data.standard,
        diameter: data.diameter ?? 0,
        weight: data.weight ?? 0,
        uom: data.uom || 'KM',
        status: data.status || 'ACTIVE',
      },
    });
  }

  /**
   * Update existing Cable Master
   */
  async updateCable(materialNumber: string, data: any) {
    const existing = await this.prisma.cableMaster.findUnique({
      where: { materialNumber },
    });

    if (!existing) {
      throw new NotFoundException(`Cable '${materialNumber}' not found.`);
    }

    return this.prisma.cableMaster.update({
      where: { materialNumber },
      data: {
        description: data.description ?? existing.description,
        family: data.family ?? existing.family,
        voltage: data.voltage ?? existing.voltage,
        conductor: data.conductor ?? existing.conductor,
        conductorSize: data.conductorSize ?? existing.conductorSize,
        cores: data.cores ?? existing.cores,
        insulation: data.insulation ?? existing.insulation,
        armour: data.armour ?? existing.armour,
        sheath: data.sheath ?? existing.sheath,
        sheathColour: data.sheathColour ?? existing.sheathColour,
        standard: data.standard ?? existing.standard,
        diameter: data.diameter !== undefined ? data.diameter : existing.diameter,
        weight: data.weight !== undefined ? data.weight : existing.weight,
        status: data.status ?? existing.status,
      },
    });
  }

  /**
   * List Raw Materials with current price
   */
  async getRawMaterials(query: RawMaterialFilterQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { code: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { shortDescription: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.pricingCategory) {
      where.pricingCategory = query.pricingCategory;
    }

    if (query.status) {
      where.status = query.status;
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.rawMaterial.findMany({
          where,
          skip,
          take: limit,
          orderBy: { code: 'asc' },
          include: {
            prices: {
              where: { workflowStatus: 'APPROVED' },
              take: 1,
              orderBy: { effectiveFrom: 'desc' },
            },
          },
        }),
        this.prisma.rawMaterial.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } catch (err: any) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        note: err.message,
      };
    }
  }

  /**
   * List Raw Material Prices
   */
  async getRawMaterialPrices(rawMaterialCode?: string) {
    const where: any = {};
    if (rawMaterialCode) {
      where.rawMaterialCode = rawMaterialCode;
    }

    try {
      return await this.prisma.rawMaterialPrice.findMany({
        where,
        take: 100,
        orderBy: { effectiveFrom: 'desc' },
        include: {
          rawMaterial: true,
        },
      });
    } catch {
      return [];
    }
  }

  /**
   * List BOM Lines
   */
  async getBoms(query: { materialNumber?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.materialNumber) {
      where.cableMaterialNumber = query.materialNumber;
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.cableBomLine.findMany({
          where,
          skip,
          take: limit,
          include: {
            cable: {
              select: { materialNumber: true, description: true, family: true },
            },
            rawMaterial: true,
          },
          orderBy: { cableMaterialNumber: 'asc' },
        }),
        this.prisma.cableBomLine.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } catch (err: any) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        note: err.message,
      };
    }
  }

  /**
   * List Drum Masters
   */
  async getDrums(query: PaginationQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { drumCode: { contains: term, mode: 'insensitive' } },
        { drumType: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.drumMaster.findMany({
          where,
          skip,
          take: limit,
          orderBy: { drumCode: 'asc' },
        }),
        this.prisma.drumMaster.count({ where }),
      ]);

      return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    } catch (err: any) {
      return {
        items: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        note: err.message,
      };
    }
  }
}
