/**
 * Transactions Queries — owns admin money-ledger list hook (BR-03).
 * WHY: isolates paginated ledger fetching from receipts API so admin tables stay thin. Keys: ["transactions", "list", params]; no custom staleTime (uses global 5m); read-only, no invalidations.
 * State: TanStack Query hook only, no local state or mutations.
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
