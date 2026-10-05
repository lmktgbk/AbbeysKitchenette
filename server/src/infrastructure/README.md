# Shared server infrastructure

Business workflows remain in `src/modules`. This folder contains mechanisms used
by those workflows; moving a file here does not change its transaction boundaries
or retry policy.

| Folder | Responsibility |
| --- | --- |
| `effects` | Record audit/notification intent inside the business transaction and deliver it durably. |
| `storage` | Validate uploaded images, track asset ownership, and schedule/retry safe provider cleanup through `imageCleanup.js`. |
| `integrations` | Email delivery, Gemini client, ML requests/admission, and Sheets snapshots/transport. |
| `realtime` | WebSocket authentication, bounded admission, session invalidation, and process-local fanout. |
| `operations` | Readiness, redacted telemetry, and graceful process shutdown. |
| `rateLimit` | Maintain persisted rate-limit records. |

## Following a write

A feature service owns the business transaction. It supplies the transaction to
its repository and `recordEffects`; neither should independently commit part of
that workflow. The effects worker delivers saved intent after the business commit.
Delivery failure must not reverse an already committed business operation.

Storage cleanup follows persisted asset ownership. A failed or interrupted delete
remains recoverable; request handlers must not substitute untracked provider
deletion for this lifecycle.

The entry point starts and drains workers. Controllers should not start timers or
workers. Provider requests should stay outside database transactions unless the
existing workflow explicitly requires otherwise.

Anomaly trigger admission and execution live in `modules/anomalyDetection` because
they own feature-specific rules. The effects repository invokes that admission
within its delivery transaction; this dependency is intentional and ensures that
an audit event cannot be marked delivered without recording its required scan.

## Aligned file ownership

- effects: effects.js, effects.repository.js, effects.worker.js.
- storage: storage.repository.js, storage.worker.js, cloudinary.js (upload
  adapter), imageValidation.js, imageCleanup.js (safe deletion scheduling).
- integrations: email.js, gemini.js, ml/ml.client.js, ml/ml.mutation.js,
  and sheets/sheets.{outbox,repository,service,transport}.js.
- realtime: the existing socket implementation moved intact from src/realtime.
- rateLimit: rateLimit.store.js and rateLimit.maintenance.js. Express limiter
  declarations remain in middleware/rateLimit.middleware.js.
- operations: readiness.js, observability.js, shutdown.js.

Configuration retains Cloudinary/Nodemailer setup alongside environment, database,
cookie, token, and time settings. OTP stays feature-owned in auth/auth.otp.js.
The shared business resolver services/advisoryEffects.js remains outside infrastructure
because it resolves recommendation state rather than delivering provider effects.
These existing responsibility-specific files are deliberate additions to the
illustrative structure, not duplicate implementations or compatibility wrappers.

All imports, test mocks, and the Sheets maintenance script use the new locations.
Moving these files does not change worker timing, leases, queries, or transaction
ownership. Hosted startup and live provider acceptance still require verification.
