import { Controller, Get, UseGuards, Res, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { ReferenceService } from './reference.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard } from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';

@Controller()
export class ReferenceController {
  constructor(
    @Inject(ReferenceService)
    private readonly referenceService: ReferenceService,
  ) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('api/master/reference')
  async listReference() {
    return this.referenceService.listReference();
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('api/master/keys')
  async getKeys() {
    return this.referenceService.getKeysAnalysis();
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('api/master/uniqueness')
  async getUniqueness() {
    return this.referenceService.getUniquenessReport();
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get('api/master/sot-status')
  async getSotStatus() {
    return this.referenceService.getSotStatus();
  }

  // Public: DB health check
  @Get('api/platform/db')
  async getDbHealth(@Res() res: Response) {
    const health = await this.referenceService.getDbHealth();
    res.status(health.ok ? 200 : 503).json(health);
  }
}
