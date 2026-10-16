import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Inject,
} from '@nestjs/common';
import { DrumsService } from './drums.service.js';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { MasterReadAuthGuard, DrumComputeAuthGuard } from '../../common/guards/master-data-auth.guard.js';

@Controller(['api/master', 'api/platform'])
@UsePipes(new ValidationPipe({ whitelist: false, forbidNonWhitelisted: false }))
export class DrumsController {
  constructor(
    @Inject(DrumsService)
    private readonly drumsService: DrumsService,
  ) {}

  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
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
  @HttpCode(HttpStatus.OK)
  @Post('drums/capacity')
  async calculateCapacity(@Body() body: any) {
    return this.drumsService.calculateCapacity(body?.drum, body?.cable);
  }

  @UseGuards(JwtAuthGuard, DrumComputeAuthGuard)
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
  @HttpCode(HttpStatus.OK)
  @Post('drums/optimize')
  async optimizePlan(@Body() body: any) {
    return this.drumsService.optimizePlan(body?.cable, body || {});
  }
}
