export const SNAPSHOT_CONFIGURATION_STATUS_PIN = '__SNAPSHOT_CONFIGURATION_STATUS__';

export type PinnedAlgorithmParameter = {
  name: string;
  value: string;
  numericValue?: number | null;
  ruleStatus?: string;
};

export function buildPinnedAlgorithmParameters(
  parameters: Array<{
    name: string;
    value: string;
    numericValue: number | null;
    unit: string | null;
    scope: string;
    ruleStatus: string;
  }>,
  configurationStatus: string
): PinnedAlgorithmParameter[] {
  return [
    ...parameters.map((p) => ({
      name: p.name,
      value: p.value,
      numericValue: p.numericValue,
      ruleStatus: p.ruleStatus,
    })),
    {
      name: SNAPSHOT_CONFIGURATION_STATUS_PIN,
      value: configurationStatus,
      numericValue: null,
      ruleStatus: 'ENABLED',
    },
  ];
}

export function readPinnedConfigurationStatus(
  algorithmParameterPinJson: unknown,
  fallback?: string
): string | undefined {
  if (!Array.isArray(algorithmParameterPinJson)) return fallback;
  const row = algorithmParameterPinJson.find(
    (p) => typeof p === 'object' && p != null && (p as { name?: string }).name === SNAPSHOT_CONFIGURATION_STATUS_PIN
  ) as { value?: string } | undefined;
  return row?.value ?? fallback;
}

export function isEngineAlgorithmParameter(name: string): boolean {
  return !name.startsWith('__');
}
