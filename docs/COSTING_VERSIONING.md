# Costing Configuration Versioning (Increment 13)

## Configuration lifecycle

```
CostingConfiguration (logical header)
    └── CostingConfigurationVersion
            ├── versionNo (sequential)
            ├── status: DRAFT → ACTIVE → INACTIVE | SUPERSEDED
            ├── effectiveFrom / effectiveTo
            └── isCurrent (one ACTIVE current per configuration)
```

## Formula lifecycle

```
CostingFormula (header per config version + component)
    └── CostingFormulaVersion
            ├── versionNo (sequential)
            ├── expression (governed string)
            ├── status: DRAFT → ACTIVE → INACTIVE | SUPERSEDED
            └── CostingFormulaDependency[] (parsed edges)
```

## Status transitions

| From | Action | To |
|---|---|---|
| DRAFT | Activate | ACTIVE |
| ACTIVE | Deactivate | INACTIVE |
| ACTIVE | New version activated | SUPERSEDED |
| DRAFT | Edit expression | DRAFT (same version) |

## Rules

1. Only **DRAFT** formula versions can be edited
2. Activating a formula supersedes prior ACTIVE versions of the same formula
3. Activating a configuration version supersedes prior ACTIVE versions of the same configuration
4. Historical versions are **immutable** after activation
5. `CostingRun.configurationVersionId` links production runs to the config version used (nullable for legacy Increment 10 runs)

## Effective dating

- `effectiveFrom` / `effectiveTo` on configuration versions gate production use (enforced in Phase H)
- Formula versions inherit configuration version effective window

## Alignment with Increment 10

Increment 10 `CostingRun` versioning (`isCurrent`, `supersededById`) is preserved. Increment 13 adds configuration-level versioning as a separate dimension.
