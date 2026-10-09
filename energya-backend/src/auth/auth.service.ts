import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository.js';
import * as bcrypt from 'bcryptjs';
import { toSafeUser } from '../shared/domain/safe-user.js';
import { hashPassword, hashOpaqueToken } from '../shared/domain/password-service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwtService: JwtService,
  ) {}

  private async generateSession(userId: string, expiresInDays = 1): Promise<string> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    const session = await this.repo.createUserSession({
      userId,
      expiresAt,
      refreshTokenHash: require('crypto').randomBytes(32).toString('hex'),
    });
    return session.id;
  }

  async login(identifier: string, pass: string) {
    const user = await this.repo.findUserByIdentifier(identifier);

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
      
      await this.repo.updateUserAccount(user.id, { 
        failedLoginAttempts: newAttempts,
        isLocked: newAttempts >= threshold,
        status: newAttempts >= threshold ? 'LOCKED' : user.status
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.repo.updateUserAccount(user.id, {
      failedLoginAttempts: 0,
      lastLoginAt: new Date(),
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
      await this.repo.revokeSession(sessionId);
    }
    if (refreshToken) {
      try {
        const decoded = await this.jwtService.verifyAsync(refreshToken, { ignoreExpiration: true });
        if (decoded.sid) {
          await this.repo.revokeSession(decoded.sid);
        }
      } catch {}
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = await this.jwtService.verifyAsync(refreshToken);
      const session = await this.repo.findSessionById(decoded.sid);
      
      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired refresh token.');
      }

      const user = await this.repo.findUserById(decoded.sub);

      if (!user || !user.isActive || user.isLocked) {
        throw new UnauthorizedException('User account is no longer valid.');
      }

      await this.repo.revokeSession(session.id);

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
    const user = await this.repo.findUserById(userId);

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
    const user = await this.repo.findUserById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    
    const isMatch = await bcrypt.compare(current, user.passwordHash);
    if (!isMatch) throw new BadRequestException('Current password does not match', { description: 'VALIDATION_FAILED' });

    const hash = await hashPassword(newPass);
    await this.repo.updateUserAccount(userId, { passwordHash: hash, passwordChangedAt: new Date() });

    if (sessionId) {
      await this.repo.revokeOtherUserSessions(userId, sessionId);
    }
  }

  async resetPassword(token: string, newPass: string) {
    const tokenHash = hashOpaqueToken(token);
    const ticket = await this.repo.findPasswordResetTicket(tokenHash);
    if (!ticket || ticket.usedAt || ticket.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }
    const passwordHash = await hashPassword(newPass);
    await this.repo.applyPasswordResetTransaction(ticket.userId, ticket.id, passwordHash);
    await this.repo.revokeUserSessions(ticket.userId);
    return { success: true };
  }

  async getRoles() {
    return this.repo.findActiveRoles();
  }
}
