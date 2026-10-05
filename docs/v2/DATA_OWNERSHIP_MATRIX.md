# Data Ownership Matrix

Machine-readable source: [`src/platform/dataOwnershipMatrix.ts`](../../src/platform/dataOwnershipMatrix.ts)  
HTTP: `GET /api/v2/data-ownership` (authenticated)

Write ownership is exclusive to `ownerModuleId`. Other modules read via published APIs only.

Frozen entities (do not reshape without new phase approval):

- `CommercialCommitment`, `EpcSalesOrder`, `SalesAgreement`, `AgreementRelease`
- `CostingMetalCostComponent` (Option B / Decision 5)

See also [12_MODULE_REGISTRY.md](./12_MODULE_REGISTRY.md).
