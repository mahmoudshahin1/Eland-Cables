import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service.js';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { toSafeUser } from '../shared/domain/safe-user.js';
import { hashPassword, hashOpaqueToken } from '../shared/domain/password-service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private async generateSession(userId: string, expiresInDays = 1): Promise<string> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        expiresAt,
        refreshTokenHash: require('crypto').randomBytes(32).toString('hex'),
      }
    });
    return session.id;
  }

  async login(identifier: string, pass: string) {
    const user = await this.prisma.userAccount.findFirst({
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

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isActive || user.isLocked) {
      throw new UnauthorizedException('Account is inactive or locked.');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      const threshold = parseInt(process.env.LOGIN_LOCK_THRESHOLD || '5', 10);
      const newAttempts = user.failedLoginAttempts + 1;
      
      await this.prisma.userAccount.update({
        where: { id: user.id },
        data: { 
          failedLoginAttempts: newAttempts,
          isLocked: newAttempts >= threshold,
          status: newAttempts >= threshold ? 'LOCKED' : user.status
        },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.prisma.userAccount.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lastLoginAt: new Date(),
      },
    });

    const sessionId = await this.generateSession(user.id, 1);
    const refreshSessionId = await this.generateSession(user.id, 7);
    
    const roleCodes = user.roles.map(ur => ur.role.code);
    const codes = [...new Set(
      user.roles.flatMap((ur) =>
        ur.role.isActive
          ? ur.role.permissions.filter((rp) => rp.permission.isActive).map((rp) => `${rp.permission.module}:${rp.permission.resource}:${rp.permission.action}`.toUpperCase())
          : []
      )
    )];

    const links = user.customerUsers.filter(l => l.status === 'ACTIVE');
    const customerId = links.length === 1 ? links[0].customerId : undefined;
    const customerCode = links.length === 1 ? links[0].customer.code : undefined;
    const scopeKeys = links.length > 0 ? links.map(l => l.customerId) : undefined;

    const payload = { 
      sub: user.id, 
      id: user.id,
      name: user.fullName || user.username,
      email: user.email,
      username: user.username,
      userType: user.userType || 'customer',
      role: roleCodes[0],
      roles: roleCodes,
      permissionCodes: codes,
      customerId,
      customerCode,
      customerScopeKeys: scopeKeys,
      customerMasterIds: scopeKeys,
      sid: sessionId,
      department: user.department,
      accountStatus: user.status || 'ACTIVE'
    };

    const refreshPayload = { ...payload, sid: refreshSessionId };

    const { passwordHash: _passwordHash, ...userWithoutPassword } = user;

    return {
      accessToken: await this.jwtService.signAsync(payload),
      refreshToken: await this.jwtService.signAsync(refreshPayload, { expiresIn: '7d' }),
      user: toSafeUser({ ...user, permissionCodes: codes }),
    };
  }

  async logout(sessionId?: string, refreshToken?: string) {
    if (sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: sessionId },
        data: { revokedAt: new Date() }
      });
    }
    if (refreshToken) {
      try {
        const decoded = await this.jwtService.verifyAsync(refreshToken, { ignoreExpiration: true });
        if (decoded.sid) {
          await this.prisma.userSession.updateMany({
            where: { id: decoded.sid },
            data: { revokedAt: new Date() }
          });
        }
      } catch {}
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = await this.jwtService.verifyAsync(refreshToken);
      const session = await this.prisma.userSession.findUnique({ where: { id: decoded.sid } });
      
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired refresh token.');
      }

      const user = await this.prisma.userAccount.findUnique({
        where: { id: decoded.sub },
        include: {
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
          customerUsers: { include: { customer: true } }
        }
      });

      if (!user || !user.isActive || user.isLocked) {
        throw new UnauthorizedException('User account is no longer valid.');
      }

      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });

      const newSessionId = await this.generateSession(user.id, 1);
      const newRefreshSessionId = await this.generateSession(user.id, 7);

      const roleCodes = user.roles.map(ur => ur.role.code);
      const codes = [...new Set(
        user.roles.flatMap((ur) =>
          ur.role.isActive
            ? ur.role.permissions.filter((rp) => rp.permission.isActive).map((rp) => `${rp.permission.module}:${rp.permission.resource}:${rp.permission.action}`.toUpperCase())
            : []
        )
      )];

      const links = user.customerUsers.filter(l => l.status === 'ACTIVE');
      const customerId = links.length === 1 ? links[0].customerId : undefined;
      const customerCode = links.length === 1 ? links[0].customer.code : undefined;
      const scopeKeys = links.length > 0 ? links.map(l => l.customerId) : undefined;

      const payload = { 
        sub: user.id, 
        id: user.id,
        name: user.fullName || user.username,
        email: user.email,
        username: user.username,
        userType: user.userType || 'customer',
        role: roleCodes[0],
        roles: roleCodes,
        permissionCodes: codes,
        customerId,
        customerCode,
        customerScopeKeys: scopeKeys,
        customerMasterIds: scopeKeys,
        sid: newSessionId,
        department: user.department,
        accountStatus: user.status || 'ACTIVE'
      };

      return {
        accessToken: await this.jwtService.signAsync(payload, { expiresIn: '1d' }),
        refreshToken: await this.jwtService.signAsync({ ...payload, sid: newRefreshSessionId }, { expiresIn: '7d' }),
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });

    if (!user || !user.isActive || user.isLocked) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    const codes = [...new Set(
      user.roles.flatMap((ur) =>
        ur.role.isActive
          ? ur.role.permissions.filter((rp) => rp.permission.isActive).map((rp) => `${rp.permission.module}:${rp.permission.resource}:${rp.permission.action}`.toUpperCase())
          : []
      )
    )];

    return toSafeUser({ ...user, permissionCodes: codes });
  }

  async changePassword(userId: string, current: string, newPass: string, sessionId?: string) {
    const user = await this.prisma.userAccount.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    
    const isMatch = await bcrypt.compare(current, user.passwordHash);
    if (!isMatch) throw new BadRequestException('Current password does not match', { description: 'VALIDATION_FAILED' });

    const hash = await hashPassword(newPass);
    await this.prisma.userAccount.update({
      where: { id: userId },
      data: { passwordHash: hash, passwordChangedAt: new Date() }
    });

    if (sessionId) {
      await this.prisma.userSession.updateMany({
        where: { userId, id: { not: sessionId } },
        data: { revokedAt: new Date() }
      });
    }
  }

  async resetPassword(token: string, newPass: string) {
    const tokenHash = hashOpaqueToken(token);
    const ticket = await this.prisma.passwordResetTicket.findUnique({
      where: { tokenHash },
    });
    if (!ticket || ticket.usedAt || ticket.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }
    const passwordHash = await hashPassword(newPass);
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

  async getRoles() {
    return this.prisma.role.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
  }
}
