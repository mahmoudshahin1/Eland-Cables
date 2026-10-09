import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Controller('api/platform')
export class AppController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('health')
  async getHealth() {
    let dbStatus: { ok: boolean; postgresql: boolean; prisma: boolean; error?: string };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = { ok: true, postgresql: true, prisma: true };
    } catch (err: any) {
      dbStatus = {
        ok: false,
        postgresql: false,
        prisma: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    return {
      ok: true,
      service: 'energya-connect',
      architecture: 'modular-monolith',
      database: dbStatus,
    };
  }

  @Get('status')
  async getStatus() {
    let dbStatus: { ok: boolean; postgresql: boolean; prisma: boolean; error?: string };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = { ok: true, postgresql: true, prisma: true };
    } catch (err: any) {
      dbStatus = {
        ok: false,
        postgresql: false,
        prisma: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    return {
      persistence: dbStatus.ok ? 'POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT' : 'BROWSER_LOCAL_AND_PROCESS_MEMORY',
      postgresql: dbStatus.ok,
      nestjs: true,
      prisma: Boolean(process.env.DATABASE_URL),
      d365DomainAdapters: 'NOT_IMPLEMENTED',
      note: 'GET /api/d365/sync-status remains a prototype stub and must not be treated as live ERP connectivity. localStorage remains until each domain is fully cut over.',
      database: dbStatus,
    };
  }
}
