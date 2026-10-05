/**
 * Structured costing request — prepares inquiry line context for orchestration (Phase I integration).
 * Does not redesign inquiry UI; normalizes inputs from inquiry or admin preview.
 */

export interface StructuredCostingRequest {
  materialNumber: string;
  costingDate: string;
  quantity: number;
  lengthMeters: number;
  currency: string;
  configurationVersionId?: string;
  inquiryLineId?: string;
  /** Inquiry commercial metadata for FX and metal rates */
  commercialMetadata?: Record<string, unknown> | null;
  /** Optional explicit FX overrides */
  fxContext?: import('../domain/currencyConversion').FxConversionContext;
  /** Optional governed inputs for layer formulas */
  layerInputs?: Record<string, string | number>;
  /** Diagnostic only — never persists from this service */
  previewOnly: boolean;
}

export interface InquiryLineCostingContext {
  materialNumber?: string | null;
  requestedQuantity?: number | string | null;
  requestedLengthMeters?: number | string | null;
  cuttingLengthMeters?: number | string | null;
  drumType?: string | null;
  cableTolerancePercent?: number | string | null;
  drumSchedule?: Record<string, unknown> | null;
  quantityUom?: string | null;
  costingReadinessStatus?: string | null;
}

export interface InquiryHeaderCostingContext {
  currency?: string | null;
  inquiryDate?: string | Date | null;
  incoterms?: string | null;
  deliveryDestination?: string | null;
  commercialMetadata?: Record<string, unknown> | null;
}

/** Snapshot metal/FX rates into layer inputs — not applied to RM prices until business policy approved. */
export function buildLayerInputsFromCommercialMetadata(
  metadata?: Record<string, unknown> | null
): Record<string, string | number> | undefined {
  if (!metadata) return undefined;
  const inputs: Record<string, string | number> = {};
  if (metadata.copperPriceRate != null && metadata.copperPriceRate !== '') {
    inputs.COPPER_PRICE_RATE = String(metadata.copperPriceRate);
  }
  if (metadata.aluminiumPriceRate != null && metadata.aluminiumPriceRate !== '') {
    inputs.ALUMINIUM_PRICE_RATE = String(metadata.aluminiumPriceRate);
  }
  if (metadata.exchangeRate != null && metadata.exchangeRate !== '') {
    inputs.EXCHANGE_RATE = String(metadata.exchangeRate);
  }
  if (metadata.rawMaterialExchangeRate != null && metadata.rawMaterialExchangeRate !== '') {
    inputs.RAW_MATERIAL_EXCHANGE_RATE = String(metadata.rawMaterialExchangeRate);
  }
  return Object.keys(inputs).length > 0 ? inputs : undefined;
}

/** Pass inquiry-header incoterms/destination into costing metadata. Does not invent logistics amounts. */
export function mergeInquiryHeaderIntoCommercialMetadata(
  header: InquiryHeaderCostingContext
): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = { ...(header.commercialMetadata || {}) };
  const incoterms =
    header.incoterms ||
    (typeof meta.incoterms === 'string' ? meta.incoterms : null) ||
    (typeof meta.incoterm === 'string' ? meta.incoterm : null);
  if (incoterms) meta.incoterms = incoterms;
  const destination =
    header.deliveryDestination ||
    (typeof meta.deliveryDestination === 'string' ? meta.deliveryDestination : null);
  if (destination) meta.deliveryDestination = destination;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

export function normalizeCostingDate(value?: string | Date | null): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function buildCostingRequestFromInquiryLine(
  line: InquiryLineCostingContext,
  header: InquiryHeaderCostingContext,
  options?: { configurationVersionId?: string; previewOnly?: boolean }
): StructuredCostingRequest | { error: string } {
  const materialNumber = line.materialNumber?.trim();
  if (!materialNumber) {
    return { error: 'Inquiry line has no material number — costing request cannot be built.' };
  }

  const quantity = Number(line.requestedQuantity ?? 1);
  const cuttingLength = Number(line.cuttingLengthMeters);
  const storedLength = Number(line.requestedLengthMeters ?? 1000);
  const lengthFromCutting =
    Number.isFinite(quantity) &&
    quantity > 0 &&
    Number.isFinite(cuttingLength) &&
    cuttingLength > 0
      ? quantity * cuttingLength
      : null;
  const lengthMeters = lengthFromCutting ?? storedLength;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: 'Quantity must be greater than zero.' };
  }
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) {
    return { error: 'Length must be greater than zero.' };
  }

  const commercialMetadata = mergeInquiryHeaderIntoCommercialMetadata(header);
  const meta: Record<string, unknown> = { ...(commercialMetadata || {}) };
  if (line.drumType?.trim()) meta.drumType = line.drumType.trim();
  if (Number.isFinite(cuttingLength) && cuttingLength > 0) meta.cuttingLengthMeters = cuttingLength;
  const cableTolerance = Number(line.cableTolerancePercent);
  if (Number.isFinite(cableTolerance) && cableTolerance >= 0) {
    meta.cableTolerancePercent = cableTolerance;
  }
  if (line.drumSchedule && typeof line.drumSchedule === 'object') {
    meta.drumSchedule = line.drumSchedule;
  }

  return {
    materialNumber,
    costingDate: normalizeCostingDate(header.inquiryDate),
    quantity,
    lengthMeters,
    currency: (header.currency || 'USD').toUpperCase(),
    configurationVersionId: options?.configurationVersionId,
    commercialMetadata: Object.keys(meta).length ? meta : undefined,
    layerInputs: buildLayerInputsFromCommercialMetadata(meta),
    previewOnly: options?.previewOnly ?? true,
  };
}

export function buildCostingRequestFromPreviewPayload(body: {
  materialNumber?: string;
  costingDate?: string;
  quantity?: number;
  lengthMeters?: number;
  currency?: string;
  configurationVersionId?: string;
  layerInputs?: Record<string, string | number>;
  commercialMetadata?: Record<string, unknown>;
  incoterms?: string;
  destination?: string;
  drumType?: string;
  copperPriceRate?: number;
  aluminiumPriceRate?: number;
}): StructuredCostingRequest | { error: string } {
  const materialNumber = body.materialNumber?.trim();
  if (!materialNumber) return { error: 'materialNumber is required.' };

  const quantity = Number(body.quantity ?? 1);
  const lengthMeters = Number(body.lengthMeters ?? 1000);

  if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'quantity must be > 0.' };
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) return { error: 'lengthMeters must be > 0.' };

  const commercialMetadata: Record<string, unknown> = { ...(body.commercialMetadata || {}) };
  if (body.incoterms) commercialMetadata.incoterms = body.incoterms;
  if (body.destination) commercialMetadata.deliveryDestination = body.destination;
  if (body.drumType) commercialMetadata.drumType = body.drumType;
  if (body.copperPriceRate != null) commercialMetadata.copperPriceRate = body.copperPriceRate;
  if (body.aluminiumPriceRate != null) commercialMetadata.aluminiumPriceRate = body.aluminiumPriceRate;

  const layerInputs = {
    ...buildLayerInputsFromCommercialMetadata(commercialMetadata),
    ...(body.layerInputs || {}),
  };

  return {
    materialNumber,
    costingDate: normalizeCostingDate(body.costingDate),
    quantity,
    lengthMeters,
    currency: (body.currency || 'USD').toUpperCase(),
    configurationVersionId: body.configurationVersionId,
    commercialMetadata: Object.keys(commercialMetadata).length ? commercialMetadata : undefined,
    layerInputs: Object.keys(layerInputs).length ? layerInputs : body.layerInputs,
    previewOnly: true,
  };
}
