import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
import { RawMaterialsService } from './raw-materials.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard } from '../../common/guards/master-data-auth.guard.js';

@Controller(['api/master', 'api/platform'])
export class RawMaterialsController {
  constructor(@Inject(RawMaterialsService) private readonly rawMaterialsService: RawMaterialsService) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get('raw-materials')
  async listRawMaterials() {
    return this.rawMaterialsService.listRawMaterials();
  }
}
