# Administrative staff lifecycle

Routes require admin authorization. Services coordinate accounts and audit intent;
repositories select explicit safe fields and rotate session versions with edits.
Response formatting excludes credentials and internal revocation state.

Creation hashes a random placeholder outside the account transaction. The account,
audit, and notification intent commit before invitation mail. Invitation delivery
failure returns `emailed: false`; it does not roll back or recreate the account.
The auth repository issues the single-use password-reset token, and SMTP remains
outside database locks.

Profile changes rotate the persisted session version. An administrator changing
their own email must use verified My Profile recovery-email flow. Local WebSocket
sessions close after successful commit, supplementing database-backed revocation.

Active-state toggles derive their next value from the locked account row; stale
pre-reads cannot decide a concurrent toggle. Deletes lock the account before
checking transaction history and recording deletion audit. Drawer/history references
prevent deletion. Audit failure must roll back the mutation without revoking a
session for a change that never committed.

Keep domain checks local and use the auth feature for reset-token/mail lifecycle.
Do not add a generic user-management layer just to share a small lookup.
