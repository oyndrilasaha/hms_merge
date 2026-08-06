# Live browser QA record

Date: 5 August 2026 (Australia/Sydney)  
Application: local St George Hospital Management System MVP  
Environment: Node.js 24.14.0, local HTTP, SQLite, in-app Chromium browser  
Data classification: deterministic and manually entered synthetic assessment data only

## Scenario results

| Scenario | Role/environment | Result | Observation |
|---|---|---|---|
| Administrator sign-in and dashboard | Administrator, default desktop viewport | Pass | The application loaded authorised administrator navigation and dashboard metrics: 2 patients, 1 active appointment, 1 open lab order and 1 outstanding invoice. Evidence: `EV-UI-02-admin-dashboard.png`. |
| Receptionist sign-in and role-specific dashboard | Receptionist, local browser | Pass | Receptionist navigation contained Dashboard, Patients, Appointments and Billing; clinical, pharmacy and audit modules were not exposed. |
| Synthetic patient registration | Receptionist, Kogarah branch | Pass | Submitted Morgan Browser Example, date of birth 1990-06-15, non-binary, synthetic `.test` email, synthetic phone/address and synthetic emergency contact. The UI announced `Patient registered successfully.` and the patient metric changed from 2 to 3. Evidence: `EV-UI-03-patient-created.png`. |
| Registration/database reconciliation | Read-only query after the browser scenario | Pass | Patient ID 3, MRN `SGH-000003`, branch ID 1, creator user ID 4, created at `2026-08-05T00:22:42.084Z`. Matching audit row: ID 6, action `PATIENT_CREATED`, entity `patient`, entity ID `3`, actor user ID 4, same timestamp. |
| Responsive dashboard | Receptionist, 390 x 844 viewport | Pass for layout check | Core dashboard heading and four metric cards remained visible and represented in the accessibility snapshot. Evidence: `EV-UI-11-mobile-dashboard.png`. This was not an installation/offline or full WCAG audit. |
| Browser diagnostics | Same live session | Pass | Final browser warning/error log query returned an empty list. |

## Evidence boundary

This record proves only the live local scenarios listed above. It does not prove production deployment, TLS, accessibility conformance, performance targets, availability, backup/restore, notification delivery, payment-gateway integration, stakeholder acceptance, assessment feedback, forum participation or individual team-member authorship.

The browser-test database was `/private/tmp/st-george-hms-browser-20260805-01.db`; it is an ephemeral local QA database and must never be submitted as a real patient database.
