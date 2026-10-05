# Costing Security

## RBAC permissions

| Permission | Capability |
|------------|------------|
| `ADMIN.COSTING.VIEW` | View costing configuration |
| `ADMIN.COSTING.CREATE` | Create draft methods/variables/formulas |
| `ADMIN.COSTING.UPDATE` | Edit draft configuration |
| `ADMIN.COSTING.APPROVE` | Approve/reject configuration |
| `ADMIN.COSTING.PREVIEW` | Run calculation preview |
| `COSTING.CALCULATION.VIEW` | View inquiry costing results |
| `COSTING.CALCULATION.CALCULATE` | Execute inquiry-line costing |

Permissions are checked server-side on every sensitive route. Frontend field visibility is **not** security.

## Customer isolation

| Control | Implementation |
|---------|----------------|
| Block calculate-cost | `commercialRoutes.ts` → `UNAUTHORIZED_COSTING_ACCESS` |
| Hide material cost | `commercialProjection.ts` strips `materialCost` |
| Field manifest | `inquiryFieldManifest.ts` — `materialCost.customerVisible: false` |
| Quotation costing | `GET /api/quotations/:id/costing` — internal only |

## Audit

Immutable `AuditEvent` records:

- Configuration create/update/approve  
- Calculation execution and failure  
- Quotation costing snapshot  
- Recalculation (explicit, audited)  

Passwords and tokens are never audited.

## Formula security

- Tokenizer → AST → validator → evaluator only  
- No arbitrary SQL, JavaScript, or server code in formulas  
- See [`COSTING_FORMULA_SECURITY.md`](./COSTING_FORMULA_SECURITY.md)

## Increment 12 security preserved

PostgreSQL identity, bcrypt, JWT, refresh tokens, session revocation, lockout, customer scope isolation, administrator separation from business authority.
