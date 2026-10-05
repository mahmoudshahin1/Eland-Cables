# Broken UI actions (updated 2026-08-25)

Production-relevant actions after the final business costing pass.

| Surface | Action | Status |
|---------|--------|--------|
| `GET /api/d365/sync-status` | Status JSON | **IMPLEMENTED** `connected: false`, `NOT_CONNECTED` |
| `GET /api/advaris/mes-status` | Status JSON | **IMPLEMENTED** `NOT_CONNECTED` |
| Internal dashboard charts | Sales / ranking | **IMPLEMENTED** copy: “No data configured” (D365 not connected) |
| Reports & Analytics export | Power BI pack | **NOT IMPLEMENTED** `REPORT_BUILDER_NOT_IMPLEMENTED`; print from inquiry is the thin substitute |
| Finance payment reminders | Send | **NOT IMPLEMENTED** disabled |
| Production MES | New order / inspect | **NOT_CONNECTED** |
| Customer statement PDF | Download | **NOT IMPLEMENTED** |
| Inquiry Documents | Upload | **IMPLEMENTED** PostgreSQL `CommercialInquiryAttachment` |
| Inquiry Print | Summary / costing / offer | **IMPLEMENTED** print from persisted inquiry + snapshot |
| Inquiry tabs | Overview / Cables / Costing / Drums / Cutting / Documents / Quotation / Activity | **IMPLEMENTED** (header form preserved) |
| Costing Other Costs create | Metal / logistics / packing | **IMPLEMENTED** amounts optional (`NOT_CONFIGURED` if blank) |
| PlatformFieldDefinition | Inquiry visibility | **PARTIAL** GET `/api/inquiries/meta/field-definitions` merged into header/line catalog; no full admin grid |
| NotificationRule delivery | Email/SMS | **NOT IMPLEMENTED** table only |
| Costing config REJECT | `/reject` | **BUSINESS DECISION** enum has no REJECTED |
| TDS / Support Center downloads | Fake PDF alerts | **Mock** (customer help demo, not costing SoT) |
| Inquiry saved views | localStorage | Preference only |
| 2D/3D cable engine | Visualization | **NOT IMPLEMENTED** (`three` is a dependency; no configurator WebGL scene) |
| NestJS | — | **Not in repo** (Express) |

JWT in localStorage remains **session cache**, not costing source of truth.
