import { Module } from '@nestjs/common';
import { ReferenceController } from './reference.controller.js';
import { ReferenceService } from './reference.service.js';
import { ReferenceRepository } from './reference.repository.js';
import { AuthModule } from '../../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ReferenceController],
  providers: [ReferenceService, ReferenceRepository],
  exports: [ReferenceService, ReferenceRepository],
})
export class ReferenceSubModule {}
