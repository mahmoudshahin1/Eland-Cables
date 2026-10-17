import { Controller, Get, Query, Req, UseGuards, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { AnonMessage } from '../../common/decorators/anon-message.decorator.js';
import { RequestActor } from '../../common/interfaces/request-actor.interface.js';
import { CablesService } from './cables.service.js';

@Controller('api/v2/cables')
export class CustomerCatalogController {
  constructor(@Inject(CablesService) private readonly cablesService: CablesService) {}

  @UseGuards(JwtAuthGuard)
  @AnonMessage('Sign in is required to view Cable Products.')
  @Get('products')
  async listProducts(@Query() query: any, @Req() req: { user: RequestActor }) {
    return this.cablesService.listCustomerProducts(query, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @AnonMessage('Sign in is required to view Cable Products.')
  @Get('products/facets')
  async listFacets() {
    return { facets: await this.cablesService.listCustomerProductFacets() };
  }
}
