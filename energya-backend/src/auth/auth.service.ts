import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service.js';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Authenticate a user by email/username + password.
   * Returns JWT tokens on success.
   */
  async login(emailOrUsername: string, pass: string) {
    const user = await this.prisma.userAccount.findFirst({
      where: {
        OR: [
          { email: emailOrUsername.toLowerCase() },
          { username: emailOrUsername.toLowerCase() },
        ],
      },
    });

    if (!user) {
      return { success: false, error: 'Invalid email or password credentials.' };
    }

    if (!user.isActive || user.isLocked) {
      return { success: false, error: 'Account is inactive or locked.' };
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      // Increment failed login attempts
      await this.prisma.userAccount.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      return { success: false, error: 'Invalid email or password credentials.' };
    }

    // Reset failed attempts on successful login
    await this.prisma.userAccount.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lastLoginAt: new Date(),
      },
    });

    const payload = { sub: user.id, username: user.username, role: user.userType };

    // Remove passwordHash before returning to frontend
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      success: true,
      message: 'Logged in successfully',
      accessToken: await this.jwtService.signAsync(payload),
      refreshToken: await this.jwtService.signAsync(payload, { expiresIn: '7d' }),
      user: userWithoutPassword,
      claims: payload,
    };
  }

  /**
   * Issue a new access token from a valid refresh token.
   */
  async refreshToken(refreshToken: string) {
    try {
      const decoded = await this.jwtService.verifyAsync(refreshToken);

      // Verify user still exists and is active
      const user = await this.prisma.userAccount.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || !user.isActive || user.isLocked) {
        return { success: false, error: 'User account is no longer valid.' };
      }

      const payload = { sub: user.id, username: user.username, role: user.userType };

      return {
        success: true,
        accessToken: await this.jwtService.signAsync(payload),
        refreshToken: await this.jwtService.signAsync(payload, { expiresIn: '7d' }),
      };
    } catch {
      return { success: false, error: 'Invalid or expired refresh token.' };
    }
  }

  /**
   * Return the current user profile from a verified JWT payload.
   */
  async getMe(userId: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      return { success: false, error: 'User not found or inactive.' };
    }

    const { passwordHash, ...userWithoutPassword } = user;
    return { success: true, user: userWithoutPassword };
  }

  /**
   * Change the current user's password.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return { success: false, error: 'User not found.' };
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return { success: false, error: 'Current password is incorrect.' };
    }

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await this.prisma.userAccount.update({
      where: { id: userId },
      data: {
        passwordHash: hashedPassword,
        mustChangePassword: false,
      },
    });

    return { success: true, message: 'Password changed successfully.' };
  }
}
