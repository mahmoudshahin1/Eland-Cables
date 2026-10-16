import { Inject, Injectable } from '@nestjs/common';
import { BomsRepository } from './boms.repository.js';

@Injectable()
export class BomsService {
  constructor(
    @Inject(BomsRepository)
    private readonly bomsRepository: BomsRepository,
  ) {}

  async listBoms() {
    const boms = await this.bomsRepository.listBoms();
    return { boms };
  }
}
