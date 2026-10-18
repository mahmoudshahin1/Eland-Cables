import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // 1. Check for 404 on unmatched route to match legacy Express 404 handler
    if (exception instanceof HttpException && exception.getStatus() === HttpStatus.NOT_FOUND) {
      const originalUrl = request.originalUrl || request.url;
      const resBody = exception.getResponse();
      const isRouteNotFound =
        typeof resBody === 'object' &&
        resBody !== null &&
        (resBody as any).message &&
        String((resBody as any).message).startsWith('Cannot ');

      if (isRouteNotFound) {
        return response.status(HttpStatus.NOT_FOUND).json({
          error: 'API route not found.',
          hint: 'If this route was recently added, restart the dev server (npm run dev) or rebuild production (npm run build). Express does not hot-reload new API routes.',
          method: request.method,
          path: originalUrl,
        });
      }
    }

    // 2. Check for ThrottlerException (429 Rate Limited)
    if (exception instanceof HttpException && exception.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
      return response.status(HttpStatus.TOO_MANY_REQUESTS).json({
        error: 'Too many login attempts. Try again later.',
        code: 'RATE_LIMITED',
      });
    }

    // 3. Check for DomainError (legacy pattern)
    const err = exception as any;
    if (err && (err.name === 'DomainError' || (typeof err.code === 'string' && err.message))) {
      let status = HttpStatus.UNPROCESSABLE_ENTITY; // 422 default for domain rule failures
      if (err.code === 'NOT_FOUND') status = HttpStatus.NOT_FOUND; // 404
      else if (err.code === 'UNAUTHORIZED') status = HttpStatus.FORBIDDEN; // 403 in legacy sendDomainError
      else if (err.code === 'CONFLICT') status = HttpStatus.CONFLICT; // 409
      else if (err.code === 'VALIDATION_FAILED') status = HttpStatus.UNPROCESSABLE_ENTITY; // 422

      return response.status(status).json({
        error: err.message,
        code: err.code,
        ...(err.details ? { details: err.details } : {}),
      });
    }

    // 4. Handle standard NestJS HttpExceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resBody = exception.getResponse();

      if (status === HttpStatus.UNAUTHORIZED) {
        const customObj = typeof resBody === 'object' && resBody !== null ? (resBody as any) : {};
        let finalMsg = 'Sign in is required.';
        if (customObj.error && customObj.error !== 'Unauthorized' && customObj.error !== 'Unauthorized Exception') {
          finalMsg = customObj.error;
        } else if (customObj.message && customObj.message !== 'Unauthorized' && customObj.message !== 'Unauthorized Exception') {
          finalMsg = customObj.message;
        } else if (exception.message && exception.message !== 'Unauthorized' && exception.message !== 'Unauthorized Exception') {
          finalMsg = exception.message;
        }
        return response.status(HttpStatus.UNAUTHORIZED).json({
          error: finalMsg,
          code: customObj.code || 'UNAUTHORIZED',
        });
      }

      if (status === HttpStatus.BAD_REQUEST) {
        if (typeof resBody === 'object' && resBody !== null) {
          if (Array.isArray((resBody as any).message)) {
            return response.status(HttpStatus.BAD_REQUEST).json({
              error: 'Validation failed',
              code: 'VALIDATION_FAILED',
              details: (resBody as any).message,
            });
          }
          if ((resBody as any).code && (resBody as any).error) {
            return response.status(HttpStatus.BAD_REQUEST).json(resBody as any);
          }
        }
        const msg = typeof resBody === 'object' && typeof (resBody as any).message === 'string'
          ? (resBody as any).message
          : (typeof resBody === 'object' && (resBody as any).error ? (resBody as any).error : exception.message);
        return response.status(HttpStatus.BAD_REQUEST).json({
          error: msg,
        });
      }

      if (status === HttpStatus.FORBIDDEN) {
        const customObj = typeof resBody === 'object' && resBody !== null ? resBody as any : {};
        const msg = customObj.message && typeof customObj.message === 'string'
          ? customObj.message
          : (customObj.error ? customObj.error : exception.message);
        return response.status(HttpStatus.FORBIDDEN).json({
          error: msg,
          code: customObj.code ? customObj.code : 'UNAUTHORIZED',
        });
      }

      if (status === HttpStatus.NOT_FOUND) {
        const customObj = typeof resBody === 'object' && resBody !== null ? (resBody as any) : {};
        const msg = customObj.message && typeof customObj.message === 'string'
          ? customObj.message
          : (customObj.error ? customObj.error : exception.message);
        const formattedMsg = msg.endsWith('.') ? msg : `${msg}.`;

        if (
          request.method === 'GET' &&
          (formattedMsg === 'User not found.' || formattedMsg === 'Role not found.' || formattedMsg === 'Attachment not found.')
        ) {
          return response.status(HttpStatus.NOT_FOUND).json({ error: formattedMsg });
        }
        return response.status(HttpStatus.NOT_FOUND).json({
          error: formattedMsg,
          code: customObj.code || 'NOT_FOUND',
        });
      }

      return response.status(status).json(typeof resBody === 'object' ? resBody : { error: exception.message });
    }

    // 5. Fallback for unhandled server errors (matches legacy sendErr for /api/admin and /api/auth)
    this.logger.error(`Unhandled Exception: ${err?.message || exception}`, err?.stack);
    const reqPath = request.originalUrl || request.url || '';
    if (reqPath.startsWith('/api/admin') || reqPath.startsWith('/api/auth')) {
      const status = err?.http || (err?.code === 'NOT_FOUND' ? 404 : err?.code === 'CONFLICT' ? 409 : err?.code === 'UNAUTHORIZED' ? 403 : 400);
      return response.status(status).json({
        error: err?.message || 'Unexpected error',
        code: err?.code || 'ERROR',
      });
    }
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: err?.message || 'Unexpected error',
    });
  }
}
