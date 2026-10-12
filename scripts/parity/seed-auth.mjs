import { PrismaClient as LegacyPrisma } from '../../node_modules/@prisma/client/index.js';
import { PrismaClient as TargetPrisma } from '../../energya-backend/node_modules/@prisma/client/index.js';
import bcrypt from 'bcryptjs';

async function seedUser(prisma, email, type, roles, permissions, scopes) {
  const hash = await bcrypt.hash('Password123!', 10);
  
  // Upsert user
  let user = await prisma.userAccount.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.userAccount.create({
      data: {
        email,
        username: email,
        fullName: email,
        passwordHash: hash,
        userType: type,
        isActive: true,
        isLocked: false,
        failedLoginAttempts: 0,
        status: 'ACTIVE',
      }
    });
  } else {
    await prisma.userAccount.update({
      where: { email },
      data: {
        passwordHash: hash,
        isActive: true,
        isLocked: false,
        failedLoginAttempts: 0,
        status: 'ACTIVE',
      }
    });
  }

  // Handle roles
  if (roles && roles.length > 0) {
    for (const r of roles) {
      let roleRec = await prisma.role.findUnique({ where: { code: r } });
      if (!roleRec) {
        roleRec = await prisma.role.create({
          data: { code: r, name: r, isActive: true }
        });
      }
      // Assign
      const existingAssignment = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: roleRec.id }
      });
      if (!existingAssignment) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: roleRec.id }
        });
      }
      // Handle permissions if specified
      if (permissions && permissions.length > 0) {
        for (const pStr of permissions) {
          const [module, resource, action] = pStr.split(':');
          let permRec = await prisma.permission.findUnique({
            where: { module_resource_action: { module, resource, action } }
          });
          if (!permRec) {
            permRec = await prisma.permission.create({
              data: { module, resource, action, isActive: true, description: pStr }
            });
          }
          const existingRolePerm = await prisma.rolePermission.findFirst({
            where: { roleId: roleRec.id, permissionId: permRec.id }
          });
          if (!existingRolePerm) {
            await prisma.rolePermission.create({
              data: { roleId: roleRec.id, permissionId: permRec.id }
            });
          }
        }
      }
    }
  }

  // Assign scope
  if (type === 'customer' && scopes && scopes.length > 0) {
    for (const c of scopes) {
      let customer = await prisma.customer.findUnique({ where: { code: c }});
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            code: c,
            name: c
          }
        });
      }

      let cUser = await prisma.customerUser.findFirst({
        where: { userAccountId: user.id, customerId: customer.id }
      });
      if (!cUser) {
        await prisma.customerUser.create({
          data: { userAccountId: user.id, customerId: customer.id }
        });
      }
    }
  }

  return user;
}

export async function seedAuthDatabases() {
  const legacy = new LegacyPrisma({ datasources: { db: { url: process.env.DATABASE_URL_LEGACY || 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_legacy?schema=public' } } });
  const target = new TargetPrisma({ datasources: { db: { url: process.env.DATABASE_URL_TARGET || 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public' } } });

  const allAdminPerms = [
    'ADMIN:USER:VIEW', 'ADMIN:USER:CREATE', 'ADMIN:USER:UPDATE', 'ADMIN:USER:ACTIVATE', 'ADMIN:USER:DEACTIVATE', 'ADMIN:USER:LOCK', 'ADMIN:USER:RESET_PASSWORD',
    'ADMIN:ROLE:VIEW', 'ADMIN:ROLE:CREATE', 'ADMIN:ROLE:UPDATE', 'ADMIN:ROLE:MANAGE',
    'ADMIN:CUSTOMER:VIEW', 'ADMIN:CUSTOMER:CREATE', 'ADMIN:CUSTOMER:UPDATE', 'ADMIN:CUSTOMER:ACTIVATE', 'ADMIN:CUSTOMER:DEACTIVATE', 'ADMIN:CUSTOMER:MANAGE',
    'ADMIN:CUSTOMER_USER:VIEW', 'ADMIN:CUSTOMER_USER:CREATE', 'ADMIN:CUSTOMER_USER:UPDATE', 'ADMIN:CUSTOMER_USER:ASSIGN', 'ADMIN:CUSTOMER_USER:MANAGE',
    'ADMIN:PERMISSION:VIEW', 'ADMIN:SECURITY:VIEW'
  ];
  const viewerPerms = ['ADMIN:USER:VIEW', 'ADMIN:ROLE:VIEW', 'ADMIN:CUSTOMER:VIEW', 'ADMIN:CUSTOMER_USER:VIEW'];

  // Ensure standard system roles exist on both DBs
  const standardRoles = ['SYSTEM_ADMINISTRATOR', 'ADMIN', 'VIEWER', 'REPORT_VIEWER', 'CUSTOMER_USER'];
  for (const db of [legacy, target]) {
    for (const code of standardRoles) {
      const exists = await db.role.findUnique({ where: { code } });
      if (!exists) {
        await db.role.create({ data: { code, name: code, isActive: true } });
      }
    }
  }

  console.log('🌱 Seeding Legacy Auth Database...');
  await seedUser(legacy, 'admin@energya.com', 'internal', ['SYSTEM_ADMINISTRATOR'], allAdminPerms, null);
  await seedUser(legacy, 'ehab.maher@energya.com', 'internal', ['SYSTEM_ADMINISTRATOR'], allAdminPerms, null);
  await seedUser(legacy, 'admin@parity.test', 'internal', ['ADMIN'], allAdminPerms, null);
  await seedUser(legacy, 'limited@parity.test', 'internal', ['VIEWER'], viewerPerms, null);
  await seedUser(legacy, 'custA@parity.test', 'customer', [], null, ['CUST_A']);
  await seedUser(legacy, 'custB@parity.test', 'customer', [], null, ['CUST_B']);

  console.log('🌱 Seeding Target Auth Database...');
  await seedUser(target, 'admin@energya.com', 'internal', ['SYSTEM_ADMINISTRATOR'], allAdminPerms, null);
  await seedUser(target, 'ehab.maher@energya.com', 'internal', ['SYSTEM_ADMINISTRATOR'], allAdminPerms, null);
  await seedUser(target, 'admin@parity.test', 'internal', ['ADMIN'], allAdminPerms, null);
  await seedUser(target, 'limited@parity.test', 'internal', ['VIEWER'], viewerPerms, null);
  await seedUser(target, 'custA@parity.test', 'customer', [], null, ['CUST_A']);
  await seedUser(target, 'custB@parity.test', 'customer', [], null, ['CUST_B']);

  console.log('🔄 Syncing user profile metadata from Legacy to Target...');
  const allLegacyUsers = await legacy.userAccount.findMany();
  for (const lu of allLegacyUsers) {
    const tu = await target.userAccount.findUnique({ where: { email: lu.email } });
    if (tu) {
      await target.userAccount.update({
        where: { id: tu.id },
        data: {
          fullName: lu.fullName,
          department: lu.department,
          jobTitle: lu.jobTitle,
          mobile: lu.mobile,
          employeeNumber: lu.employeeNumber,
          failedLoginAttempts: lu.failedLoginAttempts,
          isLocked: lu.isLocked,
          status: lu.status,
          isActive: lu.isActive,
        }
      });
    }
  }

  await legacy.$disconnect();
  await target.$disconnect();
  console.log('✅ Done seeding auth databases!');
}

if (process.argv[1]?.endsWith('seed-auth.mjs')) {
  seedAuthDatabases().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
