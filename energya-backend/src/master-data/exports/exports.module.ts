import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';
import { ExportsRepository } from './exports.repository.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  controllers: [ExportsController],
  providers: [ExportsService, ExportsRepository, PrismaService],
  exports: [ExportsService, ExportsRepository],
})
export class ExportsSubModule {}
