import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Users ─────────────────────────────────────────────────────────────
  @Get('users')
  async listUsers(@Query() query: any) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Post('users')
  async createUser(@Body() data: any) {
    return this.adminService.createUser(data);
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateUser(id, data);
  }

  @Post('users/:id/lock')
  async lockUser(@Param('id') id: string) {
    return this.adminService.toggleLockUser(id, true);
  }

  @Post('users/:id/unlock')
  async unlockUser(@Param('id') id: string) {
    return this.adminService.toggleLockUser(id, false);
  }

  @Post('users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body('newPassword') newPassword?: string,
  ) {
    return this.adminService.resetUserPassword(id, newPassword);
  }

  // ── Roles ─────────────────────────────────────────────────────────────
  @Get('roles')
  async listRoles() {
    return this.adminService.listRoles();
  }

  // ── Customers ─────────────────────────────────────────────────────────
  @Get('customers')
  async listCustomers(@Query() query: any) {
    return this.adminService.listCustomers(query);
  }

  @Get('customers/:id')
  async getCustomerById(@Param('id') id: string) {
    return this.adminService.getCustomerById(id);
  }

  @Post('customers')
  async createCustomer(@Body() data: any) {
    return this.adminService.createCustomer(data);
  }

  @Patch('customers/:id')
  async updateCustomer(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateCustomer(id, data);
  }

  @Post('customers/:id/assign-user')
  async assignCustomerUser(
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    return this.adminService.assignCustomerUser(id, userId);
  }
}
