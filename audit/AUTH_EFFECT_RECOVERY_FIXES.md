# Authentication and invitation audit recovery — 2026-10-04

## Implementation

OTP issuance records an OTP_REQUESTED intent with a challenge identifier and unresolved delivery state. Successful consumption, last-login timestamp, OTP_VERIFIED and LOGIN_SUCCESS intents now share the account-locked transaction. A required-intent failure restores the usable OTP and original timestamp; no session cookie is issued. Concurrent consumption has one winner. Wrong-code attempt writes remain committed independently of failure logging, preserving brute-force protection when the audit queue is unavailable.

Password change/reset, successful version-conditional logout, profile and avatar writes capture audit intents with their database changes. Logout replays against an old version add no event. Profile/avatar writes also require active accounts and, when provided by the HTTP layer, the current session version. Local session revocation and old-avatar cleanup follow successful commit. Removed controller audit hooks avoid duplicate records and post-success capture windows. Password hashing and SMTP do not hold account locks; new transaction bounds are explicitly five seconds where changed.

Reset-token issuance atomically records an intent with subject, actor, issuance ID and delivery-not-confirmed marker. Staff invitations identify the admin as actor and invited staff as subject. A shared email adapter records provider-accepted or unconfirmed outcomes outside business transactions. It stores no token, code, email body, password, hash or recipient in audit payloads. Reset mail exceptions return the same generic response as unknown/inactive addresses; invitation mail failures preserve the created account and report emailed=false. Failed sends attempt fenced invalidation of only their own token/code/request, preserving newer requests.

Recovery-email request/confirmation audits are transactional. Request notices, verification emails and completion notices use the same outcome adapter. Completion mail failure cannot roll back a verified account change. Existing cooldowns, attempt limits, digest storage, expected-password/version checks and replay protection remain enforced.

Failed-login audits use a keyed HMAC fingerprint of the normalized submitted address and a bounded existing error reason. Capture is awaited but independent of the denial/failed-attempt counter. If storage is unavailable, authentication remains denied and a sanitized warning identifies lost capture. Password/code verification outcomes are never converted into authentication success because logging failed.

## Email uncertainty policy

SMTP acceptance is not inbox delivery. The issuance/change intent commits before SMTP, so a crash during sending leaves durable evidence of an unresolved attempt. Delivery outcome capture is best-effort after the external call: queue failure emits a sanitized warning and retains the issuance/change record. Tokens/codes are never persisted in the domain-effect queue or automatically replayed. Requesting another code/link uses the existing guarded flow. If failure cleanup cannot reach storage, expiry and account-version checks remain the bounds; immediate invalidation is not guaranteed. Cleanup and provider outcomes cannot form one ACID transaction with PostgreSQL.

## Validation and rollout

Focused authentication/email/avatar regressions passed. Final backend suite passed 808 tests with 103 optional database cases skipped; the focused email suite passed all 25 cases. All 14 new PostgreSQL scenarios passed in a disposable Supabase schema. Final invitation attribution and the prior staff-creation regression were checked separately after the actor/subject adjustment. Focused lint and whitespace checks passed. No application accounts or provider mailboxes were used for database tests.

No new migration, schema or dependency is needed; the prior domain-effects migration remains required and the user reports it applied. Restart the backend to load changes. Full browser, hosted cookie/proxy/WSS, real inbox delivery, process-kill ambiguity and representative load remain **Not verified** in FINAL_TESTING_CHECKLIST.md. The queue adds bounded database writes per authentication action; no production latency benchmark is claimed.

M14 remains partially addressed: report and ML producers plus their outcome policies are next. Failure-audit/outcome loss during database outages remains explicitly visible through warnings rather than silently granting access or replaying credential emails. Nine original findings remain outstanding.
