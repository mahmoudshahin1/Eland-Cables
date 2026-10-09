import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createUserSession(data: Prisma.UserSessionUncheckedCreateInput) {
    return this.prisma.userSession.create({ data });
  }

  async findUserByIdentifier(identifier: string) {
    return this.prisma.userAccount.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase() },
          { username: identifier.toLowerCase() },
        ],
      },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        customerUsers: { include: { customer: true } }
      }
    });
  }

  async updateUserAccount(id: string, data: Prisma.UserAccountUpdateInput) {
    return this.prisma.userAccount.update({ where: { id }, data });
  }

  async revokeUserSessions(userId: string) {
    return this.prisma.userSession.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  async revokeOtherUserSessions(userId: string, currentSessionId: string) {
    return this.prisma.userSession.updateMany({
      where: { userId, id: { not: currentSessionId } },
      data: { isRevoked: true },
    });
  }

  async findSessionById(id: string) {
    return this.prisma.userSession.findUnique({ where: { id } });
  }

  async findUserById(id: string) {
    return this.prisma.userAccount.findUnique({
      where: { id },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        customerUsers: { include: { customer: true } }
      }
    });
  }

  async revokeSession(id: string) {
    return this.prisma.userSession.update({
      where: { id },
      data: { isRevoked: true },
    });
  }

  async findPasswordResetTicket(tokenHash: string) {
    return this.prisma.passwordResetTicket.findUnique({
      where: { tokenHash }
    });
  }

  async applyPasswordResetTransaction(userId: string, ticketId: string, passwordHash: string) {
    return this.prisma.$transaction([
      this.prisma.userAccount.update({
        where: { id: userId },
        data: { passwordHash, failedLoginAttempts: 0, isLocked: false },
      }),
      this.prisma.passwordResetTicket.update({
        where: { id: ticketId },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetTicket.updateMany({
        where: { userId, id: { not: ticketId }, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  async findActiveRoles() {
    return this.prisma.role.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
  }
}
