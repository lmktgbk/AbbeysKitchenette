# Authentication remediation — 2026-10-03

This is the first remediation batch for the audit of `code-revision` at
`530c4cf064f080ef304c8ba66814d9ecd1f7d8ec`. The main audit report is a historical
baseline; this document describes the implementation and verification now added.

## Behavior and data flow

1. Password login validates the portal, active account, location policy and
   password. It issues a signed ten-minute **login challenge** in an HttpOnly,
   SameSite=Strict cookie scoped to `/api/auth`. The response contains the public
   profile and `requiresOtp`, but no challenge or session bearer token.
2. A database OTP row identifies that challenge. Its six-digit code is stored as
   an HMAC digest, not plaintext. Issuance/resend/verification lock the account row
   in short transactions. Wrong-attempt increments commit before authentication
   errors are returned; successful verification consumes the row exactly once.
3. Verify and resend require both the password challenge cookie and matching user
   UUID. They repeat active-account, role/version, lockout and staff-location
   checks. Resend retains the original challenge expiration and cannot revive a
   consumed challenge. Failed mail delivery removes only the failed code, allowing
   another password login without waiting on an undelivered code's cooldown.
4. Successful OTP verification sets the session HttpOnly cookie and clears the
   challenge cookie. JWT issuer, HS256 algorithm, purpose, audience, expiry,
   current role and database session version are checked by the shared REST/WS
   resolver. Reset/challenge/legacy JWTs cannot authenticate as sessions.
5. Logout revokes **all sessions for that account**, removes outstanding OTPs and
   recovery links, closes local authenticated sockets, and clears the cookies.
   The confirmation text discloses account-wide sign-out. A failed server request
   leaves the frontend session intact and shows a retryable error; an already
   expired 401 is treated as signed out.
6. Password reset claims an unused, unexpired hashed reset-token row and updates
   the password/version in one transaction. A failed password write rolls back
   token consumption. Password changes likewise guard the previous hash, revoke
   other sessions/challenges/links, and renew the current browser's session cookie.
   Every reset link has a random JWT identifier, including same-second requests.
7. Staff edits, activation changes and deletion invalidate sessions. Reactivation
   cannot revive a token issued before deactivation. Local sockets close
   immediately; other API instances enforce revocation on REST requests and WS
   subscription checks, and revalidate idle sockets each heartbeat (default 25s).
   Remote-instance idle WS revocation is therefore bounded by the heartbeat, not
   an instantaneous shared-broker guarantee. The hub also stops sending expired
   authenticated session events.
8. Client session helpers coordinate the auth query, Zustand state and cookie
   socket reconnection. Switching operators clears prior cached API data. A 401
   clears only the session generation that issued its request, so a delayed old
   response cannot sign out a newly logged-in operator or rotated session.

Manual Cash/GCash/Maya payment recording, order pricing, stock consumption and
financial transaction logic are unchanged by this batch.

## Finding status

| Finding | Implementation status | Remaining evidence |
|---|---|---|
| C01 reset token accepted as session | Fixed in the shared resolver | Verify deployed JWT contract after migration/restart |
| H01 OTP not bound to password challenge | Fixed, with hashed single-use challenge rows | Real email/browser/Supabase deployment regression |
| H02 session/socket revocation | Implemented; local close and heartbeat revalidation tested | Multi-instance deployed timing and capacity |
| M01 non-atomic counters/reset consumption | Guarded transactions and atomic counters implemented | Real PostgreSQL contention/rollback testing |
| M11 JSON session-token exposure | Removed from browser auth responses | Inspect deployed responses/cookies |

Other audit findings remain open. In particular, profile email reverification
(M02), order resource/action authorization and financial/inventory consistency
are **not** claimed fixed. Some baseline tests intentionally still characterize
the remaining unsafe business behavior; a passing overall suite is not a
production-readiness certificate.

## Verification performed

- **303 tests pass in 9 files**: original checks, converted auth regressions,
  225 HTTP route-boundary cases, 23 auth-flow/security cases and 5 client-session
  cases. The auth flows use actual Express routes, validation, controllers and
  services, plus real loopback HTTP and WebSocket connections.
