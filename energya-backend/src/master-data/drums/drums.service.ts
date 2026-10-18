import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DrumsRepository } from './drums.repository.js';
import { DrumCapacityService } from './drum-capacity.service.js';
import { DrumOptimizationService } from './drum-optimization.service.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

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

  async createDrum(body: any, actor: RequestActor) {
    if (!body?.drumCode) {
      throw new BadRequestException({ error: 'drumCode is required.' });
    }
    for (const field of ['flange', 'barrel', 'innerWidth', 'outerWidth', 'capacity'] as const) {
      if (body[field] == null || Number(body[field]) <= 0) {
        throw new BadRequestException({ error: `${field} is required and must be greater than zero.` });
      }
    }
    try {
      const drum = await this.drumsRepository.create(
        {
          id: `drm-${body.drumCode}`,
          drumCode: String(body.drumCode),
          drumType: body.drumType,
          description: body.description,
          flange: Number(body.flange),
          barrel: Number(body.barrel),
          innerWidth: Number(body.innerWidth),
          outerWidth: Number(body.outerWidth),
          capacity: Number(body.capacity),
          clearanceMm: body.clearanceMm != null ? Number(body.clearanceMm) : null,
          maxWeight: body.maxWeight != null ? Number(body.maxWeight) : null,
          emptyDrumNetWeightKg:
            body.emptyDrumNetWeightKg != null ? Number(body.emptyDrumNetWeightKg) : null,
          dimensionUnitNote: 'SOURCE_UNIT_NOT_IN_FILE',
          capacityUom: 'CONFIGURATION_REQUIRED',
          status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        actor,
      );
      return { drum };
    } catch (err: any) {
      if (err?.code === 'DUPLICATE_DRUM_CODE') {
        throw new ConflictException({ error: err.message, code: err.code });
      }
      if (err?.code === 'VALIDATION') {
        throw new BadRequestException({ error: err.message, code: err.code });
      }
      throw err;
    }
  }

  async updateDrum(drumCode: string, body: any, actor: RequestActor) {
    const hasDimensions =
      body?.flange != null ||
      body?.barrel != null ||
      body?.innerWidth != null ||
      body?.outerWidth != null ||
      body?.capacity != null ||
      body?.clearanceMm != null ||
      body?.maxWeight != null ||
      body?.emptyDrumNetWeightKg != null ||
      body?.description != null ||
      body?.drumType != null;

    try {
      if (hasDimensions) {
        const drum = await this.drumsRepository.update(drumCode, body, actor);
        if (!drum) throw new NotFoundException({ error: 'Drum not found.' });
        return { drum };
      }
      const status = body?.status;
      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        throw new BadRequestException({
          error: 'status must be ACTIVE or INACTIVE when no dimension fields are provided.',
        });
      }
      const drum = await this.drumsRepository.updateStatus(drumCode, status, actor);
      if (!drum) throw new NotFoundException({ error: 'Drum not found.' });
      return { drum };
    } catch (err: any) {
      if (err instanceof NotFoundException || err instanceof BadRequestException) throw err;
      if (err?.code === 'VALIDATION') {
        throw new BadRequestException({ error: err.message, code: err.code });
      }
      throw err;
    }
  }

  async deactivateOrDeleteDrum(drumCode: string, actor: RequestActor) {
    const result = await this.drumsRepository.deactivateOrDelete(drumCode, actor);
    if (!result) throw new NotFoundException({ error: 'Drum not found.' });
    return result;
  }

  async previewDrumExcel(rows: any) {
    if (!Array.isArray(rows)) {
      throw new BadRequestException({ error: 'rows[] is required.', code: 'VALIDATION' });
    }
    try {
      const preview = await this.drumsRepository.previewExcel(rows);
      return { preview, wrote: false };
    } catch (err: any) {
      if (err?.code === 'INVALID_TEMPLATE_HEADERS' || err?.code === 'VALIDATION') {
        throw new BadRequestException({ error: err.message, code: err.code, missing: err.missing });
      }
      throw err;
    }
  }

  async commitDrumExcel(rows: any, actor: RequestActor, sourceFile?: string) {
    if (!Array.isArray(rows)) {
      throw new BadRequestException({ error: 'rows[] is required.', code: 'VALIDATION' });
    }
    try {
      const result = await this.drumsRepository.commitExcel(rows, actor, sourceFile);
      return {
        committed: true,
        postgresql: true,
        ...result,
      };
    } catch (err: any) {
      if (err?.code === 'INVALID_TEMPLATE_HEADERS' || err?.code === 'VALIDATION') {
        throw new BadRequestException({ error: err.message, code: err.code, missing: err.missing });
      }
      throw err;
    }
  }
}
