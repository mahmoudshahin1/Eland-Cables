import { Inject, Injectable } from '@nestjs/common';
import { RawMaterialsRepository } from './raw-materials.repository.js';

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
}
