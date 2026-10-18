import { Module } from '@nestjs/common';
import { MarketMetalsController } from './market-metals.controller.js';
import { MarketMetalsService } from './market-metals.service.js';
import { MarketMetalsRepository } from './market-metals.repository.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  controllers: [MarketMetalsController],
  providers: [MarketMetalsService, MarketMetalsRepository, PrismaService],
  exports: [MarketMetalsService, MarketMetalsRepository],
})
export class MarketMetalsSubModule {}
