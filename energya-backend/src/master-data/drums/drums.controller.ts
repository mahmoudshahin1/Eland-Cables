import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Inject,
} from '@nestjs/common';
import { DrumsService } from './drums.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import {
  MasterReadAuthGuard,
  DrumComputeAuthGuard,
  MasterWriteAuthGuard,
  MasterImportAuthGuard,
} from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';

@Controller('api/master')
@UsePipes(new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false }))
export class DrumsController {
  constructor(
    @Inject(DrumsService)
    private readonly drumsService: DrumsService,
  ) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view drums.')
  @Get('drums')
  async listDrums() {
    return this.drumsService.listDrums();
  }

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @Get('drums/:drumCode')
  async getDrum(@Param('drumCode') drumCode: string) {
    return this.drumsService.getDrum(drumCode);
  }

  @UseGuards(JwtAuthGuard, DrumComputeAuthGuard)
  @AnonMessage('Sign in is required for drum optimization.')
  @HttpCode(HttpStatus.OK)
  @Post('drums/capacity')
  async calculateCapacity(@Body() body: any) {
    return this.drumsService.calculateCapacity(body?.drum, body?.cable);
  }

  @UseGuards(JwtAuthGuard, DrumComputeAuthGuard)
  @AnonMessage('Sign in is required for drum optimization.')
  @HttpCode(HttpStatus.OK)
  @Post('drums/candidates')
  async listCandidates(@Body() body: any) {
    return this.drumsService.listCandidates(
      body?.cable,
      Number(body?.cuttingLengthM),
      Number(body?.cableTolerancePercent),
    );
  }

  @UseGuards(JwtAuthGuard, DrumComputeAuthGuard)
  @AnonMessage('Sign in is required for drum optimization.')
  @HttpCode(HttpStatus.OK)
  @Post('drums/validate')
  async validatePlan(@Body() body: any) {
    return this.drumsService.validatePlan(
      body?.cable,
      Number(body?.cableTolerancePercent),
      Array.isArray(body?.rows) ? body.rows : [],
      body?.includeEngineering !== false,
    );
  }

  @UseGuards(JwtAuthGuard, DrumComputeAuthGuard)
  @AnonMessage('Sign in is required for drum optimization.')
  @HttpCode(HttpStatus.OK)
  @Post('drums/optimize')
  async optimizePlan(@Body() body: any) {
    return this.drumsService.optimizePlan(body?.cable, body || {});
  }

  @UseGuards(JwtAuthGuard, MasterWriteAuthGuard)
  @AnonMessage('Sign in is required to change Drum Master.')
  @HttpCode(HttpStatus.CREATED)
  @Post('drums')
  async createDrum(@Body() body: any, @Req() req: { user: RequestActor }) {
    return this.drumsService.createDrum(body, req.user);
  }

  @UseGuards(JwtAuthGuard, MasterWriteAuthGuard)
  @AnonMessage('Sign in is required to change Drum Master.')
  @Put('drums/:drumCode')
  async updateDrum(
    @Param('drumCode') drumCode: string,
    @Body() body: any,
    @Req() req: { user: RequestActor },
  ) {
    return this.drumsService.updateDrum(drumCode, body, req.user);
  }

  @UseGuards(JwtAuthGuard, MasterWriteAuthGuard)
  @AnonMessage('Sign in is required to change Drum Master.')
  @Delete('drums/:drumCode')
  async deleteDrum(@Param('drumCode') drumCode: string, @Req() req: { user: RequestActor }) {
    return this.drumsService.deactivateOrDeleteDrum(drumCode, req.user);
  }

  @UseGuards(JwtAuthGuard, MasterImportAuthGuard)
  @AnonMessage('Sign in is required to import Drum Master.')
  @HttpCode(HttpStatus.OK)
  @Post('drums/excel-preview')
  async previewDrumExcel(@Body() body: any) {
    return this.drumsService.previewDrumExcel(body?.rows);
  }

  @UseGuards(JwtAuthGuard, MasterImportAuthGuard)
  @AnonMessage('Sign in is required to import Drum Master.')
  @HttpCode(HttpStatus.OK)
  @Post('drums/excel-commit')
  async commitDrumExcel(@Body() body: any, @Req() req: { user: RequestActor }) {
    return this.drumsService.commitDrumExcel(body?.rows, req.user, body?.sourceFile);
  }
}
