/**
 * Inquiry line Value = persisted material cost (scrap-inclusive) plus other
 * configured costing parameters. Never invents missing logistics/packing amounts.
 */

export interface InquiryLineValueInput {
  materialCost: number;
  /** EX_WORK / manufacturing rollup when formulas produced one; otherwise omit. */
  manufacturingTotal?: number | null;
  logisticsAmount?: number | null;
  packingAmount?: number | null;
}

function configuredAmount(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return value;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Full line Value stored on the inquiry line and summed on the home grid. */
export function computeInquiryLineTotalValue(input: InquiryLineValueInput): number {
  const material = Number.isFinite(input.materialCost) ? input.materialCost : 0;
  const manufacturing =
    input.manufacturingTotal != null && Number.isFinite(input.manufacturingTotal)
      ? input.manufacturingTotal
      : material;
  const total =
    manufacturing + configuredAmount(input.logisticsAmount) + configuredAmount(input.packingAmount);
  return roundMoney(total);
}
