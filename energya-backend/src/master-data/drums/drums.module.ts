import { Module } from '@nestjs/common';
import { DrumsController } from './drums.controller.js';
import { DrumsService } from './drums.service.js';
import { DrumsRepository } from './drums.repository.js';
import { DrumCapacityService } from './drum-capacity.service.js';
import { DrumOptimizationService } from './drum-optimization.service.js';
import { AuthModule } from '../../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [DrumsController],
  providers: [
    DrumsService,
    DrumsRepository,
    DrumCapacityService,
    DrumOptimizationService,
  ],
  exports: [
    DrumsService,
    DrumsRepository,
    DrumCapacityService,
    DrumOptimizationService,
  ],
})
export class DrumsSubModule {}
