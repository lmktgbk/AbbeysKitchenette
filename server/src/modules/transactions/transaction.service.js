import { transactionRepository } from "./transaction.repository.js";

/**
 * Transaction Service (BR-03)
 *
 * Read-only money ledger for admins. Nothing here writes — every figure
 * derives from orders, refunds, and shift snapshots, so the ledger can
 * never disagree with the underlying books; it only re-presents them.
 * Page rows and footer totals use the SAME filters, otherwise the totals
 * row describes a different dataset than the visible page.
 */
export const transactionService = {
  async getLedger({ page = 1, limit = 20, dateFrom, dateTo, method, type, staffId }) {
    // Clamp-then-offset: page/limit are user input, never trusted for skip math.
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const pageNum = Math.max(Number(page) || 1, 1);
    const skip = (pageNum - 1) * take;
    const filters = { dateFrom, dateTo, method, type, staffId };

    const [rows, totals] = await Promise.all([
      transactionRepository.findManyPaginated({ skip, take, ...filters }),
      transactionRepository.sumFiltered(filters),
    ]);

    // total_count rides on every row via window function — read it once,
    // then strip it so it never leaks into a transaction object.
    const totalItems = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
    const transactions = rows.map(({ total_count, ...r }) => ({
      id: r.id,
      timestamp: r.ts,
      type: r.type,
      method: r.method,
      amount: Number(r.amount ?? 0),
      order_id: r.order_id,
      order_number: r.order_number != null ? Number(r.order_number) : null,
      staff_id: r.staff_id,
      staff_name: r.staff_name ?? null,
      note: r.note ?? null,
    }));

    return {
      transactions,
      totalItems,
      page: pageNum,
      limit: take,
      inflow: Math.round(totals.inflow * 100) / 100,
      outflow: Math.round(totals.outflow * 100) / 100,
      net: Math.round((totals.inflow - totals.outflow) * 100) / 100,
    };
  },
};
