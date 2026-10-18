import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExportsService } from './exports.service.js';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import {
  MasterExportAuthGuard,
  CostingFormulaAuthGuard,
  RawMaterialPriceProposeAuthGuard,
  EngineeringMappingEditAuthGuard,
  BomGovernanceInvestigateAuthGuard,
  PricingRulesManageAuthGuard,
} from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';
import { sendExcelResponse } from '../../shared/infra/excelWorkbook.js';

@Controller('api/master')
export class ExportsController {
  constructor(
    @Inject(ExportsService)
    private readonly exportsService: ExportsService,
  ) {}

  @Get('export/:entity')
  @UseGuards(JwtAuthGuard, MasterExportAuthGuard)
  @AnonMessage('Sign in is required to export master data.')
  async exportEntity(
    @Param('entity') entity: string,
    @Query('q') q: string | undefined,
    @Query('status') status: string | undefined,
    @Query('type') type: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const actor = req.user || { id: 'api-user', name: 'API User' };
    const exported = await this.exportsService.exportEntity(actor, entity, { q, status, type });
    sendExcelResponse(res, exported.filename, exported.buffer);
  }

  @Get('cable-scrap-template-export')
  @UseGuards(OptionalJwtAuthGuard, CostingFormulaAuthGuard)
  async exportCableScrapTemplate(
    @Query('metal') metal: string | undefined,
    @Query('family') family: string | undefined,
    @Query('search') search: string | undefined,
    @Res() res: Response,
  ) {
    const exported = await this.exportsService.exportCableScrapTemplate({ metal, family, search });
    sendExcelResponse(res, exported.filename, exported.buffer);
  }

  @Get('raw-material-prices-export')
  @UseGuards(OptionalJwtAuthGuard, RawMaterialPriceProposeAuthGuard)
  async exportRawMaterialPrices(
    @Query('rawMaterialCode') rawMaterialCode: string | undefined,
    @Query('workflowStatus') workflowStatus: string | undefined,
    @Res() res: Response,
  ) {
    const exported = await this.exportsService.exportRawMaterialPrices({ rawMaterialCode, workflowStatus });
    sendExcelResponse(res, exported.filename, exported.buffer);
  }

  @Get('engineering-mappings-export')
  @UseGuards(OptionalJwtAuthGuard, EngineeringMappingEditAuthGuard)
  async exportEngineeringMappings(
    @Query('status') status: string | undefined,
    @Query('workflowStatus') workflowStatus: string | undefined,
    @Query('q') q: string | undefined,
    @Res() res: Response,
  ) {
    const exported = await this.exportsService.exportEngineeringMappings({ status, workflowStatus, q });
    sendExcelResponse(res, exported.filename, exported.buffer);
  }

  @Get('bom-conflicts-export')
  @UseGuards(OptionalJwtAuthGuard, BomGovernanceInvestigateAuthGuard)
  async exportBomConflicts(
    @Query('investigationStatus') investigationStatus: string | undefined,
    @Query('classification') classification: string | undefined,
    @Query('q') q: string | undefined,
    @Res() res: Response,
  ) {
    const exported = await this.exportsService.exportBomConflicts({ investigationStatus, classification, q });
    sendExcelResponse(res, exported.filename, exported.buffer);
  }

  @Get('commercial-pricing-rules/export')
  @UseGuards(OptionalJwtAuthGuard, PricingRulesManageAuthGuard)
  async exportCommercialPricingRules(@Res() res: Response) {
    const exported = await this.exportsService.exportCommercialPricingRules();
    sendExcelResponse(res, exported.filename, exported.buffer);
  }
}
