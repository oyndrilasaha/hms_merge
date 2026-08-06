# Security and privacy controls

## Assessment-data rule

This MVP is restricted to synthetic data. Do not enter, import, photograph or upload real patient, staff, Medicare, payment or clinical information. Demo identities must be obviously fictional and must not reuse personal details from real people.

If real information is entered accidentally:

1. Stop the demonstration and prevent further access.
2. Preserve only the minimum audit facts needed to investigate; do not copy the sensitive content into issues or chat.
3. Notify the lecturer/project owner through the approved channel.
4. Remove the information through an authorised, documented process and rotate exposed secrets if applicable.
5. Record the incident and corrective action without reproducing the sensitive data.

## Implemented-design control objectives

| Area | MVP control objective | Required verification |
|---|---|---|
| Authentication | Generic login failures; slow salted password derivation; opaque expiring sessions; logout invalidation | Positive/negative login, hash inspection, expiry and logout tests |
| Authorisation | Server-side role checks on every sensitive endpoint; branch/patient scope where applicable | Negative permission and cross-scope matrix |
| Input handling | JSON/body limits, type/range/enumeration validation, prepared SQL and safe error messages | Boundary, malformed-body and injection-oriented tests |
| Data integrity | Foreign keys, transactions for multi-write workflows, appointment conflict and stock checks | Conflict, rollback and insufficient-stock tests |
| Audit | Login outcomes and material changes should record actor, action, object, outcome detail and timestamp | Audit completeness test and restricted audit-view test |
| Browser | Same-origin API; no secrets in browser storage; secure cookie attributes in production; basic security headers | Header/cookie inspection and browser tests |
| Privacy | Synthetic seed only, minimum displayed data, role/branch scoping, no card data | Seed review and access-control tests |

Passwords must never be stored or logged in plaintext. The dependency-free Node MVP should use Node's built-in password derivation with a unique random salt and constant-time comparison. The SRS permits bcrypt, Argon2id or an approved equivalent; any use of scrypt must be documented, reviewed and verified against the configured work factor before production.

## Role principle

Permissions are deny-by-default and enforced by the server. Expected role intent is:

| Role | Minimum workflow access |
|---|---|
| Admin | System-wide demo dashboard, branch/user reference data and restricted audit view |
| Branch Manager | Operational metrics for authorised branch only |
| Receptionist | Register patients and manage appointments within authorised branch |
| Doctor | Assigned/authorised patient records, clinical notes and lab orders |
| Nurse | Authorised observations only when implemented |
| Lab Technician | Assigned lab queue and result status/result entry |
| Pharmacist | Medication stock and valid dispensing workflow |
| Patient | Own permitted appointments, released results and invoices only when self-service scope is implemented |

A role appearing in a seed table does not prove all its intended permissions are implemented. Use `REQUIREMENTS_TRACEABILITY.md` as the release boundary.

## Session and transport boundary

- Local demo HTTP is acceptable only on loopback and contains synthetic data.
- Production must use HTTPS/TLS, HTTP-to-HTTPS redirection, `Secure`, `HttpOnly` and appropriate `SameSite` cookie settings.
- Idle sessions must expire after 10 minutes to satisfy NFR11; absolute lifetime and renewal rules should also be defined.
- State-changing cookie-authenticated requests need CSRF protection or a justified same-origin token design.
- Authentication and sensitive endpoints should be rate-limited in production.

The local MVP does not by itself prove TLS, distributed session handling or denial-of-service protection.

## Audit handling

Audit entries should contain actor/user ID, active role, branch/scope, action, object type/ID, outcome, timestamp and a correlation/source value. The MVP schema currently has actor, branch, action, object, details, IP address and time but no dedicated outcome column; the release must either encode an unambiguous outcome safely or add the field and test it. Never log passwords, session tokens, full clinical text, payment card data or unnecessary direct identifiers.

The MVP audit log provides partial support for NFR12 until completeness and outcome evidence are verified. A searchable audit screen may resemble proposed FR55, but FR55 remains approval-gated and must not be moved into the baseline without written stakeholder/supervisor approval. Production audit data should be append-only/tamper-evident, access-restricted and retained under an approved schedule.

## Database and backup

- The SQLite database is local assessment state, not a production clinical datastore.
- Exclude generated database files, logs and secrets from source control.
- Reset using the documented seed process; do not hand-edit evidence after a test.
- Production MySQL requires least-privilege service accounts, managed secrets, encryption at rest, encrypted verified backups and tested restore procedures.
- NFR17 and NFR18 remain unproven until scheduled backup retention and a timed restore/reconciliation exercise produce evidence.

## Known gaps before real-world use

At minimum: formal privacy impact assessment; threat model; clinical-safety review; consent/legal basis; MFA; break-glass access; data encryption/key management; file malware scanning; notification/gateway integrations; immutable audit retention; monitoring/alerting; backup/recovery; accessibility and penetration testing; load/high-availability testing; incident response; retention/disposal; patient-access/correction workflow; and deployment change control.

Proposed FR49–FR64 are approval-gated. Implementing an experimental control does not approve or baseline its requirement.
