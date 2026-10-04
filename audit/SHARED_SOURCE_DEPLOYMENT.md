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
