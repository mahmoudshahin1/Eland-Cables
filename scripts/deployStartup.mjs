import { spawn } from 'child_process';

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`▶ [Deploy] Running: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} failed with exit code ${code}`));
      }
    });
    child.on('error', (err) => reject(err));
  });
}

async function start() {
  if (process.env.DATABASE_URL) {
    console.log('🔄 [Deploy] Applying database migrations (prisma migrate deploy)...');
    try {
      await runCommand('npx', ['prisma', 'migrate', 'deploy']);
      console.log('✅ [Deploy] Migrations applied.');
    } catch (err) {
      console.error('⚠️ [Deploy] Migration warning:', err.message);
    }

    const allowDemo =
      process.env.ALLOW_DEMO_USERS === 'true' || process.env.DEMO_SEED === 'true';
    if (allowDemo) {
      console.log('👥 [Deploy] ALLOW_DEMO_USERS enabled. Seeding demo users and VIP data...');
      try {
        await runCommand('npx', ['tsx', 'scripts/seedDemoUsers.ts']);
        console.log('✅ [Deploy] Demo personas verified.');
      } catch (err) {
        console.error('⚠️ [Deploy] Demo seed warning:', err.message);
      }
    }
  } else {
    console.log('ℹ️ [Deploy] DATABASE_URL not set; skipping database migrations.');
  }

  console.log('⚡ [Deploy] Starting web server (node dist/server.cjs)...');
  const server = spawn('node', ['dist/server.cjs'], { stdio: 'inherit', shell: true });
  server.on('close', (code) => {
    process.exit(code || 0);
  });
}

start().catch((err) => {
  console.error('❌ [Deploy] Fatal startup error:', err);
  process.exit(1);
});
