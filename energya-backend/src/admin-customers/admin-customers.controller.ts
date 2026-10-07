import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RbacGuard } from '../common/guards/rbac.guard.js';
import { RequirePermission } from '../common/decorators/require-permission.decorator.js';
import { AdminCustomersService } from './admin-customers.service.js';
import type { Request, Response } from 'express';
import { RequestActor } from '../common/interfaces/request-actor.interface.js';
import { CreateCustomerDto, UpdateCustomerDto, AssignCustomerUserDto, UpdateCustomerUserDto } from './dto/admin-customers.dto.js';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AdminCustomersController {
  constructor(private readonly service: AdminCustomersService) {}

  @Get('customers')
  @RequirePermission('ADMIN', 'CUSTOMER', 'VIEW')
  async listCustomers(@Query() query: any) {
    return this.service.listCustomers(query);
  }

  @Get('customers/export')
  @RequirePermission('ADMIN', 'CUSTOMER', 'VIEW')
  async exportCustomers(@Query() query: any, @Req() req: Request, @Res() res: Response) {
    const actor = (req as any).user as RequestActor;
    const { buffer, filename } = await this.service.exportMasterDataExcel(actor, query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Get('customer-reference-masters')
  @RequirePermission('ADMIN', 'CUSTOMER', 'VIEW')
  async getReferenceMasters() {
    return this.service.listCustomerReferenceMasters();
  }

  @Post('customers')
  @RequirePermission('ADMIN', 'CUSTOMER', 'CREATE')
  async createCustomer(@Body() body: CreateCustomerDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { customer: await this.service.createCustomer(actor, body) };
  }

  @Get('customers/:id/audit')
  @RequirePermission('ADMIN', 'CUSTOMER', 'VIEW')
  async getCustomerAudit(@Param('id') id: string) {
    return this.service.listCustomerAudit(id);
  }

  @Get('customers/:id')
  @RequirePermission('ADMIN', 'CUSTOMER', 'VIEW')
  async getCustomerById(@Param('id') id: string) {
    return this.service.getCustomerById(id);
  }

  @Patch('customers/:id')
  @RequirePermission('ADMIN', 'CUSTOMER', 'UPDATE')
  async updateCustomer(@Param('id') id: string, @Body() body: UpdateCustomerDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { customer: await this.service.updateCustomer(actor, id, body) };
  }

  @Post('customers/:id/activate')
  @RequirePermission('ADMIN', 'CUSTOMER', 'ACTIVATE')
  async activateCustomer(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { customer: await this.service.setCustomerActive(actor, id, true) };
  }

  @Post('customers/:id/deactivate')
  @RequirePermission('ADMIN', 'CUSTOMER', 'ACTIVATE')
  async deactivateCustomer(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { customer: await this.service.setCustomerActive(actor, id, false) };
  }

  @Delete('customers/:id')
  @RequirePermission('ADMIN', 'CUSTOMER', 'ACTIVATE') // matching legacy logic
  async deleteCustomer(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return this.service.deleteOrDeactivateCustomer(actor, id);
  }

  @Get('customer-users')
  @RequirePermission('ADMIN', 'CUSTOMER_USER', 'VIEW')
  async listCustomerUsers(@Query() query: any) {
    return this.service.listCustomerUsers(query);
  }

  @Post('customer-users')
  @RequirePermission('ADMIN', 'CUSTOMER_USER', 'ASSIGN')
  async assignCustomerUser(@Body() body: AssignCustomerUserDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { assignment: await this.service.assignUserToCustomer(actor, body) };
  }

  @Patch('customer-users/:id')
  @RequirePermission('ADMIN', 'CUSTOMER_USER', 'UPDATE')
  async updateCustomerUser(@Param('id') id: string, @Body() body: UpdateCustomerUserDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { assignment: await this.service.updateCustomerUser(actor, id, body.status) };
  }

  @Post('customer-users/:id/unassign')
  @RequirePermission('ADMIN', 'CUSTOMER_USER', 'UPDATE')
  async unassignCustomerUser(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { assignment: await this.service.updateCustomerUser(actor, id, 'INACTIVE') };
  }
}
