/**
 * Seed documented demo personas (sales, tech, costing, procurement, customer)
 * for public demo environments (e.g. Render).
 *
 * Safety:
 * - Requires ALLOW_DEMO_USERS=true or DEMO_SEED=true
 * - Does not create/overwrite the production admin (use prisma/seed.ts + ADMIN_SEED_PASSWORD)
 * - Passwords from DEMO_*_PASSWORD env vars; documented demo passwords used only as
 *   fallbacks when the opt-in flag is set
 * - Existing users are skipped unless DEMO_RESET_PASSWORDS=true
 *
 * Usage:
 *   ALLOW_DEMO_USERS=true DATABASE_URL=... npx tsx scripts/seedDemoUsers.ts
 */
import dotenv from 'dotenv';
import { disconnectPrisma } from '../src/server/db';
import {
  buildDemoPersonaDefinitions,
  isDemoUserSeedAllowed,
  seedDemoPersonaUsers,
} from '../src/server/identityService';

dotenv.config();

async function main() {
  if (!isDemoUserSeedAllowed()) {
    console.error(
      'Refusing to seed demo users. Set ALLOW_DEMO_USERS=true or DEMO_SEED=true (opt-in only).'
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const personas = buildDemoPersonaDefinitions();
  console.log(
    `Seeding ${personas.length} demo personas (emails only): ${personas.map((p) => p.email).join(', ')}`
  );

  const summary = await seedDemoPersonaUsers({
    resetPasswords: process.env.DEMO_RESET_PASSWORDS === 'true',
  });

  console.log(
    JSON.stringify(
      {
        created: summary.created,
        skippedExisting: summary.skippedExisting,
        passwordReset: summary.passwordReset,
        rolesEnsured: summary.rolesEnsured,
      },
      null,
      2
    )
  );
  console.log('Demo persona seed complete. Passwords are never logged.');
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
