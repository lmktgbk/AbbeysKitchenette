# SmartCafe — Abbey's Kitchenette

SmartCafe is a React POS and inventory application with an Express API, Supabase PostgreSQL and a private Python forecasting/market-basket service. Cash, GCash and Maya payments are manually recorded; there are no payment gateways or payment webhooks.

## Local setup

Use Node 24 and Python 3.12, matching the verification workflow. Install exact lockfiles with `npm ci` inside `client` and `server`. Create a Python virtual environment in `ml-service/venv` and install `ml-service/requirements.lock`.

Copy each service's `.env.example` to its own `.env` and configure separate test credentials. The frontend gets public API/WSS origins only. Database, JWT, email, Cloudinary, Google and ML credentials belong in server/ML configuration and must not be committed or exposed as VITE variables.

Before schema changes, verify the intended DATABASE_URL and DIRECT_URL destinations without sharing their credentials. Existing databases need their documented baseline/history; never reset or seed a populated database to resolve migration errors. From server, apply reviewed pending migrations with `npm run db:migrate:deploy`, then `npm run db:generate`.

Start the backend using `npm run dev` from server, Python using `python main.py` from ml-service, and frontend using `npm run dev` from client. The local defaults are frontend 5173, API 5000 and ML 8000. ML_SERVICE_KEY must match on backend and ML service.

## Verification and release

Run backend `npm test`, frontend `npm run lint -- --max-warnings 0` and `npm run build`. Database suites require explicit opt-in and use disposable schemas. The GitHub workflow provisions its own PostgreSQL database; it never receives production credentials. Both npm audits are clean as of October 6, 2026; the strict dependency gate remains enabled. See the dependency security record for the scoped Prisma configuration override and its verification.

Use [the consolidated acceptance checklist](audit/FINAL_TESTING_CHECKLIST.md) for browser and live tests, [current audit status](audit/CURRENT_STATUS.md) for remaining findings, and [operations/release instructions](audit/OPERATIONS_RUNBOOK.md) for deployment and incidents.

Frontend deployment targets Vercel; backend and ML target Railway or Render. Use one backend replica until shared realtime fanout is implemented. Passing local tests does not establish backup recovery, provider delivery, hosted behavior or production load capacity.

Both JavaScript applications import `shared/canonicalJson.js`. Vercel must include
source outside its `client` root; backend deployment must retain `server/` and
`shared/` together. Follow [the shared-source deployment settings](audit/SHARED_SOURCE_DEPLOYMENT.md).
