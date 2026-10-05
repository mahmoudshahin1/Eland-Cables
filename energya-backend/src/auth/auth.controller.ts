import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { Request } from 'express';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /api/auth/login — public */
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: Record<string, any>) {
    const identifier = body.email || body.username;
    return this.authService.login(identifier, body.password);
  }

  /** POST /api/auth/logout — public (best-effort) */
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout() {
    // JWT is stateless; the frontend clears its own tokens.
    return { success: true, message: 'Logged out successfully' };
  }

  /** POST /api/auth/refresh-token — public (takes refresh token in body) */
  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  async refreshToken(@Body() body: { refreshToken: string }) {
    if (!body.refreshToken) {
      return { success: false, error: 'Refresh token is required.' };
    }
    return this.authService.refreshToken(body.refreshToken);
  }

  /** GET /api/auth/me — requires valid JWT */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    const user = (req as any).user;
    return this.authService.getMe(user.sub);
  }

  /** POST /api/auth/change-password — requires valid JWT */
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Req() req: Request,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const user = (req as any).user;
    return this.authService.changePassword(user.sub, body.currentPassword, body.newPassword);
  }

  /** POST /api/auth/forgot-password — public placeholder */
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    // TODO: wire up email/SMTP delivery in a later phase
    return {
      success: true,
      message: 'If an account exists with that email, a reset link has been sent.',
    };
  }
}
