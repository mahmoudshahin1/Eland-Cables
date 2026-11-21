-- Opening governed FX pairs from the costing workbook.
-- Same numbers as scripts/configureCostingOperationalReadiness.ts WORKBOOK_FX.
-- Stored as currency -> LE so EUR, GBP, and LE convert to USD through the company base.
-- Direct EUR->USD and GBP->USD rows are not hardcoded in application code.

INSERT INTO "CostingExchangeRate" (
    "id", "code", "name", "description",
    "fromCurrency", "toCurrency", "rate",
    "status", "workflowStatus", "versionNo", "isCurrent",
    "effectiveFrom", "effectiveTo",
    "sourceReference", "changeNotes",
    "createdAt", "updatedAt", "approvedAt", "activatedAt"
)
SELECT
    'fx_usd_le_workbook',
    'FX-USD-LE-WORKBOOK',
    'USD to LE workbook rate',
    'Opening governed rate. LE converts to USD by the inverse of this pair.',
    'USD',
    'LE',
    50.1649,
    'ACTIVE',
    'ACTIVE',
    1,
    true,
    TIMESTAMP '2026-01-01 00:00:00',
    NULL,
    'Energya Cable Master Data / costing workbook reference FX',
    'Same pair as configureCostingOperationalReadiness WORKBOOK_FX.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "CostingExchangeRate"
    WHERE "isCurrent" = true
      AND "status" = 'ACTIVE'
      AND "workflowStatus" IN ('ACTIVE', 'APPROVED')
      AND "fromCurrency" = 'USD'
      AND "toCurrency" IN ('LE', 'EGP')
);

INSERT INTO "CostingExchangeRate" (
    "id", "code", "name", "description",
    "fromCurrency", "toCurrency", "rate",
    "status", "workflowStatus", "versionNo", "isCurrent",
    "effectiveFrom", "effectiveTo",
    "sourceReference", "changeNotes",
    "createdAt", "updatedAt", "approvedAt", "activatedAt"
)
SELECT
    'fx_eur_le_workbook',
    'FX-EUR-LE-WORKBOOK',
    'EUR to LE workbook rate',
    'Opening governed rate. EUR converts to USD through LE and the USD/LE pair.',
    'EUR',
    'LE',
    58.4972,
    'ACTIVE',
    'ACTIVE',
    1,
    true,
    TIMESTAMP '2026-01-01 00:00:00',
    NULL,
    'Energya Cable Master Data / costing workbook reference FX',
    'Same pair as configureCostingOperationalReadiness WORKBOOK_FX.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "CostingExchangeRate"
    WHERE "isCurrent" = true
      AND "status" = 'ACTIVE'
      AND "workflowStatus" IN ('ACTIVE', 'APPROVED')
      AND "fromCurrency" = 'EUR'
      AND "toCurrency" IN ('LE', 'EGP')
);

INSERT INTO "CostingExchangeRate" (
    "id", "code", "name", "description",
    "fromCurrency", "toCurrency", "rate",
    "status", "workflowStatus", "versionNo", "isCurrent",
    "effectiveFrom", "effectiveTo",
    "sourceReference", "changeNotes",
    "createdAt", "updatedAt", "approvedAt", "activatedAt"
)
SELECT
    'fx_gbp_le_workbook',
    'FX-GBP-LE-WORKBOOK',
    'GBP to LE workbook rate',
    'Opening governed rate. GBP converts to USD through LE and the USD/LE pair.',
    'GBP',
    'LE',
    68.3145,
    'ACTIVE',
    'ACTIVE',
    1,
    true,
    TIMESTAMP '2026-01-01 00:00:00',
    NULL,
    'Energya Cable Master Data / costing workbook reference FX',
    'Same pair as configureCostingOperationalReadiness WORKBOOK_FX.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM "CostingExchangeRate"
    WHERE "isCurrent" = true
      AND "status" = 'ACTIVE'
      AND "workflowStatus" IN ('ACTIVE', 'APPROVED')
      AND "fromCurrency" = 'GBP'
      AND "toCurrency" IN ('LE', 'EGP')
);
