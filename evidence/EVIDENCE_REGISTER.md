# MVP evidence register

Status date: 5 August 2026. Scope: local synthetic-data assessment MVP.

This register records evidence that was actually produced. The working tree has not yet been committed or pushed, so none of these artifacts is GitHub contribution evidence and no team-member authorship is assigned here.

## Recorded evidence

| Evidence ID | Requirement/test coverage | Artifact and location | Result | Date/time | Owner | Notes and limitations |
|---|---|---|---|---|---|---|
| `EV-TEST-01` | `T-AUTH-01`, `T-AUTH-02`, `T-CSRF-01`, `T-RBAC-01`, `T-PAT-01`, `T-APT-01`, `T-APT-02`, `T-CLN-01`, `T-LAB-01`, `T-PHM-01`, `T-PHM-02`, `T-BIL-01`, `T-AUD-01`, `T-SCOPE-01`, `T-PWA-01`, `T-PAT-02`, `T-APT-03`, `T-EXPORT-01`, `T-CHAT-01` | [`test-results/integration_results.txt`](test-results/integration_results.txt) | **Pass** | 2026-08-08 AEST | Krishala Niroula | Node.js 20+; fresh in-memory SQLite database per test; 16 passed, 0 failed, 0 skipped. Revision is commit 5a531a8. |
| `EV-UI-02` | FR4; implemented subset of FR41 and FR43; supporting NFR10 evidence | [`screenshots/EV-UI-02-admin-dashboard.png`](screenshots/EV-UI-02-admin-dashboard.png) | **Pass** | 2026-08-05 AEST | Pending team attribution | Live local application after administrator login. Shows authorised navigation, four operational metrics, recent appointments and synthetic-data warning. |
| `EV-UI-03` | Implemented subset of FR11; FR12 | [`screenshots/EV-UI-03-patient-created.png`](screenshots/EV-UI-03-patient-created.png) plus [`browser-qa/2026-08-05-live-browser.md`](browser-qa/2026-08-05-live-browser.md) | **Partial** | 2026-08-05 10:22 AEST | Pending team attribution | A receptionist submitted a fully synthetic patient form. The live dashboard count changed from 2 to 3. Database reconciliation verified generated MRN `SGH-000003`; the screenshot itself shows the new count, not the MRN. Capture the patient table/detail view for stronger submission evidence. |
| `EV-DB-01` | FR12; `T-AUD-01`; supporting NFR12 evidence | [`browser-qa/2026-08-05-live-browser.md`](browser-qa/2026-08-05-live-browser.md) | **Pass (local)** | 2026-08-05 10:22 AEST | Pending team attribution | Read-only reconciliation found patient ID `3`, MRN `SGH-000003`, branch `1`, creator user `4`, and matching audit action `PATIENT_CREATED` with entity ID `3`. The temporary browser-test database is not a release artifact. |
| `EV-UI-11` | Implemented subset of NFR13 and NFR15 | [`screenshots/EV-UI-11-mobile-dashboard.png`](screenshots/EV-UI-11-mobile-dashboard.png) plus [`browser-qa/2026-08-05-live-browser.md`](browser-qa/2026-08-05-live-browser.md) | **Partial** | 2026-08-05 AEST | Pending team attribution | Core dashboard cards rendered at 390 x 844 and remained accessible in the DOM. Browser console contained no warnings or errors. This does not prove installation, offline workflow, major-browser coverage or WCAG 2.2 AA conformance. |

## Report-ready evidence statements

The following wording stays within the evidence above and may replace matching technical placeholders:

- **Automated verification:** On 8 August 2026, the local Node.js MVP completed 16 integration scenarios with 16 passes, 0 failures, and 0 skipped tests. The suite covered authentication, salted password hashes, CSRF and RBAC denial, patient profile editing, appointment rescheduling/cancellation conflicts, clinical SOAP notes, nurse observations, laboratory PDF attachments, pharmacy safe dispensing, billing/payment consistency, data CSV exports, print layouts, care chatbot drawer, audit logs, and PWA assets. See `EV-TEST-01`.
- **Patient registration:** In a live receptionist browser session using synthetic data, the system accepted a new patient registration, increased the authorised patient count from two to three, assigned MRN `SGH-000003`, and wrote a matching `PATIENT_CREATED` audit record attributed to user ID 4. See `EV-UI-03` and `EV-DB-01`.
- **Role-specific dashboard:** The live administrator dashboard exposed role-appropriate operational modules and showed scoped metrics for patients, appointments, laboratory orders and outstanding invoices. See `EV-UI-02`.
- **Responsive interface:** The signed-in dashboard rendered its core metrics at a 390 x 844 viewport with no browser console warnings or errors. This supports responsive-layout intent only; formal accessibility and cross-browser conformance remain pending. See `EV-UI-11`.

## Evidence still pending

| Area | Status | What is required before it can be claimed |
|---|---|---|
| Exact GitHub revision and contribution history | Pending | Team-authorised commit(s), push, author attribution, repository URLs and the exact revision/tag used for final evidence. |
| Trello implementation history | Pending | Genuine card owners, acceptance criteria, list-movement history and links to tests/evidence. |
| Lecturer feedback and response | Pending | Authentic feedback text, date/source and the team response/change. |
| Weekly forum iterations | Pending | Actual LMS/forum post URLs or identifiers. |
| Supervisor approval of PWA interpretation | Pending | Written approval with author, date and source. |
| FR49-FR64 decisions | Pending | Individual accept/reject/defer decisions with stakeholder evidence. |
| Individual team contribution | Pending | Team-confirmed authorship linked to genuine commits, reviews or other work products. |
| Production NFRs | Pending | TLS, 200-user load, response-time percentiles, uptime, encrypted backup/restore, cross-browser and WCAG 2.2 AA evidence. |

Do not convert any pending item into a pass from code, a planned card or an assumed approval.
