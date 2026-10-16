import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';
import { bomFromRow } from '../common/master-data-dto.js';

@Injectable()
export class BomsRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listBoms() {
    const [rows, governed] = await Promise.all([
      this.prisma.cableBomLine.findMany({
        orderBy: [{ cableMaterialNumber: 'asc' }, { rawMaterialCode: 'asc' }],
      }),
      this.prisma.governedBomLine.findMany({
        where: { status: 'APPROVED' },
        select: { cableMaterialNumber: true, rawMaterialCode: true, bomVersion: true, scrapPercentage: true },
      }),
    ]);

    const scrapByLine = new Map<string, number | null>();
    for (const g of governed) {
      if (g.scrapPercentage == null) continue;
      const key = `${g.cableMaterialNumber}|${g.rawMaterialCode}|${g.bomVersion}`;
      scrapByLine.set(key, Math.round(Number(g.scrapPercentage) * 10000) / 100);
    }

    return rows.map((row) => {
      const key = `${row.cableMaterialNumber}|${row.rawMaterialCode}|${row.bomVersion}`;
      return bomFromRow({
        ...row,
        scrapPercent: scrapByLine.get(key) ?? null,
      });
    });
  }
}
