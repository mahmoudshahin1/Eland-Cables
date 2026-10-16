import { Injectable, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service.js';
import { cableFromRow, MasterCableDto } from '../common/master-data-dto.js';

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
}
