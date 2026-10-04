# Durable automation and ML boundaries

The scheduler calculates due runs from the Manila business calendar, admits
persisted runs, and invokes feature-specific runners. The repository owns run
deduplication, the worker gate, expiring leases, fenced completion, and retry policy.
Internal anomaly triggers have separate ownership and are excluded from these claims.

`dueRuns` catches up only the latest occurrence within 24 hours. Kind/day run keys
prevent a same-day schedule edit from admitting another run of the same kind.
A single local flight avoids overlapping ticks; database ownership coordinates
different processes. Shutdown aborts admission and drains the current flight.

ML runners save a confirmed job ID as `submitted`; this is not completed forecast
or basket analysis. Reconciliation checks persisted Python job state without
resubmitting. Manual API mutations use the ML admission audit helper before the
external call, then record accepted/rejected/unconfirmed outcomes.

Deadlines and cancellation do not roll back a provider request already accepted.
Only reorder/waste generators have automatic retry eligibility because result
publication and run completion share a transaction. Unknown SMTP/ML outcomes are
blocked for review to avoid duplicate mail or jobs. Workers must check ownership
before side effects and fence publication against expired ownership.

The ML client enforces the configured service origin, rejects redirects, and
bounds response-body consumption. Service credentials authenticate Node to Python;
they do not replace user/role authorization on Express routes. Keep validation
and admin authorization explicit on forecasting and market-basket endpoints.
