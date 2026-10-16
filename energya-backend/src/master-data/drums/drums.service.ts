import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DrumsRepository } from './drums.repository.js';
import { DrumCapacityService } from './drum-capacity.service.js';
import { DrumOptimizationService } from './drum-optimization.service.js';

@Injectable()
export class DrumsService {
  constructor(
    @Inject(DrumsRepository)
    private readonly drumsRepository: DrumsRepository,
    @Inject(DrumCapacityService)
    private readonly drumCapacityService: DrumCapacityService,
    @Inject(DrumOptimizationService)
    private readonly drumOptimizationService: DrumOptimizationService,
  ) {}

  async listDrums() {
    const drums = await this.drumsRepository.listDrums();
    return { drums };
  }

  async getDrum(drumCode: string) {
    const drum = await this.drumsRepository.getDrum(drumCode);
    if (!drum) {
      throw new NotFoundException({ error: 'Drum not found.' });
    }
    return { drum };
  }

  calculateCapacity(drum: any, cable: any) {
    const result = this.drumCapacityService.computeCapacity(drum || {}, cable || {});
    return { capacity: result };
  }

  async listCandidates(cable: any, cuttingLengthM: number, cableTolerancePercent: number) {
    const drums = await this.drumsRepository.listDrums();
    return this.drumOptimizationService.computeCandidates(drums, cable || {}, cuttingLengthM, cableTolerancePercent);
  }

  async validatePlan(cable: any, cableTolerancePercent: number, rows: any[], includeEngineering?: boolean) {
    const drums = await this.drumsRepository.listDrums();
    const plan = this.drumOptimizationService.validatePlan(drums, cable || {}, cableTolerancePercent, rows, includeEngineering);
    return { plan };
  }

  async optimizePlan(cable: any, body: any) {
    const drums = await this.drumsRepository.listDrums();
    const plan = this.drumOptimizationService.optimize(drums, cable || {}, body);
    return { plan };
  }
}
