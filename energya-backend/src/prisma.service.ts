import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ [Prisma] Connected successfully to database.');
    } catch (err: any) {
      console.warn('⚠️ [Prisma] Could not connect to PostgreSQL database (' + err.message + '). Backend is operating with mock/resilient fallback.');
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
}
