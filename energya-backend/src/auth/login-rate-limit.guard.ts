import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private static buckets = new Map<string, { count: number; resetAt: number }>();

  static resetForTests() {
    this.buckets.clear();
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    const enabled =
      process.env.LOGIN_RATE_LIMIT === 'true' ||
      (process.env.LOGIN_RATE_LIMIT !== 'false' && process.env.NODE_ENV === 'production');
    if (!enabled) return true;

    const windowMs = Number(process.env.LOGIN_RATE_WINDOW_MS || 60000);
    const max = Number(process.env.LOGIN_RATE_MAX || 20);
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const now = Date.now();

    const existing = LoginRateLimitGuard.buckets.get(ip);
    if (!existing || existing.resetAt <= now) {
      LoginRateLimitGuard.buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    existing.count += 1;
    if (existing.count > max) {
      throw new HttpException(
        {
          error: 'Too many login attempts. Try again later.',
          code: 'RATE_LIMITED',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
