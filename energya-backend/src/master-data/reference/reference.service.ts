import { Inject, Injectable } from '@nestjs/common';
import { ReferenceRepository } from './reference.repository.js';
import {
  MASTER_DATA_KEY_CLASSIFICATION,
  MASTER_DATA_SOT_STATUS,
  MASTER_DATA_CUTOVER_MATRIX,
  MASTER_DATA_CUTOVER_FRAMEWORK,
  MASTER_DATA_CUTOVER_GATE_DEFINITIONS,
  MASTER_DATA_CUTOVER_ORDER,
} from '../../shared/domain/masterDataSoT.js';

@Injectable()
export class ReferenceService {
  constructor(
    @Inject(ReferenceRepository)
    private readonly referenceRepository: ReferenceRepository,
  ) {}

  async listReference() {
    const parameters = await this.referenceRepository.listReference();
    return { parameters };
  }

  async getKeysAnalysis() {
    const uniqueness = await this.referenceRepository.cableUniquenessReport();
    return {
      analysis: this.referenceRepository.masterDataKeyAnalysis(),
      uniqueness,
    };
  }

  async getUniquenessReport() {
    return this.referenceRepository.cableUniquenessReport();
  }

  async getDbHealth() {
    const health = await this.referenceRepository.checkDbHealth();
    return {
      ...health,
      target: 'postgresql',
      coexistence: 'localStorage remains until each domain is dual-written',
    };
  }

  getSotStatus() {
    return {
      entities: MASTER_DATA_SOT_STATUS,
      keyClassification: MASTER_DATA_KEY_CLASSIFICATION,
      cutoverMatrix: MASTER_DATA_CUTOVER_MATRIX,
      cutoverGates: MASTER_DATA_CUTOVER_GATE_DEFINITIONS,
      cutoverOrder: MASTER_DATA_CUTOVER_ORDER,
      framework: MASTER_DATA_CUTOVER_FRAMEWORK,
      policy: MASTER_DATA_CUTOVER_FRAMEWORK.policy,
      task: '04B-1',
    };
  }
}
