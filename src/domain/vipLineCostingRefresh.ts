/**
 * A persisted costing run is reused only when Calculate did not ask to recalculate.
 * A new copper or aluminium rate must be sent with recalculate=true, otherwise the
 * previous material cost and offer stay on the line.
 */
/** A second Calculate on the same unissued draft syncs lines and must not record a new quotation. */
export function vipQuotationDraftWasCreated(input: {
  existingId?: string | null;
  existingIssued: boolean;
  returnedId: string;
}): boolean {
  if (!input.existingId || input.existingIssued) return true;
  return input.returnedId !== input.existingId;
}

export function shouldSkipVipLineCosting(
  recalculate: boolean | undefined,
  line: { costingCalculationId?: string | null; costingRunId?: string | null }
): boolean {
  return recalculate !== true && Boolean(line.costingCalculationId) && Boolean(line.costingRunId);
}
