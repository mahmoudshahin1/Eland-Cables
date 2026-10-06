import { describe, it, expect, vi } from 'vitest';
import { DomainExceptionFilter } from './domain-exception.filter.js';
import { HttpStatus, NotFoundException, UnauthorizedException, HttpException } from '@nestjs/common';
import { validateEnv } from '../config/env.validation.js';

describe('Phase 0 Security & Filter Contracts', () => {
  describe('validateEnv', () => {
    it('rejects missing DATABASE_URL', () => {
      expect(() =>
        validateEnv({
          JWT_SECRET: 'a'.repeat(32),
        }),
      ).toThrow('DATABASE_URL is required');
    });

    it('rejects missing or short JWT_SECRET', () => {
      expect(() =>
        validateEnv({
          DATABASE_URL: 'postgresql://localhost:5432/db',
          JWT_SECRET: 'short',
        }),
      ).toThrow('JWT_SECRET must be at least 32 characters long');
    });

    it('accepts valid configuration', () => {
      const res = validateEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
        JWT_SECRET: 'a'.repeat(32),
      });
      expect(res.PORT).toBe(3000);
      expect(res.DATABASE_URL).toBe('postgresql://localhost:5432/db');
    });
  });

  describe('DomainExceptionFilter', () => {
    const filter = new DomainExceptionFilter();

    function mockHost(url = '/api/unknown', method = 'GET') {
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const ctx = {
        getResponse: () => ({ status }),
        getRequest: () => ({ url, originalUrl: url, method }),
      };
      return {
        host: { switchToHttp: () => ctx } as any,
        status,
        json,
      };
    }

    it('formats unmatched /api 404 route matching legacy express format', () => {
      const { host, status, json } = mockHost('/api/does-not-exist');
      const notFound = new NotFoundException('Cannot GET /api/does-not-exist');

      filter.catch(notFound, host);
      expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'API route not found.',
          method: 'GET',
          path: '/api/does-not-exist',
        }),
      );
    });

    it('formats 401 Unauthorized matching legacy error format', () => {
      const { host, status, json } = mockHost('/api/protected');
      filter.catch(new UnauthorizedException(), host);
      expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(json).toHaveBeenCalledWith({
        error: 'Sign in is required.',
        code: 'UNAUTHORIZED',
      });
    });

    it('formats 429 rate limit matching legacy error format', () => {
      const { host, status, json } = mockHost('/api/auth/login');
      filter.catch(new HttpException('Rate limit', HttpStatus.TOO_MANY_REQUESTS), host);
      expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
      expect(json).toHaveBeenCalledWith({
        error: 'Too many login attempts. Try again later.',
        code: 'RATE_LIMITED',
      });
    });

    it('formats custom DomainError matching legacy format and status', () => {
      const { host, status, json } = mockHost('/api/business');
      const domainErr = {
        name: 'DomainError',
        code: 'CONFLICT',
        message: 'Business conflict occurred',
        details: { entity: 'Cable' },
      };
      filter.catch(domainErr, host);
      expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(json).toHaveBeenCalledWith({
        error: 'Business conflict occurred',
        code: 'CONFLICT',
        details: { entity: 'Cable' },
      });
    });
  });
});
