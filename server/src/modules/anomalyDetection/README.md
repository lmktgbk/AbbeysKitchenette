# Anomaly detection

Statistical/configured rules detect findings; Gemini optionally provides advice.
An alert is a prompt to investigate, not proof of misconduct. The shared deviation
score uses median centering and average absolute distance, not standard MAD.
Its confidence field is a bounded heuristic, not calibrated probability.

Revenue assesses the preceding complete Manila calendar day against prior
observed sales dates (up to 30 days, at least seven prior observations). Today's
running sales are excluded. A missing target date is not assumed to be zero:
closure and missing records cannot be distinguished. This is not a same-weekday
seasonal model. Existing saved descriptions are not rewritten.

Cancellation, refund, discount and cancellation-loss spikes require positive
deviation; lower values are not spikes. Cancellation retains its five-order gate.
Daily rates and fulfillment medians can still fluctuate with low trading volume.
Cancellation-loss and refund histories contain observed event dates, not all
calendar days. The loss rule covers cancellation losses, not all inventory waste.
Historical windows for enabled daily rules start at Manila midnight.

Shift variance flags nonzero differences on closed shifts. Fulfillment can flag
both faster and slower measured daily medians. Disabled supplier, stockout,
restock-spend, payment-share and dead-hours rules remain disabled.

Cards without saved Gemini advice receive clearly identified standard guidance.
Reviewing sets isAcknowledged; it does not delete a finding. Current retention
deletes active and reviewed findings older than 90 days from detection after scans.

Three security rules are enabled as admin-only findings and notifications:
- Existing account lockout reached (one event per lockout transition).
- Five staff store-network denials for the same hashed account reference in a
  fixed ten-minute window. One denial does not create a card; attempts across
  accounts sharing an IP are not combined. A denial does not prove a valid password.
- Login challenge reaches five incorrect OTP attempts (one event per challenge).

Security uses deterministic guidance rather than Gemini. Credential events queue
durable scans through the existing audit outbox. Recent 24-hour audit events can
also be recovered by manual/scheduled scans. Per-event/window keys deduplicate
findings across instances and after review; a new incident can create a new card.
The key is stored in description metadata text and hidden in rendered cards and
notification messages. No passwords, OTPs, challenge tokens or raw account emails
are sent to Gemini. Optional alert capture uses a savepoint so an outbox failure
cannot roll back incorrect-password/OTP accounting; such capture failures are
logged and may leave no alert for that event. Existing access restrictions,
lockout duration, OTP rules, rate limits and session behavior are unchanged.
Anomaly and notification routes both enforce admin authorization. No migration
or reseed is required. Historical events missing the new audit types are not
retroactively inferred. IP-based or multi-account security rules are not enabled.
