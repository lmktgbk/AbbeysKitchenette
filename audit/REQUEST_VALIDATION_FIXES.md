# Request validation remediation

## M03: request parsing

JSON and URL-encoded bodies retain an explicit 100 KB limit. URL-encoded forms allow at most 100 fields and ten levels of nesting. Multipart images use their own upload limits.

Known parser failures return fixed, safe messages: malformed JSON, excessive nesting, interrupted requests and invalid lengths map to 400; oversized decoded bodies or excessive form fields map to 413; unsupported compression/charset maps to 415. The serializer never returns or logs the parser's potentially sensitive request fragment. Unknown errors retain the generic server-error behavior. Responses already sent are delegated to Express.

Eleven new tests exercise actual loopback HTTP JSON/form parsing, oversized JSON/forms/gzip, malformed and primitive JSON, excess fields/nesting and unsupported encodings. Aborted/invalid-length mapping is tested directly; an aborted connection cannot be assumed to receive a response. Historical unsafe malformed-JSON assertions were converted to regressions. The complete backend suite passes 502 tests; six PostgreSQL email checks remain opt-in. No database schema or business data changes are required.

Deployed proxy body limits, real client disconnect behavior and final browser acceptance: **Not verified**. Manual cases remain in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md).

## M04: bounded API inputs and complete ingredient options

Shared validators enforce positive Int32 identifiers, pages 1–1000, page sizes 1–100, searches up to 200 characters, real calendar dates and ordered date ranges. Numeric inputs must be finite and fit their database precision: money two places, stock three, unit cost four. Orders allow 100 lines and quantity 1000 per line; products allow 50 variants and 100 recipe lines per variant. Derived restock cost and authoritative order gross totals are checked against monetary storage limits. Validation failures do not enter the protected handler.

Audit-log and dashboard queries now use validated inputs. Forecasting, notifications, anomaly and market-basket filters reject surprising coercions such as booleans and repeated query parameters. Existing successful request shapes and list defaults are preserved.

The product recipe picker now requests a dedicated admin-only, minimal-projection ingredient endpoint, using UUID keyset pages of 100 instead of requesting 9999 enriched records. The frontend loads all pages, sorts names, propagates cancellation and shows loading/error/retry states. It refuses stalled cursors or more than 100 pages rather than silently truncating the picker.

Verification: 541 backend tests pass, including input edge cases, real HTTP middleware rejection/access checks, computed-price overflow and frontend page assembly/failure behavior. Six real PostgreSQL email tests remain opt-in. Frontend production build passes; the existing large-bundle warning remains. Final browser acceptance, real PostgreSQL keyset behavior, load testing and all-time analytics aggregation performance: **Not verified**. This batch changes no database schema. These bounds do not establish correctness of every concurrent inventory writer.

### Dashboard revenue-trend correction

The revenue-trend route was missing `validateQuery(dashboardQuerySchema)` even though its controller consumed `req.validatedQuery`. This caused a 500 for valid requests such as `GET /api/dashboard/revenue-trend?granularity=weekly`. The missing middleware is now attached. Ten loopback HTTP tests exercise the real router/controller with substituted database analytics, covering daily/weekly/monthly, default granularity, dates, invalid/repeated filters and authentication. Earlier endpoint-matrix tests mocked the controller and did not detect this regression.
