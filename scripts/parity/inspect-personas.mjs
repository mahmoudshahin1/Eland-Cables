// Read-only: prints the effective permission codes of the parity personas in both parity DBs.
import { PrismaClient } from '../../node_modules/@prisma/client/index.js';

const DBS = ['energya_legacy', 'energya_nest'];
const PERSONAS = ['limited@parity.test', 'granular@parity.test', 'writer@parity.test', 'custA@parity.test'];

for (const db of DBS) {
  const prisma = new PrismaClient({
    datasources: { db: { url: `postgresql://energya:energya_dev@127.0.0.1:5432/${db}?schema=public&connect_timeout=60` } },
  });
  for (const email of PERSONAS) {
    const user = await prisma.userAccount.findUnique({
      where: { email },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user) {
      console.log(`${db} ${email} MISSING`);
      continue;
    }
    const codes = [
      ...new Set(
        user.roles.flatMap((r) =>
          r.role.permissions
            .filter((rp) => rp.permission.isActive)
            .map((rp) => `${rp.permission.module}:${rp.permission.resource}:${rp.permission.action}`)
        )
      ),
    ].sort();
    console.log(`${db} ${email} type=${user.userType} roles=${user.roles.map((r) => r.role.code).join(',')} codes=${codes.length}`);
    console.log(`  ${codes.join(' ')}`);
  }
  await prisma.$disconnect();
}
