import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { BomsService } from './boms.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard } from '../../common/guards/master-data-auth.guard.js';

@Controller('api/master')
export class BomsController {
  constructor(
    @Inject(BomsService)
    private readonly bomsService: BomsService,
  ) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get('boms')
  async listBoms() {
    return this.bomsService.listBoms();
  }
}
