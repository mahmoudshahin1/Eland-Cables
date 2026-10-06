import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Fail loudly if database is unreachable (no mock or resilient fallback per Migration Rules)
    await this.$connect();
    this.logger.log('✅ [Prisma] Connected successfully to database.');
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {
      // Ignore disconnect errors during shutdown
    }
  }
}
