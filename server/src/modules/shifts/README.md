# Cashier shift workflow

The service owns opening/closing workflows and access checks; the repository owns
drawer reads, locks, guarded writes, and grouped financial queries. Read endpoints
share `findAccessibleShift`: only the opener or an admin can inspect an individual
drawer. Force-close authorization remains explicit in the admin route.

Opening uses a partial unique index to enforce one open drawer per cashier.
The preliminary lookup improves the error message; it does not replace that
database constraint. Opening and its audit intent commit together.

Payment transactions lock the open shift before assigning the sale. Closing locks
the same row, checks active kitchen orders unless forced, computes the summary,
and uses `closeIfOpen` to commit the frozen cash counts and audit intent. The
unused unguarded close method has been removed; do not introduce a second path.

Expected cash is opening cash plus cash tender minus cash change and cash refunds.
GCash/Maya are separately recorded manual payment channels, not cash in the drawer.
Cancelled paid orders retain tender and subtract refunds separately. Unpaid pending
orders do not count as sales. Variance is actual cash minus expected cash; notes
are required for nonzero variance and force-close.

Summary queries execute sequentially when a transaction is supplied because they
share one connection; ordinary reads can run concurrently. Closed cash snapshots
remain stored, while channel breakdowns use the repository's shift time window.
Period KPIs use a single SQL aggregate snapshot. Separate requests can legitimately
observe different totals as new transactions commit.

Keep the transaction ownership, shift-before-sale locking, Manila business-day
boundaries, refund windows, and conditional close behavior when refactoring.
