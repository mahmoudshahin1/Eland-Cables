# Raw Material Price Excel Import/Export Template (Increment 9)

## Excel Template Structure

Export URL: `GET /api/master/raw-material-prices-export`

Controlled Columns in `Raw Material Prices` worksheet:

| Column Name | Type / Format | Validation Rule |
|---|---|---|
| **Raw Material Code** | String (Required) | Must exist in `RawMaterial` master data. |
| **Description** | String (Informational) | Validated against master description. |
| **Price** | Numeric Decimal (Required) | Must be > 0. Blank or <= 0 is rejected. |
| **Currency** | String (Required) | Must be in `['USD', 'EUR', 'EGP', 'SAR', 'GBP', 'AED']`. |
| **UOM** | String (Required) | Must be in `['kg', 'ton', 'm', 'PCS', 'm2', 'KM']`. |
| **Effective From** | Date (YYYY-MM-DD) | Must be a valid date. |
| **Effective To** | Date (YYYY-MM-DD) | Must be >= Effective From if provided. |
| **Supplier** | String (Optional) | Vendor / supplier name. |
| **Source** | String (Optional) | Price index provenance (e.g. `LME Cash Official`). |
| **Price Basis** | String (Optional) | `PER_KG`, `PER_TON`, `PER_METER`, `PER_PCS`, `PER_M2`. Default: `PER_KG`. |
| **Comment** | String (Optional) | Procurement / Finance change note. |

---

## Import Pipeline Rules

1. **Preview & Validate (`POST /api/master/raw-material-prices/import/preview`)**:
   - Detects unknown Raw Material codes (`RAW_MATERIAL_NOT_FOUND`).
   - Detects duplicate rows in the upload (`DUPLICATE`).
   - Detects non-positive or blank prices (`INVALID_PRICE` / `PRICE_NOT_CONFIGURED`).
   - Detects date range inversion (`INVALID_DATE_RANGE`).
   - Pre-checks overlap with existing approved price records (`PRICE_PERIOD_OVERLAP`).
2. **Commit Drafts (`POST /api/master/raw-material-prices/import/commit`)**:
   - Inserts valid rows as **`DRAFT` price proposals**.
   - **Excel import NEVER creates directly approved prices.**
