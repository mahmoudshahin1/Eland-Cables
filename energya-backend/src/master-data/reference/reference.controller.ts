import { Controller, Get, UseGuards, Res, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { ReferenceService } from './reference.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard } from '../../common/guards/master-data-auth.guard.js';

@Controller()
export class ReferenceController {
  constructor(
    @Inject(ReferenceService)
    private readonly referenceService: ReferenceService,
  ) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get(['api/master/reference', 'api/platform/reference'])
  async listReference() {
    return this.referenceService.listReference();
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get(['api/master/keys', 'api/platform/keys'])
  async getKeys() {
    return this.referenceService.getKeysAnalysis();
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get(['api/master/uniqueness', 'api/platform/uniqueness'])
  async getUniqueness() {
    return this.referenceService.getUniquenessReport();
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get(['api/master/sot-status', 'api/platform/sot-status'])
  async getSotStatus() {
    return this.referenceService.getSotStatus();
  }

  // Public: DB health check
  @Get(['api/master/db', 'api/platform/db'])
  async getDbHealth(@Res() res: Response) {
    const health = await this.referenceService.getDbHealth();
    res.status(health.ok ? 200 : 503).json(health);
  }
}
