import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminIdentityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findUserById(id: string) {
    return this.prisma.userAccount.findUnique({
      where: { id },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, customerUsers: { include: { customer: true } } }
    });
  }

  async countUsers(where: Prisma.UserAccountWhereInput) {
    return this.prisma.userAccount.count({ where });
  }

  async findUsers(where: Prisma.UserAccountWhereInput, skip: number, take: number) {
    return this.prisma.userAccount.findMany({
      where,
      skip,
      take,
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        customerUsers: { include: { customer: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createUser(data: Prisma.UserAccountCreateInput) {
    return this.prisma.userAccount.create({ data });
  }

  async updateUser(id: string, data: Prisma.UserAccountUpdateInput) {
    return this.prisma.userAccount.update({ where: { id }, data });
  }

  async findRoleByCode(code: string) {
    return this.prisma.role.findUnique({ where: { code } });
  }

  async findUserRole(userId: string, roleId: string) {
    return this.prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId } } });
  }

  async createUserRole(userId: string, roleId: string, assignedBy: string) {
    return this.prisma.userRole.create({ data: { userId, roleId, assignedBy } });
  }

  async deleteUserRoles(userId: string, roleId: string) {
    return this.prisma.userRole.deleteMany({ where: { userId, roleId } });
  }

  async createPasswordResetTicket(userId: string, tokenHash: string, expiresAt: Date, createdBy?: string) {
    return this.prisma.passwordResetTicket.create({
      data: { userId, tokenHash, expiresAt, createdBy }
    });
  }

  async revokeUserSessions(userId: string) {
    return this.prisma.userSession.updateMany({
      where: { userId },
      data: { revokedAt: new Date() }
    });
  }

  async findRoles() {
    const roles = await this.prisma.role.findMany({
      include: { _count: { select: { users: true, permissions: true } } },
      orderBy: { code: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      userType: r.userType,
      isSystem: r.isSystem,
      isActive: r.isActive,
      userCount: r._count.users,
      permissionCount: r._count.permissions,
    }));
  }

  async findRoleById(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { OR: [{ id }, { code: id }] },
      include: {
        permissions: { include: { permission: true } },
        users: { include: { user: true } },
      },
    });
    if (!role) return null;
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      userType: role.userType,
      isSystem: role.isSystem,
      isActive: role.isActive,
      permissions: role.permissions.map((p) => ({
        module: p.permission.module,
        resource: p.permission.resource,
        action: p.permission.action,
        description: p.permission.description,
      })),
      users: (role.users || []).map((u: any) => ({ id: u.user?.id, email: u.user?.email, fullName: u.user?.fullName })),
    };
  }

  async createRole(data: Prisma.RoleCreateInput) {
    return this.prisma.role.create({ data });
  }

  async updateRole(id: string, data: Prisma.RoleUpdateInput) {
    return this.prisma.role.update({ where: { id }, data });
  }

  async updateRolePermissionsTransaction(roleId: string, permissionIds: string[], assignedBy: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map(pId => ({
            roleId,
            permissionId: pId,
          }))
        });
      }
      return tx.role.findUnique({
        where: { id: roleId },
        include: { permissions: { include: { permission: true } } }
      });
    });
  }

  async findPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { resource: 'asc' }, { action: 'asc' }]
    });
  }

  async countSessions() {
    return this.prisma.userSession.count({ where: { revokedAt: null } });
  }
}
