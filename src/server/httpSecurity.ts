/**
 * HTTP security controls for the Express monolith.
 * Headers always on. CORS and login rate-limit apply in production (or when env flags are set).
 * Account lockout remains authoritative in identityService (LOGIN_LOCK_THRESHOLD).
 */

import type { NextFunction, Request, Response } from 'express';

export function applySecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

export function applyCors(req: Request, res: Response, next: NextFunction) {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  const allowed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS' && origin && allowed.includes(origin)) {
    res.status(204).end();
    return;
  }
  next();
}

type Bucket = { count: number; resetAt: number };

const loginBuckets = new Map<string, Bucket>();

export function isLoginRateLimitEnabled(): boolean {
  if (process.env.LOGIN_RATE_LIMIT === 'false') return false;
  if (process.env.LOGIN_RATE_LIMIT === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  if (!isLoginRateLimitEnabled()) return next();
  const windowMs = Number(process.env.LOGIN_RATE_WINDOW_MS || 60_000);
  const max = Number(process.env.LOGIN_RATE_MAX || 20);
  const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const existing = loginBuckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    loginBuckets.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }
  existing.count += 1;
  if (existing.count > max) {
    res.status(429).json({
      error: 'Too many login attempts. Try again later.',
      code: 'RATE_LIMITED',
    });
    return;
  }
  next();
}

/** Test helper — does not change production lockout. */
export function resetLoginRateLimitForTests() {
  loginBuckets.clear();
}
