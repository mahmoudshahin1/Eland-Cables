import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ImportsService } from './imports.service.js';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import {
  MasterReadAuthGuard,
  MasterImportAuthGuard,
  ScrapManageAuthGuard,
  RawMaterialPriceProposeAuthGuard,
  EngineeringMappingEditAuthGuard,
} from '../../common/guards/master-data-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';

@Controller('api/master')
export class ImportsController {
  constructor(
    @Inject(ImportsService)
    private readonly importsService: ImportsService,
  ) {}

  @Get('imports')
  @UseGuards(JwtAuthGuard, MasterReadAuthGuard)
  @AnonMessage('Sign in is required to view master data.')
  async listImportHistory() {
    const imports = await this.importsService.listImportHistory();
    return { imports };
  }

  @HttpCode(HttpStatus.OK)
  @Post('imports/preview')
  @UseGuards(JwtAuthGuard, MasterImportAuthGuard)
  @AnonMessage('Sign in is required to import master data.')
  async previewGeneralImport(@Body() body: any, @Req() req: any) {
    const actor = req.user || { id: 'api-user', name: 'API User' };
    return this.importsService.previewGeneralImport(
      body?.kind,
      body?.rows,
      body?.sourceFile,
      actor,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('imports/commit')
  @UseGuards(JwtAuthGuard, MasterImportAuthGuard)
  @AnonMessage('Sign in is required to import master data.')
  async commitGeneralImport(@Body() body: any, @Req() req: any) {
    const actor = req.user || { id: 'api-user', name: 'API User' };
    return this.importsService.commitGeneralImport(
      body?.kind,
      body?.rows,
      body?.sourceFile,
      actor,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('cable-scrap-import/preview')
  @UseGuards(OptionalJwtAuthGuard, ScrapManageAuthGuard)
  async previewCableScrapImport(@Body() body: any) {
    return this.importsService.previewCableScrapImport(body?.rows);
  }

  @HttpCode(HttpStatus.OK)
  @Post('cable-scrap-import/commit')
  @UseGuards(OptionalJwtAuthGuard, ScrapManageAuthGuard)
  async commitCableScrapImport(@Body() body: any, @Req() req: any) {
    const actor = req.user || { id: 'api-user', name: 'API User' };
    return this.importsService.commitCableScrapImport(body?.rows, actor);
  }

  @HttpCode(HttpStatus.OK)
  @Post('raw-material-prices/import/preview')
  @UseGuards(OptionalJwtAuthGuard, RawMaterialPriceProposeAuthGuard)
  async previewRawMaterialPricesImport(@Body() body: any) {
    return this.importsService.previewRawMaterialPricesImport(body?.rows, body?.sourceFile);
  }

  @HttpCode(HttpStatus.OK)
  @Post('raw-material-prices/import/commit')
  @UseGuards(OptionalJwtAuthGuard, RawMaterialPriceProposeAuthGuard)
  async commitRawMaterialPricesImport(@Body() body: any, @Req() req: any) {
    const actor = req.user || { id: 'api-user', name: 'API User' };
    return this.importsService.commitRawMaterialPricesImport(body?.rows, body?.sourceFile, actor);
  }

  @HttpCode(HttpStatus.OK)
  @Post('engineering-mappings/import/preview')
  @UseGuards(OptionalJwtAuthGuard, EngineeringMappingEditAuthGuard)
  async previewEngineeringMappingsImport(@Body() body: any) {
    return this.importsService.previewEngineeringMappingsImport(body?.rows, body?.sourceFile);
  }

  @HttpCode(HttpStatus.OK)
  @Post('engineering-mappings/import/commit')
  @UseGuards(OptionalJwtAuthGuard, EngineeringMappingEditAuthGuard)
  async commitEngineeringMappingsImport(@Body() body: any, @Req() req: any) {
    const actor = req.user || { id: 'api-user', name: 'API User' };
    return this.importsService.commitEngineeringMappingsImport(body?.rows, body?.sourceFile, actor);
  }
}
