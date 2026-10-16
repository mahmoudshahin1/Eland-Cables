import { PrismaClient as LegacyPrisma } from '../../node_modules/@prisma/client/index.js';
import { PrismaClient as TargetPrisma } from '../../energya-backend/node_modules/@prisma/client/index.js';

function assertSafeDatabaseUrl(rawUrl, allowedDbNames) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';
    if (!isLocal) {
      throw new Error(`TRUNCATE CASCADE guard: Refusing to run on non-local host "${host}". Must be 127.0.0.1 or localhost.`);
    }
    const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
    if (!allowedDbNames.includes(dbName)) {
      throw new Error(`TRUNCATE CASCADE guard: Refusing to run on database "${dbName}". Allowed names: ${allowedDbNames.join(', ')}`);
    }
  } catch (err) {
    throw new Error(`Safety guard rejected connection string: ${err.message}`);
  }
}

export async function seedMasterDataDatabases() {
  const legacyUrl = process.env.DATABASE_URL_LEGACY || 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_legacy?schema=public';
  const targetUrl = process.env.DATABASE_URL_TARGET || 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public';

  // Strict safety check before any DB instantiation or TRUNCATE execution
  assertSafeDatabaseUrl(legacyUrl, ['energya_legacy']);
  assertSafeDatabaseUrl(targetUrl, ['energya_nest']);

  const source = new LegacyPrisma({
    datasources: { db: { url: process.env.DATABASE_URL_SOURCE || 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_connect?schema=public' } }
  });
  const legacy = new LegacyPrisma({
    datasources: { db: { url: legacyUrl } }
  });
  const target = new TargetPrisma({
    datasources: { db: { url: targetUrl } }
  });


  console.log('📦 Reading master dataset from energya_connect...');
  const [
    parameters,
    rawMaterials,
    cables,
    boms,
    drums,
    observations
  ] = await Promise.all([
    source.cableParameter.findMany({ orderBy: [{ kind: 'asc' }, { code: 'asc' }] }),
    source.rawMaterial.findMany({ orderBy: { code: 'asc' } }),
    source.cableMaster.findMany({ orderBy: { materialNumber: 'asc' } }),
    source.cableBomLine.findMany({ orderBy: { id: 'asc' } }),
    source.drumMaster.findMany({ orderBy: { drumCode: 'asc' } }),
    source.bomDuplicateObservation.findMany({ orderBy: { id: 'asc' } }),
  ]);

  console.log(`Source records fetched:
- CableParameter: ${parameters.length}
- RawMaterial: ${rawMaterials.length}
- CableMaster: ${cables.length}
- CableBomLine: ${boms.length}
- DrumMaster: ${drums.length}
- BomDuplicateObservation: ${observations.length}`);

  for (const [name, db] of [['legacy (energya_legacy)', legacy], ['target (energya_nest)', target]]) {
    console.log(`\n🚀 Seeding ${name}...`);

    // Clean master tables via TRUNCATE CASCADE to ensure empty heap pages and identical physical tuple layout
    console.log(`  Truncating master tables in ${name}...`);
    await db.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "CableBomLine", 
        "BomDuplicateObservation", 
        "CableMasterAttachment", 
        "CableEngineeringMapping", 
        "CableMaster",
        "RawMaterialPrice",
        "RawMaterial",
        "DrumMaster",
        "CableParameter"
      CASCADE;
    `);

    // 1. Cable Parameters
    console.log(`  Inserting ${parameters.length} CableParameter rows...`);
    for (let i = 0; i < parameters.length; i += 100) {
      const chunk = parameters.slice(i, i + 100);
      await db.cableParameter.createMany({ data: chunk, skipDuplicates: true });
    }

    // 2. Raw Materials
    console.log(`  Inserting ${rawMaterials.length} RawMaterial rows...`);
    for (let i = 0; i < rawMaterials.length; i += 100) {
      const chunk = rawMaterials.slice(i, i + 100);
      await db.rawMaterial.createMany({ data: chunk, skipDuplicates: true });
    }

    // 3. Drums
    console.log(`  Inserting ${drums.length} DrumMaster rows...`);
    for (let i = 0; i < drums.length; i += 100) {
      const chunk = drums.slice(i, i + 100);
      await db.drumMaster.createMany({ data: chunk, skipDuplicates: true });
    }

    // 4. Cables
    console.log(`  Inserting ${cables.length} CableMaster rows...`);
    for (let i = 0; i < cables.length; i += 100) {
      const chunk = cables.slice(i, i + 100);
      await db.cableMaster.createMany({ data: chunk, skipDuplicates: true });
    }

    // 5. Cable BOM Lines
    console.log(`  Inserting ${boms.length} CableBomLine rows...`);
    for (let i = 0; i < boms.length; i += 500) {
      const chunk = boms.slice(i, i + 500);
      await db.cableBomLine.createMany({ data: chunk, skipDuplicates: true });
    }

    // 6. Bom Duplicate Observations
    console.log(`  Inserting ${observations.length} BomDuplicateObservation rows...`);
    for (let i = 0; i < observations.length; i += 100) {
      const chunk = observations.slice(i, i + 100);
      await db.bomDuplicateObservation.createMany({ data: chunk, skipDuplicates: true });
    }

    // Verify
    const [cCount, rmCount, bCount, dCount, pCount] = await Promise.all([
      db.cableMaster.count(),
      db.rawMaterial.count(),
      db.cableBomLine.count(),
      db.drumMaster.count(),
      db.cableParameter.count(),
    ]);

    console.log(`  ✅ Verified ${name}: Cables=${cCount}, RawMaterials=${rmCount}, BOMs=${bCount}, Drums=${dCount}, Params=${pCount}`);
  }

  await source.$disconnect();
  await legacy.$disconnect();
  await target.$disconnect();
  console.log('\n✨ Master data seeding complete across both databases without touching auth tables!');
}

if (process.argv[1]?.endsWith('seed-master-data.mjs')) {
  seedMasterDataDatabases().catch((err) => {
    console.error('Fatal error during seedMasterDataDatabases:', err);
    process.exit(1);
  });
}
