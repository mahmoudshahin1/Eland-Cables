import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { MasterDataService } from './master-data.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/master')
@UseGuards(JwtAuthGuard)
export class MasterDataController {
  constructor(private readonly masterDataService: MasterDataService) {}

  @Get('cables')
  async getCables(@Query() query: any) {
    return this.masterDataService.getCables(query);
  }

  @Get('cables/:materialNumber')
  async getCableByMaterialNumber(@Param('materialNumber') materialNumber: string) {
    return this.masterDataService.getCableByMaterialNumber(materialNumber);
  }

  @Post('cables')
  async createCable(@Body() data: any) {
    return this.masterDataService.createCable(data);
  }

  @Put('cables/:materialNumber')
  async updateCable(
    @Param('materialNumber') materialNumber: string,
    @Body() data: any,
  ) {
    return this.masterDataService.updateCable(materialNumber, data);
  }

  @Get('raw-materials')
  async getRawMaterials(@Query() query: any) {
    return this.masterDataService.getRawMaterials(query);
  }

  @Get('raw-material-prices')
  async getRawMaterialPrices(@Query('rawMaterialCode') code?: string) {
    return this.masterDataService.getRawMaterialPrices(code);
  }

  @Get('boms')
  async getBoms(@Query() query: any) {
    return this.masterDataService.getBoms(query);
  }

  @Get('drums')
  async getDrums(@Query() query: any) {
    return this.masterDataService.getDrums(query);
  }
}
