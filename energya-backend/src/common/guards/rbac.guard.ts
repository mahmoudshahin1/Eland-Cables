import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, PermissionRequirements } from '../decorators/require-permission.decorator.js';
import { RequestActor } from '../interfaces/request-actor.interface.js';
import { hasPermission } from '../../shared/domain/rbac-engine.js';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride<PermissionRequirements>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermission) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user: RequestActor }>();
    
    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    if (hasPermission(user, requiredPermission.domain, requiredPermission.resource, requiredPermission.action)) {
      return true;
    }

    throw new ForbiddenException(`Insufficient permissions for ${requiredPermission.domain}:${requiredPermission.resource}:${requiredPermission.action}`);
  }
}
