/**
 * AuditLogs Queries — owns filtered audit-trail list hook.
 * WHY: isolates compliance log fetching and envelope unwrapping from tables. Keys: ["auditLogs", "list", filters]; select unwraps res.data; no custom staleTime (uses global 5m); read-only, no invalidations.
 * State: TanStack Query hook only, no local state or mutations.
 */
import { useQuery } from "@tanstack/react-query";
import { getAuditLogsRequest } from "./api";

const auditLogKeys = {
  all: ["auditLogs"],
  list: (filters) => [...auditLogKeys.all, "list", filters],
};

/** Fetch audit logs with filters and pagination */
export function useAuditLogs(filters) {
  return useQuery({
    queryKey: auditLogKeys.list(filters),
    queryFn: () => getAuditLogsRequest(filters),
    select: (res) => res.data,
  });
}
