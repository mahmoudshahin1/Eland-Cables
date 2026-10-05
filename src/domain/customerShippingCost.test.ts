import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ELAND_SHIPPING_COST_SEED,
  SHIPPING_COST_NOT_CONFIGURED,
  attachShippingFacts,
  mapContainerTypeToCanonicalShippingType,
  mapDestinationPortToShippingDeliveryPoint,
  presentShippingBesidePacking,
  readShippingContainerType,
  readShippingDeliveryPoint,
  resolveCustomerShippingCostFromRows,
  resolveShippingLookupFromContainerStudy,
  type CustomerShippingRateRow,
} from './customerShippingCost';

function row(partial: Partial<CustomerShippingRateRow> & Pick<CustomerShippingRateRow, 'version' | 'amount' | 'effectiveFrom' | 'effectiveTo' | 'status'>): CustomerShippingRateRow {
  return {
    id: `r${partial.version}`,
    customerId: 'cust',
    deliveryPoint: 'Rotterdam',
    incotermId: 'cif',
    containerType: "20' SD",
    currency: 'USD',
    ...partial,
  };
}

const family = [
  row({ version: 1, amount: 1800, effectiveFrom: '2026-09-23', effectiveTo: '2026-10-31', status: 'SUPERSEDED' }),
  row({ version: 2, amount: 1900, effectiveFrom: '2026-11-01', effectiveTo: null, status: 'ACTIVE' }),
];

