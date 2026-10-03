# WebSocket admission, lifecycle and reconnect fixes

Scope: M12 resource budgets and reconnect correctness. This batch does not modify order, payment or inventory data and needs no database migration. Realtime events remain process-local: deploy **one backend replica** until shared event fanout is implemented and verified. Shared HTTP rate limits do not provide shared socket event delivery.

## Implemented behavior

The server accepts only `/ws` (optional query string), checks the configured browser Origin, and selects client IP using the same numeric proxy-hop rules as Express. IPv6 client keys use the existing rate limiter's subnet grouping. Pending authenticated upgrades count toward admission, not just fully connected clients.

Default per-process limits:

| Resource | Limit | Configuration |
| --- | ---: | --- |
| Pending and active connections | 256 | WS_MAX_CONNECTIONS |
| Connections per client IP/subnet | 40 | WS_MAX_CONNECTIONS_PER_IP |
| Subscriptions per socket | 16 | WS_MAX_SUBSCRIPTIONS |
| Incoming message payload | 8 KiB | WS_MAX_PAYLOAD_BYTES |
| Outgoing buffered data | 64 KiB | WS_MAX_BUFFERED_BYTES |
| Message burst/refill | 40 tokens, 4 tokens/sec | WS_MAX_MESSAGES_PER_10S |
| Authentication caller/upgrade deadline | 5 seconds | WS_AUTH_TIMEOUT_MS |
| Actual concurrent auth lookups | At most 4, at most half the backend pool (minimum 1) | Derived from DATABASE_POOL_SIZE |
| Queued auth callers | 64 | Internal bound |
| Pending messages per socket | 32 | Internal bound |
| Upgrade attempts per IP/subnet | 60/minute | Internal bound |
| Total upgrade attempts | 600/minute | Internal bound |
| Tracked client IP/subnet records | 4096 | Internal bound |

Connection budgets are intentionally local to the one backend process. They reset on restart. They are application safeguards, not protection against a network-level DDoS. Many cafe terminals may share one IP; include tabs and guest devices when checking capacity. Raising limits requires measured memory/CPU/database headroom.

JSON messages, ping frames and pong frames share the message budget. Binary messages close with 1003; oversized messages close with 1009. Malformed JSON/null/arrays/invalid topic fields receive safe BAD_MESSAGE responses. Authentication token and topic lengths are bounded. Unauthorized staff topics remain rejected by backend ACL. Guest topics require a canonical UUID-shaped tracking token and remain possession-based invalidations; REST still controls access to actual order details.

Messages are processed sequentially per socket with a bounded pending queue. Duplicate auth submissions cannot launch parallel lookups; duplicate subscriptions do not consume another slot or repeat a database query. Unsubscribe releases a topic slot. Slow consumers are removed from fanout and disconnected rather than building an unbounded outgoing backlog.

Authentication uses a bounded FIFO queue so a normal reconnect burst can wait briefly for database-query slots. Query admission reserves pool headroom for HTTP checkout and other transactions. Its deadline includes queue waiting. A caller timeout does **not** free a slot for a query that is still running: that slot remains occupied until the query settles. Disconnected queued callers are skipped before querying; late results cannot register sessions, subscribe closed sockets or complete an upgrade after shutdown. Database/auth capacity failure is never silently downgraded to an anonymous connection; invalid credentials still cannot join staff topics.

Idle session revalidation uses up to four workers and does not overlap scans. Expired tokens, role changes, disabled accounts and session revocation still invalidate sockets. Cached expiry also prevents fanout after expiration. Under sustained auth capacity pressure an idle scan can be deferred; every new staff topic subscription still checks authorization, and local logout/revocation removes memberships immediately. Measure revalidation latency at the intended connection count.

Shutdown stops admission, destroys pending upgrades, rejects late upgrades, drops memberships and closes connected sockets. Limit/revocation/shutdown closes have a one-second termination fallback if the peer ignores the close handshake. A pending upgrade receiving TCP FIN is destroyed immediately; this fixes a reproduced reservation leak. Existing HTTP shutdown still has its overall 20-second drain deadline.

## Frontend changes

The client derives `/ws` from VITE_API_URL, converting HTTPS to WSS. VITE_WS_URL remains an explicit override. A separately hosted frontend therefore does not accidentally connect to the Vercel origin.

Subscription acknowledgements trigger the existing query invalidation handlers **after** the server joins the topic. This refetches state missed while offline and on initial subscription. A denied staff subscription also invalidates its queries so REST authorization/session-expiry handling can act. No business mutation is replayed by reconnecting.

Old socket callbacks are ignored after stop/restart; they cannot close the new session's connection or schedule an extra reconnect. Reconnect delay uses exponential backoff with jitter and a 30-second cap. Shared topic handlers send only one subscription, and only the last unsubscribe removes it.

## Verification and limits

Tests exercise real loopback HTTP upgrades and WebSocket frames with mocked auth reads: exact paths, per-IP/pending admission, disconnect during auth, timeout with an unsettled query, safe DB failure, subscription budgets/ACL, malformed/binary/oversized messages, JSON/control-frame floods, pending work limits, sequential auth, shutdown fencing, bounded idle checks and a healthy reconnect burst.

Additional tests exercise bounded IP records/attempt accounting, proxy spoofing/IPv6 grouping, token refill, slow consumer fanout/termination, authentication queue expiry/cancellation and the actual frontend socket module's URL, resubscription, resync callbacks, stale callbacks, heartbeat and timer cleanup.

The full suite initially exposed a pre-existing 200 ms happy-path Sheets fixture deadline under parallel startup. Its healthy HTTP fixture default is now two seconds; explicit 50 ms timeout tests remain unchanged. Production Google deadlines are unchanged.

Verification: the full backend suite passed 707 tests with 32 opt-in PostgreSQL tests skipped. The final auth-headroom defaults and new headroom test passed 54 focused socket/auth cases. Frontend production build and changed-file lint passed. The existing large-bundle warning remains open. No live database or third-party service data was changed.

Live hosted WSS behavior, real browser/cafe load, real PostgreSQL auth contention, role-change timings through a proxy and production memory/latency are **Not verified**. Automated auth/transport fixtures are not load-testing evidence. Acceptance cases remain in FINAL_TESTING_CHECKLIST.md.
