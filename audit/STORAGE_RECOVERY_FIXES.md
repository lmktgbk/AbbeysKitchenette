# Durable image ownership and cleanup

## Implemented behavior

Successful product/avatar replacement queues the previous image for deletion in the same database transaction that saves the new image. Post-commit cleanup wakes the worker promptly; its periodic fallback runs every 60 seconds. A failed or rolled-back save keeps the previous image. Shared images remain until their last recognized product/profile reference disappears. Provider outages or a backlog can delay deletion; cleanup does not block the save response.

The server reserves a unique asset identity before calling Cloudinary, disables overwriting, and records verified upload success before returning the file to the save flow. Database triggers attach the asset and queue removed references atomically. Indexed Cloudinary identities recognize version-equivalent URLs. The cleanup transaction takes a row lock, checks references and establishes a deletion fence; a late save receives a safe 409 IMAGE_NOT_AVAILABLE instead of attaching an image being deleted.

Claims use short transactions (five-second timeout, 2.5-second acquisition wait). Provider deletion runs outside transactions, with a 31-second overall deadline. Two-minute leases recover interrupted work; conditional completion rejects stale owners. Successful deletion and already-missing assets both complete safely. Failures retry with capped exponential backoff while preserving the deletion fence. Deleted identities remain tombstones and cannot be reused.

Known successful but unattached uploads have a 24-hour quarantine; definitive rejected saves shorten that to one hour. An upload whose provider outcome is unknown becomes blocked after its quarantine, rather than being blindly deleted. A late verified callback can resolve that upload. Process termination before recording provider success can therefore leave an asset requiring operator review. This is deliberate preservation of uncertain outcomes, not a guarantee that every orphan is deleted automatically.

## Deployment and operations

Migration `20261003090000_storage_assets` creates the ledger, constraints, RLS, reference indexes and lifecycle triggers. It backfills existing recognized product/profile URLs without making provider calls. It has **not been applied to the public database**. Stop the older backend/cleanup workers, apply reviewed pending migrations, generate the client and start the new backend. Older inline deletion code does not participate in the new deletion fence; avoid overlapping versions during rollout.

Run from `server`:

```powershell
npm.cmd run db:migrate:deploy
npm.cmd run db:generate
```

Apply the migration before starting this code; uploads fail safely with 503 if the ledger is unavailable. Configure all Cloudinary credentials to enable the worker. Only the configured account is processed. Historical orphan assets without current references are not discovered by this migration. Transformed, external and manually assigned URLs outside the strict supported identity pattern are retained.

Review blocked assets and persistent failures through restricted database access:

```sql
SELECT public_id, state, last_error, attempts, created_at, updated_at
FROM public.storage_assets
WHERE state = 'blocked' OR last_error IS NOT NULL
ORDER BY updated_at;
```

Confirm provider identity, upload outcome and current references before any controlled resolution. There is no operator resolution UI or verified alert integration yet. Do not blindly reset blocked records or delete provider assets. Database backups do not restore Cloudinary files; retain a separate storage recovery strategy.

The server's existing 20-second forced shutdown may interrupt a deletion with a 31-second bound. The durable lease recovers that work after restart; graceful shutdown cannot promise every provider call finishes before exit.

Cloudinary deletion requests include CDN invalidation. A cached old URL can remain available briefly while invalidation propagates; verify provider deletion separately from cached browser behavior. See [Cloudinary invalidation documentation](https://cloudinary.com/documentation/invalidate_cached_media_assets_on_the_cdn).

## Verification

- Backend suite: 718 passed; 43 optional database cases skipped in the ordinary run.
- Separately executed: all 11 new PostgreSQL storage tests passed in a generated disposable Supabase schema, replaying all 11 migrations. The schema was removed afterwards. No public business rows were changed.
- Database cases cover backfill/RLS/indexes, atomic attachment/unlink, rollback, shared/version-equivalent references, concurrent claims and saves, real Prisma conflict mapping, expired leases/stale owners, uncertain uploads, account isolation, product replacement/deletion and tombstones.
- HTTP/provider-mocked cases cover reservation before upload, persistence before response, safe reservation/persistence failure, late success after abort, failed metadata/save preservation and durable cleanup. Worker cases cover bounded batches, timeout, retries, wake coalescing and shutdown.
- Prisma validation and client generation passed.

Live Cloudinary delivery/deletion, browser acceptance, hosting behavior, alerting and load capacity: **Not verified**. Acceptance cases are consolidated in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md).
