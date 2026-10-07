import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import * as bcrypt from 'bcryptjs';
import { RequestActor } from '../common/interfaces/request-actor.interface.js';
import { hashPassword, hashOpaqueToken, randomOpaqueToken } from '../shared/domain/password-service.js';
import { toSafeUser } from '../shared/domain/safe-user.js';

@Injectable()
export class AdminIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  private actorHasRole(actor: RequestActor, code: string): boolean {
    return (actor.roles || []).includes(code) || actor.role === code;
  }

  private async loadPermissionCodes(userId: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user) return [];
    return [...new Set(
      user.roles.flatMap((ur) =>
        ur.role.isActive
          ? ur.role.permissions.filter((rp) => rp.permission.isActive).map((rp) => `${rp.permission.module}:${rp.permission.resource}:${rp.permission.action}`.toUpperCase())
          : []
      )
    )];
  }

  async listUsers(filter: any) {
    const where: any = {};
    if (filter.q) {
      where.OR = [
        { email: { contains: filter.q, mode: 'insensitive' } },
        { username: { contains: filter.q, mode: 'insensitive' } },
        { fullName: { contains: filter.q, mode: 'insensitive' } },
        { department: { contains: filter.q, mode: 'insensitive' } },
      ];
    }
    if (filter.userType) where.userType = filter.userType;
    if (filter.department) where.department = { contains: filter.department, mode: 'insensitive' };
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.role) where.roles = { some: { role: { code: filter.role } } };
    if (filter.status === 'LOCKED') where.isLocked = true;
    if (filter.status === 'INACTIVE') where.isActive = false;
    if (filter.status === 'ACTIVE') {
      where.isActive = true;
      where.isLocked = false;
    }
    
    const take = Math.min(filter.take || 50, 100);
    const skip = filter.skip || 0;
    const orderBy = filter.sort === 'lastLoginAt' ? { lastLoginAt: 'desc' as const } : { createdAt: 'desc' as const };
    
    const [total, rows] = await Promise.all([
      this.prisma.userAccount.count({ where }),
      this.prisma.userAccount.findMany({
        where,
        include: { roles: { include: { role: true } } },
        orderBy,
        skip,
        take,
      }),
    ]);

    const users = [];
    for (const row of rows) {
      const codes = await this.loadPermissionCodes(row.id);
      users.push(toSafeUser({ ...row, permissionCodes: codes }));
    }
    return { users, total, skip, take };
  }

  async getUserById(id: string) {
    const row = await this.prisma.userAccount.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!row) throw new NotFoundException('User not found');
    const codes = await this.loadPermissionCodes(row.id);
    return toSafeUser({ ...row, permissionCodes: codes });
  }

  async createUser(input: any, actor: RequestActor) {
    const passwordHash = await bcrypt.hash(input.password, 12);
    
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.userAccount.create({
        data: {
          username: input.username.trim(),
          email: input.email.trim().toLowerCase(),
          fullName: input.fullName.trim(),
          passwordHash,
          passwordChangedAt: new Date(),
          userType: input.userType || 'internal',
          department: input.department,
          jobTitle: input.jobTitle,
          mobile: input.mobile,
          employeeNumber: input.employeeNumber,
          customerId: input.customerId,
          createdBy: actor.id,
        },
      });

      const codes = input.roleCodes?.length ? input.roleCodes : input.userType === 'customer' ? ['CUSTOMER_USER'] : ['REPORT_VIEWER'];
      if (codes.includes('SYSTEM_ADMINISTRATOR') && !this.actorHasRole(actor, 'SYSTEM_ADMINISTRATOR')) {
        throw new ForbiddenException('Only a SYSTEM_ADMINISTRATOR can grant that role.');
      }

      for (const code of codes) {
        const role = await tx.role.findUnique({ where: { code } });
        if (!role || !role.isActive) throw new BadRequestException(`Role ${code} is not available.`);
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id, assignedBy: actor.id } });
      }

      const row = await tx.userAccount.findUniqueOrThrow({ where: { id: user.id }, include: { roles: { include: { role: true } } } });
      const permCodes = await this.loadPermissionCodes(user.id);
      return toSafeUser({ ...row, permissionCodes: permCodes });
    });
  }

  async updateUser(id: string, input: any, actor: RequestActor) {
    const current = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('User not found');

    const data: any = {};
    if (input.fullName !== undefined) data.fullName = input.fullName.trim();
    if (input.department !== undefined) data.department = input.department;
    if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle;
    if (input.mobile !== undefined) data.mobile = input.mobile;
    if (input.employeeNumber !== undefined) data.employeeNumber = input.employeeNumber;
    if (input.userType !== undefined) data.userType = input.userType;
    if (input.customerId !== undefined) data.customerId = input.customerId;

    const user = await this.prisma.userAccount.update({
      where: { id },
      data,
      include: { roles: { include: { role: true } } }
    });
    const codes = await this.loadPermissionCodes(id);
    return toSafeUser({ ...user, permissionCodes: codes });
  }

  async setUserActive(id: string, isActive: boolean, actor: RequestActor) {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.userAccount.update({
      where: { id },
      data: { isActive, status: isActive ? 'ACTIVE' : 'INACTIVE' },
      include: { roles: { include: { role: true } } }
    });
    if (!isActive) {
      await this.prisma.userSession.updateMany({ where: { userId: id }, data: { revokedAt: new Date() } });
    }
    const codes = await this.loadPermissionCodes(id);
    return toSafeUser({ ...updated, permissionCodes: codes });
  }

  async setUserLocked(id: string, isLocked: boolean, actor: RequestActor) {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const updated = await this.prisma.userAccount.update({
      where: { id },
      data: { isLocked, status: isLocked ? 'LOCKED' : (user.isActive ? 'ACTIVE' : 'INACTIVE'), failedLoginAttempts: 0 },
      include: { roles: { include: { role: true } } }
    });
    const codes = await this.loadPermissionCodes(id);
    return toSafeUser({ ...updated, permissionCodes: codes });
  }

  async assignRole(userId: string, roleCode: string, actor: RequestActor) {
    if (roleCode === 'SYSTEM_ADMINISTRATOR' && !this.actorHasRole(actor, 'SYSTEM_ADMINISTRATOR')) {
      throw new ForbiddenException('Only a SYSTEM_ADMINISTRATOR can assign that role.');
    }
    const user = await this.prisma.userAccount.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new NotFoundException('Role not found');
    const exists = await this.prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId: role.id } } });
    if (!exists) {
      await this.prisma.userRole.create({ data: { userId, roleId: role.id, assignedBy: actor.id } });
    }
    return this.getUserById(userId);
  }

  async removeRole(userId: string, roleCode: string, actor: RequestActor) {
    if (roleCode === 'SYSTEM_ADMINISTRATOR' && !this.actorHasRole(actor, 'SYSTEM_ADMINISTRATOR')) {
      throw new ForbiddenException('Only a SYSTEM_ADMINISTRATOR can remove that role.');
    }
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
    return this.getUserById(userId);
  }

  async issueAdminPasswordReset(id: string, actor: RequestActor) {
    const user = await this.prisma.userAccount.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    const token = randomOpaqueToken();
    const tokenHash = hashOpaqueToken(token);
    await this.prisma.passwordResetTicket.create({
      data: {
        userId: id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdBy: actor.id,
      },
    });
    const includeToken = process.env.NODE_ENV !== 'production' && process.env.ADMIN_RESET_TOKEN_IN_RESPONSE === 'true';
    return {
      resetIssued: true,
      expiresInMinutes: 60,
      resetToken: includeToken ? token : undefined,
    };
  }

  async consumePasswordReset(token: string, newPassword: string) {
    const tokenHash = hashOpaqueToken(token);
    const ticket = await this.prisma.passwordResetTicket.findUnique({
      where: { tokenHash },
    });
    if (!ticket || ticket.usedAt || ticket.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.userAccount.update({
        where: { id: ticket.userId },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          isLocked: false,
          status: 'ACTIVE',
        },
      }),
      this.prisma.passwordResetTicket.update({
        where: { id: ticket.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetTicket.updateMany({
        where: { userId: ticket.userId, usedAt: null, id: { not: ticket.id } },
        data: { usedAt: new Date() },
      }),
    ]);
    await this.prisma.userSession.updateMany({
      where: { userId: ticket.userId },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async listRoles() {
    const rows = await this.prisma.role.findMany({ orderBy: { code: 'asc' } });
    return rows;
  }

  async getRoleDetail(id: string) {
    return this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        users: { include: { user: { select: { id: true, username: true, fullName: true, email: true, isActive: true } } } }
      }
    });
  }

  async createRole(input: any, actor: RequestActor) {
    return this.prisma.role.create({
      data: {
        code: input.code.trim().toUpperCase(),
        name: input.name || input.code.trim().toUpperCase(),
        description: input.description,
        isActive: input.isActive ?? true,
      }
    });
  }

  async updateRole(id: string, input: any, actor: RequestActor) {
    return this.prisma.role.update({
      where: { id },
      data: { description: input.description }
    });
  }

  async setRoleActive(id: string, isActive: boolean, actor: RequestActor) {
    if (!isActive) {
      const role = await this.prisma.role.findUnique({ where: { id } });
      if (role?.code === 'SYSTEM_ADMINISTRATOR') throw new ForbiddenException('Cannot disable SYSTEM_ADMINISTRATOR role.');
    }
    return this.prisma.role.update({ where: { id }, data: { isActive } });
  }

  async setRolePermissions(id: string, list: string[], actor: RequestActor) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.code === 'SYSTEM_ADMINISTRATOR') throw new ForbiddenException('Cannot modify SYSTEM_ADMINISTRATOR role.');

    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      for (const code of list) {
        const [module, resource, action] = code.split(':');
        if (!module || !resource || !action) continue;
        const perm = await tx.permission.findUnique({
          where: { module_resource_action: { module, resource, action } }
        });
        if (perm) {
          await tx.rolePermission.create({ data: { roleId: id, permissionId: perm.id, grantedBy: actor.id } });
        }
      }
      return tx.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    });
  }

  async securitySummary() {
    return { status: 'healthy', checkedAt: new Date() };
  }
}
