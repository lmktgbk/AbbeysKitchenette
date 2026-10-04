# Report and intelligence follow-up recovery

Implemented on code-revision. No new migration is required; the existing domain_effects table must be deployed. Restart both backend and ML service after updating.

Reorder and waste publication now serialize replacement of pending batches with transaction advisory locks. Accept/reject claims only pending suggestions and returns a 409 conflict for stale actions. Mutation and audit intent commit together, so failed capture rolls back the primary change.

Anomaly publication commits findings, audit intent and notification intents together. Notifications reference assigned persisted UUIDs. Acknowledgement records its audit only on the first successful transition. Trigger execution, concurrent scan deduplication and shared in-memory rule context still require follow-up; publication durability does not make trigger admission durable.

Daily reports capture an attempt before each SMTP call and an outcome afterward. SMTP runs outside database transactions. Failed outcome capture stops subsequent recipients. Provider acceptance is not proof of inbox delivery; ambiguous delivery requires operator review and is not automatically replayed.

Manual forecast and market-basket mutations record attempts before external admission, retain accepted responses even if outcome capture fails, and explicitly report uncertain network outcomes. Python admission, completion, failure, expiry and combo publication capture durable audit intents in the same transactions as their database changes. Scheduled completion similarly captures its audit in the fenced completion transaction.

## Verification

- Full backend suite: 816 passed, 110 optional tests skipped.
- Separate isolated PostgreSQL suite: 7 passed, replaying the existing migrations in a disposable schema. Includes publication rollback, accept/reject races, concurrent generation, scheduled completion rollback and Python lifecycle delivery.
- Python lifecycle fixture exercised five checks and six intents, then the Node worker delivered all six audit records.
- Focused JavaScript lint and git diff whitespace checks passed.
- Real email delivery, heavy forecast/MBA algorithms, combo endpoint integration, anomaly browser workflows, process-kill recovery, hosted behavior and representative load: **Not verified**.

Acceptance cases are consolidated in FINAL_TESTING_CHECKLIST.md. The M14 finding remains partial until trigger recovery and live failure acceptance are completed.
