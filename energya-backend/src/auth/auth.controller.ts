import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { Request } from 'express';
import { LoginDto, RefreshTokenDto, ChangePasswordDto, ResetPasswordDto, LogoutDto } from './dto/auth.dto.js';
import { RequestActor } from '../common/interfaces/request-actor.interface.js';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: LoginDto) {
    const identifier = body.email || body.username || body.userName;
    if (!identifier) {
      throw new ForbiddenException('Email or username and password are required');
    }
    const auth = await this.authService.login(identifier, body.password);
    return { success: true, message: 'Authentication successful', ...auth };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Body() body: LogoutDto) {
    let sessionId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const user = (req as any).user as RequestActor;
      if (user) {
        sessionId = user.sessionId;
      }
    }
    await this.authService.logout(sessionId, body.refreshToken);
    return { success: true, message: 'Signed out' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  async refreshToken(@Body() body: RefreshTokenDto) {
    const auth = await this.authService.refreshToken(body.refreshToken);
    return { success: true, message: 'Token refreshed', ...auth };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    const user = (req as any).user as RequestActor;
    if (!user || !user.id) throw new ForbiddenException('Invalid or expired session.');
    const fullUser = await this.authService.getMe(user.id);
    return { authenticated: true, user: fullUser, claims: user };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @Body() body: ChangePasswordDto,
  ) {
    const user = (req as any).user as RequestActor;
    if (!user || !user.id) throw new ForbiddenException('Invalid or expired session.');
    await this.authService.changePassword(user.id, body.currentPassword, body.newPassword, user.sessionId);
    return { success: true, message: 'Password updated.' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    if (!body.token || !body.newPassword) {
      throw new BadRequestException('Reset token and new password are required');
    }
    await this.authService.resetPassword(body.token, body.newPassword);
    return { success: true, message: 'Password updated. You may now sign in.' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword() {
    return {
      success: true,
      message: 'If the account exists, an administrator must issue a password reset ticket. Self-service email reset is not enabled in B1.',
    };
  }

  @Post('register')
  async register() {
    throw new ForbiddenException({ error: 'Self-registration is disabled. Ask an administrator to create your account.', code: 'UNAUTHORIZED' });
  }

  @Post('roles')
  async postRoles() {
    throw new ForbiddenException({ error: 'Use POST /api/admin/roles.', code: 'UNAUTHORIZED' });
  }

  @Post('assign-role')
  async assignRole() {
    throw new ForbiddenException({ error: 'Use POST /api/admin/users/:id/roles.', code: 'UNAUTHORIZED' });
  }

  @Get('users')
  async getUsers() {
    throw new ForbiddenException({ error: 'Use GET /api/admin/users.', code: 'UNAUTHORIZED' });
  }

  @Get('roles')
  async getRoles() {
    const roles = await this.authService.getRoles();
    return { success: true, roles, totalRoles: roles.length };
  }
}
