import type { ContainerStudyCalculationInput } from './containerStudyCalculationTypes';

/** Golden inputs exercise LEGACY_FIRST_FIT_V1 (SaaS deterministic Rolling), not Excel/VBA parity. */

const STANDARD_PARAMS = [
  { name: 'CONTAINER_INTERNAL_WIDTH', value: '2350', numericValue: 2350, ruleStatus: 'ENABLED' as const },
  { name: 'MAX_LOADING_WEIGHT', value: '26000', numericValue: 26000, ruleStatus: 'ENABLED' as const },
  { name: 'USABLE_LENGTH_40', value: '12000', numericValue: 12000, ruleStatus: 'ENABLED' as const },
  { name: 'USABLE_LENGTH_20', value: '5900', numericValue: 5900, ruleStatus: 'ENABLED' as const },
  { name: 'FLANGE_HQ_MIN', value: '2300', numericValue: 2300, ruleStatus: 'ENABLED' as const },
  { name: 'FLANGE_OPEN_TOP_MIN', value: '2600', numericValue: 2600, ruleStatus: 'ENABLED' as const },
  { name: 'SECOND_LAYER_LENGTH_LT', value: '1050', numericValue: 1050, ruleStatus: 'ENABLED' as const },
  { name: 'SECOND_LAYER_SHARE_MIN', value: '0.5', numericValue: 0.5, ruleStatus: 'ENABLED' as const },
  { name: 'POST_ADJUST_REMAINING_LENGTH_GE', value: '6100', numericValue: 6100, ruleStatus: 'BLOCKED' as const },
  { name: 'CONTAINER_SEARCH_LIMIT', value: '1000', numericValue: 1000, ruleStatus: 'ENABLED' as const },
  { name: 'INPUT_ROW_LIMIT', value: '2000', numericValue: 2000, ruleStatus: 'ENABLED' as const },
];

export const GOLDEN_CONTAINER_PINS = [
  {
    versionId: 'ctv-40hq-g',
    code: '40HQ',
    parityLabel: '40 HQ',
    usableLengthMm: 12000,
    internalWidthMm: 2350,
    payloadCapacityKg: 26000,
    dimensionsStatus: 'APPROVED' as const,
  },
  {
    versionId: 'ctv-40std-g',
    code: '40STD',
    parityLabel: '40 STD',
    usableLengthMm: 12000,
    internalWidthMm: 2350,
    payloadCapacityKg: 26000,
    dimensionsStatus: 'APPROVED' as const,
  },
  {
    versionId: 'ctv-20std-g',
    code: '20STD',
    parityLabel: '20 STD',
    usableLengthMm: 5900,
    internalWidthMm: 2350,
    payloadCapacityKg: 26000,
    dimensionsStatus: 'APPROVED' as const,
  },
  {
    versionId: 'ctv-40ot-g',
    code: '40OT',
    parityLabel: '40 Open Top',
    usableLengthMm: 12000,
    internalWidthMm: 2350,
    payloadCapacityKg: 26000,
    dimensionsStatus: 'APPROVED' as const,
  },
];

type DrumLine = {
  sourceLineId: string;
  quantity: number;
  packedLengthMm: number;
  packedWidthMm: number;
  grossWeightKg: number;
};

export function goldenInput(
  testId: string,
  opts: {
    stuffingMethod?: 'Rolling' | 'Forklifting';
    region?: 'Europe' | 'Africa';
    drums: DrumLine[];
  }
): ContainerStudyCalculationInput {
  return {
    snapshotId: `golden-${testId}`,
    stuffingMethod: opts.stuffingMethod ?? 'Rolling',
    region: opts.region ?? 'Europe',
    algorithmVersionCode: 'LEGACY_FIRST_FIT_V1',
    configurationVersion: 'CFG-LEGACY-FIRST-FIT-V1',
    drums: opts.drums,
    containerPins: GOLDEN_CONTAINER_PINS,
    algorithmParameters: STANDARD_PARAMS,
  };
}

/** G01 185-drum sample — structural invariants only (Excel tier model differs). */
export const G01_DRUMS: DrumLine[] = [
  { sourceLineId: 'L2400', quantity: 55, packedLengthMm: 2400, packedWidthMm: 1632, grossWeightKg: 6371 },
  { sourceLineId: 'L2100', quantity: 5, packedLengthMm: 2100, packedWidthMm: 1632, grossWeightKg: 4537 },
  { sourceLineId: 'L1600', quantity: 65, packedLengthMm: 1600, packedWidthMm: 1120, grossWeightKg: 1930 },
  { sourceLineId: 'L1400', quantity: 60, packedLengthMm: 1400, packedWidthMm: 982, grossWeightKg: 1039 },
];
