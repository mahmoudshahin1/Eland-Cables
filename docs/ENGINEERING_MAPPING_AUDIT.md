# Engineering Mapping Audit & Revision Trail (Increment 6)

## Audit Event Schema

Every mapping action appends an immutable event to `AuditEvent`:

- `at`: ISO timestamp of the action
- `actorId`: User ID
- `actorName`: Full name / email of engineer/manager
- `entity`: `CableEngineeringMapping`
- `entityId`: `<MaterialNumber>-V<Revision>`
- `action`: `CREATE` | `UPDATE` | `SUBMIT` | `APPROVE` | `REJECT`
- `oldValue` & `newValue`: JSON state diffs
- `message`: Descriptive audit entry

## Revision Immutability Example

1. **V1 Draft Created**: Attributes populated with diameter/weight as SOURCE, others MISSING.
2. **V1 Submitted & Approved**: V1 marked `APPROVED` with approver timestamp. Cable Authority evaluates structured config against V1.
3. **V2 Revision Requested**: Engineer edits mapping. System sets V1 `isCurrent = false` and inserts V2 `isCurrent = true, status = DRAFT`.
4. **Authority During V2 Draft**: Because V2 is `DRAFT`, Cable Authority treats the cable as `CONFIGURATION_REQUIRED` until V2 is formally `APPROVED`.
5. **Historical Inspection**: `GET /api/master/engineering-mappings/:materialNumber` returns all historical revisions intact.
