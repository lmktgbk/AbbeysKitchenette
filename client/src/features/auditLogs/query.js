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
