/** Increment / lab codes that must not appear as official costing master data. */

export function isSyntheticRawMaterialCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return (
    /^I\d+-RM-/.test(normalized) ||
    /^I\d+D-RM-/.test(normalized) ||
    /^I\d+_TEST/.test(normalized) ||
    /^I\d+-TEST/.test(normalized) ||
    normalized.startsWith('TEST-') ||
    normalized.startsWith('TEST_')
  );
}

export function isSyntheticCostingConfigCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return /^I\d+_TEST/.test(normalized) || /^I\d+-TEST/.test(normalized) || normalized.startsWith('TEST-') || normalized.startsWith('TEST_');
}

export function isIncrementTestScrapCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  if (/^SC\d{2}-\d{5}$/.test(normalized)) return false;
  return (
    /^I\d+[A-Z]?-/.test(normalized) ||
    /^I\d+_TEST/.test(normalized) ||
    normalized.startsWith('TEST-') ||
    normalized.startsWith('TEST_') ||
    normalized.startsWith('SCRAP-TEST')
  );
}

export function isIncrementTestCableCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  return (
    /^I\d+[A-Z]?-CABLE/.test(normalized) ||
    /^I\d+-TEST-CABLE/.test(normalized) ||
    /^I\d+_TEST/.test(normalized) ||
    normalized.startsWith('TEST-CABLE')
  );
}
