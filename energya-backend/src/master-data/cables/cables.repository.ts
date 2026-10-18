import { Injectable, Inject } from '@nestjs/common';
import { Prisma, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service.js';
import { cableFromRow, MasterCableDto } from '../common/master-data-dto.js';
import { writeAudit } from '../../shared/infra/legacy-ports.js';

export function cableFamilyFilterWhere(family: string): Prisma.CableMasterWhereInput {
  const value = family.trim();
  const key = value.toUpperCase();
  const contains = (text: string): Prisma.StringFilter => ({ contains: text, mode: 'insensitive' });
  const or: Prisma.CableMasterWhereInput[] = [{ family: contains(value) }, { voltage: contains(value) }];
  if (key === 'LV') {
    or.push(
      { family: contains('L.V') },
      { family: contains('LOW VOLTAGE') },
      { description: contains('0.6/1') },
      { description: contains('600/1000') },
    );
  } else if (key === 'MV') {
    or.push(
      { family: contains('M.V') },
      { family: contains('MEDIUM VOLTAGE') },
      { description: contains('6/10') },
      { description: contains('8.7/15') },
      { description: contains('11 KV') },
      { description: contains('12/20') },
      { description: contains('18/30') },
      { description: contains('33 KV') },
    );
  } else if (key === 'HV') {
    or.push(
      { family: contains('H.V') },
      { family: contains('HIGH VOLTAGE') },
      { description: contains('66 KV') },
      { description: contains('132 KV') },
      { description: contains('220 KV') },
    );
  } else if (key === 'CONTROL') {
    or.push(
      { family: contains('INSTRUMENT') },
      { description: contains('CONTROL') },
      { description: contains('INSTRUMENT') },
    );
  }
  return { OR: or };
}

@Injectable()
export class CablesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAll(): Promise<MasterCableDto[]> {
    const rows = await this.prisma.cableMaster.findMany({
      orderBy: { materialNumber: 'asc' },
    });
    return rows.map(cableFromRow);
  }

  async getByMaterialNumber(materialNumber: string): Promise<MasterCableDto | null> {
    const row = await this.prisma.cableMaster.findUnique({
      where: { materialNumber },
    });
    return row ? cableFromRow(row) : null;
  }

  async search(query: {
    q?: string;
    customerCode?: string;
    itemCode?: string;
    materialNumber?: string;
    family?: string;
    voltage?: string;
    conductor?: string;
    cores?: string;
    diameter?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ total: number; page: number; pageSize: number; cables: MasterCableDto[] }> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize || 25));
    const contains = (value?: string) =>
      value && value.trim() ? { contains: value.trim(), mode: 'insensitive' as const } : undefined;

    const and: Prisma.CableMasterWhereInput[] = [{ status: 'ACTIVE' }];
    if (query.customerCode) and.push({ customerCode: contains(query.customerCode)! });
    if (query.itemCode) and.push({ itemCode: contains(query.itemCode)! });
    if (query.materialNumber) and.push({ materialNumber: contains(query.materialNumber)! });
    if (query.family) and.push(cableFamilyFilterWhere(query.family));
    if (query.voltage) and.push({ voltage: contains(query.voltage)! });
    if (query.conductor) and.push({ conductor: contains(query.conductor)! });
    if (query.cores) and.push({ cores: contains(query.cores)! });
    if (query.diameter && Number.isFinite(Number(query.diameter))) {
      and.push({ diameter: Number(query.diameter) });
    }
    if (query.q && query.q.trim()) {
      const q = query.q.trim();
      and.push({
        OR: [
          { customerCode: { contains: q, mode: 'insensitive' } },
          { itemCode: { contains: q, mode: 'insensitive' } },
          { materialNumber: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { family: { contains: q, mode: 'insensitive' } },
          { voltage: { contains: q, mode: 'insensitive' } },
          { conductor: { contains: q, mode: 'insensitive' } },
          { cores: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.CableMasterWhereInput = { AND: and };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.cableMaster.count({ where }),
      this.prisma.cableMaster.findMany({
        where,
        orderBy: { materialNumber: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, cables: rows.map(cableFromRow) };
  }

  async create(input: any, actor: any): Promise<MasterCableDto> {
    const existing = await this.prisma.cableMaster.findUnique({
      where: { materialNumber: input.cableCode },
    });
    if (existing) {
      const err = new Error('Cable material number already exists.');
      (err as any).code = 'DUPLICATE_MATERIAL_NUMBER';
      throw err;
    }

    const created = await this.prisma.cableMaster.create({
      data: cableWriteData(input),
    });

    await writeAudit({
      actor,
      entity: 'CableMaster',
      entityId: created.materialNumber,
      action: 'CREATE',
      newValue: created,
    });

    return cableFromRow(created);
  }

  async update(materialNumber: string, input: any, actor: any): Promise<MasterCableDto | null> {
    const existing = await this.prisma.cableMaster.findUnique({
      where: { materialNumber },
    });
    if (!existing) return null;

    const merged = {
      ...cableFromRow(existing),
      ...input,
      cableCode: materialNumber,
    };

    const updated = await this.prisma.cableMaster.update({
      where: { materialNumber },
      data: {
        ...cableWriteData(merged),
        status: input.status === 'INACTIVE' ? 'INACTIVE' : input.status === 'ACTIVE' ? 'ACTIVE' : existing.status,
      },
    });

    const action =
      existing.status !== updated.status
        ? updated.status === 'INACTIVE'
          ? 'DEACTIVATE'
          : 'ACTIVATE'
        : 'UPDATE';

    await writeAudit({
      actor,
      entity: 'CableMaster',
      entityId: materialNumber,
      action,
      oldValue: existing,
      newValue: updated,
    });

    return cableFromRow(updated);
  }
}

function cableWriteData(input: any) {
  const authority = input.authorityFields;
  return {
    materialNumber: input.cableCode,
    itemCode: input.itemCode,
    customerCode: input.customerCode,
    elandItemNumber: input.elandItemNumber || null,
    description: input.description,
    family: authority ? authority.family ?? null : input.family ?? null,
    voltage: authority ? authority.voltage ?? null : input.voltageClass || null,
    conductor: authority ? authority.conductor ?? null : input.conductor || null,
    cores: authority ? authority.cores ?? null : input.cores || null,
    conductorSize: authority
      ? authority.conductorSize ?? null
      : input.crossSectionMm2 != null
        ? String(input.crossSectionMm2)
        : null,
    insulation: authority ? authority.insulation ?? null : input.insulation ?? null,
    screen: authority ? authority.screen ?? null : input.screen ?? null,
    armour: authority ? authority.armour ?? null : input.armour ?? null,
    sheath: authority ? authority.sheath ?? null : input.sheath ?? null,
    sheathColour: authority ? authority.sheathColour ?? null : input.sheathColour ?? null,
    coreColour: authority ? authority.coreColour ?? null : input.coreColour ?? null,
    standard: authority ? authority.standard ?? null : input.standard ?? null,
    diameter: input.outerDiameterMm,
    weight: input.approxWeightKgKm,
    uom: (authority?.uom || input.uom || 'CONFIGURATION_REQUIRED') as string,
    status: (input.status === 'INACTIVE' ? RecordStatus.INACTIVE : RecordStatus.ACTIVE) as RecordStatus,
  };
}
