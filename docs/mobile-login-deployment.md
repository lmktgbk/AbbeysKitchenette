# Mobile login: Vercel API proxy

Deploy the backend before enabling the frontend proxy. No database migration or reset is needed.

## Railway backend

Generate one random secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Set `API_PROXY_SECRET` to that value. Keep it private and use the identical value in Vercel.
Keep `CLIENT_IP_SOURCE=railway` and the existing verified proxy-hop configuration.
Keep the existing `COOKIE_SAME_SITE=none` during the transition so older frontend
deployments still work. After the proxy is live and tested on all devices, it can
be tightened to `lax`; that is not required for the first-party cookie fix.
Keep `CLIENT_URL=https://abbeys-kitchenette.vercel.app` and the existing Railway API public URL.
Use one backend replica: realtime fanout and single-use, 30-second admission tickets are process-local.

## Vercel production variables

```text
VITE_API_URL=/api
VITE_WS_URL=wss://abbeyskitchenette-production.up.railway.app/ws
VITE_WS_TICKET=on
API_UPSTREAM_ORIGIN=https://abbeyskitchenette-production.up.railway.app
API_PROXY_SECRET=<the same private random secret as Railway>
```

Never prefix the proxy secret with `VITE_`. Redeploy after saving the variables.
The proxy forwards only the app's auth cookies and selected request headers, preserves
Set-Cookie and download headers, prevents caching, and signs the browser IP with method,
target and time. Railway rejects forged/expired attestations by falling back to its ingress IP.
WebSockets connect directly to Railway using a one-use ticket sent in a frame, never in a URL.
The ticket is exchanged server-side for the original session and its current revocation checks.

Vercel Function payload/runtime limits apply to proxied uploads and exports. Verify image/avatar
uploads and PDF/Excel downloads in addition to login; large uploads may need direct storage later.

## Acceptance checks

- Fresh desktop and mobile admin/staff login and OTP resend. Test one person per account initially.
- Browser Network should show `/api/auth/...` on the Vercel origin; cookies remain HttpOnly/Secure.
- Authenticated realtime should reach Live and refresh orders on a second device.
- Store-network diagnostic must match the real public IP; off-site staff/guest submissions remain denied.
- Logout must revoke the HTTP session and its realtime connection.
- Verify image/avatar upload, order idempotency, receipt and report downloads.

Existing direct-Railway cookies are separate; sign in again after switching the frontend API origin.
Rollback the Vercel API URL/socket flag to the previous configuration together if required.

## Brevo delivery investigation

API acceptance is not inbox delivery. Authentication delivery audit entries now retain the provider
message ID without OTPs or message bodies. Recent requests at 22:15–22:21 on 2026-10-14 reached Brevo
but had no delivery event at inspection; sending was enabled with nonzero credits.

For Brevo support, provide message IDs from Transactional Logs and ask why accepted requests have
no delivery, deferred, bounce or blocked event. Example pending message ID:
`<202610141421.23104501059@smtp-relay.mailin.fr>`.
Do not send OTPs, API keys, passwords or session cookies. No automatic resend/provider fallback is
introduced: ambiguous retries could replace valid codes or send duplicates.
