# Costing Engine Technical Specification (Increment 10)

## 1. Input Specification: `CostingRequest`

| Field | Type | Required | Validation Rule / Default |
|---|---|---|---|
| `materialNumber` | String | Yes | Must exist in `CableMaster` catalog. |
| `costingDate` | Date / ISO String | No | Target valuation date (defaults to current date). |
| `quantity` | Number | No | Positive number > 0 (defaults to 1). |
| `lengthMeters` | Number | No | Positive number in meters > 0 (defaults to 1000m). |
| `currency` | String | No | Must be an allowed currency (`USD`, `EUR`, `EGP`, `SAR`, etc., default `USD`). |
| `comment` | String | No | Optional audit comment / request rationale. |

---

## 2. Calculation Output Specification: `CostingResult`

```json
{
  "costingRunNumber": "CR-20260820-A1B2",
  "materialNumber": "10009487",
  "cableDescription": "Cu / XLPE / LSHF 0.6/1 kV 1X16 mm2 RMC IEC 60502-1",
  "costingDate": "2026-08-20T00:00:00.000Z",
  "currency": "USD",
  "quantity": 1,
  "lengthMeters": 1000,
  "lengthKm": 1,
  "engineeringRevision": 1,
  "bomVersion": 1,
  "costingStatus": "INCOMPLETE",
  "materialCost": 1313.30,
  "processCostStatus": "NOT_CONFIGURED",
  "overheadCostStatus": "NOT_CONFIGURED",
  "scrapCostStatus": "NOT_CONFIGURED",
  "manufacturingCost": null,
  "isCurrent": true,
  "createdBy": "Eng. Costing Lead",
  "costingLines": [
    {
      "componentType": "MATERIAL",
      "rawMaterialCode": "CR01",
      "rawMaterialDesc": "Copper Conductor Wire Rod",
      "consumptionPerKm": 135.23,
      "totalConsumption": 135.23,
      "consumptionUom": "kg",
      "price": 9.50,
      "priceCurrency": "USD",
      "priceUom": "kg",
      "priceBasis": "PER_KG",
      "priceRevision": 1,
      "effectiveFrom": "2026-01-01T00:00:00.000Z",
      "effectiveTo": "2026-12-31T00:00:00.000Z",
      "lineCost": 1284.69,
      "calculationNotes": "135.2300 kg @ 9.5000 / kg"
    },
    {
      "componentType": "MATERIAL",
      "rawMaterialCode": "XL08",
      "rawMaterialDesc": "XLPE Insulation Granules",
      "consumptionPerKm": 11.92,
      "totalConsumption": 11.92,
      "consumptionUom": "kg",
      "price": 2.40,
      "priceCurrency": "USD",
      "priceUom": "kg",
      "priceBasis": "PER_KG",
      "priceRevision": 1,
      "effectiveFrom": "2026-01-01T00:00:00.000Z",
      "effectiveTo": "2026-12-31T00:00:00.000Z",
      "lineCost": 28.61,
      "calculationNotes": "11.9200 kg @ 2.4000 / kg"
    }
  ]
}
```
