import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INCOTERM_ID_COLUMNS,
  REQUIRED_INCOTERM_COLUMNS,
  buildCodeMasterMap,
  collectOrphanFkAfterRemap,
  effectiveTargetParentIds,
  filterRowsToCreateByCode,
  isParentBeforeChild,
  prepareDependentRow,
  remapCustomerFieldsPure,
  remapIncotermFields,
  validateFkValuesAgainstMap,
} from './migrateLocalToSupabaseLib';

/** Mirrors scripts/migrateLocalToSupabase.ts MIGRATION_ORDER shipping segment. */
const MIGRATION_ORDER_SNIPPET = [
  'Customer',
  'CustomerAddress',
  'DestinationPort',
  'Incoterm',
  'ShippingCostRate',
  'CustomerDeliveryCombination',
  'CustomerShippingCostRate',
  'ShippingCostTransactionSnapshot',
];

describe('migrateLocalToSupabase Incoterm / CustomerShippingCostRate remapping', () => {
  it('1. maps source Incoterm ids to target Incoterm ids by code', () => {
    const map = buildCodeMasterMap(
      [
        { id: 'src-cif', code: 'CIF' },
        { id: 'src-dap', code: 'DAP' },
        { id: 'incoterm-icc-fob', code: 'FOB' },
        { id: 'src-only', code: 'EXW' },
      ],
      [
        { id: 'tgt-cif', code: 'CIF' },
        { id: 'tgt-dap', code: 'DAP' },
        { id: 'incoterm-icc-fob', code: 'FOB' },
      ]
    );

    assert.equal(map.sourceIdToTargetId.get('src-cif'), 'tgt-cif');
    assert.equal(map.sourceIdToTargetId.get('src-dap'), 'tgt-dap');
    assert.equal(map.sourceIdToTargetId.get('incoterm-icc-fob'), 'incoterm-icc-fob');
    assert.equal(map.sourceIdToTargetId.get('src-only'), 'src-only');
    assert.equal(map.idRemaps.length, 2);
    assert.deepEqual(
      map.idRemaps.map((r) => r.code).sort(),
      ['CIF', 'DAP']
    );
    assert.deepEqual(map.toCreate, [{ code: 'EXW', sourceId: 'src-only' }]);
    assert.equal(map.matched.length, 3);
  });

  it('2. remaps CustomerShippingCostRate.incotermId via Incoterm code map', () => {
    const incotermMap = buildCodeMasterMap(
      [
        { id: 'src-cif', code: 'CIF' },
        { id: 'src-dap', code: 'DAP' },
      ],
      [
        { id: 'tgt-cif', code: 'CIF' },
        { id: 'tgt-dap', code: 'DAP' },
      ]
    );

    const remapped = remapIncotermFields(
      'CustomerShippingCostRate',
      { id: 'rate-1', customerId: 'cust-src', incotermId: 'src-cif', amount: 100 },
      incotermMap
    );

    assert.equal(remapped.errors.length, 0);
    assert.equal(remapped.row.incotermId, 'tgt-cif');
    assert.deepEqual(remapped.remapped, ['incotermId']);
    assert.ok(INCOTERM_ID_COLUMNS.CustomerShippingCostRate.includes('incotermId'));
    assert.ok(REQUIRED_INCOTERM_COLUMNS.CustomerShippingCostRate.includes('incotermId'));
  });

  it('3. remaps CustomerShippingCostRate.customerId via Customer code map', () => {
    const customerMap = {
      sourceIdToTargetId: new Map([['cust-src', 'cust-tgt']]),
      sourceIdToCode: new Map([['cust-src', 'C-ELAND']]),
      sourceCodeToId: new Map([['C-ELAND', 'cust-src']]),
      targetCodeToId: new Map([['C-ELAND', 'cust-tgt']]),
    };

    const remapped = remapCustomerFieldsPure(
      'CustomerShippingCostRate',
      { id: 'rate-1', customerId: 'cust-src', incotermId: 'src-cif' },
      customerMap
    );

    assert.equal(remapped.errors.length, 0);
    assert.equal(remapped.row.customerId, 'cust-tgt');
  });

  it('4. places Incoterm before CustomerShippingCostRate in dependency order', () => {
    assert.equal(
      isParentBeforeChild(MIGRATION_ORDER_SNIPPET, 'Incoterm', 'CustomerShippingCostRate'),
      true
    );
    assert.equal(
      isParentBeforeChild(MIGRATION_ORDER_SNIPPET, 'Customer', 'CustomerShippingCostRate'),
      true
    );
    assert.equal(
      isParentBeforeChild(MIGRATION_ORDER_SNIPPET, 'CustomerShippingCostRate', 'Incoterm'),
      false
    );
  });

  it('5. skips inserting Incoterms whose code already exists on target (shared/duplicate target ids)', () => {
    const map = buildCodeMasterMap(
      [
        { id: 'src-cif', code: 'CIF' },
        { id: 'same-id-fob', code: 'FOB' },
        { id: 'src-new', code: 'CFR' },
      ],
      [
        { id: 'tgt-cif', code: 'CIF' },
        { id: 'same-id-fob', code: 'FOB' },
      ]
    );

    const sourceRows = [
      { id: 'src-cif', code: 'CIF', name: 'CIF src' },
      { id: 'same-id-fob', code: 'FOB', name: 'FOB' },
      { id: 'src-new', code: 'CFR', name: 'CFR' },
    ];

    const toInsert = filterRowsToCreateByCode(sourceRows, map);
    assert.deepEqual(
      toInsert.map((r) => r.id),
      ['src-new']
    );
    // Dependents still resolve CIF/FOB to target parents that already exist
    const parents = effectiveTargetParentIds(map);
    assert.ok(parents.has('tgt-cif'));
    assert.ok(parents.has('same-id-fob'));
    assert.ok(parents.has('src-new'));
    assert.equal(parents.has('src-cif'), false);
  });

  it('6. nullable ShippingCostTransactionSnapshot.incotermId clears when unmapped', () => {
    const incotermMap = buildCodeMasterMap(
      [{ id: 'src-cif', code: 'CIF' }],
      [{ id: 'tgt-cif', code: 'CIF' }]
    );

    const ok = remapIncotermFields(
      'ShippingCostTransactionSnapshot',
      { id: 'snap-1', incotermId: 'src-cif' },
      incotermMap
    );
    assert.equal(ok.row.incotermId, 'tgt-cif');

    const orphan = remapIncotermFields(
      'ShippingCostTransactionSnapshot',
      { id: 'snap-2', incotermId: 'missing-incoterm' },
      incotermMap
    );
    assert.equal(orphan.errors.length, 0);
    assert.equal(orphan.row.incotermId, null);

    const requiredOrphan = remapIncotermFields(
      'CustomerShippingCostRate',
      { id: 'rate-x', incotermId: 'missing-incoterm' },
      incotermMap
    );
    assert.ok(requiredOrphan.errors.length > 0);
  });

  it('7. prepared CustomerShippingCostRate rows have no orphan customerId/incotermId refs', () => {
    const incotermMap = buildCodeMasterMap(
      [
        { id: 'src-cif', code: 'CIF' },
        { id: 'src-dap', code: 'DAP' },
      ],
      [
        { id: 'tgt-cif', code: 'CIF' },
        { id: 'tgt-dap', code: 'DAP' },
      ]
    );
    const customerMap = {
      sourceIdToTargetId: new Map([
        ['cust-src', 'cust-tgt'],
        ['cust-new', 'cust-new'],
      ]),
      sourceIdToCode: new Map([
        ['cust-src', 'C-ELAND'],
        ['cust-new', 'C-NEW'],
      ]),
      sourceCodeToId: new Map([
        ['C-ELAND', 'cust-src'],
        ['C-NEW', 'cust-new'],
      ]),
      targetCodeToId: new Map([['C-ELAND', 'cust-tgt']]),
    };

    const sourceRates = [
      { id: 'r1', customerId: 'cust-src', incotermId: 'src-cif' },
      { id: 'r2', customerId: 'cust-src', incotermId: 'src-dap' },
      { id: 'r3', customerId: 'cust-new', incotermId: 'src-cif' },
    ];

    const prepared = sourceRates.map((row) => {
      const out = prepareDependentRow('CustomerShippingCostRate', row, customerMap, incotermMap);
      assert.equal(out.errors.length, 0);
      return out.row;
    });

    assert.deepEqual(
      prepared.map((r) => r.incotermId),
      ['tgt-cif', 'tgt-dap', 'tgt-cif']
    );
    assert.deepEqual(
      prepared.map((r) => r.customerId),
      ['cust-tgt', 'cust-tgt', 'cust-new']
    );

    const customerParents = new Set(customerMap.sourceIdToTargetId.values());
    const incotermParents = effectiveTargetParentIds(incotermMap);

    assert.deepEqual(
      collectOrphanFkAfterRemap({
        model: 'CustomerShippingCostRate',
        preparedRows: prepared,
        columns: ['customerId'],
        requiredColumns: ['customerId'],
        effectiveParentIds: customerParents,
      }),
      []
    );
    assert.deepEqual(
      collectOrphanFkAfterRemap({
        model: 'CustomerShippingCostRate',
        preparedRows: prepared,
        columns: ['incotermId'],
        requiredColumns: ['incotermId'],
        effectiveParentIds: incotermParents,
      }),
      []
    );

    // Without remapping, source ids would be orphans against target parents
    const issues = validateFkValuesAgainstMap({
      model: 'CustomerShippingCostRate',
      column: 'incotermId',
      distinctValues: [
        { value: 'src-cif', rowCount: 2 },
        { value: 'src-dap', rowCount: 1 },
      ],
      sourceIdToTargetId: new Map(), // no remap → blocking
      effectiveParentIds: incotermParents,
      required: true,
    });
    assert.equal(issues.length, 2);
    assert.equal(issues[0].severity, 'blocking');

    // With remap map, same values resolve
    const ok = validateFkValuesAgainstMap({
      model: 'CustomerShippingCostRate',
      column: 'incotermId',
      distinctValues: [
        { value: 'src-cif', rowCount: 2 },
        { value: 'src-dap', rowCount: 1 },
      ],
      sourceIdToTargetId: incotermMap.sourceIdToTargetId,
      effectiveParentIds: incotermParents,
      required: true,
    });
    assert.deepEqual(ok, []);
  });
});
