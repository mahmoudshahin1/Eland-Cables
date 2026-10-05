import { getPrisma } from './db';
import { permissionCode } from '../domain/permissionCatalog';
import type { RequestActor } from './auth';

/**
 * Resolve permission codes granted via SecurityGroup → Role → Permission,
 * in addition to direct UserRole assignments (already on the JWT actor).
 */
export async function resolveGroupPermissionCodes(userId?: string | null): Promise<string[]> {
  if (!userId) return [];
  const prisma = getPrisma();
  if (!prisma) return [];

  const memberships = await prisma.securityGroupMember.findMany({
    where: { userId, group: { isActive: true } },
    include: {
      group: {
        include: {
          roles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const codes = new Set<string>();
  for (const m of memberships) {
    for (const gr of m.group.roles) {
      if (!gr.role.isActive) continue;
      for (const rp of gr.role.permissions) {
        if (!rp.permission.isActive) continue;
        codes.add(
          permissionCode({
            module: rp.permission.module,
            resource: rp.permission.resource,
            action: rp.permission.action,
          })
        );
      }
    }
  }
  return [...codes];
}

export async function loadUserAccessProfile(userId: string) {
  const prisma = getPrisma();
  if (!prisma) return null;

  const user = await prisma.userAccount.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: {
            include: { permissions: { include: { permission: true } } },
          },
        },
      },
      securityGroups: {
        include: {
          group: {
            include: {
              roles: {
                include: {
                  role: {
                    include: { permissions: { include: { permission: true } } },
                  },
                },
              },
            },
          },
        },
      },
      customerUsers: { include: { customer: true } },
    },
  });
  if (!user) return null;

  const directRoleCodes = user.roles.filter((r) => r.role.isActive).map((r) => r.role.code);
  const groupCodes = user.securityGroups.filter((g) => g.group.isActive).map((g) => g.group.code);
  const permissionCodes = new Set<string>();

  for (const ur of user.roles) {
    if (!ur.role.isActive) continue;
    for (const rp of ur.role.permissions) {
      if (!rp.permission.isActive) continue;
      permissionCodes.add(
        permissionCode({
          module: rp.permission.module,
          resource: rp.permission.resource,
          action: rp.permission.action,
        })
      );
    }
  }
  for (const gm of user.securityGroups) {
    if (!gm.group.isActive) continue;
    for (const gr of gm.group.roles) {
      if (!gr.role.isActive) continue;
      for (const rp of gr.role.permissions) {
        if (!rp.permission.isActive) continue;
        permissionCodes.add(
          permissionCode({
            module: rp.permission.module,
            resource: rp.permission.resource,
            action: rp.permission.action,
          })
        );
      }
    }
  }

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    userType: user.userType,
    roles: directRoleCodes,
    groups: groupCodes,
    permissionCodes: [...permissionCodes],
    /** V1 compatibility: Role acts as PermissionSet */
    permissionSets: directRoleCodes,
    customerScope: user.customerUsers.map((cu) => ({
      customerId: cu.customerId,
      customerCode: cu.customer.code,
    })),
    chain: {
      user: user.id,
      groups: groupCodes,
      roles: directRoleCodes,
      permissionSetModel: 'Role (V1 compatibility)',
      moduleResourceAction: 'MODULE:RESOURCE:ACTION',
      field: 'PlatformFieldDefinition.fieldSecurity / roleVisibility',
      dataScope: 'customerScope / CustomerUser',
    },
  };
}

export function actorWithGroupCodes(
  actor: RequestActor,
  groupPermissionCodes: string[]
): RequestActor & { groupPermissionCodes: string[] } {
  return { ...actor, groupPermissionCodes };
}
