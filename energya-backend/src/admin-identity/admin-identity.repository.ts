import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminIdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserById(id: string) {
    return this.prisma.userAccount.findUnique({
      where: { id },
      include: { roles: { include: { role: true } }, customerUsers: { include: { customer: true } } }
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
        roles: { include: { role: true } },
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

  async createPasswordResetTicket(userId: string, tokenHash: string, expiresAt: Date, requestedByIp?: string) {
    return this.prisma.passwordResetTicket.create({
      data: { userId, tokenHash, expiresAt, requestedByIp }
    });
  }

  async revokeUserSessions(userId: string) {
    return this.prisma.userSession.updateMany({
      where: { userId },
      data: { isRevoked: true }
    });
  }

  async findRoles() {
    return this.prisma.role.findMany({ orderBy: { code: 'asc' } });
  }

  async findRoleById(id: string) {
    return this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } }
    });
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
            assignedBy
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
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async countSessions() {
    return this.prisma.userSession.count({ where: { isRevoked: false } });
  }
}
