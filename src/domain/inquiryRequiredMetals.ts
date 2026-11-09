/**
 * Which header metal prices an inquiry needs.
 * CableMaster.conductor wins. The cable description is used only when conductor is empty.
 * An unrecognised line requires both prices so a copper or aluminium cable is not skipped.
 */

export interface RequiredInquiryMetals {
  copper: boolean;
  aluminium: boolean;
}

export interface InquiryMetalLineHint {
  conductor?: unknown;
  cableDescription?: unknown;
  description?: unknown;
}

const BOTH: RequiredInquiryMetals = { copper: true, aluminium: true };

function leadingToken(value: string): string {
  return value.split(/[\s/|,;-]+/).find((part) => part.length > 0) || '';
}

/** Copper or aluminium from a conductor name or a cable description. */
export function metalKindFromText(value: unknown): 'copper' | 'aluminium' | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const leading = leadingToken(raw);
  if (leading === 'al' || leading === 'aluminium' || leading === 'aluminum') return 'aluminium';
  if (leading === 'cu' || leading === 'copper') return 'copper';
  if (/\b(aluminium|aluminum)\b/.test(raw)) return 'aluminium';
  if (/\b(copper|cu)\b/.test(raw)) return 'copper';
  if (/\bal\b/.test(raw)) return 'aluminium';
  return null;
}

export function requiredMetalsForLines(lines: InquiryMetalLineHint[]): RequiredInquiryMetals {
  if (lines.length === 0) return { ...BOTH };
  let copper = false;
  let aluminium = false;
  let unknown = false;
  for (const line of lines) {
    const kind =
      metalKindFromText(line.conductor) ??
      metalKindFromText(line.cableDescription) ??
      metalKindFromText(line.description);
    if (kind === 'copper') copper = true;
    else if (kind === 'aluminium') aluminium = true;
    else unknown = true;
  }
  if (unknown || (!copper && !aluminium)) return { ...BOTH };
  return { copper, aluminium };
}
