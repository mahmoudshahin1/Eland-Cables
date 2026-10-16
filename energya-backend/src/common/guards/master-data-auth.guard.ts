import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { RequestActor } from '../interfaces/request-actor.interface.js';
import {
  assertCanViewMasterDataCatalog,
  assertCanUseDrumOptimization,
  assertCanWriteCableMaster,
} from '../../shared/domain/rbac.js';
import { DomainError } from '../../shared/errors/domainError.js';

function getActor(context: ExecutionContext): RequestActor | null {
  const req = context.switchToHttp().getRequest();
  return req.user || null;
}

@Injectable()
export class MasterReadAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required to view master data.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      assertCanViewMasterDataCatalog(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        const isSignIn = /sign in/i.test(err.message);
        if (isSignIn) {
          throw new UnauthorizedException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
        }
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class DrumComputeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required for drum optimization.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      assertCanUseDrumOptimization(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        const isSignIn = /sign in/i.test(err.message);
        if (isSignIn) {
          throw new UnauthorizedException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
        }
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class MasterWriteAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required to change Cable Master.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      assertCanWriteCableMaster(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}
