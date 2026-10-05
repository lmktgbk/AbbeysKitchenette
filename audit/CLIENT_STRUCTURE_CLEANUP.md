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

## Batch 5a — POS payment presentation boundaries

- Extracted PosDiscountLine for the existing per-item discount editor and
  PosPaymentControls for the existing segmented buttons and method cards.
- Kept all payment/discount state, render-time resets, line alignment, rounding,
  totals, validation, and confirmation payload assembly in PosPaymentModal.
  The modal now has 584 lines instead of 736.
- Kept GCash/Maya as manual payment records. No gateway behavior was introduced.
- Added professional function comments explaining state ownership, quote versus
  authoritative totals, and submission ownership. Corrected a comment implying
  discount types cannot be switched; switching replaces the current type.
- Preserved the legacy whole-order fallback because it remains part of the
  current contract. No generic form framework, custom hook, or duplicate picker
  implementation was added. Broader form cleanup is still outstanding.

Verification: final structural comparison confirms original function logic is
unchanged when the extracted component is substituted back into the parent.
The extracted line markup matches after accounting for uniform indentation and
moving the list key to the component boundary. Final production build and ESLint
passed; all 52 existing client-focused regression cases passed. These tests do
not provide browser-level POS payment/discount coverage. Manual cash/GCash/Maya,
line discounts, loading/error gates, modal reopen, and receipt reconciliation
remain **Not verified**; use FLOW-02, FLOW-04, and FLOW-05 in the consolidated
FINAL_TESTING_CHECKLIST.md. No API/schema/migration change is required.
Existing Router.jsx and server automation repository edits are excluded.

## Batch 5b — product and ingredient form contracts

- Reused one local ingredient default-value function for registration and reset,
  preserving empty creation drafts and saved edit values without adding files.
- Derived editIngredientSchema with createIngredientSchema.partial(), eliminating
  duplicate constraints while retaining omitted-field support and numeric coercion.
- Kept product edit rules separate: required variants, nullable image removal,
  and availability defaults differ from creation and must not be merged blindly.
- Added professional product/ingredient handler comments covering draft reset,
  async edit identity, recipe mapping, upload intent, and persistence ownership.
- Corrected ImageUpload documentation: it opens a file picker; it has no drag/drop
  implementation. Explained that blob cleanup is local and stored-asset deletion
  occurs through the backend on successful save.

Verification: production build, ESLint, and all 52 existing client-focused tests
passed. Ad hoc before/after comparison matched 102 ingredient validation cases,
including missing/null/empty/nonfinite/nonnumeric values and long/Unicode strings,
with identical successful values and validation issues. Five ingredient draft
fixtures matched the old initializer. ProductFormModal and ImageUpload executable
syntax trees are unchanged. No UI markup, API payload, server, or schema change
is included. Actual product/ingredient dialog interaction and stored-image
replacement/removal remain **Not verified** for this batch; use the consolidated
FINAL_TESTING_CHECKLIST.md. Existing Router.jsx and automation edits are excluded.
No migration is required. Broader cleanup and final regression remain outstanding.

## Batch 6 — confirmed unused client code and final automated checks

Removed 18 unused files (2,285 lines) after tracing literal imports/re-exports and
lazy route imports from the sole HTML entry, src/main.jsx. No computed dynamic
imports, CommonJS loaders, or import.meta.glob loaders were found. Repository
reference searches found no test/script callers of the removed components;
references between unused components were removed together. Current dashboard,
forecasting, order-detail and staff pages were checked for their actual imports.

Removed files, relative to client/src:

- components/filters: LoadMore.jsx, SingleDatePicker.jsx
- components/ui: tooltip.jsx
- features/dashboard/components: DashboardKpis.jsx, IngredientCostChart.jsx,
  IngredientOverview.jsx, MostRestockedTable.jsx, StaffPerformanceChart.jsx,
  TableUtilizationChart.jsx, TopProductsTable.jsx
- features/forecasting/components: DemandTable.jsx, ForecastChart.jsx,
  ForecastHistory.jsx, ForecastServiceError.jsx, ForecastSidebar.jsx,
  IngredientNeeds.jsx
- features/orders/components: OrderTimeline.jsx
- features/staff/components: ResetPinModal.jsx

Kept active routes/pages, hooks, transport contracts, backend endpoints, and
package dependencies. Updated two comments that named removed components;
retained JSX executable syntax trees and CSS rules are unchanged. Removed code
remains recoverable in Git history. Tailwind may drop styles discovered only in
unused files; this is not a measured runtime performance improvement.

