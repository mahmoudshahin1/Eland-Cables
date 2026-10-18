import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { MarketMetalsService } from './market-metals.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import {
  MasterReadAuthGuard,
  CostingConfigurationManageAuthGuard,
} from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Controller('api/master')
export class MarketMetalsController {
  constructor(
    @Inject(MarketMetalsService)
    private readonly service: MarketMetalsService,
  ) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('market-metals/imports')
  async listImports() {
    return this.service.listImports();
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('market-metals/imports/:id')
  async getImport(@Param('id') id: string) {
    return this.service.getImport(id);
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  @Get('market-metals/imports/:id/image')
  async getImportImage(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.service.getImportImage(id);
    res.setHeader('Content-Type', mimeType);
    return res.send(buffer);
  }

  @UseGuards(JwtAuthGuard, CostingConfigurationManageAuthGuard)
  @AnonMessage('Sign in is required to view costing formulas.')
  @HttpCode(HttpStatus.CREATED)
  @Post('market-metals/imports')
  async createImport(@Body() body: any, @Req() req: { user: RequestActor }) {
    return this.service.createImport(body, req.user);
  }

  @UseGuards(JwtAuthGuard, CostingConfigurationManageAuthGuard)
  @AnonMessage('Sign in is required to view costing formulas.')
  @Patch('market-metals/imports/:id/rows/:code')
  async correctRow(
    @Param('id') id: string,
    @Param('code') code: string,
    @Body() body: any,
  ) {
    return this.service.correctRow(id, code, body);
  }

  @UseGuards(JwtAuthGuard, CostingConfigurationManageAuthGuard)
  @AnonMessage('Sign in is required to view costing formulas.')
  @Post('market-metals/imports/:id/approve')
  async approveImport(@Param('id') id: string, @Req() req: { user: RequestActor }) {
    return this.service.approveImport(id, req.user);
  }

  @UseGuards(JwtAuthGuard, CostingConfigurationManageAuthGuard)
  @AnonMessage('Sign in is required to view costing formulas.')
  @Post('market-metals/imports/:id/publish')
  async publishImport(@Param('id') id: string, @Req() req: { user: RequestActor }) {
    return this.service.publishImport(id, req.user);
  }
}
