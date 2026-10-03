# Recovery email protection (M02)

## Behavior

Changing your own recovery email requires your current password and a six-digit code delivered to the new mailbox. Until verification, the old email and name remain active. Name-only edits still save immediately. The profile UI explains this distinction and supports code entry or requesting another code/address.

The server creates one replaceable request per account, with a ten-minute expiry, one-minute issuance cooldown and five committed verification attempts. Codes use a purpose-specific keyed SHA-256 digest; raw codes and passwords are neither stored in the request table nor returned by the API. Five incorrect password confirmations invoke the existing account lockout. An authenticated-account route limiter adds a per-process outer budget; database counters/cooldowns protect requests across instances.

The current password is checked outside the transaction. The transaction then locks the account and rechecks its password hash, recovery address, active/lock state and session version. Confirmation locks in the same account-first order, requires the requesting account/session version and unexpired challenge, then atomically changes the email/name, increments the session version, consumes the request, and removes login codes and unused password-reset credentials. A competing address claim is rejected by the existing unique email constraint without consuming the request. Failed code attempts commit before an error is returned.

Other browser profiles/devices lose their old sessions. Local sockets are closed immediately; other instances use the existing session-version checks. The successful caller receives a replacement HttpOnly cookie and the frontend reconnects realtime using that cookie. Browser tabs sharing one cookie also share the replacement session, as usual.

The admin staff-edit route cannot change an administrator's own address as a shortcut; it directs them to My Profile. Existing authorized admin edits to other staff accounts remain an administrative operation. Broader admin reauthentication policy is outside this self-service finding's scope.

## Failure behavior and limits

SMTP work runs outside database locks. The previous mailbox receives a request notice before the verification code is submitted to the new mailbox. A failure in either send removes only that request ID, preserving newer requests. After confirmation, a completion notice is also attempted; failure produces a generic warning and does not turn an already committed change into an API error. Completion notification has no durable retry/outbox yet. SMTP acceptance does not prove inbox delivery.

SMTP connection/greeting timeouts are 10 seconds and socket inactivity timeout is 30 seconds. These are stage/inactivity budgets, not an absolute deadline for an entire email or multi-email workflow. Existing development mail suppression remains; configure a real transport for acceptance tests.

If the modal closes, the browser refreshes, or the request response is lost, the old address remains usable until verification. Reopen the profile and request a fresh code after the cooldown; old request IDs cannot verify a replacement. Pending challenges are kept only in component memory and the bounded per-account server row, never browser storage or URLs. Expired rows are replaced by the next request and removed with the account; periodic retention cleanup is not implemented.

## Verification

- 491 backend tests pass across 15 files, including 23 new recovery-email HTTP/service regressions. They exercise all roles, missing/wrong passwords, expiry, disabled/locked/changed accounts, cross-account access, stale requests, wrong-code budgets, replay, mail failures, rollback, admin shortcut denial and cookie-only sessions.
- Six additional opt-in tests pass against real PostgreSQL and the generated Prisma Client in a disposable schema. They exercise concurrent issuance, six concurrent confirmations, eight concurrent wrong guesses, unique-email conflicts, injected cleanup failure/rollback and session revocation. The schema was removed afterward; no public business rows were modified.
- All seven migrations replay successfully in a separate transaction that is rolled back, including the new table's RLS and prior constraints/indexes.
- Prisma validation and Client generation pass. Frontend production build and lint for all changed profile files pass. The existing large frontend bundle warning remains.

Real mailbox delivery, deployed browser interaction, multi-instance socket recovery and production latency: **Not verified**. Final manual cases remain in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md).

## Deployment

Migration `20261003050000_email_change_requests` is prepared and rehearsed, **not applied to the shared database**. The previous six migrations remain applied. The additive table has UUID identity, a unique account key, cascading account FK, an attempt-count CHECK constraint and RLS with no public access policy.

From `server`, before running the updated backend:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

Deploy the matching frontend/backend, restart backend processes and ensure no old backend instance continues serving the unverified email-write route. This migration does not change existing business rows. Reverting the backend to the previous implementation would restore the insecure profile behavior.

For repeatable isolated PostgreSQL verification from `server`:

```powershell
$env:EMAIL_CHANGE_DB_CHECK = '1'
npm.cmd test -- --run tests/emailChange.database.test.js
Remove-Item Env:EMAIL_CHANGE_DB_CHECK
```

The suite requires schema-creation permission through DIRECT_URL and verifies the isolated search path before any fixture write. Never substitute public tables if isolation cannot be established. The opt-in suite is skipped during ordinary tests.
