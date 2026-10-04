# Administrative mutation recovery — 2026-10-04

## Changed behavior

Product creation, updates, variant replacement, activation/deactivation and deletion commit their audit intents with business changes. Product lifecycle operations lock the parent and its variants in deterministic order before reading the replacement diff or history. Foreign/deleted variant IDs return VARIANT_CHANGED (409), instead of silently creating another variant. Variants removed from a product with order history now retain manual deactivation, protecting them from automatic stock repair. Parent/variant activation and deactivation are atomic, including concurrent deactivation of the last two variants. Activation rejects archived ingredients and queues a revisioned repair in one SQL statement for eligible variants. Duplicate product-name races map to 409.

Subcategory creation, mutation, deletion and bundle-location ensure now capture audit work transactionally. Deactivation propagates through two set-based writes, replacing two writes per product. The subcategory row is locked for update/delete, so dependency checks and propagation share a transaction. PATCH parameter validation now rejects malformed/out-of-range IDs before parseInt can reinterpret them. Bundle-location provisioning is independently idempotent setup; it remains a separate transaction from subsequent product creation.

Staff creation includes its required audit and internal notification in the transaction. Staff updates increment session versions with audit capture; local socket session revocation happens after commit. Toggles derive the new state from the locked current user, rather than a stale pre-read. Deletion locks the user and uses EXISTS checks for recorded order, stock, drawer, refund and actor history. Unique-email races return 409. Password hashing, invitation-token issuance and email delivery remain outside the staff-creation transaction; mail failures still return emailed=false. Invitation warnings expose only an error code, not a full provider error object.

Settings initializes the singleton using conflict-safe createMany/ON CONFLICT, then locks the row before computing its diff. Real changes, audit and notification commit together; identical concurrent saves produce one intent. The PostgreSQL tests caught a first-save race in the initial empty Prisma upsert; the implementation was corrected and the full suite passed. The existing 60-second local payment cache and fallback policy are unchanged; multi-replica coherence/failure policy was not established by this batch.

## Validation

- Backend suite: 800 passed; 89 optional database cases skipped.
- All 17 administrative PostgreSQL cases passed in a disposable Supabase schema: rollback/retry, settings first-save concurrency, category propagation, foreign variant rejection, product history, image ordering, activation, bundle ensure, staff session and deletion behavior.
- Seven HTTP boundary cases cover unauthenticated/cashier/kitchen denial across 16 mutation routes plus four malformed subcategory IDs. These use controller doubles to verify routing boundaries, not live authentication/session issuance.
- Existing eight image-persistence checks passed with transaction-aware fixtures.
- Final expanded staff-history SQL was checked separately after the full database run.
- Focused source lint and diff whitespace checks passed.

No migration, schema or dependency change is required. Restart the backend after deploying this code; the prior domain-effects migration is required and the user reports it applied. No production business records were changed during testing.

## Limits and next work

The shared worker delivers committed intents without replaying mutations. Immediate socket broadcasts and staff invitation outcome audits remain best-effort; authentication/email recovery will address the latter. Detailed product responses still reload after commit and can fail if the database disappears afterward. Actual backend process killing, browser flows, live Cloudinary/mail and representative large-dataset latency are **Not verified**; acceptance cases are in FINAL_TESTING_CHECKLIST.md. Five-second mutation deadlines remain bounds rather than performance measurements.

M14 remains partial: authentication (including invitation outcomes), reports and ML producers still need durable follow-up policies. Nine original audit findings remain outstanding.
