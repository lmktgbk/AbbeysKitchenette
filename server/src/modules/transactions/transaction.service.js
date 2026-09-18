import { transactionRepository } from "./transaction.repository.js";

/**
 * Transaction Service (BR-03)
 *
 * Shapes ledger rows for the admin money view. Read-only —
 * all figures derive from orders, refunds, and shift snapshots.
 */
export const transactionService = {
  async getLedger({ page = 1, limit = 20, dateFrom, dateTo, method, type, staffId }) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const pageNum = Math.max(Number(page) || 1, 1);
    const skip = (pageNum - 1) * take;
    const filters = { dateFrom, dateTo, method, type, staffId };

    const [rows, totals] = await Promise.all([
      transactionRepository.findManyPaginated({ skip, take, ...filters }),
      transactionRepository.sumFiltered(filters),
    ]);

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