describe('customer shipping cost resolution', () => {
  it('resolves the six Eland lane amounts from the seed definition', () => {
    assert.equal(ELAND_SHIPPING_COST_SEED.length, 6);
    const amounts = ELAND_SHIPPING_COST_SEED.map((rate) => rate.amount);
    assert.deepEqual(amounts, [3100, 3300, 6400, 6600, 1800, 2000]);
  });

  it('returns v1 inside the v1 window, v2 on and after v2, and not configured before v1', () => {
    const key = { customerId: 'cust', deliveryPoint: 'Rotterdam', incotermId: 'cif', containerType: "20' SD" };
    const insideV1 = resolveCustomerShippingCostFromRows(family, { ...key, effectiveDate: '2026-10-15' });
    const onV2 = resolveCustomerShippingCostFromRows(family, { ...key, effectiveDate: '2026-11-01' });
    const before = resolveCustomerShippingCostFromRows(family, { ...key, effectiveDate: '2026-09-22' });
    assert.equal(insideV1.rate?.version, 1);
    assert.equal(insideV1.amount, 1800);
    assert.equal(onV2.rate?.version, 2);
    assert.equal(onV2.amount, 1900);
    assert.equal(before.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(before.amount, null);
  });

  it('returns SHIPPING_COST_NOT_CONFIGURED and not zero when no rate covers the date', () => {
    const missing = resolveCustomerShippingCostFromRows([], {
      customerId: 'cust',
      deliveryPoint: 'Rotterdam',
      incotermId: 'cif',
      containerType: "40' SD/HC",
      effectiveDate: '2026-09-23',
    });
    assert.equal(missing.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(missing.amount, null);
    assert.notEqual(missing.amount, 0);
    const beside = presentShippingBesidePacking({ containers: [{ typeCode: '20STD' }] }, {
      resolutionCode: missing.resolutionCode,
      amount: missing.amount,
      currency: null,
      shippingCostRateId: null,
      shippingRateVersion: null,
      deliveryPoint: 'Rotterdam',
      incotermId: 'cif',
      incotermCode: 'CIF',
      containerType: "40' SD/HC",
      appliedAt: null,
      blocksPacking: false,
    });
    assert.equal(beside.packing.containers.length, 1);
    assert.equal(beside.shippingCostFinancial.blocksPacking, false);
    assert.equal(beside.shippingCostFinancial.amount, 0);
  });

  it('copies shipping facts onto a commercial offer without changing selling totals', () => {
    const document = attachShippingFacts(
      { productsTotal: 10, shipmentTotal: 40, grandTotal: 50, currency: 'USD' },
      {
        amount: 1800,
        currency: 'USD',
        shippingCostRateId: 'rate-1',
        shippingRateVersion: 1,
        deliveryPoint: 'Rotterdam',
        incotermId: 'cif',
        incotermCode: 'CIF',
        containerType: "20' SD",
        appliedAt: '2026-09-23T00:00:00.000Z',
      }
    );
    assert.equal(document.productsTotal, 10);
    assert.equal(document.shipmentTotal, 40);
    assert.equal(document.grandTotal, 50);
    assert.equal(document.shippingCostSnapshot.amount, 1800);
  });

  const rotterdamPorts = [{ code: 'ROTTERDAM', name: 'Rotterdam' }, { code: 'DONCASTER', name: 'DONCASTER' }];

  it('D: maps destination-port code ROTTERDAM to shipping delivery-point Rotterdam', () => {
    assert.equal(mapDestinationPortToShippingDeliveryPoint('ROTTERDAM', rotterdamPorts), 'Rotterdam');
    assert.equal(
      readShippingDeliveryPoint({ destinationPortCode: 'ROTTERDAM', deliveryDestination: 'Alexandria' }, null, rotterdamPorts),
      'Rotterdam'
    );
  });

  function seedRows(): CustomerShippingRateRow[] {
    return ELAND_SHIPPING_COST_SEED.map((seed, index) => ({
      id: `seed-${index}`,
      customerId: 'eland',
      deliveryPoint: seed.deliveryPoint,
      incotermId: seed.incotermCode === 'CIF' ? 'cif' : 'dap',
      containerType: seed.containerType,
      amount: seed.amount,
      currency: 'USD',
      effectiveFrom: '2026-09-23',
      effectiveTo: null,
      status: 'ACTIVE' as const,
      version: 1,
    }));
  }

  it('E: Rotterdam CIF 20 SD resolves 1800', () => {
    const deliveryPoint = mapDestinationPortToShippingDeliveryPoint('ROTTERDAM', rotterdamPorts);
    const containerType = mapContainerTypeToCanonicalShippingType('20STD');
    const resolved = resolveCustomerShippingCostFromRows(seedRows(), {
      customerId: 'eland',
      deliveryPoint: deliveryPoint!,
      incotermId: 'cif',
      containerType: containerType!,
      effectiveDate: '2026-09-23',
    });
    assert.equal(resolved.amount, 1800);
  });

  it('F: Rotterdam CIF 40 SD/HC resolves 2000', () => {
    const deliveryPoint = mapDestinationPortToShippingDeliveryPoint('ROTTERDAM', rotterdamPorts);
    const containerType = mapContainerTypeToCanonicalShippingType('40HQ');
    const resolved = resolveCustomerShippingCostFromRows(seedRows(), {
      customerId: 'eland',
      deliveryPoint: deliveryPoint!,
      incotermId: 'cif',
      containerType: containerType!,
      effectiveDate: '2026-09-23',
    });
    assert.equal(resolved.amount, 2000);
  });

  it('G: missing container type stays SHIPPING_COST_NOT_CONFIGURED', () => {
    assert.equal(readShippingContainerType({ destinationPortCode: 'ROTTERDAM' }, null), null);
    const resolved = resolveCustomerShippingCostFromRows(seedRows(), {
      customerId: 'eland',
      deliveryPoint: 'Rotterdam',
      incotermId: 'cif',
      containerType: '',
      effectiveDate: '2026-09-23',
    });
    assert.equal(resolved.resolutionCode, SHIPPING_COST_NOT_CONFIGURED);
    assert.equal(resolved.amount, null);
  });

  it('J: Doncaster/SD or HC lanes stay unchanged', () => {
    assert.equal(readShippingDeliveryPoint({ shippingDeliveryPoint: 'Doncaster/SD or HC' }, 'ROTTERDAM', rotterdamPorts), 'Doncaster/SD or HC');
    const resolved = resolveCustomerShippingCostFromRows(seedRows(), {
      customerId: 'eland',
      deliveryPoint: 'Doncaster/SD or HC',
      incotermId: 'dap',
      containerType: "20' SD",
      effectiveDate: '2026-09-23',
    });
    assert.equal(resolved.amount, 3100);
  });

  it('K: Doncaster/RORO lanes stay unchanged', () => {
    assert.equal(readShippingDeliveryPoint({ shippingDeliveryPoint: 'Doncaster/RORO' }, 'ROTTERDAM', rotterdamPorts), 'Doncaster/RORO');
    const resolved = resolveCustomerShippingCostFromRows(seedRows(), {
      customerId: 'eland',
      deliveryPoint: 'Doncaster/RORO',
      incotermId: 'dap',
      containerType: "40' SD/HC",
      effectiveDate: '2026-09-23',
    });
    assert.equal(resolved.amount, 6600);
  });

  it('DF-C: shipping lookup uses lineage dest and result typeCode, not preference or Alexandria metadata', () => {
    const lineage = {
      destinationPortCode: 'ROTTERDAM',
      incotermCode: 'CIF',
      containerTypePreferenceCode: '20STD',
    };
    const grain = resolveShippingLookupFromContainerStudy({
      lineageJson: lineage,
      shipmentGroup: {
        status: 'ACTIVE',
        destinationPortCode: 'DONCASTER',
        incotermCode: 'FOB',
      },
      resultContainers: [{ typeCode: '40HQ' }, { typeCode: '40HQ' }],
      destinationPorts: rotterdamPorts,
    });
    assert.equal(grain.deliveryPoint, 'Rotterdam');
    assert.equal(grain.incotermCode, 'CIF');
    assert.equal(grain.containerType, "40' SD/HC");
    assert.equal(grain.containerQuantity, 2);
    assert.equal(grain.typeCode, '40HQ');
    const alexandria = resolveShippingLookupFromContainerStudy({
      lineageJson: lineage,
      shipmentGroup: { status: 'ACTIVE', destinationPortCode: 'ALEXANDRIA', incotermCode: 'FOB' },
      resultContainers: [{ typeCode: '40HQ' }],
      destinationPorts: rotterdamPorts,
    });
    assert.equal(alexandria.deliveryPoint, 'Rotterdam');
    assert.notEqual(alexandria.destinationPortCode, 'ALEXANDRIA');
    const missing = resolveShippingLookupFromContainerStudy({
      lineageJson: { destinationPortCode: 'DONCASTER', incotermCode: 'CIF' },
      shipmentGroup: { status: 'ACTIVE', destinationPortCode: 'ROTTERDAM', incotermCode: 'CIF' },
      resultContainers: [{ typeCode: '40HQ' }],
      destinationPorts: rotterdamPorts,
    });
    assert.equal(missing.deliveryPoint, null);
  });
});
