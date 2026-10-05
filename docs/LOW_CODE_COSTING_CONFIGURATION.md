# Low-Code Costing Configuration (Increment 14)

Costing Team configures governed data in **Administration → Costing** or **Costing Configuration**. Customer inquiry **Calculate** still executes `executeCostingForInquiryLine` only.

## Configure once

Raw Material Prices (existing `RawMaterialPrice` drafts) → Scrap (`CostingScrapRule` / BOM scrap %) → Variables → Formulas (safe `+ - * /`) → Cable assignment → Validate → Approve/Activate.

## Calculate

Cable Master → approved BOM → RM prices → scrap → optional formulas → metal/logistics/packing if configured → immutable `CostingCalculation`.

Missing values return `CONFIGURATION_REQUIRED` / `NOT_READY`. No invented prices, scrap, LME, freight, or drum cost.

## Not low-code

Formula parser, BOM governance, price overlap, RBAC, customer isolation, snapshot immutability.
