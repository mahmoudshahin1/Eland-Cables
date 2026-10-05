# Costing Inquiry Flow

```
Costing Team publishes ACTIVE configuration
        ↓
Customer / sales create inquiry and select cable
        ↓
Enter length, quantity, currency, incoterm, destination, drum
        ↓
Calculate
        ↓
POST /api/inquiries/:id/lines/:lineId/calculate-cost
        ↓
executeCostingForInquiryLine (only engine)
        ↓
CostingCalculation snapshot + line.costingCalculationId
```

Refresh / reopen loads PostgreSQL, not React state. Future price/formula changes do not rewrite the snapshot.