Verification: final AST graph has 234/234 reachable JS/JSX source files (252 before
this batch), no missing relative/alias imports, and no dependency cycles. Final
production build and ESLint passed. Full ordinary Vitest suite: 48 files passed,
13 skipped; 838 tests passed, 119 skipped. The 52 client-focused cases are included.
Skipped tests and live browser/hosting behavior remain **Not verified**. No live
business database test, migration, or deployment was performed. Generated HTTP
results were restored; existing Router.jsx and automation repository edits remain
excluded. Follow the final client acceptance section in FINAL_TESTING_CHECKLIST.md.

The six planned client structural cleanup stages now have local automated
verification recorded. This is not a full audit of every client line, a guarantee
of no regressions, or completed manual acceptance. Next scope: ML service structure
and comments; browser acceptance and deployment verification remain outstanding.

## Comment follow-up — submission identity and guest cart recovery

The earlier structural cleanup did not complete documentation of all client
logic. Added a module contract, function parameters/return description, and
explanatory comments to orders/submission.js: operator/action scope, canonical
fingerprints, stable retry keys, shared active promises, outcome classification,
and guarded cleanup. Explained that this is browser coordination; backend
idempotency/transactions enforce consistency. Storage retains fingerprints and
keys rather than original customer/payment fields.

Also documented each guest cart helper and useGuestCart storage/draft ownership,
including sanitized intent, expiry, blocked storage, menu reconciliation, and
quote comparison. No helper, condition, payload, timing, or storage behavior was
changed. This is a targeted comment pass, not a claim that all client files now
have complete comments.

Verification: normalized executable syntax trees are unchanged. Production build,
ESLint, and 52 client-focused cases passed, including seven submission identity
cases and guest cart recovery. Existing submission formatting is preserved in the
worktree and excluded from the comment-only commit, along with the pre-existing
Router.jsx and server automation edits. Live browser acceptance remains
**Not verified**. No migration is required.

## Comment follow-up — helper and query responsibilities

Reviewed and documented 19 source files without changing executable logic:

- hooks: useResettableState.js, useReducedMotion.js
- lib: orderNumber.js
- ingredients: options.js, query.js
- landing: formatHours.js, query.js
- orders: guestKeys.js, api.js
- products: imagePayload.js, productValidation.js, query.js
- forecasting: query.js
- dashboard/utils: dashboardUtils.js
- shifts: shiftUtils.js
- settings: validation.js
- receipts: printerService.js, escpos.js, logo.js

Comments explain state scope/identity, catalog pagination limits and cancellation,
public cache keys, API replay headers, image intent versus server cleanup,
create/edit validation differences, outcome-based cache refreshes, forecast job
subscriptions and conditional polling, and printer text/raster encoding.
Corrected overstatements about polling never freezing, USB vendor filtering,
physical print completion, and printer speed/quality. Documented actual limits:
raw printer dates use the device timezone, settings TIME_RE validates text shape,
and print handoff does not acknowledge physical delivery. No behavioral fix is
included in this documentation pass.

Verification: final normalized AST comparison against HEAD passes for all 19
files. Production build and ESLint passed. Full ordinary suite: 838 cases passed,
119 skipped across 48 passing/13 skipped files. Final two wording corrections
also passed AST verification. Generated HTTP test results were restored. Existing
Router.jsx, submission.js formatting, and automation edits remain excluded.
No migration is needed. Live browser/printer/hosting behavior is **Not verified**.

This completes the scoped helper/query pass; larger page/component readability
still needs review. It does not certify all 234 client source files as fully
commented. Existing adequate comments were retained rather than adding redundant
line-by-line narration.

## Comment follow-up — order settlement, batches, and settings UI

Added handler and decision comments in seven larger JSX files:
PosInterface, OrdersPage, CancelOrderDialog, RemoveItemDialog, OrderDetailModal,
BatchListModal, and SettingsPage. Kept all implementations and rendered markup.

Comments explain unsaved cart versus persisted item operations, loading versus
fulfilling guest orders, discount-to-line mapping, shift-required recovery,
post-commit printing, cancellation/removal request contracts, original-consumption
requirements, loss rescaling/manual quantities, refund estimate authority,
expiry removal with null, page-derived FIFO indicators, and settings draft/save
ownership. Corrected outdated descriptions of removal defaults, removed item
visibility, guaranteed pre-print detail refresh, and read-only order details.

Documented actual behavior rather than inferred improvements: missing manual loss
entries are recipe-derived again during rescaling; a settings response resets the
whole draft; clipboard feedback currently appears even on copying failure. No
behavioral correction is included in this comment-only pass.

