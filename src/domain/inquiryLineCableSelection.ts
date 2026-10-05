/** Inquiry-line cable identity only. Never deletes Cable Master. */

export function normalizeInquiryLineMaterialNumber(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

export function nextInquiryLineMaterialNumber(
  inputMaterialNumber: string | null | undefined,
  currentMaterialNumber: string | null | undefined
): string | null {
  if (inputMaterialNumber === undefined) {
    return normalizeInquiryLineMaterialNumber(currentMaterialNumber);
  }
  return normalizeInquiryLineMaterialNumber(inputMaterialNumber);
}

export function inquiryLineCableIdentityChanged(
  previousMaterialNumber: string | null | undefined,
  nextMaterialNumber: string | null | undefined
): boolean {
  return (
    normalizeInquiryLineMaterialNumber(previousMaterialNumber) !==
    normalizeInquiryLineMaterialNumber(nextMaterialNumber)
  );
}
