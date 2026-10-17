import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
import { RawMaterialsService } from './raw-materials.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard } from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';

@Controller('api/master')
export class RawMaterialsController {
  constructor(@Inject(RawMaterialsService) private readonly rawMaterialsService: RawMaterialsService) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('raw-materials')
  async listRawMaterials() {
    return this.rawMaterialsService.listRawMaterials();
  }
}
