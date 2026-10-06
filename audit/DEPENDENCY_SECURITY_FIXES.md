# Dependency security remediation

This batch addresses H14 without changing business rules or database schema. Manual payments remain manual. Original audit findings describe the historical baseline.

## Changes and evidence

- Server npm audit: 18 affected package entries before, three after. The three remaining entries represent one underlying advisory, described below. Production-only audit also reports these entries.
- Client npm audit: 14 affected package entries before, zero after.
- Installed Python OSV scan: pip and urllib3 were affected before; zero affected packages after, across 71 installed packages with complete pagination. pip is now 26.2.1 and urllib3 2.8.0. `pip check` passes. Exact environment versions are recorded in `ml-service/requirements.lock`.
- Cloudinary is updated to 2.11.0, Nodemailer to 10.0.13 and Axios to 1.20.0. Prisma CLI, Client and PostgreSQL adapter are aligned at 7.10.0. Compatible transitive updates are recorded in both npm lockfiles.
- The legacy Cloudinary Multer adapter required the old Cloudinary SDK. A small streaming storage adapter now uses the current SDK directly, preserves `req.file.path`, `filename` and `size`, applies a 30-second provider timeout and forwards stream failures once. Existing upload limits remain 5 MB for products and 2 MB for avatars. Multer cleanup removes uploaded assets when its size checks fail.
- Native Node watch replaces nodemon. The frontend only needed shadcn's stylesheet: its exact 4.17.0 stylesheet and MIT license are preserved locally, removing the CLI dependency tree without changing those styles.
- Scoped overrides update ExcelJS's UUID dependency to CJS-compatible 11.1.1 and Prisma's mysql2 dependency to 3.24.5. Workbook serialization/read-back passes. The application database remains PostgreSQL.

Raw before/after reports are in [dependency-remediation](dependency-remediation/). Counts are advisory matches, not a claim that every vulnerable path was reachable.

## Residual high-severity advisory

**Finding:** GHSA-ggr8-5vv4-36mx affects deepmerge-ts 7.1.5, inherited through @prisma/config and Prisma 7.10.0. Recursive merging can exhaust the stack. npm reports three high-severity package entries for this one advisory, including in the production-only scan because Prisma is an optional peer dependency.

**Evidence and reachability:** Installed @prisma/config imports `deepmerge` while loading local Prisma configuration. Application HTTP handlers do not pass request data to this merger. This is a source-level reachability assessment; exploit execution is **Not verified**. No claim of a clean production dependency scan is made.

**Mitigation and follow-up:** Keep Prisma configuration and CLI inputs trusted and deployment access restricted. Recheck the advisory at every release and move to an upstream patched compatible Prisma release when available. Do not blindly force the suggested major downgrade or override a major merger API without compatibility verification. This is a documented residual risk, not a permanent security waiver or production-readiness certification.

## October 6, 2026 release dependency update

- `proxy-addr` 2.0.7 → 2.0.8, shared by the direct dependency and Express. Tests reject forged forwarded IPs through incorrectly specified IPv4-mapped IPv6 trust subnets while preserving correctly specified private proxy subnets. [Advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
- `source-map-js` 1.2.1 → 1.2.2 in both npm lockfiles. [Advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- Prisma CLI/client stay on 7.10.0. A narrow `@prisma/config` override selects `deepmerge-ts` 8.0.2 because config 7.10.0 still pins 7.1.5. The patched library preserves the `deepmerge` export used by Prisma's local configuration loader; actual `prisma validate` and `prisma generate` pass. No database migrations, seed changes or schema writes were run. [Advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
- This is a deliberate transitive major-version override, not an upstream Prisma compatibility guarantee. Retest configuration loading/generation on Prisma upgrades, and remove the override once the chosen Prisma release itself depends on a patched version.
- Verification: server/client npm audits each report zero vulnerabilities; 957 backend tests pass with 133 opt-in tests skipped; frontend strict lint/build and source-layout checks pass. Linux CI execution and hosted acceptance remain unverified at this point.

The earlier verification and residual-risk notes below are historical evidence, superseded for npm advisories by this dated update.

## Verification

- Backend: 468 tests in 14 files pass, including 11 new integration tests. Actual loopback HTTP multipart requests exercise both upload contracts, size limits, forbidden extensions, provider/stream errors, malformed provider responses and callback completion. Cloudinary is mocked; no external uploads occur.
- Real Nodemailer stream transport serializes a multipart email with attachment; real ExcelJS writes and reads a workbook. No email is sent.
- Frontend production build passes. Its existing 1.64 MB JavaScript chunk warning remains; bundle splitting is separate performance work.
- Python: 18 authentication/pool/worker tests pass, including real spawned model computation using synthetic fixtures.
- Prisma validation and Client generation pass. Read-only migration status confirms all six migrations are applied, including the two ML migrations the user deployed. This batch requires no new schema migration.

Real Cloudinary uploads, real email delivery, browser visual regression, Linux installation of the Python lock, representative load and final deployed workflows: **Not verified**. File-content validation and orphaned-upload recovery remain separate open work; replacing the SDK adapter does not certify upload security.

## Deployment and maintenance

Use `npm ci` in server and client, and `python -m pip install -r requirements.lock` from ml-service in a tested deployment environment. Generate Prisma Client, rebuild the frontend and restart backend/ML processes to load the updated libraries. Verify the consolidated [final checklist](FINAL_TESTING_CHECKLIST.md); do not modify production business data to test failures.

For each release, scan exact npm lockfiles and the installed Python environment, review direct and transitive advisories, test compatible updates, and document any residual risk with an owner and next review date. Avoid unreviewed force upgrades. Keep the vendored stylesheet's provenance and license when updating it.

The storage implementation follows Cloudinary's documented [stream upload API](https://cloudinary.com/documentation/node_image_and_video_upload) and [upload timeout parameter](https://cloudinary.com/documentation/image_upload_api_reference). npm evidence links to each underlying published advisory.
