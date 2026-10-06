import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
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
   * Authenticate a user by email/username + password strictly against PostgreSQL.
   * No mock data or demo credentials allowed.
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
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.isActive || user.isLocked) {
      throw new UnauthorizedException('Account is inactive or locked.');
    }

    const isMatch = await bcrypt.compare(pass, user.passwordHash);
    if (!isMatch) {
      await this.prisma.userAccount.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 } },
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

    const payload = { sub: user.id, username: user.username, role: user.userType };
    const { passwordHash: _passwordHash, ...userWithoutPassword } = user;

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

      const user = await this.prisma.userAccount.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || !user.isActive || user.isLocked) {
        throw new UnauthorizedException('User account is no longer valid.');
      }

      const payload = { sub: user.id, username: user.username, role: user.userType };

      return {
        success: true,
        accessToken: await this.jwtService.signAsync(payload),
        refreshToken: await this.jwtService.signAsync(payload, { expiresIn: '7d' }),
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }
  }

  /**
   * Return the current user profile from a verified JWT payload strictly from PostgreSQL.
   */
  async getMe(userId: string) {
    const user = await this.prisma.userAccount.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('User not found or inactive.');
    }

    const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
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
      throw new NotFoundException('User not found.');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Current password is incorrect.');
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
