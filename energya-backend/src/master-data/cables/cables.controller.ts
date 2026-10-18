import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
  Inject,
} from '@nestjs/common';
import { CablesService } from './cables.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard, MasterWriteAuthGuard } from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Controller('api/master')
export class CablesController {
  constructor(@Inject(CablesService) private readonly cablesService: CablesService) {}

  @UseGuards(JwtAuthGuard)
  @AnonMessage('Sign in is required to view Cable Master.')
  @Get('cables')
  async listCables(@Query() query: any, @Req() req: { user: RequestActor }) {
    return this.cablesService.listOrSearchCables(query, req.user);
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view Cable Master.')
  @Get('cables/:materialNumber')
  async getCable(@Param('materialNumber') materialNumber: string) {
    return this.cablesService.getCableByMaterialNumber(materialNumber);
  }

  @UseGuards(JwtAuthGuard, MasterWriteAuthGuard)
  @AnonMessage('Sign in is required to change Cable Master.')
  @Post('cables')
  async createCable(@Body() body: any, @Req() req: { user: RequestActor }) {
    return this.cablesService.createCable(body, req.user);
  }

  @UseGuards(JwtAuthGuard, MasterWriteAuthGuard)
  @AnonMessage('Sign in is required to change Cable Master.')
  @Put('cables/:materialNumber')
  async updateCable(
    @Param('materialNumber') materialNumber: string,
    @Body() body: any,
    @Req() req: { user: RequestActor },
  ) {
    return this.cablesService.updateCable(materialNumber, body, req.user);
  }
}
