# Engineering Approval Rules (Increment 6)

## Approval Prerequisites

Before any mapping can transition to `APPROVED`, the system validates:

1. **Parameter Master Membership**: All non-null attributes must resolve to active codes in `CableParameter` (`FAMILY`, `VOLTAGE`, `CONDUCTOR`, `INSULATION`, `SCREEN`, `ARMOUR`, `SHEATH`, `CORE_COLOUR`, `STANDARD`).
2. **Compatibility Matrices**: Compatibility rules in `ParameterCompatibility` must permit the combination (e.g. `FAMILY ↔ VOLTAGE`). Forbidden or unlisted combinations block approval (`422 APPROVAL_BLOCKED_INVALID_COMPATIBILITY`).
3. **Approver Authorization**: The approving actor must have internal Technical Office authority (`assertCanApproveEngineeringMapping`).
4. **Structured Completeness**: Cable Authority requires approved values for `family`, `voltage`, `conductor`, `conductorSize`, `cores`, and `insulation` before yielding `EXISTING_CABLE`.

## Rules Against Assumption

- Free-text parameter names are prohibited where controlled codes exist.
- If compatibility rules are not configured for a pair: returns `CONFIGURATION_REQUIRED`.
- Blank values remain `NULL` / `MISSING`. Default parameters are not invented.
