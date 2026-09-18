/**
 * Transactions Query Layer (BR-03)
 */

import { useQuery } from "@tanstack/react-query";
import { getTransactionsRequest } from "@/features/receipts/api";

/**
 * useTransactions — paginated money ledger (admin).
 * @param {object} params - { page, limit, date_from, date_to, method, type, staff_id }
 */
export function useTransactions(params) {
  return useQuery({
    queryKey: ["transactions", "list", params],
    queryFn: () => getTransactionsRequest(params),
  });
}
