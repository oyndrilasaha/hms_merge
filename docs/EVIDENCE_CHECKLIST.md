# SRS evidence checklist

Use this checklist to replace report placeholders with verifiable evidence. Record a stable file/link, date, author and related requirement for every item. Do not claim completion from a planned card or an unrun test.

Evidence already produced for the current local MVP is recorded separately in [`../evidence/EVIDENCE_REGISTER.md`](../evidence/EVIDENCE_REGISTER.md). The unchecked items below remain the capture/release checklist; the register is the source of truth for pass, partial and pending status.

## Evidence register fields

| Field | What to record |
|---|---|
| Evidence ID | Stable identifier such as `EV-UI-03` or `EV-TEST-07` |
| Requirement(s) | FR/NFR identifiers supported by the evidence |
| Artifact | Screenshot, test result, commit, pull request, Trello card, meeting record or approval |
| Location | Repository-relative path or accessible URL |
| Date/time | When the evidence was produced |
| Owner | Team member responsible for the artifact |
| Result | Pass, fail, partial, pending or not applicable |
| Notes | Test data, role, branch, environment and limitations |

## Working-system screenshots

- [ ] `EV-UI-01`: Login page plus generic invalid-credentials result; no real credentials visible. Supports FR2 and NFR14.
- [ ] `EV-UI-02`: Role-specific dashboard after login. Supports FR4 and the implemented part of FR43.
- [ ] `EV-UI-03`: Receptionist creates a clearly synthetic patient; show generated global patient ID. Supports FR11–FR12.
- [ ] `EV-UI-04`: Appointment created with branch, patient, doctor and time. Supports the implemented part of FR16–FR18.
- [ ] `EV-UI-05`: Overlapping appointment rejected with a useful, non-sensitive message. Supports FR19.
- [ ] `EV-UI-06`: Doctor appends a note to the correct patient. Supports the implemented part of FR14 and FR23.
- [ ] `EV-UI-07`: Doctor creates a lab order and technician releases a result. Supports FR31–FR32.
- [ ] `EV-UI-08`: Pharmacist dispense succeeds and stock decreases; separately capture insufficient/expired stock rejection. Supports FR26, FR28 and FR30.
- [ ] `EV-UI-09`: Itemised invoice/status view. Supports the implemented part of FR36–FR39.
- [ ] `EV-UI-10`: Restricted audit view containing actor, action, object, outcome and time. Supports NFR12; it is not approval evidence for proposed FR55.
- [ ] `EV-UI-11`: Responsive mobile view and installed/offline application shell. Supports partial NFR13/NFR15 only after browser/accessibility checks.

Before capture, reset/seed the demo, use synthetic names, hide browser tokens/cookies, and include enough of the UI to identify the role and result.

## Test evidence

- [ ] `EV-TEST-01`: Complete automated test command and terminal result, including date, revision and pass/fail counts.
- [ ] `EV-TEST-02`: Positive and negative login; password hash inspection; logout; idle-session expiry.
- [ ] `EV-TEST-03`: Role/permission matrix: every unauthorised sensitive route returns a denial.
- [ ] `EV-TEST-04`: Branch-scope and patient-self-scope isolation tests.
- [ ] `EV-TEST-05`: Patient validation and unique global identifier tests.
- [ ] `EV-TEST-06`: Appointment overlap, boundary and concurrent-request tests.
- [ ] `EV-TEST-07`: Clinical note author attribution and append/history test.
- [ ] `EV-TEST-08`: Lab role and valid status-transition tests.
- [ ] `EV-TEST-09`: Pharmacy success, insufficient stock, zero/negative quantity and expired-stock tests.
- [ ] `EV-TEST-10`: Invoice amount/status validation and patient-scope tests.
- [ ] `EV-TEST-11`: Audit completeness for successful/failed login and every material write.
- [ ] `EV-TEST-12`: P95 page/API timing with environment and dataset recorded.
- [ ] `EV-TEST-13`: Responsive-browser and WCAG 2.2 AA automated/manual results.
- [ ] `EV-TEST-14`: Database backup/restore drill with duration and reconciliation checks, when implemented.

Keep raw test output or a generated report in a dated evidence folder. A cropped “all tests passed” image without command, revision or test list is weak evidence.

## GitHub contribution evidence

- [ ] Repository and default branch link.
- [ ] Commit(s) for each member, with meaningful message and mapped task/requirement.
- [ ] Pull request(s), review comments and merge result where the team uses reviews.
- [ ] Exact revision/tag used for screenshots and test results.
- [ ] README/setup and schema/migration changes linked to their author.

Do not assign a commit to a person who did not author the work. Local unpushed changes are not GitHub evidence.

## Trello and iteration evidence

- [ ] Card links for each implemented story, with owner, acceptance criteria and requirement ID.
- [ ] Movement/history showing Product Backlog → Sprint Backlog → Working → Testing → Done.
- [ ] Test/evidence link attached to each “Done” card.
- [ ] Sprint/weekly snapshot and dated retrospective or review action.
- [ ] Blocked/deferred cards retained with reasons rather than marked complete.

A Trello card alone proves planning, not implementation.

## Report placeholders that require human/external evidence

Leave these as `Pending` until genuine evidence exists:

- [ ] Lecturer feedback: exact feedback, date/source and the documented response/change.
- [ ] Weekly forum iterations: actual forum post URLs or LMS references.
- [ ] Supervisor/stakeholder approval of the PWA interpretation.
- [ ] Individual accept/reject/defer decisions for proposed FR49–FR64.
- [ ] Team member contribution confirmation and author attribution.
- [ ] Client/supervisor acceptance-test sign-off.

Never invent names, dates, quotations, approvals, links, test results or contribution records. The lecturer’s later approval to use generative AI should be retained separately as authentic assessment-process evidence if the course requires it; it is not proof that a system requirement passed.

## Release evidence package

- [ ] `REQUIREMENTS_TRACEABILITY.md` updated from the exact release revision.
- [ ] Test results and limitations.
- [ ] Sanitised screenshots with evidence IDs.
- [ ] Seed/reset instructions and synthetic-data notice.
- [ ] Architecture and security/privacy notes.
- [ ] GitHub revision plus Trello card links.
- [ ] Open defects, planned requirements and approval-gated requirements clearly separated.
