# Client structure cleanup

## Scope and conventions

Retain the existing feature-based React structure. Feature api.js files own HTTP
contracts, query.js files own query keys/hooks/invalidation, pages compose feature
workflows, and components render their scoped UI. Shared components remain generic;
shared hooks own reusable React behavior and lib owns pure helpers. Do not create
extra layers or require every feature to have identical files.

Preserve backend authorization/pricing authority, session epochs and cache clearing,
submission replay keys, guest cart recovery, realtime reconciliation, and image
replacement handling. Comments should explain contracts and non-obvious decisions.

## Baseline review

- 247 JavaScript/JSX source files; AST-based static imports found no missing
  relative/alias targets or dependency cycles.
- Production build and ESLint passed; 52 client-focused regression cases passed.
- 18 files were unreachable from main.jsx in the static import graph. These are
  investigation candidates, not confirmed unused code.
- Large files include guest OrderingPage (1,151 lines), PosPaymentModal (736),
  OrderDetailModal/BatchListModal (661 each), and cancellation/removal dialogs.
  Length alone is not grounds for extraction; responsibilities must justify it.

## Planned sequence

1. Align order-dialog/shared-hook ownership.
2. Consolidate analytics API/query files, preserving cache keys and freshness.
3. Clarify session/realtime responsibilities and correct outdated comments.
4. Extract existing guest ordering components in bounded steps.
5. Simplify POS and form responsibilities with focused verification.
6. Remove confirmed unused code and perform final regression/manual acceptance.

## Batch 1 — ownership alignment

- Moved CancelOrderDialog.jsx and RemoveItemDialog.jsx from components/orders
  into features/orders/components; they implement order-specific loss/refund UI.
- Moved useReducedMotion.js from lib to hooks; it owns React state and a media
  query subscription rather than a pure transformation.
- Updated OrdersPage and all chart imports, including currently unreachable
  chart candidates. No compatibility files or new abstractions were introduced.
- Preserved all moved implementations and their comments unchanged after
  normalizing repository/worktree line endings.

Verification: production build and ESLint passed; all 52 client-focused cases
passed. Relocation-only AST comparison passed for 16 source files, allowing only
the three mapped import paths. No calculations, props, state transitions, query
keys, DOM structure, or accessibility behavior changed. This batch does not
provide new browser interaction coverage of the moved dialogs. Live/manual
cancellation, removal, and reduced-motion acceptance remain **Not verified**.
No migration or server implementation change is required. The existing server
automation formatting is excluded from this commit.


## Batch 2 — analytics transport and query consolidation

- Merged variantApi.js into api.js and variantQuery.js into query.js; removed
  both redundant files rather than retaining compatibility exports.
- Updated profitability-table and waste-modal hook imports.
- Preserved exported function names, endpoint paths, response envelopes,
  filter forwarding, cache-key arrays, and all 30-second staleTime settings.
- Added function comments distinguishing KPI/export date normalization from
  unchanged detail-filter forwarding and explained retained cache ownership.

Verification: syntax-tree comparison confirms all eight executable declarations
match the original two-file pairs, and both callers changed only their imports.
Production build and ESLint passed; 52 existing client-focused cases passed.
Those cases protect broader client safeguards, not browser-level coverage of
analytics tables or downloads. Live analytics filtering, pagination, and Excel/PDF
exports remain **Not verified** for this batch. No server/API/schema change or
migration is required. Existing Router.jsx and automation repository edits were
preserved outside this commit.


## Batch 3 — session and realtime responsibilities

- Documented the browser-local session epoch and stale-401 protection, cache
  clearing for new operators, and same-operator credential rotation.
- Clarified logout success/already-unauthorized behavior versus failed revocation,
  AuthProvider restore-error behavior, and HttpOnly credential ownership.
- Explained connection-instance guards, timer shutdown, retained subscriptions,
  rejoin acknowledgements, jittered reconnect, and final-handler unsubscribe.
- Corrected claims that realtime disables all polling, that VITE_REALTIME=off
  automatically restores polling, and that auth state contains a token.
- Corrected the server emitter path and inventory subscription scope: ingredient
  queries are refreshed, while separately keyed advisory lists are not included.
- Updated order/query-default comments to describe actual caller polling overrides.

Verification: final normalized syntax trees match HEAD for all 12 modified source
files. Production build and ESLint passed; all 52 client-focused tests passed,
including session-switch/late-401 and socket reconnect/shutdown cases. The final
two header edits also passed the syntax-tree comparison. No functions, timings,
cache keys, access decisions, or fallback behavior changed. Live multi-tab session
rotation, hosted cookies/WebSockets, and browser acceptance remain **Not verified**.
Existing Router.jsx and server automation formatting edits remain outside this
commit. No migration is required.

## Batch 4 — guest ordering component boundaries

- Extracted the existing product card, cart panel (including its private line row),
  product-detail dialog, checkout dialog, and confirmation screen into five
  feature-owned components. OrderingPage now has 354 lines instead of 1,151.
- Kept cart persistence, menu reconciliation, dialog coordination, and success
  state in the page. Kept the full checkout preflight and retry flow together.
- Added responsibility comments and documented the synchronous submission gate,
  server pricing authority, and uncertain-response recovery contract.
- Preserved props, rendered markup, CSS classes, quantity limits, query behavior,
  calculations, and submission payloads. No generic framework or extra hook was added.

Verification: all nine original function declarations have identical normalized
executable syntax trees after relocation. All 52 client-focused regression cases
passed. The final production build and ESLint passed. Existing tests cover cart,
submission, session, transport, and related safeguards; they do not constitute
browser interaction coverage of these extracted components. Guest menu selection,
cart recovery, checkout, retry, and confirmation browser acceptance remain
**Not verified** for this batch; use the consolidated FINAL_TESTING_CHECKLIST.md.
Existing Router.jsx and server automation repository changes are excluded.
No API, database, or migration change is required.
