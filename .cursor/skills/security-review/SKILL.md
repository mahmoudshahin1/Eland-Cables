---
name: security-review
description: Apply the phase security checklist (guards, public routes, sensitive fields, injection, secrets, dependencies, negative permission tests, findings log) to the routes of a phase and write SECURITY_REVIEW.md. Use at phase close or when reviewing migrated routes for security.
---

# Security review (protocol §3.2 and §4)

Read-only analysis plus safe read commands. No fixes to legacy behaviour.

1. Table per new route: method, path, Nest guard, permission helper, public?, customer allowed?, matches legacy (cite legacy file:line of the auth helper).
2. Public routes with justification from legacy code.
3. Sensitive fields: compare real responses (from parity output) for hashes, tokens, cost/price fields for customers, cross-customer data.
4. Verbatim outputs:
   - `npm audit --omit=dev` (root and energya-backend)
   - `rg -n "\$queryRaw|\$executeRaw|eval\(|new Function|child_process" energya-backend/src`
   - `rg -n "(ghp_|sk-|AKIA|password\s*[:=]\s*['\"])" --glob "!**/node_modules/**"`
   - `rg -c npmmirror -g "*lock*"`
   - dangerous flags (`ALLOW_DEMO_USERS`, `DEMO_MODE`) blocked in production
   - `curl.exe -I http://127.0.0.1:3000/<migrated route>` headers and CORS
5. Negative permission tests: no token, customer, internal without permission, partial, authorized; size limits and upload limits where relevant.
6. Findings log: id, description, severity, legacy/new, status (ported as-is / fixed / open), decision owner.
7. Any new High in Nest code -> stop and report.
