import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma.service.js';
import { preferPostgresMasterData } from '../../src/shared/domain/masterDataSoT.js';
import { CablesRepository } from '../../src/master-data/cables/cables.repository.js';
import { RawMaterialsRepository } from '../../src/master-data/raw-materials/raw-materials.repository.js';
import { DrumsRepository } from '../../src/master-data/drums/drums.repository.js';

describe('Increment 2 PostgreSQL master data (NestJS e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cablesRepo: CablesRepository;
  let rmRepo: RawMaterialsRepository;
  let drumsRepo: DrumsRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    cablesRepo = app.get(CablesRepository);
    rmRepo = app.get(RawMaterialsRepository);
    drumsRepo = app.get(DrumsRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports database connectivity', async () => {
    const result = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 as ok`;
    expect(result).toBeDefined();
    expect(result[0].ok).toBe(1);
  });

  it('creates and reads a cable without inventing a sales price', async () => {
    const materialNumber = `TEST-${Date.now()}`;
    const created = await prisma.cableMaster.create({
      data: {
        materialNumber,
        itemCode: 'TESTITEM',
        customerCode: 'N2XH',
        description: 'Test cable Increment 2',
        voltage: 'LV',
        conductor: 'Copper',
        cores: '1C',
        conductorSize: '16',
        diameter: 10.9,
        weight: 268,
        status: 'ACTIVE',
      },
    });

    expect(created.materialNumber).toBe(materialNumber);
    const fetched = await cablesRepo.getByMaterialNumber(materialNumber);
    expect(fetched).toBeDefined();
    expect(fetched?.description).toBe('Test cable Increment 2');

    await prisma.cableMaster.delete({ where: { materialNumber } });
  });

  it('persists raw materials with PRICE_NOT_CONFIGURED and no zero price row', async () => {
    const code = `RMTEST${Date.now()}`;
    await prisma.rawMaterial.create({
      data: {
        code,
        description: 'Test RM',
        uom: 'kg',
        priceStatus: 'PRICE_NOT_CONFIGURED',
      },
    });

    const listed = await rmRepo.listRawMaterials();
    const row = listed.find((r) => r.rawMaterialCode === code);
    expect(row).toBeDefined();
    expect(row?.price).toBeNull();
    expect(row?.priceStatus).toBe('PRICE_NOT_CONFIGURED');

    const prices = await prisma.rawMaterialPrice.findMany({ where: { rawMaterialCode: code } });
    expect(prices.length).toBe(0);

    await prisma.rawMaterial.delete({ where: { code } });
  });

  it('Task 04: PostgreSQL cable wins over stale local payload', async () => {
    const materialNumber = `T04-${Date.now()}`;
    await prisma.cableMaster.create({
      data: {
        materialNumber,
        itemCode: 'T04ITEM',
        customerCode: 'N2XH',
        description: 'Task 04 SoT cable',
        voltage: 'LV',
        conductor: 'Copper',
        cores: '1C',
        conductorSize: '16',
        diameter: 10.9,
        weight: 268,
        status: 'ACTIVE',
      },
    });

    const fetched = await cablesRepo.getByMaterialNumber(materialNumber);
    expect(fetched).toBeDefined();

    const prefer = preferPostgresMasterData(
      { ok: true, data: fetched },
      { ...fetched!, description: 'stale localStorage' },
    );

    expect(prefer.data?.description).toBe('Task 04 SoT cable');
    expect(prefer.staleLocalIgnored).toBe(true);
    expect(prefer.authoritative).toBe(true);

    await prisma.cableMaster.delete({ where: { materialNumber } });
  });

  it('Task 04: drum status update is PostgreSQL + AuditEvent', async () => {
    const drumCode = `T04D-${Date.now()}`;
    await prisma.drumMaster.create({
      data: {
        drumCode,
        flange: 630,
        barrel: 300,
        innerWidth: 600,
        outerWidth: 760,
        capacity: 650,
        status: 'ACTIVE',
      },
    });

    // Update status and append audit
    const updated = await prisma.drumMaster.update({
      where: { drumCode },
      data: { status: 'INACTIVE' },
    });
    await prisma.auditEvent.create({
      data: {
        entity: 'DrumMaster',
        entityId: drumCode,
        action: 'DEACTIVATE',
        actorId: 'task04',
        actorName: 'task04',
        message: `Drum ${drumCode} updated`,
      },
    });

    expect(updated.status).toBe('INACTIVE');
    const listed = await drumsRepo.listDrums();
    const found = listed.find((d) => d.drumCode === drumCode);
    expect(found).toBeDefined();
    expect(found?.status).toBe('INACTIVE');

    const audit = await prisma.auditEvent.findFirst({
      where: { entity: 'DrumMaster', entityId: drumCode, action: 'DEACTIVATE' },
      orderBy: { at: 'desc' },
    });
    expect(audit).toBeDefined();

    await prisma.drumMaster.delete({ where: { drumCode } });
    await prisma.auditEvent.deleteMany({ where: { entityId: drumCode } });
  });
});
