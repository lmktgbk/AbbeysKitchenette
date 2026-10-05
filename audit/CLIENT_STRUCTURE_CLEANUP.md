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
