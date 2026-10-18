import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { RawMaterialsService } from './raw-materials.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard, BomRmAuthGuard } from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Controller('api/master')
export class RawMaterialsController {
  constructor(@Inject(RawMaterialsService) private readonly rawMaterialsService: RawMaterialsService) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('raw-materials')
  async listRawMaterials() {
    return this.rawMaterialsService.listRawMaterials();
  }

  @UseGuards(JwtAuthGuard, BomRmAuthGuard)
  @AnonMessage('Sign in is required to change BOM or raw materials.')
  @HttpCode(HttpStatus.CREATED)
  @Post('raw-materials')
  async createRawMaterial(@Body() body: any, @Req() req: { user: RequestActor }) {
    return this.rawMaterialsService.createRawMaterial(body, req.user);
  }

  @UseGuards(JwtAuthGuard, BomRmAuthGuard)
  @AnonMessage('Sign in is required to change BOM or raw materials.')
  @Put('raw-materials/:code')
  async updateRawMaterial(
    @Param('code') code: string,
    @Body() body: any,
    @Req() req: { user: RequestActor },
  ) {
    return this.rawMaterialsService.updateRawMaterial(code, body, req.user);
  }

  @UseGuards(JwtAuthGuard, BomRmAuthGuard)
  @AnonMessage('Sign in is required to change BOM or raw materials.')
  @HttpCode(HttpStatus.CREATED)
  @Post('raw-materials/:code/prices')
  async appendPrice(
    @Param('code') code: string,
    @Body() body: any,
    @Req() req: { user: RequestActor },
  ) {
    return this.rawMaterialsService.appendRawMaterialPrice(code, body, req.user);
  }
}
