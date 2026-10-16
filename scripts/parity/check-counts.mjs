import { PrismaClient as LegacyPrisma } from '../../node_modules/@prisma/client/index.js';
import { PrismaClient as TargetPrisma } from '../../energya-backend/node_modules/@prisma/client/index.js';

async function main() {
  const pLegacy = new LegacyPrisma({
    datasources: { db: { url: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_legacy?schema=public' } }
  });
  const pConnect = new LegacyPrisma({
    datasources: { db: { url: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_connect?schema=public' } }
  });
  const pNest = new TargetPrisma({
    datasources: { db: { url: 'postgresql://energya:energya_dev@127.0.0.1:5432/energya_nest?schema=public' } }
  });

  const [lCables, lRms, lBoms, lDrums, lRef] = await Promise.all([
    pLegacy.cableMaster.count(),
    pLegacy.rawMaterial.count(),
    pLegacy.cableBomLine.count(),
    pLegacy.drumMaster.count(),
    pLegacy.cableParameter.count(),
  ]);

  const [nCables, nRms, nBoms, nDrums, nRef] = await Promise.all([
    pNest.cableMaster.count(),
    pNest.rawMaterial.count(),
    pNest.cableBomLine.count(),
    pNest.drumMaster.count(),
    pNest.cableParameter.count(),
  ]);

  const [cCables, cRms, cBoms, cDrums, cRef] = await Promise.all([
    pConnect.cableMaster.count(),
    pConnect.rawMaterial.count(),
    pConnect.cableBomLine.count(),
    pConnect.drumMaster.count(),
    pConnect.cableParameter.count(),
  ]);

  console.log('LEGACY DB COUNTS: ', { cables: lCables, rms: lRms, boms: lBoms, drums: lDrums, ref: lRef });
  console.log('CONNECT DB COUNTS:', { cables: cCables, rms: cRms, boms: cBoms, drums: cDrums, ref: cRef });
  console.log('NEST DB COUNTS:   ', { cables: nCables, rms: nRms, boms: nBoms, drums: nDrums, ref: nRef });

  await pLegacy.$disconnect();
  await pConnect.$disconnect();
  await pNest.$disconnect();
}

main().catch(console.error);
