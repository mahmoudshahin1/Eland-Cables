/**
 * Simple stacking calculator for costing parameter lines.
 * Server-side evaluation only — no eval().
 */

export type CalculatorParameterType =
  | 'RAW_MATERIAL'
  | 'INCOTERM'
  | 'SCRAP'
  | 'EXCHANGE'
  | 'MARGIN'
  | 'CUSTOM';

export type CalculatorBasis =
  | 'FIXED_VALUE'
  | 'PERCENT_OF_BASE'
  | 'PER_UNIT'
  | 'CONSUMPTION_QTY';

export interface CalculatorRowInput {
  parameterType: CalculatorParameterType;
  subCode?: string;
  basis: CalculatorBasis;
  value: number;
  label?: string;
}

export interface CalculatorLineResult {
  rowIndex: number;
  parameterType: CalculatorParameterType;
  subCode?: string;
  basis: CalculatorBasis;
  value: number;
  label: string;
  amount: number;
  description: string;
}

export interface RawMaterialPriceHint {
  unitPrice: number;
  uom?: string;
  consumptionPerKm?: number;
}

export interface CalculatorStackContext {
  baseAmount: number;
  quantity: number;
  lengthMeters: number;
  runningTotal: number;
  rawMaterialPrices?: Record<string, RawMaterialPriceHint>;
  /** Default incoterm surcharge % when value is zero */
  incotermChargePercent?: Record<string, number>;
}

export const PARAMETER_TYPE_LABELS: Record<CalculatorParameterType, string> = {
  RAW_MATERIAL: 'Raw Material',
  INCOTERM: 'Incoterm',
  SCRAP: 'Scrap',
  EXCHANGE: 'Exchange Rate',
  MARGIN: 'Margin / Ex-Work',
  CUSTOM: 'Custom',
};

export const BASIS_LABELS: Record<CalculatorBasis, string> = {
  FIXED_VALUE: 'Fixed value',
  PERCENT_OF_BASE: '% of base / running total',
  PER_UNIT: 'Per unit',
  CONSUMPTION_QTY: 'Consumption × qty',
};

const DEFAULT_INCOTERM_CHARGE_PERCENT: Record<string, number> = {
  FOB: 2,
  CIF: 5,
  EXW: 0,
  DDP: 8,
  CFR: 4,
  DAP: 6,
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildDefaultLabel(row: CalculatorRowInput): string {
  const typeLabel = PARAMETER_TYPE_LABELS[row.parameterType];
  if (row.subCode) return `${typeLabel}: ${row.subCode}`;
  return typeLabel;
}

export function computeCalculatorLineAmount(
  row: CalculatorRowInput,
  ctx: CalculatorStackContext
): { amount: number; description: string; label: string } {
  const label = row.label || buildDefaultLabel(row);
  const baseForPercent = ctx.runningTotal > 0 ? ctx.runningTotal : ctx.baseAmount;
  let amount = 0;
  let description = '';

  if (row.parameterType === 'SCRAP' && row.basis === 'PERCENT_OF_BASE') {
    amount = ctx.baseAmount * (row.value / 100);
    description = `Scrap ${row.value}% on material base ${ctx.baseAmount.toFixed(2)}`;
    return { amount: round2(amount), description, label };
  }

  if (row.parameterType === 'INCOTERM') {
    const chargeMap = ctx.incotermChargePercent ?? DEFAULT_INCOTERM_CHARGE_PERCENT;
    const pct = row.basis === 'PERCENT_OF_BASE' ? row.value : chargeMap[row.subCode || ''] ?? row.value;
    amount = baseForPercent * (pct / 100);
    description = `${row.subCode || 'Incoterm'} delivery charge ${pct}%`;
    return { amount: round2(amount), description, label };
  }

  switch (row.basis) {
    case 'FIXED_VALUE':
      amount = row.value;
      description = `Fixed amount ${row.value}`;
      break;
    case 'PERCENT_OF_BASE':
      amount = baseForPercent * (row.value / 100);
      description = `${row.value}% of ${baseForPercent.toFixed(2)}`;
      break;
    case 'PER_UNIT':
      amount = row.value * ctx.quantity;
      description = `${row.value} × ${ctx.quantity} units`;
      break;
    case 'CONSUMPTION_QTY': {
      const rmKey = row.subCode?.toUpperCase();
      const rm = rmKey ? ctx.rawMaterialPrices?.[rmKey] : undefined;
      const consumptionPerKm = rm?.consumptionPerKm ?? 0;
      const totalConsumption = consumptionPerKm * (ctx.lengthMeters / 1000) * ctx.quantity;
      const unitPrice = row.value > 0 ? row.value : rm?.unitPrice ?? 0;
      amount = unitPrice * totalConsumption;
      description =
        totalConsumption > 0
          ? `${unitPrice} × ${totalConsumption.toFixed(4)} ${rm?.uom || 'units'}`
          : `Consumption qty — no BOM hint for ${row.subCode || 'material'}`;
      break;
    }
    default:
      amount = 0;
      description = 'Unsupported basis';
  }

  if (row.parameterType === 'EXCHANGE' && row.basis === 'PERCENT_OF_BASE') {
    description = `FX adjustment ${row.value}%`;
  }

  if (row.parameterType === 'MARGIN' && row.basis === 'PERCENT_OF_BASE') {
    description = `Margin / ex-work ${row.value}%`;
  }

  return { amount: round2(amount), description, label };
}

export function stackCalculatorRows(
  rows: CalculatorRowInput[],
  initial: Omit<CalculatorStackContext, 'runningTotal'>
): { lines: CalculatorLineResult[]; total: number } {
  const lines: CalculatorLineResult[] = [];
  let runningTotal = initial.baseAmount;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const ctx: CalculatorStackContext = { ...initial, runningTotal };
    const { amount, description, label } = computeCalculatorLineAmount(row, ctx);

    lines.push({
      rowIndex: i,
      parameterType: row.parameterType,
      subCode: row.subCode,
      basis: row.basis,
      value: row.value,
      label,
      amount,
      description,
    });

    runningTotal = round2(runningTotal + amount);
  }

  return { lines, total: round2(runningTotal) };
}

/** Map calculator rows to governed layer inputs for orchestration preview */
export function buildLayerInputsFromCalculatorRows(rows: CalculatorRowInput[]): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const row of rows) {
    if (row.parameterType === 'MARGIN' && row.basis === 'PERCENT_OF_BASE') {
      inputs.EX_WORK_RATE = String(row.value / 100);
    }
    if (row.parameterType === 'SCRAP' && row.basis === 'PERCENT_OF_BASE') {
      inputs.SCRAP_RATE = String(row.value / 100);
    }
    if (row.parameterType === 'EXCHANGE' && row.basis === 'FIXED_VALUE') {
      inputs.EXCHANGE_RATE = String(row.value);
    }
    if (row.parameterType === 'INCOTERM' && row.subCode) {
      inputs.INCOTERM = row.subCode;
    }
  }
  return inputs;
}
