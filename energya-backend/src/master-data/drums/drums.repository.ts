import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';
import { drumFromRow } from '../common/master-data-dto.js';

@Injectable()
export class DrumsRepository {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async listDrums() {
    const rows = await this.prisma.drumMaster.findMany({
      orderBy: { drumCode: 'asc' },
    });
    return rows.map(drumFromRow);
  }

  async getDrum(drumCode: string) {
    const row = await this.prisma.drumMaster.findUnique({
      where: { drumCode },
    });
    return row ? drumFromRow(row) : null;
  }
}
