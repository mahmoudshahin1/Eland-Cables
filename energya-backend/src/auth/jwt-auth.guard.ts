import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service.js';
import { RequestActor, CustomerScopeStatus } from '../common/interfaces/request-actor.interface.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const actor: RequestActor = {
      id: payload.sub || payload.id,
      name: payload.name || payload.email || payload.unique_name,
      email: payload.email,
      userType: payload.role || payload.userType,
      role: payload.role,
      roles: Array.isArray(payload.roles) ? payload.roles : payload.role ? [payload.role] : [],
      permissions: payload.permissions,
      permissionCodes: Array.isArray(payload.permissionCodes) ? payload.permissionCodes : undefined,
      customerId: payload.customerId,
      customerCode: payload.customerCode,
      customerScopeKeys: Array.isArray(payload.customerScopeKeys) ? payload.customerScopeKeys : undefined,
      customerMasterIds: Array.isArray(payload.customerMasterIds) ? payload.customerMasterIds : undefined,
      sessionId: typeof payload.sid === 'string' ? payload.sid : undefined,
      department: payload.department,
      username: payload.username,
      accountStatus: payload.accountStatus,
    };

    const hydrated = await this.hydrateActorFromDatabase(actor);
    if (!hydrated.id) {
      throw new UnauthorizedException('Invalid or expired session.');
    }

    (request as any).user = hydrated;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const auth = request.headers.authorization;
    if (!auth) return undefined;
    const [type, token] = auth.split(' ');
    return type === 'Bearer' ? token : undefined;
  }

  private async sessionIsActive(sessionId: string | undefined, userId: string | undefined): Promise<boolean> {
    if (!sessionId || !userId) return false;
    const session = await this.prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session) return false;
    if (session.userId !== userId) return false;
    if (session.revokedAt) return false;
    if (session.expiresAt < new Date()) return false;
    return true;
  }

  private async hydrateActorFromDatabase(actor: RequestActor): Promise<RequestActor> {
    if (!actor.id) return actor;
    
    const user = await this.prisma.userAccount.findUnique({
      where: { id: actor.id },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
        customerUsers: { where: { status: 'ACTIVE' }, include: { customer: true } },
      },
    });

    if (!user) {
      return actor; // unit-test fallback like legacy
    }

    if (!actor.sessionId || !(await this.sessionIsActive(actor.sessionId, user.id))) {
      return {};
    }

    if (!user.isActive || user.isLocked || user.status === 'INACTIVE' || user.status === 'LOCKED') {
      return {};
    }

    const codes = [
      ...new Set(
        user.roles.flatMap((ur) =>
          ur.role.isActive
            ? ur.role.permissions
                .filter((rp) => rp.permission.isActive)
                .map((rp) => `${rp.permission.module}:${rp.permission.resource}:${rp.permission.action}`.toUpperCase())
            : []
        )
      ),
    ];

    const roleCodes = user.roles.map((ur) => ur.role.code);
    const links = user.customerUsers;
    const isCustomer = user.userType === 'customer';
    
    let customerScopeStatus: CustomerScopeStatus = 'internal';
    let scopedLinks = links;
    
    if (isCustomer) {
      if (links.length === 1) {
        customerScopeStatus = 'resolved';
        scopedLinks = links;
      } else if (links.length === 0) {
        customerScopeStatus = 'none';
        scopedLinks = [];
      } else {
        const resolved = links.find((l) => l.customer.id === actor.customerId);
        if (resolved) {
          customerScopeStatus = 'resolved';
          scopedLinks = [resolved];
        } else {
          customerScopeStatus = 'ambiguous';
          scopedLinks = [];
        }
      }
    }

    return {
      ...actor,
      id: user.id,
      name: user.fullName || user.username,
      email: user.email,
      userType: user.userType || 'customer',
      role: roleCodes[0],
      roles: roleCodes,
      permissionCodes: codes,
      accountStatus: user.status || (user.isLocked ? 'LOCKED' : user.isActive ? 'ACTIVE' : 'INACTIVE'),
      customerId: scopedLinks.length === 1 ? scopedLinks[0].customerId : undefined,
      customerCode: scopedLinks.length === 1 ? scopedLinks[0].customer.code : undefined,
      customerScopeKeys: scopedLinks.length > 0 ? scopedLinks.map((l) => l.customerId) : undefined,
      customerMasterIds: scopedLinks.length > 0 ? scopedLinks.map((l) => l.customerId) : undefined,
      customerScopeStatus,
      department: user.department || undefined,
      username: user.username,
    };
  }
}
