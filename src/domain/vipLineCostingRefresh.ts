/**
 * A persisted costing run is reused only when Calculate did not ask to recalculate.
 * A new copper or aluminium rate must be sent with recalculate=true, otherwise the
 * previous material cost and offer stay on the line.
 */
export function shouldSkipVipLineCosting(
  recalculate: boolean | undefined,
  line: { costingCalculationId?: string | null; costingRunId?: string | null }
): boolean {
  return recalculate !== true && Boolean(line.costingCalculationId) && Boolean(line.costingRunId);
}
