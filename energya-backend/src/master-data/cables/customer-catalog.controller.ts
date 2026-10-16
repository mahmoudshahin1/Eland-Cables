import { Controller, Get, Query, Req, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';
import { CablesService } from './cables.service.js';

@Controller('api/v2/cables')
export class CustomerCatalogController {
  constructor(@Inject(CablesService) private readonly cablesService: CablesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('products')
  async listProducts(@Query() query: any, @Req() req: { user: RequestActor }) {
    return this.cablesService.listCustomerProducts(query, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('products/facets')
  async listFacets() {
    return { facets: await this.cablesService.listCustomerProductFacets() };
  }
}
