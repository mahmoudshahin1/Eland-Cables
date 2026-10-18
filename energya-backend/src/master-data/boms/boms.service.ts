import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { BomsRepository } from './boms.repository.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

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

  async commitExcel(body: any, actor: RequestActor) {
    const lines = Array.isArray(body?.lines) ? body.lines : [];
    const replaceCableMaterialNumbers = Array.isArray(body?.replaceCableMaterialNumbers)
      ? body.replaceCableMaterialNumbers
      : [];
    try {
      const result = await this.bomsRepository.persistExcelCommit({
        lines,
        replaceCableMaterialNumbers,
        duplicateObservations: body?.duplicateObservations,
        sourceFile: body?.sourceFile,
        actor,
      });
      return {
        committed: true,
        postgresql: true,
        ...result,
      };
    } catch (err: any) {
      if (err?.code === 'VALIDATION_ERROR') {
        throw new BadRequestException({ error: err.message, code: err.code });
      }
      throw err;
    }
  }
}
