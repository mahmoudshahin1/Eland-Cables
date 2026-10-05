# Raw material price readiness (Increment 5)

## Current state

74 official raw materials. **All prices blank.** `priceStatus = PRICE_NOT_CONFIGURED`. No price row with 0. No market scrape. No invented currency, dates, or suppliers.

`GET /api/master/raw-material-price-readiness` lists:

Raw Material · Code · Description · Currency · Price · Effective From · Effective To · Status

Price is null. Status is PRICE_NOT_CONFIGURED. Dates are null (`DATA_REQUIRED` if a numeric price existed without dates — none do).

## Required from Finance / Procurement

Do not substitute defaults. Provide:

1. **price** (numeric; blank remains unconfigured)
2. **currency**
3. **UOM** (must match RM master; do not convert PCS→kg here)
4. **effective date** (Effective From)
5. **supplier / source**
6. **price basis** (per kg, per km, per unit — not in the extract)
7. **validity period** (Effective To, or explicit open-ended policy)

Until those arrive, costing must not treat missing prices as free material. Costing is not implemented in Increment 5.
