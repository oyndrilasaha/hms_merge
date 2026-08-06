# Demo and setup guide

## What this build is

This is a local, synthetic-data MVP for the CPRO306 Group 3 assessment. It demonstrates role-based hospital workflows; it is not approved for clinical use.

**Never enter real patient, staff, Medicare, payment or clinical information.** Use obviously fictional details such as `Taylor Example` and addresses under `example.test`.

## Start the application

Prerequisite: Node.js 24 or newer. The MVP uses only Node's standard library, so there are no third-party packages to install.

```sh
node --version
npm start
```

Open `http://localhost:3000` unless the startup message shows a different local address. On the first start, the application creates `data/hospital.db`, applies `data/schema.sql`, and inserts the synthetic demo dataset. Stop the server with `Ctrl+C`.

Useful checks:

```sh
npm run check
npm test
```

Record the full test command, revision, date and pass/fail output before citing it in the SRS.

## Seed accounts

All seed accounts use the password `DemoPass!2026`. This shared password is only for the local synthetic-data demonstration and must never be used in a deployed or real-data environment.

| Role | Username | Email |
|---|---|---|
| Admin | `admin` | `admin@demo.stgeorge.local` |
| Doctor | `doctor` | `doctor@demo.stgeorge.local` |
| Nurse | `nurse` | `nurse@demo.stgeorge.local` |
| Receptionist | `reception` | `reception@demo.stgeorge.local` |
| Lab Technician | `labtech` | `lab@demo.stgeorge.local` |
| Pharmacist | `pharmacist` | `pharmacy@demo.stgeorge.local` |
| Branch Manager | `manager` | `manager@demo.stgeorge.local` |
| Patient | `patient` | `patient@demo.stgeorge.local` |

The login form accepts the username shown above. Seed accounts are assigned to the synthetic Kogarah branch. A seeded patient is linked to the Patient account.

## Recommended demonstration

Run the automated checks first, then use a fresh/reset database so screen evidence is repeatable.

1. **Authentication and role dashboard:** sign in as Admin, show the role/branch header and dashboard, sign out, then show one generic invalid-login result.
2. **Patient registration:** sign in as Receptionist and create an obviously synthetic patient. Record the generated `SGH-…` medical record number.
3. **Appointment conflict:** create an appointment for the new patient and Doctor. Try a second appointment that overlaps the same doctor's time and capture the rejection.
4. **Clinical note and lab:** sign in as Doctor, append a note to the correct synthetic patient and create a laboratory order.
5. **Laboratory:** sign in as Lab Technician, update the order/result through the permitted workflow.
6. **Pharmacy:** sign in as Pharmacist, dispense stock for a synthetic patient, then attempt more than the available quantity or an expired batch and capture the safe rejection.
7. **Billing:** view/update the permitted synthetic invoice workflow and confirm totals/status.
8. **Audit:** sign in as Admin and show that the preceding material actions contain actor, action, object and time evidence.
9. **PWA/responsive view:** show the narrow/mobile layout, manifest/install control and offline application shell separately from live API data.

Use `docs/EVIDENCE_CHECKLIST.md` to name the screenshots and test artifacts. Do not show the shared password, session cookie, CSRF token or other secrets in submitted images.

## Reset the synthetic dataset

The seed runs only when no users exist. To return to the original data:

1. Stop the server completely.
2. Archive or delete only the generated `data/hospital.db`, `data/hospital.db-shm` and `data/hospital.db-wal` files. Do not remove `data/schema.sql`.
3. Start the application again; it recreates and seeds the database.

If the previous server did not shut down cleanly, confirm no process is still using the database before resetting it. A reset destroys local demo changes, so retain any required test evidence first.

## Evidence-quality notes

- Capture the exact revision (`git rev-parse HEAD`) after the work is committed.
- Keep screenshots free of unrelated tabs, personal details and tokens.
- Include the active role, the synthetic-data label and the success/error result where possible.
- A screenshot demonstrates one result, not every acceptance criterion; pair it with positive and negative tests.
- A Trello “Done” card is planning/process evidence only until linked to passing tests and a revision.

## Current limitations

The local MVP does not prove production TLS, 200 concurrent users, high availability, daily encrypted backup/retention, 30-minute recovery, real email/SMS, payment-gateway processing or every FR1–FR48 workflow. The exact implemented/partial/planned boundary is maintained in `docs/REQUIREMENTS_TRACEABILITY.md`.

Proposed FR49–FR64 remain pending written supervisor/stakeholder approval. The audit viewer and expired-stock checks must not be used to imply that proposed FR55 or FR63 has been approved.
