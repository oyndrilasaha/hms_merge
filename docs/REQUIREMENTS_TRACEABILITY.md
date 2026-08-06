# MVP requirements traceability

Status date: 5 August 2026. Scope: local synthetic-data MVP.

This matrix is the release boundary, not a claim that the full SRS is complete. `Implemented` means the MVP contains the complete behaviour described in the row; `Partial` means it demonstrates only a stated subset; `Planned` means it must not be presented as delivered. A code path becomes assessment evidence only after its named test/evidence is run and retained against an exact revision.

API paths below use the `/api` prefix. UI evidence refers to the corresponding dashboard workspace/panel.

## Test/evidence identifiers

| ID | Verification intent |
|---|---|
| `T-AUTH-01` | Valid/invalid login, current user, logout and inactive-session behaviour |
| `T-AUTH-02` | Password storage inspection and constant-time verification |
| `T-RBAC-01` | Negative role-permission matrix for every sensitive route |
| `T-SCOPE-01` | Cross-branch and patient-self-scope denial matrix |
| `T-PAT-01` | Patient validation, creation and globally unique identifier |
| `T-APT-01` | Appointment creation and valid actor/field checks |
| `T-APT-02` | Doctor/time overlap and transaction/concurrency conflict checks |
| `T-CLN-01` | Clinical note attribution, append behaviour and unauthorised denial |
| `T-LAB-01` | Doctor order → technician result/status workflow and role denial |
| `T-PHM-01` | Dispense, inventory decrement and patient linkage |
| `T-PHM-02` | Invalid quantity, insufficient stock and expired-stock rejection |
| `T-BIL-01` | Invoice retrieval/status validation, totals and scope |
| `T-DASH-01` | Role/branch-scoped dashboard metrics |
| `T-AUD-01` | Successful/failed login and material-write audit completeness |
| `T-PWA-01` | Manifest, service worker, installability and offline shell |
| `T-UI-01` | Responsive-browser and core keyboard/label/contrast checks |
| `EV-UI-*` | Sanitised screenshots defined in `EVIDENCE_CHECKLIST.md` |

These IDs are stable documentation labels. Link each to the exact automated test name/output or manual evidence before submission.

## Baseline functional requirements FR1–FR48

