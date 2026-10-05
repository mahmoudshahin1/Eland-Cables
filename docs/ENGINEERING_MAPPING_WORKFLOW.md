# Engineering Mapping & Technical Office Approval Workflow (Increment 6)

## Overview & Architecture

Increment 6 implements a controlled data-governance workflow to convert incomplete Cable Master engineering records into explicitly reviewed, approved, and revision-controlled engineering data.

This is **NOT** an inference engine and **NOT** a costing engine.

## Strict Separation: Source vs Approved Data

| Layer | Entity / Scope | Mutability | Examples |
|---|---|---|---|
| **SOURCE CABLE DATA** | `CableMaster` (materialNumber, itemCode, customerCode, description, diameter, weight) | Read-only from official extract (immutable) | Diameter: `10.9 mm (SOURCE)`, Weight: `268 kg/km (SOURCE)` |
| **ENGINEERING-APPROVED DATA** | `CableEngineeringMapping` (family, voltage, conductor, size, cores, insulation, screen, armour, sheath, standard, etc.) | Governed by Technical Office workflow with explicit human approval | Voltage: `600/1000V (APPROVED)`, Family: `LV (APPROVED)` |

Under no circumstances are original source values overwritten when an engineer approves an attribute.

## Workflow States & Transitions

```
[DRAFT] ───► (Submit) ───► [SUBMITTED] ───► (Assign/Review) ───► [UNDER_REVIEW] ───► (Approve) ───► [APPROVED]
  ▲                           │                                      │
  │                           ▼                                      ▼
  └────────────────── (Reject / Return) ◄───────────────────── [REJECTED]
```

- **DRAFT**: Created/edited by Technical Office engineers. Values remain non-authoritative.
- **SUBMITTED**: Submitted for Technical Office management review.
- **UNDER_REVIEW**: Assigned to a reviewing engineer.
- **APPROVED**: Signed off by authorized Technical Office manager. Only this status becomes authoritative for structured `EXISTING_CABLE` matching.
- **REJECTED**: Rejected with audit comments; returned for correction.

### Immutable Revision Control

Editing an already `APPROVED` mapping automatically creates Revision V(N+1) in `DRAFT` status. Previous revisions (e.g. V1) remain immutable historical records (`isCurrent = false`).

## No Inference Policy

1. Description parsing candidate values are labeled **Suggested** (`DERIVED`).
2. Suggested values **NEVER** silently become master data.
3. Specification Code (e.g. `N2XH`, `N2XS2Y`) is **NOT** Cable Family. Cable Family must be explicitly selected from active `FAMILY` parameter masters.
4. If an unmapped cable is evaluated in Cable Configurator, Cable Authority returns `CONFIGURATION_REQUIRED`.

## Role-Based Access Control (RBAC)

- **Customer Users**: Blocked from editing or approving mappings (`403 UNAUTHORIZED`).
- **Technical Office Engineers**: Can view queue, edit drafts, submit, and review.
- **Technical Office Managers**: Can approve and reject mappings.

## APIs

- `GET /api/master/engineering-mappings` — List mappings with filters (`workflowStatus`, `status`, `q`)
- `GET /api/master/engineering-mappings/:materialNumber` — Detailed side-by-side comparison & revision history
- `PUT /api/master/engineering-mappings/:materialNumber` — Update draft attributes with parameter validation
- `POST /api/master/engineering-mappings/:materialNumber/actions` — Perform workflow action (`SUBMIT`, `ASSIGN`, `REVIEW`, `APPROVE`, `REJECT`, `CANCEL`)
