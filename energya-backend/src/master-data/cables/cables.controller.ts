import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Req,
  Inject,
} from '@nestjs/common';
import { CablesService } from './cables.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard } from '../../common/guards/master-data-auth.guard.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Controller(['api/master', 'api/platform'])
export class CablesController {
  constructor(@Inject(CablesService) private readonly cablesService: CablesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('cables')
  async listCables(@Query() query: any, @Req() req: { user: RequestActor }) {
    return this.cablesService.listOrSearchCables(query, req.user);
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get('cables/:materialNumber')
  async getCable(@Param('materialNumber') materialNumber: string) {
    return this.cablesService.getCableByMaterialNumber(materialNumber);
  }
}
