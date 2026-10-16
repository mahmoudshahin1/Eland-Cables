import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';
import { rmFromRow } from '../common/master-data-dto.js';

@Injectable()
export class RawMaterialsRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listRawMaterials() {
    const rows = await this.prisma.rawMaterial.findMany({
      include: { prices: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { code: 'asc' },
    });
    return rows.map(rmFromRow);
  }
}
