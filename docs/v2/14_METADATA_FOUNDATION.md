# 14 — Metadata Foundation

**Code:** `src/platform/metadata/metadataService.ts`  
**API:** `GET /api/v2/metadata/fields`  
**Storage:** `PlatformFieldDefinition` (extended with tab, lookup, fieldSecurity)

## Policy

| Allowed | Forbidden |
|---------|-----------|
| Labels, visibility, required, read-only, order, sections, tabs, lookup, field security | EAV replacement of relational transaction models |
| Overlay on typed entities (Inquiry, Cable, …) | Arbitrary JS/SQL/schema via low-code |

Inquiry field metadata converges toward platform SoT: **code manifest** remains fallback; **PlatformFieldDefinition** overlays when present (`mergeFieldMetadata`).

Transactional facts stay on Prisma models (`CommercialInquiry`, lines, costing docs, etc.).
