import { Module } from '@nestjs/common';
import { BomsController } from './boms.controller.js';
import { BomsService } from './boms.service.js';
import { BomsRepository } from './boms.repository.js';
import { AuthModule } from '../../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [BomsController],
  providers: [BomsService, BomsRepository],
  exports: [BomsService, BomsRepository],
})
export class BomsSubModule {}
