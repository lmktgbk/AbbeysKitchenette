# Server cleanup — batch 1

This batch relocates 15 implementations out of the broad `src/services` folder:
durable effects, image storage, ML transport/admission, process operations,
rate-limit maintenance, and feature-owned anomaly triggers. Existing filenames,
exports, transactions, queries, timeouts, and retry behavior are preserved.
Application imports and test imports/mocks follow the new paths; no forwarding
wrappers or duplicate implementations were introduced.

See `server/src/infrastructure/README.md` for responsibilities and the write flow.
The remaining services, realtime implementation, Sheets integration, and provider
configuration are intentionally deferred. This is the first structural batch,
not completion of the full server cleanup.

## Verification

- Before relocation: 826 tests passed; 117 opt-in database tests skipped.
- After relocation: 826 tests passed; the same 117 database tests skipped.
- Existing database regression files were updated to import the relocated code.
- No database schema, migration, HTTP contract, or client/ML implementation changed.
- Live browser/provider workflows and database integration execution for this
  batch: **Not verified**.

Next: review orders and inventory ownership, readability, and transaction comments
without combining structural edits with changes to business behavior.
