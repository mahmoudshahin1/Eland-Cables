import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';
import { ImportsRepository } from './imports.repository.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ImportsRepository, PrismaService],
  exports: [ImportsService, ImportsRepository],
})
export class ImportsSubModule {}
