export type BomDuplicateClassification =
  | 'LIKELY_LEGITIMATE_VARIATION'
  | 'LIKELY_DUPLICATE'
  | 'UNCLEAR'
  | 'BUSINESS_DECISION_REQUIRED';

export interface BomDuplicateGroup {
  cableMaterialNumber: string;
  rawMaterialCode: string;
  weightA: number;
  weightB: number;
  weights: number[];
  occurrenceCount: number;
  sourceWorksheet?: string;
  sourceFile?: string;
  sourceRowNumbers: number[];
  classification: BomDuplicateClassification;
  classificationReason: string;
}

export interface ParsedBomLine {
  rowNumber: number;
  cableMaterialNumber: string;
  rawMaterial: string;
  weight: number;
}

/**
 * Groups Cable + Raw Material pairs that have more than one distinct consumption weight.
 * Does not delete, average, pick first/latest, or invent BOM versions / plants / dates.
 */
export function findConflictingBomWeightGroups(
  lines: ParsedBomLine[],
  meta?: { sourceWorksheet?: string; sourceFile?: string }
): BomDuplicateGroup[] {
  const pairMap = new Map<string, ParsedBomLine[]>();
  lines.forEach((line) => {
    const key = `${line.cableMaterialNumber.toLowerCase()}::${line.rawMaterial.toUpperCase()}`;
    const list = pairMap.get(key) || [];
    list.push(line);
    pairMap.set(key, list);
  });

  const groups: BomDuplicateGroup[] = [];
  pairMap.forEach((list) => {
    const uniqueWeights = [...new Set(list.map((l) => l.weight))];
    if (uniqueWeights.length < 2) return;
    const sorted = [...uniqueWeights].sort((a, b) => a - b);
    const weightA = sorted[0];
    const weightB = sorted[sorted.length - 1];
    groups.push({
      cableMaterialNumber: list[0].cableMaterialNumber,
      rawMaterialCode: list[0].rawMaterial,
      weightA,
      weightB,
      weights: sorted,
      occurrenceCount: list.length,
      sourceWorksheet: meta?.sourceWorksheet,
      sourceFile: meta?.sourceFile,
      sourceRowNumbers: list.map((l) => l.rowNumber),
      ...classifyBomWeightConflict(sorted),
    });
  });
  return groups.sort((a, b) => a.cableMaterialNumber.localeCompare(b.cableMaterialNumber));
}

export function classifyBomWeightConflict(weights: number[]): {
  classification: BomDuplicateClassification;
  classificationReason: string;
} {
  if (weights.length < 2) {
    return { classification: 'UNCLEAR', classificationReason: 'Fewer than two distinct weights.' };
  }
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const rel = min === 0 ? Infinity : (max - min) / min;
  if (rel > 0 && rel < 0.005) {
    return {
      classification: 'LIKELY_DUPLICATE',
      classificationReason:
        'Weights differ by less than 0.5%. Source has no plant, route, version, or effective date to prove they are distinct.',
    };
  }
  return {
    classification: 'BUSINESS_DECISION_REQUIRED',
    classificationReason:
      'Source has no BOM version, plant, manufacturing route, or effective date. Different weights cannot be classified as legitimate variation from the workbook alone.',
  };
}
