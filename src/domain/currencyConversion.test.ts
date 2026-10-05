import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPANY_BASE_CURRENCY,
  convertAmount,
  isConsumableGovernedFxStatus,
  normalizeCostingCurrency,
  resolveFxRate,
} from './currencyConversion';

describe('currencyConversion', () => {
  const costingDate = new Date('2026-06-01');

  it('normalizes LE and EGP as equivalent', () => {
    assert.equal(normalizeCostingCurrency('egp'), 'LE');
    assert.equal(normalizeCostingCurrency('LE'), 'LE');
    assert.equal(COMPANY_BASE_CURRENCY, 'LE');
  });

  it('returns 1 for same currency', () => {
    const res = resolveFxRate('USD', 'USD', { targetCurrency: 'USD', costingDate });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.resolution.rate, 1);
      assert.equal(res.resolution.source, 'SAME_CURRENCY');
    }
  });

  it('uses inquiry rawMaterialExchangeRate when price currency matches', () => {
    const res = resolveFxRate('USD', 'LE', {
      targetCurrency: 'LE',
      costingDate,
      rawMaterialCurrency: 'USD',
      rawMaterialExchangeRate: 50,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.resolution.rate, 50);
      assert.equal(res.resolution.source, 'INQUIRY_RAW_MATERIAL_RATE');
    }
  });

  it('uses inquiry exchangeRate as fallback to target', () => {
    const res = resolveFxRate('EUR', 'LE', {
      targetCurrency: 'LE',
      costingDate,
      inquiryExchangeRate: 54,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.resolution.rate, 54);
      assert.equal(res.resolution.source, 'INQUIRY_EXCHANGE_RATE');
    }
  });

  it('uses governed table when inquiry rates absent', () => {
    const res = resolveFxRate('USD', 'LE', {
      targetCurrency: 'LE',
      costingDate,
      governedRates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'LE',
          rate: 48.5,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          workflowStatus: 'ACTIVE',
          code: 'USD-LE-2026',
        },
      ],
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.resolution.rate, 48.5);
      assert.equal(res.resolution.source, 'GOVERNED_TABLE');
    }
  });

  it('converts via company base when only USD/LE and EUR/LE rates exist', () => {
    const res = resolveFxRate('USD', 'EUR', {
      targetCurrency: 'EUR',
      costingDate,
      companyBaseCurrency: 'LE',
      governedRates: [
        {
          fromCurrency: 'USD',
          toCurrency: 'LE',
          rate: 50.1649,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          workflowStatus: 'ACTIVE',
          code: 'USD-LE',
        },
        {
          fromCurrency: 'EUR',
          toCurrency: 'LE',
          rate: 58.4972,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          workflowStatus: 'ACTIVE',
          code: 'EUR-LE',
        },
      ],
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.resolution.source, 'GOVERNED_TABLE_VIA_BASE');
      assert.ok(Math.abs(res.resolution.rate - 50.1649 / 58.4972) < 1e-9);
    }
  });

  it('blocks when no FX path exists', () => {
    const res = resolveFxRate('USD', 'LE', { targetCurrency: 'LE', costingDate, governedRates: [] });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, 'FX_NOT_CONFIGURED');
  });

  it('treats LE and EGP as the same pair for governed rates', () => {
    const onDate = new Date('2026-08-24T12:00:00.000Z');
    const res = resolveFxRate('LE', 'USD', {
      targetCurrency: 'USD',
      costingDate: onDate,
      governedRates: [
        {
          fromCurrency: 'EGP',
          toCurrency: 'USD',
          rate: 0.021,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
          workflowStatus: 'APPROVED',
          code: 'EGP-USD-TEST',
        },
      ],
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.resolution.rate, 0.021);
      assert.equal(res.resolution.source, 'GOVERNED_TABLE');
      assert.equal(res.resolution.fromCurrency, 'LE');
      assert.equal(res.resolution.toCurrency, 'USD');
    }
  });

  it('consumes APPROVED governed rates and ignores DRAFT', () => {
    const onDate = new Date('2026-08-24');
    const draft = resolveFxRate('LE', 'USD', {
      targetCurrency: 'USD',
      costingDate: onDate,
      governedRates: [
        {
          fromCurrency: 'LE',
          toCurrency: 'USD',
          rate: 0.021,
          effectiveFrom: new Date('2026-08-24'),
          effectiveTo: null,
          workflowStatus: 'DRAFT',
          code: 'LE-USD-DRAFT',
        },
      ],
    });
    assert.equal(draft.ok, false);
    if (!draft.ok) assert.equal(draft.code, 'FX_NOT_CONFIGURED');

    const approved = resolveFxRate('LE', 'USD', {
      targetCurrency: 'USD',
      costingDate: onDate,
      governedRates: [
        {
          fromCurrency: 'LE',
          toCurrency: 'USD',
          rate: 0.021,
          effectiveFrom: new Date('2026-08-24'),
          effectiveTo: null,
          workflowStatus: 'APPROVED',
          code: 'LE-USD-APPR',
        },
      ],
    });
    assert.equal(approved.ok, true);
    if (approved.ok) assert.equal(approved.resolution.source, 'GOVERNED_TABLE');
    assert.equal(isConsumableGovernedFxStatus('APPROVED'), true);
    assert.equal(isConsumableGovernedFxStatus('DRAFT'), false);
  });

  it('convertAmount applies rate to line cost', () => {
    const res = convertAmount(2125, 'USD', 'LE', {
      targetCurrency: 'LE',
      costingDate,
      rawMaterialCurrency: 'USD',
      rawMaterialExchangeRate: 50,
    });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.converted, 106250);
      assert.equal(res.resolution.source, 'INQUIRY_RAW_MATERIAL_RATE');
    }
  });
});
