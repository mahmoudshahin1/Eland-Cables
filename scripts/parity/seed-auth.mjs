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
  const legacy = new LegacyPrisma({ datasources: { db: { url: process.env.DATABASE_URL_LEGACY || 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_legacy?schema=public&connect_timeout=60' } } });
  const target = new TargetPrisma({ datasources: { db: { url: process.env.DATABASE_URL_TARGET || 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public&connect_timeout=60' } } });

  console.log('🧹 Cleaning ephemeral test records on both DBs...');
  const standardUserEmails = [
    'admin@energya.com',
    'ehab.maher@energya.com',
    'sales@energya.com',
    'm.ahmed@energya.com',
    'technical@energya.com',
    'k.salem@energya.com',
    'n.nabil@energya.com',
    'david.smith@elandcables.com',
    'standard.test@energya.local',
    'admin@parity.test',
    'limited@parity.test',
    'granular@parity.test',
    'writer@parity.test',
    'custA@parity.test',
    'custB@parity.test'
  ];


  const standardRoleCodes = [
    'SYSTEM_ADMINISTRATOR',
    'ADMIN',
    'VIEWER',
    'REPORT_VIEWER',
    'CUSTOMER_USER',
    'TECHNICAL_OFFICE_ENGINEER',
    'TECHNICAL_OFFICE_MANAGER',
    'SALES_REPRESENTATIVE',
    'SALES_MANAGER',
    'PROCUREMENT_USER',
    'PROCUREMENT_MANAGER',
    'FINANCE_USER',
    'FINANCE_MANAGER',
    'COSTING_USER',
    'COSTING_MANAGER',
    'AUDITOR'
  ];

  const standardCustomerCodes = [
    'C-ELAND',
    'TEST-STANDARD-001',
    'CUST_A',
    'CUST_B'
  ];

  for (const db of [legacy, target]) {
    // 1. Delete ephemeral sessions and audit events
    await db.userSession.deleteMany({});
    if (db.auditEvent) await db.auditEvent.deleteMany({});

    // 2. Delete non-standard user accounts and their relations
    const nonStdUsers = await db.userAccount.findMany({
      where: { email: { notIn: standardUserEmails } }
    });
    for (const u of nonStdUsers) {
      if (db.customerUser) await db.customerUser.deleteMany({ where: { userAccountId: u.id } });
      if (db.userRole) await db.userRole.deleteMany({ where: { userId: u.id } });
      if (db.passwordResetTicket) await db.passwordResetTicket.deleteMany({ where: { userId: u.id } });
      if (db.auditEvent) await db.auditEvent.deleteMany({ where: { actorId: u.id } }).catch(() => {});
      await db.userAccount.delete({ where: { id: u.id } });
    }

    // 3. Delete non-standard roles
    const nonStdRoles = await db.role.findMany({
      where: { code: { notIn: standardRoleCodes } }
    });
    for (const r of nonStdRoles) {
      await db.rolePermission.deleteMany({ where: { roleId: r.id } });
      await db.userRole.deleteMany({ where: { roleId: r.id } });
      await db.role.delete({ where: { id: r.id } });
    }

    // 4. Delete non-standard customers
    const nonStdCusts = await db.customer.findMany({
      where: { code: { notIn: standardCustomerCodes } }
    });
    for (const c of nonStdCusts) {
      await db.customerUser.deleteMany({ where: { customerId: c.id } });
      await db.customer.delete({ where: { id: c.id } });
    }

    // 5. Delete non-standard customerUser links
    const allowedCusts = await db.customer.findMany({
      where: { code: { in: standardCustomerCodes } }
    });
    const allowedCustIds = allowedCusts.map(c => c.id);
    const allowedUsers = await db.userAccount.findMany({
      where: { email: { in: standardUserEmails } }
    });
    const allowedUserIds = allowedUsers.map(u => u.id);
    await db.customerUser.deleteMany({
      where: {
        OR: [
          { customerId: { notIn: allowedCustIds } },
          { userAccountId: { notIn: allowedUserIds } }
        ]
      }
    });
  }

  const allAdminPerms = [
    'ADMIN:USER:VIEW', 'ADMIN:USER:CREATE', 'ADMIN:USER:UPDATE', 'ADMIN:USER:ACTIVATE', 'ADMIN:USER:DEACTIVATE', 'ADMIN:USER:LOCK', 'ADMIN:USER:RESET_PASSWORD',
    'ADMIN:ROLE:VIEW', 'ADMIN:ROLE:CREATE', 'ADMIN:ROLE:UPDATE', 'ADMIN:ROLE:MANAGE',
    'ADMIN:CUSTOMER:VIEW', 'ADMIN:CUSTOMER:CREATE', 'ADMIN:CUSTOMER:UPDATE', 'ADMIN:CUSTOMER:ACTIVATE', 'ADMIN:CUSTOMER:DEACTIVATE', 'ADMIN:CUSTOMER:MANAGE',
    'ADMIN:CUSTOMER_USER:VIEW', 'ADMIN:CUSTOMER_USER:CREATE', 'ADMIN:CUSTOMER_USER:UPDATE', 'ADMIN:CUSTOMER_USER:ASSIGN', 'ADMIN:CUSTOMER_USER:MANAGE',
    'ADMIN:PERMISSION:VIEW', 'ADMIN:SECURITY:VIEW'
  ];
  const viewerPerms = ['ADMIN:USER:VIEW', 'ADMIN:ROLE:VIEW', 'ADMIN:CUSTOMER:VIEW', 'ADMIN:CUSTOMER_USER:VIEW'];

  // Ensure standard system roles exist on both DBs
  for (const db of [legacy, target]) {
    for (const code of standardRoleCodes) {
      const exists = await db.role.findUnique({ where: { code } });
      if (!exists) {
        await db.role.create({ data: { code, name: code, isActive: true } });
      }
    }
  }

  const granularPerms = ['CABLE:CABLE_MASTER:VIEW'];
  const writerPerms = ['CABLE:CABLE_MASTER:VIEW', 'CABLE:CABLE_MASTER:CREATE', 'CABLE:CABLE_MASTER:UPDATE'];

  console.log('🌱 Seeding Legacy Auth Database...');
  await seedUser(legacy, 'admin@energya.com', 'internal', ['SYSTEM_ADMINISTRATOR'], allAdminPerms, null);
  await seedUser(legacy, 'ehab.maher@energya.com', 'internal', ['SYSTEM_ADMINISTRATOR'], allAdminPerms, null);
  await seedUser(legacy, 'admin@parity.test', 'internal', ['ADMIN'], allAdminPerms, null);
  await seedUser(legacy, 'limited@parity.test', 'internal', ['VIEWER'], viewerPerms, null);
  await seedUser(legacy, 'granular@parity.test', 'internal', ['TECHNICAL_OFFICE_ENGINEER'], granularPerms, null);
  await seedUser(legacy, 'writer@parity.test', 'internal', ['TECHNICAL_OFFICE_MANAGER'], writerPerms, null);
  await seedUser(legacy, 'custA@parity.test', 'customer', [], null, ['CUST_A']);
  await seedUser(legacy, 'custB@parity.test', 'customer', [], null, ['CUST_B']);

  console.log('🌱 Seeding Target Auth Database...');
  await seedUser(target, 'admin@energya.com', 'internal', ['SYSTEM_ADMINISTRATOR'], allAdminPerms, null);
  await seedUser(target, 'ehab.maher@energya.com', 'internal', ['SYSTEM_ADMINISTRATOR'], allAdminPerms, null);
  await seedUser(target, 'admin@parity.test', 'internal', ['ADMIN'], allAdminPerms, null);
  await seedUser(target, 'limited@parity.test', 'internal', ['VIEWER'], viewerPerms, null);
  await seedUser(target, 'granular@parity.test', 'internal', ['TECHNICAL_OFFICE_ENGINEER'], granularPerms, null);
  await seedUser(target, 'writer@parity.test', 'internal', ['TECHNICAL_OFFICE_MANAGER'], writerPerms, null);
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
