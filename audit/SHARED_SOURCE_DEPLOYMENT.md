# Deployment with shared submission code

The frontend and backend import `shared/canonicalJson.js`. It is source code,
not another hosted service. Do not deploy an isolated copy of `server/` without
its sibling `shared/` folder.

## Vercel frontend

- Root Directory: `client`.
- Enable **Include source files outside of the Root Directory in the Build Step**.
- Install: `npm ci`.
- Build: `npm run build`.
- Output: `dist`.
- Keep `client/vercel.json` for SPA routing.

Vite bundles the imported serializer into browser JavaScript. Only built public
assets are served; including repository source in the build does not require
serving backend files. Never put secrets in frontend environment variables.
Ensure deployment skipping/watch rules include changes in `shared/**`.

Provider reference: https://vercel.com/docs/monorepos/monorepo-faq

## Railway or Render backend

Use the repository root as the service source/build context. Leave Root Directory
unset rather than restricting it to `server`. Run these commands from that root:

```sh
# Build: include the Prisma CLI for generation; retain the sibling shared folder.
cd server && npm ci --include=dev && npm run check:source && npm run db:generate

# Start: the application working directory remains server for existing relative paths.
cd server && npm start

# Release/pre-deploy step, after the documented backup and migration review.
cd server && npm run db:migrate:deploy
```

These are separate hosting command fields, not one combined command. Migrations
belong to the coordinated release step, not every application startup. Configure
environment variables on the backend service and retain one backend replica.

Set deployment watch/build filters to include `server/**` and `shared/**`.
If a provider's builder cannot detect Node at the repository root, explicitly
configure its Node build mechanism or a repository-root Docker build context;
do not restore a server-only context to make detection pass. Builder detection
and the final artifact must be verified on the selected host.

Render excludes files outside its configured root at build time and runtime:
https://render.com/docs/monorepo-support
Railway shared-monorepo reference:
https://docs.railway.com/deployments/monorepo

## Supabase certificate trust on Railway

The repository-root `prod-ca-2021.crt` is the public Supabase CA certificate;
it contains no database credentials. Keep it in the backend build context.
Set this backend service variable before deploying:

```text
NODE_EXTRA_CA_CERTS=/app/prod-ca-2021.crt
```

Keep `sslmode=verify-full` on `DATABASE_URL` and `DIRECT_URL`. Node loads
additional trusted CAs at process startup, so a dotenv file alone cannot enable
this setting. Certificate and hostname verification remain enabled.

A read-only runtime `SELECT 1` with this certificate succeeded locally within
the existing 2.5-second connection timeout. Railway startup and `/api/ready`
still require verification after deployment.

## Brevo email delivery on Railway

### Client-IP identity on Railway

Set `CLIENT_IP_SOURCE=railway` on the backend public HTTP service. Keep
`CLIENT_IP_SOURCE=proxy` for localhost (with `TRUST_PROXY_HOPS=0`) and other
verified proxy deployments. The shared resolver uses Railway's `X-Real-IP`
for HTTP access checks, HTTP rate limits and WebSocket connection budgets.
`TRUST_PROXY_HOPS` still controls Express's other proxy-aware properties.

This relies on Railway public ingress replacing caller-supplied `X-Real-IP`.
Private-network callers bypass this protection and must be trusted; do not
expose the container through a TCP proxy or another unsanitized entry path.
Reference: https://docs.railway.com/networking/public-networking/specs-and-limits
Header handling: https://station.railway.com/questions/need-authoritative-client-ip-proxy-tru-090eac86

Live verification: use the admin network check and repeat it with a forged
`X-Real-IP` header against the public domain. The detected policy IP must stay
equal to the actual connection address. Local unit tests cannot prove hosted
header replacement. Retest allowed/off-site staff login and guest submissions.

### Email provider

Set `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `EMAIL_FROM` (the verified sender),
and `EMAIL_FROM_NAME=Abbey's Kitchenette` on the backend service only. Do not
put API keys in Vercel's browser variables. SMTP credentials are not required
when Brevo is selected; localhost can select `EMAIL_PROVIDER=smtp` instead.

Login/resent OTPs, password resets, staff invitations, recovery-email verification
and security notices, and daily reports all use the same delivery function.
Existing HTML templates and report PDF buffers are retained. HTTP acceptance is
not proof of inbox delivery: verify each flow live and check Brevo's delivery log.
Failures remain unconfirmed, with no automatic SMTP fallback or duplicate retry.

## ML service

Root Directory: `ml-service`. Install `requirements.lock` and start `python main.py`.
This Python application does not import the JavaScript shared helper.

## Verification

From the repository root, `npm --prefix server run check:source` checks the sibling
file and imports it with Node without connecting to the database or providers.
`npm --prefix client run build` verifies the frontend's import can be bundled.
Run the source check inside the actual backend artifact too: local success cannot
prove the host retained the same layout.

Hosted builds, Node builder detection, shared-file deployment triggers, startup,
cookies, and WebSockets remain **Not verified** until staging deployment.


## Repository-root Node detection

The root `package.json` and dependency-free lockfile identify the backend build
context as Node 24 to Railpack. Its commands delegate to `server/`; this is not
a workspace conversion and does not install client dependencies. Keep Railway's
Root Directory unset so runtime imports of `shared/` still resolve.

The previously documented `cd server && ...` command overrides remain valid.
After this change, Railway must rebuild from the new commit, rather than restart
the old image. Confirm both build and runtime logs show Node/npm available.
Physical hosted runtime behavior remains unverified until the rebuilt deployment starts.
