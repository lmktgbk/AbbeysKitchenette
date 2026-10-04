# Authentication feature boundaries

Routes apply validation, rate limits, and HTTP authentication. Controllers manage
cookies and API envelopes. `auth.service.js` coordinates credentials, challenges,
mail, and local realtime revocation; `auth.repository.js` owns persisted credential
writes and their transaction guards.

| Helper | Responsibility |
| --- | --- |
| `auth.session.js` | Shared HTTP/WebSocket session resolution and public profile projection. |
| `auth.accountLock.js` | Account-first transaction locks for credential workflows. |
| `auth.otp.js` | Login code issuance, attempt budgets, one-time consumption, and audit intent. |
| `auth.emailChange.js` | Password-confirmed recovery-address verification and credential rotation. |
| `auth.effects.js` | Durable auth audit intent and mail outcome handling. |

OTP belongs here rather than `utils`: it depends on auth state, database
transactions, and audit intent. These helpers are feature implementations, not
independent services or a new authentication framework.

## Follow a login

Password verification yields a short-lived login challenge, not an authenticated
session. OTP verification checks the account again, consumes its code once, and
records successful login before the service signs a session token. Both HTTP and
WebSocket authentication resolve that session against the current active account,
role, and session version. A JWT signature alone does not bypass revocation.

## Credential transaction rules

Acquire the account lock before dependent OTP/reset/email-change rows. Wrong code
attempts return an outcome from the transaction and throw afterward: throwing
inside would roll back the attempt counter. Code digests are purpose-bound;
login and recovery-address verification must not share interchangeable codes.

Password hashing and SMTP calls stay outside account locks. Saved challenge
issuance precedes delivery, and a failed send invalidates only its own challenge.
SMTP acceptance is not proof of inbox delivery. Completion notice failure cannot
undo an email change already committed.

Logout and credential changes invalidate prior sessions through persisted state.
Successful password/email changes may issue the current browser a replacement
token while older sessions remain invalid. Local WebSocket closure supplements
database-backed revocation; it does not provide cross-replica event fanout.

## Refactoring limits

Keep purpose-specific token validation and explicit public-field allowlists.
Similar-looking OTP, reset, and email-change paths have different expiry, failure,
and ownership rules. Do not merge them merely to reduce filenames or code length.
