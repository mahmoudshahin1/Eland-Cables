import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import dotenv from 'dotenv';
import { checkDatabase, getPrisma } from './db';
import { createCable, evaluatePersistedCable, searchCables } from './masterDataRepository';

dotenv.config();

describe('Increment 3 PostgreSQL Cable Master authority', () => {
  it('Test A/F: search and EXISTING_CABLE against persisted master', async () => {
    const health = await checkDatabase();
    assert.equal(health.ok, true, health.error);
    const prisma = getPrisma();
    assert.ok(prisma);
    const materialNumber = `I3-${Date.now()}`;
    await createCable(
      {
        id: `mc-${materialNumber}`,
        itemCode: 'I3ITEM',
        cableCode: materialNumber,
        customerCode: 'N2XH',
        code: `N2XH ${materialNumber}`,
        description: 'Increment 3 authority cable',
        voltageClass: 'LV',
        conductor: 'Copper',
        cores: '1C',
        crossSectionMm2: 16,
        outerDiameterMm: 10.9,
        approxWeightKgKm: 268,
        standardPriceUsdPerM: 0,
        priceConfigured: false,
        status: 'ACTIVE',
      },
      { id: 'u-admin-1', name: 'admin@energya.com' }
    );
    await prisma.cableMaster.update({
      where: { materialNumber },
      data: { family: 'LV', voltage: '600/1000V', insulation: 'XLPE', conductorSize: '16', cores: '1' },
    });

    const found = await searchCables({ q: materialNumber, pageSize: 10 });
    assert.ok(found.cables.some((c) => c.cableCode === materialNumber));

    const decision = await evaluatePersistedCable({
      family: 'LV',
      voltage: '600/1000V',
      conductor: 'Copper',
      conductorSize: 16,
      cores: 1,
      insulation: 'XLPE',
      customerCode: 'N2XH',
      materialNumber,
    });
    assert.equal(decision.code, 'EXISTING_CABLE');
    await prisma.cableMaster.delete({ where: { materialNumber } });
  });
});