| ID | MVP status | Endpoint/UI implementation | Required evidence |
|---|---|---|---|
| FR1 | Planned | No public/self-service registration; assessment users are seeded. | Future registration validation tests |
| FR2 | Implemented | `POST /api/auth/login`; login form uses a generic failure message. | `T-AUTH-01`, `EV-UI-01` |
| FR3 | Implemented | Seeded passwords are stored using a salted built-in password derivation function, never plaintext. | `T-AUTH-02`, source/hash inspection |
| FR4 | Implemented | `GET /api/dashboard` and the signed-in dashboard expose role-appropriate modules/metrics. | `T-AUTH-01`, `T-RBAC-01`, `EV-UI-02` |
| FR5 | Planned | `GET /api/users?role=Doctor` is reference lookup only; full audited account administration is absent. | Future user-lifecycle tests |
| FR6 | Planned | `GET /api/branches` is read-only; branch create/update/deactivate is absent. | Future branch-lifecycle tests |
| FR7 | Partial | Seeded branch identifiers and display details are available through `GET /api/branches`; verify every SRS field in the schema. | Schema/seed inspection |
| FR8 | Partial | Seed users are associated with branches; administrator assignment workflow is absent. | `T-SCOPE-01`; future assignment test |
| FR9 | Partial | `GET /api/dashboard` returns limited scoped operational statistics, not the full report suite. | `T-DASH-01` |
| FR10 | Planned | Admissions, discharges and resource monitoring are not in this MVP. | Future inpatient/resource UAT |
| FR11 | Partial | `POST /api/patients` and patient form support synthetic patient creation and validation; confirm receptionist-only rule. | `T-PAT-01`, `T-RBAC-01`, `EV-UI-03` |
| FR12 | Implemented | Patient creation assigns a server-generated globally unique patient number. | `T-PAT-01`, `EV-UI-03` |
| FR13 | Partial | `GET/POST /api/patients` provide authorised create/read subset; role-specific field update is absent. | `T-RBAC-01`, `T-SCOPE-01` |
| FR14 | Partial | Patient view plus `GET/POST /api/clinical-notes` preserve an append-only clinical-note subset, not a complete longitudinal record. | `T-CLN-01`, `EV-UI-06` |
| FR15 | Planned | Complete patient self-service record view is not delivered. | Future patient-self-scope UAT |
| FR16 | Partial | `POST /api/appointments` and appointment form create requests; verify patient self-service actor separately. | `T-APT-01`, `EV-UI-04` |
| FR17 | Partial | `GET /api/users?role=Doctor` exposes doctors and conflict feedback supports slot choice; published schedule/availability calendar is absent. | `T-APT-01`; future schedule test |
| FR18 | Partial | Appointment creation is available; full receptionist approve/modify/cancel with mandatory reason is absent unless demonstrated. | `T-APT-01`; future status-transition test |
| FR19 | Implemented | `POST /api/appointments` checks the same doctor's overlapping time range before commit. | `T-APT-02`, `EV-UI-05` |
| FR20 | Planned | Real queued email/SMS confirmations and reminders are absent. | Future notification integration test |
| FR21 | Planned | Seeded doctor reference data is not an administrator staff-profile workflow. | Future staff-lifecycle tests |
| FR22 | Planned | Schedules, shifts, leave and visiting hours are not maintained. | Future schedule tests |
| FR23 | Partial | `POST /api/clinical-notes` allows the doctor workflow to append attributed notes; assignment and full treatment-record rules require verification. | `T-CLN-01`, `EV-UI-06` |
| FR24 | Planned | A nurse observation/vitals workflow is not delivered. | Future nurse permission/UAT |
| FR25 | Planned | Attendance and shift allocation are not delivered. | Future staff-scheduling tests |
| FR26 | Partial | Medication reference data includes stock and safety fields used by `GET /api/medications`; confirm supplier/minimum/expiry completeness. | Schema/seed inspection, `T-PHM-02` |
| FR27 | Partial | Low-stock state may be shown in pharmacy/dashboard data; no external pharmacist notification is delivered. | `T-DASH-01`; future notification test |
| FR28 | Implemented | `POST /api/medications/dispense` records the dispense, links patient/medicine and reduces stock. | `T-PHM-01`, `EV-UI-08` |
| FR29 | Planned | Purchase-order generation is absent. | Future purchase-order UAT |
| FR30 | Implemented | Dispensing rejects invalid quantity, expired medicine or insufficient stock. | `T-PHM-02`, `EV-UI-08` |
| FR31 | Implemented | `POST /api/lab-orders` lets an authorised doctor create an order for a patient. | `T-LAB-01`, `EV-UI-07` |
| FR32 | Partial | `PATCH /api/lab-orders/:id` records result/status data; protected report upload is absent. | `T-LAB-01`, `EV-UI-07` |
| FR33 | Planned | Real doctor/patient release notifications are absent. | Future notification integration test |
| FR34 | Planned | Patient download/print of a protected released report is absent. | Future patient report UAT |
| FR35 | Partial | `GET /api/lab-orders` exposes an authorised queue/history subset; complete patient/branch/type/date/status filters require verification. | `T-LAB-01`, `T-SCOPE-01` |
| FR36 | Partial | Invoice data demonstrates charges/totals; a complete configured consultation/test/medication price engine is absent. | `T-BIL-01` |
| FR37 | Partial | `GET /api/invoices` and `PATCH /api/invoices/:id` expose seeded invoice/status data; verify itemisation before claiming full compliance. | `T-BIL-01`, `EV-UI-09` |
| FR38 | Planned | Patient-owned invoice download/print is absent. | Future patient invoice UAT |
| FR39 | Partial | `PATCH /api/invoices/:id` validates supported status changes and auditing; verify full paid/pending/cancelled history. | `T-BIL-01`, `T-AUD-01` |
| FR40 | Planned | No payment gateway is connected; no card details are accepted. | Future sandbox-gateway tests |
| FR41 | Partial | `GET /api/dashboard` provides a current operational summary, not complete daily/weekly/monthly reporting. | `T-DASH-01`, `EV-UI-02` |
| FR42 | Planned | PDF/spreadsheet reporting exports are absent. | Future export tests |
| FR43 | Partial | Dashboard summary cards provide limited role-appropriate metrics; graphical reporting breadth is incomplete. | `T-DASH-01`, `EV-UI-02` |
| FR44 | Planned | Department-comparison reporting is absent. | Future branch-manager UAT |
| FR45 | Planned | Real appointment/result/billing delivery and notification logs are absent. | Future integration/retry test |
| FR46 | Planned | Non-clinical chatbot is absent. | Future safety-boundary and escalation test |
| FR47 | Planned | Feedback sentiment classification and human review are absent. | Future model evaluation/UAT |
| FR48 | Planned | Aggregate summaries with source values and human review are absent. | Future reproducibility/review test |

## Baseline non-functional requirements NFR1–NFR20

