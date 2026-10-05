# Costing Configuration Versioning

Phase D approval workflow for costing configuration versions:

```
DRAFT → VALIDATION → SUBMITTED → APPROVED → ACTIVE
```

- `workflowStatus` tracks pipeline state on `CostingConfigurationVersion`
- `status` mirrors lifecycle for backward compatibility with Phase B+C
- Only one `isCurrent = true` ACTIVE version per configuration
- Activation supersedes prior current versions

API transitions: `validate`, `submit`, `approve`, `activate`.
