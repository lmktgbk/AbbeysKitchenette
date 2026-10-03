# Request validation remediation

## M03: request parsing

JSON and URL-encoded bodies retain an explicit 100 KB limit. URL-encoded forms allow at most 100 fields and ten levels of nesting. Multipart images use their own upload limits.

Known parser failures return fixed, safe messages: malformed JSON, excessive nesting, interrupted requests and invalid lengths map to 400; oversized decoded bodies or excessive form fields map to 413; unsupported compression/charset maps to 415. The serializer never returns or logs the parser's potentially sensitive request fragment. Unknown errors retain the generic server-error behavior. Responses already sent are delegated to Express.

Eleven new tests exercise actual loopback HTTP JSON/form parsing, oversized JSON/forms/gzip, malformed and primitive JSON, excess fields/nesting and unsupported encodings. Aborted/invalid-length mapping is tested directly; an aborted connection cannot be assumed to receive a response. Historical unsafe malformed-JSON assertions were converted to regressions. The complete backend suite passes 502 tests; six PostgreSQL email checks remain opt-in. No database schema or business data changes are required.

Deployed proxy body limits, real client disconnect behavior and final browser acceptance: **Not verified**. Manual cases remain in [FINAL_TESTING_CHECKLIST.md](FINAL_TESTING_CHECKLIST.md).