Verification: normalized executable syntax trees match the pre-edit files for all
seven. Production build and ESLint passed; 52 client-focused cases passed. Those
cases protect shared safeguards, not browser-level coverage of every handler in
these pages/dialogs. Live financial reconciliation, loss/default UX, settings
multi-section draft behavior, expiry editing, and physical printing remain
**Not verified**. No migration is needed. Existing Router.jsx, submission formatting,
and server automation changes remain excluded from this commit.

Remaining comment review includes the product/inventory pages, kitchen workflow,
profile/account flows, forecasting UI, and other components with non-obvious state
or calculations. This pass does not claim comprehensive comments for all files.

## Comment follow-up — catalog, kitchen, profile, and inventory forms

Added professional handler/decision comments to ten files: ProductsPage,
InventoryPage, KitchenDisplay, ProfileForm, ProfileModal, ChangePasswordForm,
ProfileMenu, RestockModal, LossModal, and CountModal. Explained scope/remount
behavior, preview versus fetched detail, product activation summaries, suggestion
restock drafts, kitchen action indicators, email challenge confirmation, immediate
avatar uploads, renewed-session ownership, and estimate versus settlement data.

Corrected misleading descriptions of kitchen role filtering and restock expiry
hints. Documented actual boundaries: product metadata/image and variants save in
two requests; suggestion acceptance follows restock separately and is not awaited;
loss options load only the first 100 batches and use an ignore-stale-response guard;
restock expiry hints use device-local midnight. These comments do not implement
atomicity, fetch-all behavior, transport cancellation, or timezone corrections.

Verification: normalized executable syntax trees are unchanged for all ten files.
Production build and ESLint passed; 52 client-focused cases passed. They do not
constitute browser tests for these pages/forms. Live profile/email/avatar flows,
partial-failure product edits, suggestion acceptance failure, kitchen races, and
stock/cost reconciliation remain **Not verified** for this pass. No migration or
server/API change is included. Existing Router.jsx, submission formatting, and
server automation edits remain excluded.

Remaining review includes forecasting/market-basket UI, staff/shift/transaction
components, and shared UI behavior where comments would clarify non-obvious logic.
The broader client comment review remains unfinished.

## Comment follow-up — analysis, staff, settlement, and shared controls

Added professional comments to 17 source files covering forecast/MBA job identity,
recommendation drafts, evaluation calculations, staff invitations, shift settlement,
transaction search scope, filter drafts, calendar positioning, and dialog lifecycle.
No executable logic, endpoints, schemas, or transaction boundaries changed.

Documented important limits: recommendation product creation and association are
separate requests; shift history is limited to 50 returned records; transaction text
search covers the returned page; dialog focus trapping/restoration is absent; and
calendar instant conversion can shift dates on devices outside Manila. Corrected
overstated polling and forecast metric comments. These limits are not fixes.

Verification: executable AST equality against HEAD for all 17 source files;
production build, ESLint, and 52 client-focused tests passed. Browser analysis,
shift settlement, keyboard accessibility, and cross-timezone calendar behavior
remain **Not verified** in this pass. Existing Router, submission formatting, and
server automation edits were excluded. No migration is required.

### Follow-up security finding: confirmation HTML interpolation

Confirmed source path: ProductsPage handleDeactivate/delete supplies stored
product_name in message alongside a note; ConfirmDialog.confirm interpolates
message and note into SweetAlert html without escaping. Reason-dialog message
and reason values also enter HTML templates. Stored text can therefore change
dialog markup. Script execution/exploitability remains **Not verified**.

Reproduce safely on an isolated local product: use a harmless name such as
<b>test-name</b>, open deactivate or delete confirmation, and cancel without
performing the action. The name must appear literally, not as bold markup.
Recommended separate security fix: escape dynamic text and attribute values or
construct text nodes; add regression tests for tags, quotes, and event attributes.
This comment-only batch does not resolve that finding.

## Security follow-up — confirmation text rendering

Resolved the raw interpolation path in ConfirmDialog: one private encoder handles
HTML text and quoted reason attributes; dynamic titles use SweetAlert titleText;
button labels are encoded because SweetAlert renders them as HTML. Static layout,
callbacks, reason payloads, and cancellation result contracts remain unchanged.
No dependency, server endpoint, database schema, or transaction change is needed.

Six new renderer-contract regression tests cover stored-name/note tags, reason
attribute breakout, order labels, title/button options, Unicode/quotes/entities,
plain-message rendering, and confirmation results. All 58 client-focused tests,
production build, and ESLint passed. These tests mock the renderer and do not
prove browser DOM behavior; live dialog verification remains **Not verified**.
Existing Router, submission formatting, and automation edits are excluded.