- PostgreSQL operations use an isolated transactional test double. Its rollback
  and serialization support exercise the application's transaction boundaries;
  it is **not evidence of PostgreSQL's actual locking/isolation semantics**.
- Three roles successfully complete password → OTP → session → `/auth/me`.
- Negative tests cover missing/wrong/expired challenges, inactive/changed accounts,
  location changes, exhausted OTP attempts, replay, parallel verification/reset,
  used/expired tokens, cookie/token exposure, mail failure, password-write failure,
  local logout, idle WS expiry and simulated cross-instance version revocation.
- Client tests cover operator cache isolation, failed/expired logout, protected
  API 401 handling and delayed responses from an older session.
- Changed frontend files pass ESLint. Full frontend lint still has the baseline
  unrelated failures and is not claimed clean.
- Frontend production build passes with the existing large-chunk warning.
- Prisma schema validation and local client generation pass; neither command
  applied SQL or connected to Supabase for a data mutation.
- No live database data, real emails, uploads, payments or external integration
  writes were used for testing.

## Supabase rollout prerequisite

**Update 2026-10-03:** The configured Supabase database now has a registered
Prisma baseline and the applied `20261003000000_auth_sessions` migration.
Migration status is current and the database-to-Prisma schema diff is empty.
The migration was rehearsed in an isolated PostgreSQL schema and rolled back
before deployment. See `server/prisma/MIGRATIONS.md` for subsequent deployments.
The instructions below remain the rollout checklist for other installations;
full deployed browser/email authentication checks are still outstanding.

`server/prisma/SEC05_auth_sessions.sql` adds `User.session_version`, adds an OTP
`challenge_id` unique index, and widens `otp_codes.code` for hashed codes. Existing
orders, receipts, inventory, recipes and recorded payments are not changed by the
SQL. The existing `User`, `otp_codes` and `password_reset_tokens` tables must
already be present (including the earlier SEC02/SEC03 setup).

1. Rehearse SEC05 in a disposable Supabase/PostgreSQL environment and inspect the
   resulting columns/index. Run real DB tests for concurrent OTP/reset/login
   attempts, rollback and staff activation/version changes.
2. Confirm the deployment has a configured working SMTP/Gmail transport,
   production `NODE_ENV`, HTTPS, the intended same-site frontend/API topology,
   `CLIENT_URL`, a strong JWT secret and the Supabase runtime database credentials.
   Secure production cookies require HTTPS. The challenge cookie assumes the
   existing `/api/auth` mount.
3. During the release, apply SEC05 **before** any new API instance starts using
   the new Prisma fields. Use the Supabase SQL editor or the established approved
   migration mechanism. Do not substitute `db push`, seed, cleanup or reset scripts
   against production.
4. Regenerate the deployment Prisma client with `npm.cmd exec -- prisma generate`
   in `server`, build the updated frontend, and replace all old API instances.
   Keep old insecure and new authentication code from serving together after the
   cutover. Existing sessions and old emailed reset links must be replaced by
   fresh login/recovery requests.
5. Verify the complete three-role login/OTP/logout/password-reset flow using
   deployment test accounts; inspect cookie attributes and confirm JWTs are absent
   from response bodies. Test replay, cross-role access, WS revocation and staff
   deactivation/reactivation before opening normal traffic.

The additive schema changes can remain if application rollback is necessary, but
rolling back to the original authentication code restores the known vulnerabilities.
Treat such a rollback as a security incident/restricted-service decision, not a
safe public release.

## Commands for local verification

From `server`:

```powershell
npm.cmd test
npm.cmd exec -- prisma validate
npm.cmd exec -- prisma generate
```

From `client`:

```powershell
npm.cmd run build
npm.cmd exec -- eslint src/config/axios.js src/features/auth/api.js src/features/auth/components/EmailForm.jsx src/features/auth/components/OtpForm.jsx src/features/auth/session.js src/features/auth/useLogout.js src/features/orders/components/KitchenHeader.jsx src/features/orders/pages/PosTerminal.jsx src/features/profile/components/ProfileMenu.jsx src/features/profile/query.js src/layouts/admin/AvatarDropdown.jsx
```
