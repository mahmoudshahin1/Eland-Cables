import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { BomsService } from './boms.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard, BomRmAuthGuard } from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Controller('api/master')
export class BomsController {
  constructor(
    @Inject(BomsService)
    private readonly bomsService: BomsService,
  ) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('boms')
  async listBoms() {
    return this.bomsService.listBoms();
  }

  @UseGuards(JwtAuthGuard, BomRmAuthGuard)
  @AnonMessage('Sign in is required to change BOM or raw materials.')
  @HttpCode(HttpStatus.OK)
  @Post('boms/excel-commit')
  async commitExcel(@Body() body: any, @Req() req: { user: RequestActor }) {
    return this.bomsService.commitExcel(body, req.user);
  }
}
