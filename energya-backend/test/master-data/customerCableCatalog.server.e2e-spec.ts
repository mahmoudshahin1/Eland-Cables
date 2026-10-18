import { describe, it, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma.service.js';

describe('Customer Cable Products catalog API (NestJS e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const suffix = `CAT-${String(Date.now()).replace(/99/g, '88')}`;
  const matLv = `${suffix}-LV`;
  const matMv = `${suffix}-MV`;
  const materials = [matLv, matMv];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Seed test cables
    await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: materials } } });
    await prisma.cableMaster.create({
      data: {
        materialNumber: matLv,
        itemCode: `${matLv}-ITEM`,
        customerCode: 'N2XH',
        description: 'Cu / XLPE / LSHF 0.6/1 kV 1X150 mm2 IEC 60502-1',
        family: 'LV',
        voltage: '0.6/1 kV',
        conductor: 'Copper',
        cores: '1',
        conductorSize: '150',
        insulation: 'XLPE',
        sheath: 'LSHF',
        standard: 'IEC 60502-1',
        diameter: 32,
        weight: 1800,
        status: 'ACTIVE',
      },
    });

    await prisma.cableMaster.create({
      data: {
        materialNumber: matMv,
        itemCode: `${matMv}-ITEM`,
        customerCode: 'N2XS2Y',
        description: 'Cu / XLPE / MDPE 6/10 kV CWs 1X150/25 mm2 IEC 60502-2',
        family: 'MV',
        voltage: '6/10 kV',
        conductor: 'Copper',
        cores: '1',
        conductorSize: '150',
        insulation: 'XLPE',
        screen: 'CWS',
        sheath: 'MDPE',
        standard: 'IEC 60502-2',
        diameter: 32,
        weight: 1800,
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cableMaster.deleteMany({ where: { materialNumber: { in: materials } } });
    }
    await app.close();
  });

  // Deferred to Phase 3 (catalog routes removed from 2a by user decision 2026-10-18)
  it.todo('requires sign-in');

  // Deferred to Phase 3 (catalog routes removed from 2a by user decision 2026-10-18)
  it.todo('lists Cable Master rows with server-side pagination and no costing leak');

  // Deferred to Phase 3 (catalog routes removed from 2a by user decision 2026-10-18)
  it.todo('maps category=MV from family/voltage without rewriting masters');

  // Deferred to Phase 3 (catalog routes removed from 2a by user decision 2026-10-18)
  it.todo('maps POWER as LV ∪ MV family keys');

  // Deferred to Phase 3 (catalog routes removed from 2a by user decision 2026-10-18)
  it.todo('returns live facets from Cable Master and documents unmapped category field');

  it.todo('exports customer-safe Excel without costing or BOM columns (Deferred to Phase 2b: Excel Export)');
});
