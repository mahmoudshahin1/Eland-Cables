import { Module } from '@nestjs/common';
import { RawMaterialsController } from './raw-materials.controller.js';
import { RawMaterialsService } from './raw-materials.service.js';
import { RawMaterialsRepository } from './raw-materials.repository.js';
import { AuthModule } from '../../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [RawMaterialsController],
  providers: [RawMaterialsService, RawMaterialsRepository],
  exports: [RawMaterialsService, RawMaterialsRepository],
})
export class RawMaterialsSubModule {}
