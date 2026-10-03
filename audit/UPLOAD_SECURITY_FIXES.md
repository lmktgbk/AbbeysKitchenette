# Upload validation and persistence remediation

## Implemented behavior

Product images and avatars require exact filename-extension and MIME pairs, followed by decoding of the actual bytes with Sharp. Supported product formats remain JPEG, PNG, GIF and WebP; avatars accept JPEG, PNG and WebP. Files are decoded and re-encoded, stripping source metadata and trailing payloads while preserving alpha/animation. Single-frame images are auto-oriented. SVG, corrupt content and supported formats disguised as another format are rejected.

Limits: products 5 MB, avatars 2 MB; 4096 pixels per dimension, 16,777,216 pixels across frames, at most 50 frames. Four uploads and two decoders may be active per process. Decoding has a three-second processing timeout; the complete upload has a 35-second deadline and Cloudinary operations a 30-second timeout. Oversized files return 413; busy processing returns 429. Multipart uploads allow one file, product metadata up to 100 KB in one field, and no avatar text fields. Truncated/oversized files never start a provider upload.

The product editor sends its image and JSON metadata in one multipart POST/PATCH. The old standalone `/api/products/upload-image` endpoint returns 410 before uploading. JSON-only saves remain supported. New arbitrary image URLs cannot be attached through JSON; an existing unchanged image remains valid on edits. Deploy frontend and backend together and invalidate stale frontend assets. This avoids abandoned uploads from cancelling an unsaved modal. Product metadata and variants still use the existing two-step edit workflow; this batch does **not** make that entire edit atomic.

Avatar/product replacement saves the new URL before cleaning up the previous asset. Conditional database updates compare the prior image to reject concurrent stale replacements with 409. Hard deletion cleans the image returned by the actual delete, accounting for an intervening replacement. No storage/network work runs in a database transaction; old-image cleanup does not block the success response.

Cleanup accepts only HTTPS Cloudinary URLs in this account's application folders and checks both product/user references. Definitive 4xx save/validation rejection schedules removal of an unreferenced new asset. Unexpected 5xx/connection failures are retained because a commit may still finish later. Database reference-check or provider-deletion failure logs a fixed warning and retains the asset. Failed provider uploads use server-generated public IDs for compensation, including late successful callbacks.

## Verification and remaining limits

Automated tests cover real image bytes, exact type tricks, corrupt/disguised content, dimension bounds, EXIF/trailing-script removal, real HTTP multipart create/update flows, authorization before upload, rejected metadata, definitive database constraint failure, ambiguous outcomes, current-reference protection, forbidden deletion URLs, old-image preservation on failed/stale saves and frontend multipart transport. Cloudinary and database persistence are simulated; no production business rows or real storage/email services are changed.

Final backend result: 584 passing tests; six PostgreSQL recovery-email checks remain opt-in. Frontend build passes and changed-file lint has no errors, retaining the existing React Hook Form compiler warning. npm audit still reports three high entries corresponding to the previously documented single Prisma CLI/deepmerge-ts advisory; the image dependency adds no reported advisory.

Real Cloudinary storage/deletion, PostgreSQL image contention, complete browser acceptance and load testing: **Not verified**. Public image URLs are intentionally public; do not store confidential images there. Crash-safe cleanup is **not implemented**: provider outage, process termination, client disconnect after upload and uncertain commits can leave retained orphan assets. A durable asset ledger/reconciliation worker is the remaining reliability improvement; do not delete these assets without checking their current database references. Older manually assigned/transformed URLs outside the strict deletion pattern are retained.

Manual acceptance is consolidated in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md).
