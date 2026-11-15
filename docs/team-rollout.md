# Maple team workspace rollout

Status: local implementation; no production migration, account creation, salary entry or employee communication has occurred.

## Included

- Website enquiries, Contacts, bookings and availability share the existing MongoDB API.
- Atomic booking claims and safe unbooked-slot removal. No automatic availability generation on read failure.
- Forms acknowledge saved submissions and retain input on failure.
- Individual sessions in HttpOnly/SameSite cookies, current-account checks, revocation, disable/enable and roles.
- Owner: studio, employee management, accounts, payroll. Admin: studio, employee management and leave review; no payroll or account management. Member: directory, own attendance/leave and password changes.
- Employee contract start/status/reference (document signing remains external), daily attendance, leave requests/review.
- Payroll in INR minor units, one record per employee/month; draft editing, approval locks amounts, external-payment reference, actor history. Attendance/leave adjustments are entered explicitly. Tax/statutory calculation, disbursement, bank details, payslip distribution and accounting integration are not implemented.

## Initial setup

Keep the approved onboarding roster outside the repository. Each row contains name, email, role (owner/admin/member), contractStart (YYYY-MM-DD), and passwordEnv (the name of its unique secret environment variable). Do not put passwords in the roster file or commit employee records.

No salaries are assumed. Add employee records in Team, and create sign-in accounts separately in Settings. Changing employee employment status does not disable the login; disable account access in Settings during offboarding. Payroll is restricted to Owners in this first version.

## Pre-deployment and cutover

1. Confirm the current VPS deployment and MongoDB database. Use Node 22. Preserve its existing secrets and GROWTH_API_ORIGIN. Backend should remain bound to loopback behind the trusted proxy. The proxy must overwrite client IP forwarding headers; TRUST_PROXY must match actual hops.
2. Take a timestamped MongoDB backup, a complete copy of data/ (including CMS/media), and the current deployment revision. Verify a restore on an isolated database. Do not treat successful backup creation as restore verification.
3. Stop website enquiry/booking writes for the short migration window (maintenance response). Keep both legacy JSON files from the final snapshot. If an absent store truly means no data, review that explicitly before creating an empty input file. Malformed data must be fixed in the snapshot, never silently skipped.
4. Deploy the backend candidate and create its model indexes. Run from backend: `LEGACY_DATA_DIR=/absolute/snapshot/data npm run migrate:json -- --dry-run`; verify row counts. Then run the same command without `--dry-run`. It validates the whole input and only inserts absent records. Keep legacy files unchanged. Partially interrupted imports are safe to rerun.
5. Provision the approved accounts with `TEAM_BOOTSTRAP_FILE=/absolute/private/roster.json npm run bootstrap:team`, supplying the unique password values named by each row’s passwordEnv through the secure process environment, not shell command arguments/history. This creates missing accounts and records only; reruns preserve passwords and data. It refuses to overwrite a conflicting existing role. Remove the bootstrap password variables immediately afterward. No mail is sent.
6. Deploy Next with GROWTH_API_ORIGIN pointing to that backend. Verify HTTPS, secure cookies, login/refresh/logout, enquiry submission → both inbox views, one booking claim, reopening a booked slot, and role denials. Do this before reopening public writes.
7. Remove LEGACY_ADMIN_KEY from the backend and MAPLE_ADMIN_KEY from the website after the named owner account is verified. Retaining LEGACY_ADMIN_KEY would retain old studio access; the Team API always rejects legacy access. Verify the old key gets 401.
8. Confirm persistent CMS/media paths and scheduled backups. Re-enable public writes. Record release revision and verification evidence.

## Rollback

Keep public writes paused while diagnosing a failed cutover. Restore the prior deployment only if no new Mongo-backed submissions have been accepted. Once new submissions exist, rolling back to the old JSON writers splits the data again: export/reconcile those records before reopening legacy writes. Prefer a forward fix to the adapter. Never restore old JSON bookings over newer database bookings.

## Operations

- Monthly pay remains a draft until reviewed. Approval locks it; only approved payroll can be marked paid, with the external reference. No money moves through this app.
- Payroll correction/voiding after approval is not yet exposed; review carefully before approval. Keep payment evidence in your existing secure Drive folder and use its reference.
- Leave requests record working days supplied by the employee; there is no holiday-calendar or leave-balance engine yet. Another administrator must review an administrator's own leave.
- Contract status is a record of an externally signed contract, not a legal signature service.
- CMS content and media still use existing persistent files; they are not moved to Mongo by this release. The CMS audit log is still bounded/best-effort, now with verified actor attribution.
