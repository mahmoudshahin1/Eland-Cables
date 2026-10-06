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
        return response.status(HttpStatus.UNAUTHORIZED).json({
          error: 'Sign in is required.',
          code: 'UNAUTHORIZED',
        });
      }

      if (status === HttpStatus.BAD_REQUEST) {
        if (typeof resBody === 'object' && resBody !== null && Array.isArray((resBody as any).message)) {
          // ValidationPipe errors
          return response.status(HttpStatus.BAD_REQUEST).json({
            error: 'Validation failed',
            code: 'VALIDATION_FAILED',
            details: (resBody as any).message,
          });
        }
        return response.status(HttpStatus.BAD_REQUEST).json({
          error: typeof resBody === 'object' && (resBody as any).message ? (resBody as any).message : exception.message,
          code: 'BAD_REQUEST',
        });
      }

      if (status === HttpStatus.FORBIDDEN) {
        return response.status(HttpStatus.FORBIDDEN).json({
          error: typeof resBody === 'object' && (resBody as any).message ? (resBody as any).message : exception.message,
          code: 'UNAUTHORIZED',
        });
      }

      return response.status(status).json(typeof resBody === 'object' ? resBody : { error: exception.message });
    }

    // 5. Fallback for unhandled server errors (500)
    this.logger.error(`Unhandled Exception: ${err?.message || exception}`, err?.stack);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: err?.message || 'Unexpected error',
    });
  }
}
