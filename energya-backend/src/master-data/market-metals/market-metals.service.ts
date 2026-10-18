import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { MarketMetalsRepository } from './market-metals.repository.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Injectable()
export class MarketMetalsService {
  constructor(
    @Inject(MarketMetalsRepository)
    private readonly repo: MarketMetalsRepository,
  ) {}

  private mapError(err: any): never {
    if (err?.code === 'NOT_FOUND') {
      throw new NotFoundException({ error: err.message, code: err.code });
    }
    if (err?.code === 'BUSINESS_RULE_REQUIRED') {
      throw new ConflictException({ error: err.message, code: err.code });
    }
    throw new BadRequestException({
      error: err.message || 'Request failed.',
      code: err.code || 'BAD_REQUEST',
    });
  }

  async listImports() {
    try {
      const imports = await this.repo.list();
      return { imports };
    } catch (err: any) {
      this.mapError(err);
    }
  }

  async getImport(id: string) {
    try {
      const batch = await this.repo.getById(id);
      if (!batch) {
        throw Object.assign(new Error('Import not found.'), { code: 'NOT_FOUND' });
      }
      return {
        import: {
          ...batch,
          image: undefined,
          hasImage: Boolean(batch.image),
        },
      };
    } catch (err: any) {
      this.mapError(err);
    }
  }

  async getImportImage(id: string) {
    try {
      const batch = await this.repo.getById(id);
      if (!batch?.image) {
        throw Object.assign(new Error('No image stored.'), { code: 'NOT_FOUND' });
      }
      return {
        buffer: batch.image,
        mimeType: batch.mimeType || 'application/octet-stream',
      };
    } catch (err: any) {
      this.mapError(err);
    }
  }

  async createImport(body: any, actor?: RequestActor) {
    try {
      const batch = await this.repo.create(body || {}, actor);
      return {
        import: {
          ...batch,
          image: undefined,
          hasImage: Boolean(batch.image),
        },
      };
    } catch (err: any) {
      this.mapError(err);
    }
  }

  async correctRow(batchId: string, code: string, body: any) {
    try {
      const row = await this.repo.correctRow(batchId, code, body || {});
      return { row };
    } catch (err: any) {
      this.mapError(err);
    }
  }

  async approveImport(id: string, actor?: RequestActor) {
    try {
      const batch = await this.repo.approve(id, actor);
      return {
        import: {
          ...batch,
          image: undefined,
        },
      };
    } catch (err: any) {
      this.mapError(err);
    }
  }

  async publishImport(id: string, actor?: RequestActor) {
    try {
      const batch = await this.repo.publish(id, actor);
      return {
        import: batch ? { ...batch, image: undefined } : null,
      };
    } catch (err: any) {
      this.mapError(err);
    }
  }
}
