import { Injectable, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository.js';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { toSafeUser } from '../shared/domain/safe-user.js';
import { hashPassword, hashOpaqueToken, randomOpaqueToken } from '../shared/domain/password-service.js';
import { deriveLegacyPermissions } from '../shared/domain/rbac-compatibility.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthRepository) private readonly repo: AuthRepository,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  private async generateSession(userId: string, expiresInDays = 1): Promise<string> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    const session = await this.repo.createUserSession({
      userId,
      expiresAt,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    });
    return session.id;
  }

  async login(identifier: string, pass: string) {
    const user = await this.repo.findUserByIdentifier(identifier);

    if (!user) {
      throw new UnauthorizedException({ error: 'Invalid email or password credentials.', code: 'UNAUTHORIZED' });
    }

    if (!user.isActive || user.status === 'INACTIVE') {
      throw new UnauthorizedException({ error: 'Account is inactive.', code: 'UNAUTHORIZED' });
    }
    if (user.isLocked || user.status === 'LOCKED') {
      throw new UnauthorizedException({ error: 'Account is locked.', code: 'UNAUTHORIZED' });
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
      throw new UnauthorizedException({ error: 'Invalid email or password credentials.', code: 'UNAUTHORIZED' });
    }

    await this.repo.updateUserAccount(user.id, {
      failedLoginAttempts: 0,
      lastLoginAt: new Date(),
    });

    const refreshToken = randomOpaqueToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const session = await this.repo.createUserSession({
      userId: user.id,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
    });
    
    const roleCodes = user.roles.map(ur => ur.role.code);
    const codes = [...new Set(
      user.roles.flatMap((ur) =>
        ur.role.isActive
          ? ur.role.permissions.filter((rp) => rp.permission.isActive).map((rp) => `${rp.permission.module}:${rp.permission.resource}:${rp.permission.action}`.toUpperCase())
          : []
      )
    )];

    const payload = { 
      sub: user.id, 
      sid: session.id,
      name: user.fullName || user.username,
      email: user.email,
      username: user.username,
      userType: user.userType || 'internal',
      role: roleCodes[0],
      roles: roleCodes,
      department: user.department || null,
      permissions: deriveLegacyPermissions(codes),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const decodedClaims = this.jwtService.decode(accessToken);
    const safeUser = toSafeUser({ ...user, permissionCodes: codes });
    const activeLinks = (user.customerUsers || []).filter((l: any) => l.status === 'ACTIVE');
    (safeUser as any).customerMasterIds = activeLinks.map((l: any) => l.customerId);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      refreshToken,
      user: safeUser,
      claims: decodedClaims,
    };
  }

  async logout(sessionId?: string, refreshToken?: string) {
    if (sessionId) {
      await this.repo.revokeSession(sessionId);
    }
    if (refreshToken) {
      const hash = hashOpaqueToken(refreshToken);
      await this.repo.revokeSessionByHash(hash);
    }
  }

  async refreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }
    const hash = hashOpaqueToken(refreshToken);
    const session = await this.repo.findSessionByTokenHash(hash);
    
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const user = await this.repo.findUserById(session.userId);

    if (!user || !user.isActive || user.isLocked) {
      await this.repo.revokeSession(session.id);
      throw new UnauthorizedException('Account is not permitted to refresh a session.');
    }

    await this.repo.revokeSession(session.id);

    const newRefreshToken = randomOpaqueToken();
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + 7);
    const newSession = await this.repo.createUserSession({
      userId: user.id,
      refreshTokenHash: hashOpaqueToken(newRefreshToken),
      expiresAt: newExpiresAt,
    });

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
      sid: newSession.id,
      name: user.fullName || user.username,
      email: user.email,
      username: user.username,
      userType: user.userType || 'internal',
      role: roleCodes[0],
      roles: roleCodes,
      department: user.department || null,
      permissions: deriveLegacyPermissions(codes),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const decodedClaims = this.jwtService.decode(accessToken);
    const safeUser = toSafeUser({ ...user, permissionCodes: codes });
    const activeLinks = (user.customerUsers || []).filter((l: any) => l.status === 'ACTIVE');
    (safeUser as any).customerMasterIds = activeLinks.map((l: any) => l.customerId);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      refreshToken: newRefreshToken,
      user: safeUser,
      claims: decodedClaims,
    };
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

    const safeUser = toSafeUser({ ...user, permissionCodes: codes });

    const activeLinks = user.customerUsers.filter(l => l.status === 'ACTIVE');
    const customer = activeLinks[0]?.customer;
    const customerMasterIds = activeLinks.map(l => l.customerId);

    return {
      ...safeUser,
      companyName: customer?.name,
      companyLegalName: customer?.legalName || undefined,
      companyLogoUrl: customer?.companyLogoUrl || undefined,
      companyTagline: customer?.companyTagline || undefined,
      customerMasterIds,
      customerCode: customer?.code || user.customerId || undefined,
    };
  }

  async changePassword(userId: string, current: string, newPass: string, sessionId?: string) {
    if (!current || !newPass) {
      throw new BadRequestException({
        error: 'Current password and new password are required',
        code: 'VALIDATION_FAILED',
      });
    }
    if (current === newPass) {
      throw new BadRequestException({
        error: 'New password must be different from the current password.',
        code: 'VALIDATION_FAILED',
      });
    }
    const user = await this.repo.findUserById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    
    const isMatch = await bcrypt.compare(current, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException({
        error: 'Current password does not match',
        code: 'VALIDATION_FAILED',
      });
    }

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
      throw new BadRequestException({
        error: 'Invalid or expired password reset token.',
        code: 'VALIDATION_FAILED',
      });
    }
    const passwordHash = await hashPassword(newPass);
    await this.repo.applyPasswordResetTransaction(ticket.userId, ticket.id, passwordHash);
    await this.repo.revokeUserSessions(ticket.userId);
    return { success: true, message: 'Password updated. You may now sign in.' };
  }

  async getRoles() {
    try {
      return await this.repo.findActiveRoles();
    } catch {
      return [];
    }
  }
}
