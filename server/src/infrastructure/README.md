# Shared server infrastructure

Business workflows remain in `src/modules`. This folder contains mechanisms used
by those workflows; moving a file here does not change its transaction boundaries
or retry policy.

| Folder | Responsibility |
| --- | --- |
| `effects` | Record audit/notification intent inside the business transaction and deliver it durably. |
| `storage` | Validate uploaded images, track asset ownership, and retry safe provider cleanup. |
| `integrations/ml` | Bound external ML requests and record admission outcomes without replaying uncertain requests. |
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

## Incremental cleanup

The remaining `src/services` helpers and existing realtime, Sheets, and provider
configuration folders are deferred to later batches. Their placement is not an
invitation to duplicate them here. Move an implementation and update its callers;
avoid compatibility wrappers that leave two paths to the same responsibility.
