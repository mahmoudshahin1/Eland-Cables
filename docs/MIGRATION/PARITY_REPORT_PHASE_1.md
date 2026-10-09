# Parity Report: Phase 1

Date: 2026-10-09T06:56:23.820Z
Legacy: `http://127.0.0.1:3847` | Target: `http://127.0.0.1:3000`

| Test ID | Method | Path | Status Match | Body Match | Overall |
|---|---|---|---|---|---|
| `auth-login` | `POST` | `/api/auth/login` | ❌ (400 vs 403) | ❌ | ❌ FAIL |
| `auth-logout` | `POST` | `/api/auth/logout` | ❌ (200 vs 500) | ❌ | ❌ FAIL |
| `auth-me` | `GET` | `/api/auth/me` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `master-cables` | `GET` | `/api/master/cables` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `master-boms` | `GET` | `/api/master/boms` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `inquiries-list` | `GET` | `/api/inquiries` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `admin-users` | `GET` | `/api/admin/users` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `admin-roles` | `GET` | `/api/admin/roles` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `admin-permissions` | `GET` | `/api/admin/permissions` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `admin-customers` | `GET` | `/api/admin/customers` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-1` | `POST` | `/api/auth/login` | ❌ (400 vs 403) | ❌ | ❌ FAIL |
| `endpoint-2` | `POST` | `/api/auth/logout` | ❌ (200 vs 500) | ❌ | ❌ FAIL |
| `endpoint-3` | `POST` | `/api/auth/refresh-token` | ❌ (400 vs 500) | ❌ | ❌ FAIL |
| `endpoint-4` | `GET` | `/api/auth/me` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-5` | `POST` | `/api/auth/change-password` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-6` | `POST` | `/api/auth/reset-password` | ✅ (400 vs 400) | ❌ | ❌ FAIL |
| `endpoint-7` | `POST` | `/api/auth/forgot-password` | ✅ (200 vs 200) | ✅ | ✅ PASS |
| `endpoint-8` | `POST` | `/api/auth/register` | ✅ (403 vs 403) | ❌ | ❌ FAIL |
| `endpoint-9` | `POST` | `/api/auth/roles` | ✅ (403 vs 403) | ❌ | ❌ FAIL |
| `endpoint-10` | `POST` | `/api/auth/assign-role` | ✅ (403 vs 403) | ❌ | ❌ FAIL |
| `endpoint-11` | `GET` | `/api/auth/users` | ✅ (403 vs 403) | ❌ | ❌ FAIL |
| `endpoint-12` | `GET` | `/api/auth/roles` | ❌ (200 vs 500) | ❌ | ❌ FAIL |
| `endpoint-13` | `GET` | `/api/master/cables` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-14` | `GET` | `/api/master/cables/123` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-15` | `POST` | `/api/master/cables` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-16` | `PUT` | `/api/master/cables/123` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-17` | `GET` | `/api/master/raw-materials` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-18` | `GET` | `/api/master/raw-material-prices` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-19` | `GET` | `/api/master/boms` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-20` | `GET` | `/api/master/drums` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-21` | `GET` | `/api/inquiries` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-22` | `GET` | `/api/inquiries/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-23` | `POST` | `/api/inquiries` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-24` | `PATCH` | `/api/inquiries/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-25` | `POST` | `/api/inquiries/1/submit` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-26` | `POST` | `/api/inquiries/1/cancel` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-27` | `POST` | `/api/inquiries/1/lines` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-28` | `PATCH` | `/api/inquiries/1/lines/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-29` | `DELETE` | `/api/inquiries/1/lines/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-30` | `GET` | `/api/admin/users` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-31` | `POST` | `/api/admin/users` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-32` | `GET` | `/api/admin/users/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-33` | `PATCH` | `/api/admin/users/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-34` | `POST` | `/api/admin/users/1/activate` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-35` | `POST` | `/api/admin/users/1/deactivate` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-36` | `POST` | `/api/admin/users/1/lock` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-37` | `POST` | `/api/admin/users/1/unlock` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-38` | `POST` | `/api/admin/users/1/reset-password` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-39` | `POST` | `/api/admin/users/1/roles` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-40` | `DELETE` | `/api/admin/users/1/roles/ADMIN` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-41` | `GET` | `/api/admin/roles` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-42` | `POST` | `/api/admin/roles` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-43` | `GET` | `/api/admin/roles/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-44` | `PATCH` | `/api/admin/roles/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-45` | `POST` | `/api/admin/roles/1/activate` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-46` | `POST` | `/api/admin/roles/1/deactivate` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-47` | `GET` | `/api/admin/roles/1/users` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-48` | `GET` | `/api/admin/roles/1/permissions` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-49` | `PUT` | `/api/admin/roles/1/permissions` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-50` | `GET` | `/api/admin/permissions` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-51` | `GET` | `/api/admin/permissions/matrix` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-52` | `GET` | `/api/admin/security` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-53` | `GET` | `/api/admin/customers` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-54` | `GET` | `/api/admin/customers/export` | ✅ (401 vs 401) | ❌ | ❌ FAIL |
| `endpoint-55` | `GET` | `/api/admin/customer-reference-masters` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-56` | `POST` | `/api/admin/customers` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-57` | `GET` | `/api/admin/customers/1/audit` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-58` | `GET` | `/api/admin/customers/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-59` | `PATCH` | `/api/admin/customers/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-60` | `POST` | `/api/admin/customers/1/activate` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-61` | `POST` | `/api/admin/customers/1/deactivate` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-62` | `DELETE` | `/api/admin/customers/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-63` | `GET` | `/api/admin/customer-users` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-64` | `POST` | `/api/admin/customer-users` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-65` | `PATCH` | `/api/admin/customer-users/1` | ✅ (401 vs 401) | ✅ | ✅ PASS |
| `endpoint-66` | `POST` | `/api/admin/customer-users/1/unassign` | ✅ (401 vs 401) | ✅ | ✅ PASS |

**Summary:** 51/76 passed (25 failed).