| ID | MVP status | Current evidence boundary | Required evidence |
|---|---|---|---|
| NFR1 | Unproven | Lightweight local implementation only; no agreed-network P95 result yet. | Timed browser/API run, environment and P95 |
| NFR2 | Planned | Single-process SQLite demo is not a 200-user result. | 200-user load report with error rate |
| NFR3 | Partial | SQLite schema can use patient/appointment lookup indexes; inspect plans/timings. | Index/schema and query-plan evidence |
| NFR4 | Unproven | Dashboard is not the complete report suite or 10,000-record timing result. | Seeded-volume report timing |
| NFR5 | Partial | Branch is a data entity, but branch lifecycle and new-branch proof are absent. | Create/configure a branch without schema change |
| NFR6 | Planned | In-process sessions plus SQLite are not multi-server architecture. | Production architecture review |
| NFR7 | Unproven | No forecast-volume test. | Growth-volume performance report |
| NFR8 | Implemented | Slow salted built-in password derivation; requires configuration/hash inspection and approval as equivalent. | `T-AUTH-02` |
| NFR9 | Planned for deployment | Local HTTP does not prove TLS. | TLS scan and redirect evidence |
| NFR10 | Implemented | Server checks roles for sensitive routes. | `T-RBAC-01`, `T-SCOPE-01` |
| NFR11 | Implemented if verified | Server-side sessions are designed for 10-minute inactivity expiry. | `T-AUTH-01` idle-expiry case |
| NFR12 | Partial | Audit storage and restricted `GET /api/audit-logs` provide an inspection path; verify failed logins, every material change/deletion and explicit outcome detail before claiming full compliance. | `T-AUD-01`, `EV-UI-10` |
| NFR13 | Partial | Responsive PWA UI supports core journeys; major-browser task matrix is still required. | `T-UI-01`, `EV-UI-11` |
| NFR14 | Partial | Server and forms provide validation/error guidance for implemented workflows only. | Negative/boundary tests for every form |
| NFR15 | Partial | Semantic/label/contrast intent is present; WCAG 2.2 AA has not been proven. | `T-UI-01`, automated plus manual audit |
| NFR16 | Planned | No uptime monitoring period. | Monitoring/availability report |
| NFR17 | Planned | Generated DB exclusion is not a daily encrypted backup/30-day retention process. | Scheduler, backup inventory and failure alert |
| NFR18 | Planned | No timed critical restore exercise. | Restore duration and reconciliation record |
| NFR19 | Partial | Server, database/domain helpers and client are separated, but the MVP is not the target PHP/MVC implementation. | Architecture/code review |
| NFR20 | Implemented for MVP | Setup, architecture, traceability, evidence and security/privacy documentation are versioned in `docs/`. | Documentation review at release revision |

## Proposed FR49–FR64 — not baseline

All requirements in this section remain **approval-gated**. They must not be described as approved, required or complete until the team records an individual written supervisor/stakeholder decision with date and evidence. An experimental endpoint that resembles a proposal is implementation exploration, not approval.

| ID | Approval status | MVP note |
|---|---|---|
| FR49 | Pending | Versioned consent/withdrawal evidence is not delivered. |
| FR50 | Pending | Privileged-role MFA is not delivered. |
| FR51 | Pending | Break-glass reason, expiry, alert and review are not delivered. |
| FR52 | Pending | Admission/transfer/discharge workflow is not delivered. |
| FR53 | Pending | Bed availability/double-allocation prevention is not delivered. |
| FR54 | Pending | Ward observations/discharge summary are not delivered. |
| FR55 | Pending | `GET /api/audit-logs` is a limited experimental audit viewer supporting NFR12; full approved search/export is not claimed. |
| FR56 | Pending | Suspicious-activity alerts are not delivered. |
| FR57 | Pending | Encrypted backup verification/failure alert is not delivered. |
| FR58 | Pending | Controlled restore-drill workflow is not delivered. |
| FR59 | Pending | Audited configuration management is not delivered. |
| FR60 | Pending | Full department/ward/room/bed/service-price configuration is not delivered. |
| FR61 | Pending | Patient access/correction request case management is not delivered. |
| FR62 | Pending | Duplicate-patient review/merge is not delivered. |
| FR63 | Pending | Expired-stock protection may exist under baseline FR30; allergy interaction checking is not delivered and the proposed requirement remains unapproved. |
| FR64 | Pending | Gateway callback/refund reconciliation is not delivered. |

## Release update rule

Before a report is submitted, reconcile this file against the exact tagged revision and retained evidence. A requirement may move from `Planned` or `Partial` to `Implemented` only when all acceptance criteria are present, the positive and negative tests pass, and the evidence location is recorded. Never infer lecturer feedback, supervisor approval, forum participation or individual contribution from code.
