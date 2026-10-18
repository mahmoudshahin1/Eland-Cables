import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import {
  ExportsRepository,
  MasterExportEntity,
  VALID_EXPORT_ENTITIES,
} from './exports.repository.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Injectable()
export class ExportsService {
  constructor(
    @Inject(ExportsRepository)
    private readonly repo: ExportsRepository,
  ) {}

  async exportEntity(
    actor: RequestActor,
    entity: string,
    filter: { q?: string; status?: string; type?: string } = {},
  ): Promise<{ buffer: Buffer; filename: string; rowCounts: Record<string, number> }> {
    if (!VALID_EXPORT_ENTITIES.has(entity)) {
      const err = new BadRequestException(`Unknown export entity: ${entity}`);
      (err as any).code = 'VALIDATION_FAILED';
      throw err;
    }
    return this.repo.exportEntity(actor, entity as MasterExportEntity, filter);
  }

  async exportCableScrapTemplate(options?: {
    metal?: string;
    family?: string;
    search?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    return this.repo.exportCableScrapTemplate(options);
  }

  async exportRawMaterialPrices(options?: {
    rawMaterialCode?: string;
    workflowStatus?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    return this.repo.exportRawMaterialPrices(options);
  }

  async exportEngineeringMappings(options?: {
    status?: string;
    workflowStatus?: string;
    q?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    return this.repo.exportEngineeringMappings(options);
  }

  async exportBomConflicts(options?: {
    investigationStatus?: string;
    classification?: string;
    q?: string;
  }): Promise<{ buffer: Buffer; filename: string }> {
    return this.repo.exportBomConflicts(options);
  }

  async exportCommercialPricingRules(): Promise<{ buffer: Buffer; filename: string }> {
    return this.repo.exportCommercialPricingRules();
  }
}
