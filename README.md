# St George Hospital Management System

A working, synthetic-data MVP for the CPRO306 Group 3 capstone project. It demonstrates a secure multi-role hospital journey across patient registration, appointments, clinical notes, laboratory work, pharmacy stock, billing, dashboards and audit records.

> **Assessment environment only:** never enter real patient, staff, Medicare, payment or clinical information.

## Run locally

Requires Node.js 24 or newer. The application has no third-party runtime dependencies.

```sh
npm start
```

Open <http://localhost:3000>. The first run creates and seeds a local SQLite database. Demo usernames, the shared local-only password, the recommended walkthrough and reset instructions are in [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md).

Run the evidence tests with:

```sh
npm test
```

## Evidence and scope

- [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md) — honest FR/NFR implementation boundary
- [`docs/EVIDENCE_CHECKLIST.md`](docs/EVIDENCE_CHECKLIST.md) — screenshots, tests, GitHub, Trello and human approvals still needed
- [`evidence/EVIDENCE_REGISTER.md`](evidence/EVIDENCE_REGISTER.md) — evidence actually produced, report-ready statements and remaining gaps
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — local MVP and production MySQL migration
- [`docs/SECURITY_PRIVACY.md`](docs/SECURITY_PRIVACY.md) — implemented controls, privacy boundary and known gaps

The local prototype does not claim production approval or complete FR1–FR48 coverage. Proposed FR49–FR64 remain pending written supervisor/stakeholder approval.
