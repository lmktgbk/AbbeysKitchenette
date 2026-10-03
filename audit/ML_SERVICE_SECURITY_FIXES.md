# ML service security remediation

## Scope and behavior

Addresses H11: FastAPI requires `X-ML-Service-Key` on all forecasting, market-basket and health routes. Express retains its authenticated admin gates. Browser user tokens cannot authenticate directly to ML. Missing or invalid service configuration fails closed; startup validates the credential before stale-job cleanup.

The shared backend transport authenticates API proxies, scheduled jobs, job watchers and readiness probes. Its default 10-second deadline includes JSON response consumption; readiness uses 3 seconds. Redirects and origin-changing paths are rejected. Service authentication errors produce a generic 503 rather than a user-session 401. Business errors retain their upstream status. POST requests are not automatically retried because a timeout can occur after a job was accepted.

Slow watcher requests cannot overlap, watchers expire independently of request failures, and late responses cannot finish replacement watchers. No database schema or business transaction changes are required.

## Configuration and deployment

- Matching random 32-byte hexadecimal credentials were configured in the existing ignored `server/.env` and `ml-service/.env`. Secret values are deliberately omitted from this report.
- Restart both processes. Do not expose this key through `VITE_` variables, browser code, URLs or logs.
- `FORECAST_URL` is a validated HTTP(S) origin; `ML_REQUEST_TIMEOUT_MS` supports 100–120000 ms, default 10000.
- Python reads its own `.env`, binds to `127.0.0.1` by default and disables development reload and documentation endpoints. Browser CORS access is removed.
- For separate containers, set `FORECAST_HOST=0.0.0.0` only on a private network and set the backend URL to the private service address. Do not publish ML's port publicly. Restrict ingress to backend instances; use TLS for traffic crossing untrusted networks.
- Rotate the credential in both deployed services together. Without matching keys, ML requests fail safely with availability errors.

Actual deployed ingress, firewall, TLS, secret storage and process restart behavior: **Not verified**. Starting Python with the real database can clean up stale jobs, so these tests intentionally avoid real startup.

## Verification

Backend: `npm.cmd test` from `server` passes 457 tests across 13 files. Added transport tests use a real loopback HTTP fixture to verify authentication headers, success envelopes, upstream errors, redirects, malformed JSON, slow headers and slow bodies. Existing HTTP role-boundary tests remain passing. Watcher tests cover non-overlap and expiry.

Python: `./ml-service/venv/Scripts/python.exe ./audit/ml_reproduction.py` passes seven tests. ASGI requests cover every registered business route plus health, wrong/non-ASCII credentials, authorized health and business reads, hidden documentation and startup validation before cleanup. Database and model services are mocked; no production business records were modified.

Two passing characterization tests still reproduce H12's existing concurrent pool initialization and duplicate forecast admission defects. H12/H13, durable job recovery, representative ML runtime performance and multi-instance execution remain unresolved.

Final browser, deployed-network and real-service checks remain in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md), with acceptance status NOT RUN.
