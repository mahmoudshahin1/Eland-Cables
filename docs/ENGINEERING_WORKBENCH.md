# Technical Office Engineering Workbench (Increment 7)

## Overview & Purpose

Increment 7 implements the **Technical Office Engineering Workbench** to streamline, govern, and audit the mapping and approval of the 432 official Cable Master records without creating a manual bottleneck or bypassing engineering controls.

This is a data-governance workbench. It is **NOT** an automatic approval engine, **NOT** an inference engine, and **NOT** a costing engine.

---

## 1. No Automatic Approval Policy

Batch features must **NEVER** automatically approve all records. Every approved mapping requires:
- Explicit multi-record or individual selection
- Strict parameter & compatibility validation of every record
- Explicit authorized Technical Office Manager sign-off
- One atomic audit event per approved mapping in `AuditEvent`
- Immutable revision logging

---

## 2. Workbench Features & Metrics

The Workbench tab under Technical Office provides:
- **Metrics Strip**: Total Official Cables, Approved, Draft, Under Review, Submitted, Rejected, Missing, Validation Errors.
- **Search & Filters**: Material Number, Description, Customer Code, Item Code, Family, Voltage, Conductor, Mapping Status, Reviewer, Revision.
- **Multi-Select Bulk Actions**:
  - `Validate`: Runs parameter & compatibility checks across all selected records.
  - `Submit`: Batch transition selected records from `DRAFT` to `SUBMITTED`.
  - `Assign`: Batch assign selected records to a reviewing engineer.
  - `Approve`: Batch sign-off by Technical Office Manager (strictly blocked if any selected record has a validation or missing mandatory attribute error).
  - `Reject`: Batch rejection with feedback notes.
- **Side-by-Side Review**: Strict comparison of immutable original source extract data (`Diameter: 10.9 mm (SOURCE)`, `Voltage: NULL`) vs governed mapping values, with `Suggested` candidate tags for description derivations.

---

## 3. Engineering Mapping Excel Template & Workflow

A controlled Excel workflow is implemented:
```
[Export Template] ──► [Fill Mapping Attributes] ──► [Upload Excel] ──► [Parse & Validate Preview] ──► [Commit as Drafts] ──► [Review & Manager Approval]
```
Excel uploads **NEVER** go directly to `APPROVED`. They update or create records in `DRAFT` status for human review.

### Controlled Template Columns
1. `Material Number` (Authoritative matching key)
2. `Cable Description` (Informational reference)
3. `Cable Family`
4. `Voltage`
5. `Conductor Material`
6. `Conductor Size`
7. `Number of Cores`
8. `Insulation`
9. `Screen`
10. `Armour`
11. `Sheath`
12. `Sheath Colour`
13. `Core Colour`
14. `Standard`
15. `Special Additives`
16. `Comment`

### Import Validation Rules
- Rejects unknown Material Numbers not present in `CableMaster` catalog.
- Rejects duplicate Material Number rows in the uploaded file.
- Validates all parameter values against `CableParameter` masters.
- Validates Family ↔ Voltage and other parameter compatibility matrices against `ParameterCompatibility`.
- Blocks submission if any row fails validation.
- **Never overwrites raw CableMaster source data** (`diameter`, `weight`, `description`, `itemCode`, `customerCode`).

---

## 4. Role-Based Access Control (RBAC)

- **Customer Role**: 403 UNAUTHORIZED on all mapping operations.
- **Sales Role**: Read approved mappings where permitted.
- **Technical Office Engineer**: Edit drafts, upload Excel mappings, validate, submit, and assign.
- **Technical Office Manager**: Approve (individually or batch) and reject mappings.

---

## 5. Audit Logging

Every operation appends an immutable record to `AuditEvent`:
- `CREATE`, `UPDATE`, `IMPORT`, `SUBMIT`, `ASSIGN`, `REVIEW`, `APPROVE`, `REJECT`, `REVISION_CREATE`
- Records Actor, Timestamp, Entity (`CableEngineeringMapping`), Entity ID (`<MaterialNumber>-V<Revision>`), Old Value, New Value, and Reviewer Comments.
