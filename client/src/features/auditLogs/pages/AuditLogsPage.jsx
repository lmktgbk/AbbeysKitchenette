import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchBar } from "@/components/filters/SearchBar";
import { Pagination } from "@/components/filters/Pagination";
import { useAuditLogs } from "../query";
import { formatDate, formatTime } from "@/lib/date";

const ACTION_GROUPS = [
  { value: "", label: "All Actions" },
  { value: "group:Product", label: "Product" },
  { value: "group:Category", label: "Category" },
  { value: "group:Inventory", label: "Inventory" },
  { value: "group:Staff", label: "Staff" },
  { value: "group:Auth", label: "Auth" },
  { value: "group:Order", label: "Order" },
  { value: "group:System", label: "System" },
];

const ACTION_GROUP_MAP = {
  "group:Product": ["PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_DELETED", "PRODUCT_ACTIVATED", "PRODUCT_DEACTIVATED", "PRODUCT_VARIANTS_UPDATED"],
  "group:Category": ["CATEGORY_CREATED", "CATEGORY_UPDATED", "CATEGORY_DELETED"],
  "group:Inventory": ["INGREDIENT_CREATED", "INGREDIENT_UPDATED", "INGREDIENT_ARCHIVED", "INGREDIENT_RESTORED", "INGREDIENT_DELETED", "STOCK_RESTOCKED", "STOCK_LOSS_DECLARED"],
  "group:Staff": ["STAFF_CREATED", "STAFF_UPDATED", "STAFF_DEACTIVATED", "STAFF_ACTIVATED", "STAFF_PIN_RESET", "STAFF_PASSWORD_RESET", "STAFF_DELETED"],
  "group:Auth": ["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGOUT", "PASSWORD_CHANGED", "PIN_CHANGED", "OTP_VERIFIED"],
  "group:Order": ["ORDER_CREATED", "ORDER_ACCEPTED", "ORDER_COMPLETED", "ORDER_CANCELLED", "ORDER_DELETED"],
  "group:System": ["SETTINGS_UPDATED", "FORECAST_RUN", "MBA_RUN"],
};

const ACTION_BADGE_COLORS = {
  PRODUCT_CREATED: "success",
  CATEGORY_CREATED: "success",
  INGREDIENT_CREATED: "success",
  STAFF_CREATED: "success",
  ORDER_CREATED: "success",
  LOGIN_SUCCESS: "success",
  OTP_VERIFIED: "success",
  PRODUCT_DELETED: "destructive",
  CATEGORY_DELETED: "destructive",
  INGREDIENT_DELETED: "destructive",
  STAFF_DELETED: "destructive",
  LOGIN_FAILED: "destructive",
  ORDER_CANCELLED: "destructive",
  ORDER_DELETED: "destructive",
  STAFF_PIN_RESET: "warning",
  STAFF_PASSWORD_RESET: "warning",
  SETTINGS_UPDATED: "info",
  FORECAST_RUN: "info",
  MBA_RUN: "info",
};

function formatAction(action) {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTarget(targetType, targetId) {
  if (!targetType) return "—";
  const label = targetType.charAt(0).toUpperCase() + targetType.slice(1);
  return targetId ? `${label} #${targetId.slice(0, 8)}` : label;
}

function formatDetails(details) {
  if (!details) return "—";
  if (typeof details === "string") return details;

  const parts = [];
  if (details.name) parts.push(details.name);
  if (details.email) parts.push(details.email);
  if (details.role) parts.push(details.role);
  if (details.fields) parts.push(details.fields.join(", "));
  if (details.reason) parts.push(details.reason);
  if (details.total) parts.push(`₱${details.total}`);
  if (details.source) parts.push(details.source);

  if (parts.length > 0) return parts.join(" · ");
  return "—";
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Resolve action group to individual action values
  const resolvedActions = ACTION_GROUP_MAP[actionFilter] || [];
  const queryParams = {
    page,
    limit,
    ...(search && { search }),
    ...(resolvedActions.length === 1 && { action: resolvedActions[0] }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  };

  // For group filters, we send all actions joined (backend supports single action filter)
  // If group has multiple actions, we use search instead
  if (resolvedActions.length > 1) {
    // We'll filter client-side from the action column for groups
    // But since backend doesn't support OR on action, we rely on search
  }

  const { data, isLoading } = useAuditLogs(queryParams);

  const logs = data?.logs || [];
  const pagination = data?.pagination || { page: 1, limit: 50, totalItems: 0, totalPages: 0 };

  // Client-side group filter when multiple actions
  const filteredLogs = resolvedActions.length > 1
    ? logs.filter((log) => resolvedActions.includes(log.action))
    : logs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">Track all system activity and user actions</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-64">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search actions, targets..."
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
            >
              {ACTION_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                className="w-40"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No audit logs found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted-foreground">
                    <th className="pb-3 pr-4">Timestamp</th>
                    <th className="pb-3 pr-4">User</th>
                    <th className="pb-3 pr-4">Action</th>
                    <th className="pb-3 pr-4">Target</th>
                    <th className="pb-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <div className="text-foreground">{formatDate(log.createdAt, "shortDate")}</div>
                        <div className="text-xs text-muted-foreground">{formatTime(log.createdAt)}</div>
                      </td>
                      <td className="py-3 pr-4">
                        {log.user ? (
                          <div>
                            <div className="font-medium text-foreground">{log.user.name}</div>
                            <div className="text-xs text-muted-foreground capitalize">{log.user.role}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={ACTION_BADGE_COLORS[log.action] || "outline"}>
                          {formatAction(log.action)}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatTarget(log.targetType, log.targetId)}
                      </td>
                      <td className="py-3 text-muted-foreground max-w-xs truncate">
                        {formatDetails(log.details)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <Pagination
        currentPage={pagination.page}
        totalItems={pagination.totalItems}
        pageSize={pagination.limit}
        onPageChange={setPage}
        onPageSizeChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
        pageSizeOptions={[50, 75, 100]}
        itemLabel="logs"
      />
    </div>
  );
}
