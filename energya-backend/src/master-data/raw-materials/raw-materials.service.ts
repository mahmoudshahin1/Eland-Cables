import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RawMaterialsRepository } from './raw-materials.repository.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Injectable()
export class RawMaterialsService {
  constructor(
    @Inject(RawMaterialsRepository)
    private readonly rawMaterialsRepository: RawMaterialsRepository,
  ) {}

  async listRawMaterials() {
    const rawMaterials = await this.rawMaterialsRepository.listRawMaterials();
    return { rawMaterials };
  }

  async createRawMaterial(body: any, actor: RequestActor) {
    if (!body?.code || !body?.description || !body?.uom) {
      throw new BadRequestException({ error: 'code, description, and uom are required.' });
    }
    try {
      const rawMaterial = await this.rawMaterialsRepository.create(
        {
          code: String(body.code),
          description: String(body.description),
          shortDescription: body.shortDescription,
          uom: String(body.uom),
          category: body.category,
          pricingCategory: body.pricingCategory,
          metalType: body.metalType,
          notes: body.notes,
          supplier: body.supplier,
          currency: body.currency,
          status: body.status,
        },
        actor,
      );
      return { rawMaterial };
    } catch (err: any) {
      if (err?.code === 'DUPLICATE_RAW_MATERIAL') {
        throw new ConflictException({ error: err.message, code: err.code });
      }
      if (err?.code === 'METAL_TYPE_MISMATCH' || err?.code === 'VALIDATION_ERROR') {
        throw new BadRequestException({ error: err.message, code: err.code });
      }
      throw err;
    }
  }

  async updateRawMaterial(code: string, body: any, actor: RequestActor) {
    try {
      const rawMaterial = await this.rawMaterialsRepository.update(code, body || {}, actor);
      if (!rawMaterial) {
        throw new NotFoundException({ error: 'Raw material not found.' });
      }
      return { rawMaterial };
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      if (err?.code === 'METAL_TYPE_MISMATCH' || err?.code === 'VALIDATION_ERROR') {
        throw new BadRequestException({ error: err.message, code: err.code });
      }
      throw err;
    }
  }

  async appendRawMaterialPrice(code: string, body: any, actor: RequestActor) {
    if (body?.price === '' || body?.price === undefined) {
      throw new BadRequestException({
        error: 'A blank price is PRICE_NOT_CONFIGURED. Do not post an empty price as zero.',
        code: 'PRICE_NOT_CONFIGURED',
      });
    }
    const created = await this.rawMaterialsRepository.appendPrice(
      code,
      {
        price: body.price == null ? null : Number(body.price),
        currency: body.currency,
        effectiveFrom: body.effectiveFrom || null,
        effectiveTo: body.effectiveTo || null,
      },
      actor,
    );
    if (!created) {
      throw new NotFoundException({ error: 'Raw material not found.' });
    }
    return { price: created };
  }
}
