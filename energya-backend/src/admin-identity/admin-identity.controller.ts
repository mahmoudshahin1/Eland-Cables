import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RbacGuard } from '../common/guards/rbac.guard.js';
import { RequirePermission } from '../common/decorators/require-permission.decorator.js';
import { AdminIdentityService } from './admin-identity.service.js';
import type { Request } from 'express';
import { RequestActor } from '../common/interfaces/request-actor.interface.js';
import {
  CreateUserDto,
  UpdateUserDto,
  AssignRoleDto,
  CreateRoleDto,
  UpdateRoleDto,
  SetPermissionsDto,
} from './dto/admin-identity.dto.js';

import { PERMISSION_CATALOG } from '../shared/domain/permission-catalog.js';

@Controller('api/admin')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AdminIdentityController {
  constructor(private readonly service: AdminIdentityService) {}

  @Get('users')
  @RequirePermission('ADMIN', 'USER', 'VIEW')
  async listUsers(@Query() query: any) {
    return this.service.listUsers(query);
  }

  @Post('users')
  @RequirePermission('ADMIN', 'USER', 'CREATE')
  async createUser(@Body() body: CreateUserDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { user: await this.service.createUser(body, actor) };
  }

  @Get('users/:id')
  @RequirePermission('ADMIN', 'USER', 'VIEW')
  async getUserById(@Param('id') id: string) {
    return { user: await this.service.getUserById(id) };
  }

  @Patch('users/:id')
  @RequirePermission('ADMIN', 'USER', 'UPDATE')
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { user: await this.service.updateUser(id, body, actor) };
  }

  @Post('users/:id/activate')
  @RequirePermission('ADMIN', 'USER', 'DEACTIVATE')
  async activateUser(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { user: await this.service.setUserActive(id, true, actor) };
  }

  @Post('users/:id/deactivate')
  @RequirePermission('ADMIN', 'USER', 'DEACTIVATE')
  async deactivateUser(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { user: await this.service.setUserActive(id, false, actor) };
  }

  @Post('users/:id/lock')
  @RequirePermission('ADMIN', 'USER', 'LOCK')
  async lockUser(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { user: await this.service.setUserLocked(id, true, actor) };
  }

  @Post('users/:id/unlock')
  @RequirePermission('ADMIN', 'USER', 'LOCK')
  async unlockUser(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { user: await this.service.setUserLocked(id, false, actor) };
  }

  @Post('users/:id/reset-password')
  @RequirePermission('ADMIN', 'USER', 'RESET_PASSWORD')
  async resetPassword(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return this.service.issueAdminPasswordReset(id, actor);
  }

  @Post('users/:id/roles')
  @RequirePermission('ADMIN', 'ROLE', 'MANAGE')
  async assignRole(@Param('id') id: string, @Body() body: AssignRoleDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    const roleCode = String(body.roleCode || body.role);
    return { user: await this.service.assignRole(id, roleCode, actor) };
  }

  @Delete('users/:id/roles/:roleCode')
  @RequirePermission('ADMIN', 'ROLE', 'MANAGE')
  async removeRole(@Param('id') id: string, @Param('roleCode') roleCode: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { user: await this.service.removeRole(id, roleCode, actor) };
  }

  @Get('roles')
  @RequirePermission('ADMIN', 'ROLE', 'VIEW')
  async listRoles() {
    return { roles: await this.service.listRoles() };
  }

  @Post('roles')
  @RequirePermission('ADMIN', 'ROLE', 'MANAGE')
  async createRole(@Body() body: CreateRoleDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { role: await this.service.createRole(body, actor) };
  }

  @Get('roles/:id')
  @RequirePermission('ADMIN', 'ROLE', 'VIEW')
  async getRoleById(@Param('id') id: string) {
    return { role: await this.service.getRoleDetail(id) };
  }

  @Patch('roles/:id')
  @RequirePermission('ADMIN', 'ROLE', 'MANAGE')
  async updateRole(@Param('id') id: string, @Body() body: UpdateRoleDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { role: await this.service.updateRole(id, body, actor) };
  }

  @Post('roles/:id/activate')
  @RequirePermission('ADMIN', 'ROLE', 'MANAGE')
  async activateRole(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { role: await this.service.setRoleActive(id, true, actor) };
  }

  @Post('roles/:id/deactivate')
  @RequirePermission('ADMIN', 'ROLE', 'MANAGE')
  async deactivateRole(@Param('id') id: string, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { role: await this.service.setRoleActive(id, false, actor) };
  }

  @Get('roles/:id/users')
  @RequirePermission('ADMIN', 'ROLE', 'VIEW')
  async getRoleUsers(@Param('id') id: string) {
    const role = await this.service.getRoleDetail(id);
    return { users: role?.users || [] };
  }

  @Get('roles/:id/permissions')
  @RequirePermission('ADMIN', 'ROLE', 'VIEW')
  async getRolePermissions(@Param('id') id: string) {
    const role = await this.service.getRoleDetail(id);
    return { permissions: role?.permissions || [] };
  }

  @Put('roles/:id/permissions')
  @RequirePermission('ADMIN', 'ROLE', 'MANAGE')
  async updateRolePermissions(@Param('id') id: string, @Body() body: SetPermissionsDto, @Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    return { role: await this.service.setRolePermissions(id, body.permissions, actor) };
  }

  @Get('permissions')
  @RequirePermission('ADMIN', 'PERMISSION', 'VIEW')
  async getPermissions() {
    return { permissions: PERMISSION_CATALOG };
  }

  @Get('permissions/matrix')
  @RequirePermission('ADMIN', 'PERMISSION', 'VIEW')
  async getPermissionsMatrix(@Req() req: Request) {
    const actor = (req as any).user as RequestActor;
    const canManage = actor.permissionCodes?.includes('ADMIN:ROLE:MANAGE') || actor.permissions?.userManagement === true;
    return { permissions: PERMISSION_CATALOG, canAssign: Boolean(canManage) };
  }

  @Get('security')
  @RequirePermission('ADMIN', 'SECURITY', 'VIEW')
  async securitySummary() {
    return { summary: await this.service.securitySummary() };
  }
}
