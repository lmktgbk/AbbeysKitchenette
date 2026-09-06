import { useState, useMemo } from "react";
import { SearchBar } from "@/components/filters/SearchBar";
import { DropDown } from "@/components/filters/DropDown";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import { Pagination } from "@/components/filters/Pagination";
import { useAuditLogs } from "../query";
import { formatTime } from "@/lib/date";
import Icon from "@/components/ui/icon";

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

const BADGE_STYLES = {
  PRODUCT_CREATED: "bg-green-50 text-green-700 border-green-200",
  CATEGORY_CREATED: "bg-green-50 text-green-700 border-green-200",
  INGREDIENT_CREATED: "bg-green-50 text-green-700 border-green-200",
  STAFF_CREATED: "bg-green-50 text-green-700 border-green-200",
  ORDER_CREATED: "bg-green-50 text-green-700 border-green-200",
  LOGIN_SUCCESS: "bg-green-50 text-green-700 border-green-200",
  OTP_VERIFIED: "bg-green-50 text-green-700 border-green-200",
  PRODUCT_ACTIVATED: "bg-green-50 text-green-700 border-green-200",
  STAFF_ACTIVATED: "bg-green-50 text-green-700 border-green-200",
  INGREDIENT_RESTORED: "bg-green-50 text-green-700 border-green-200",

  PRODUCT_DELETED: "bg-red-50 text-red-700 border-red-200",
  CATEGORY_DELETED: "bg-red-50 text-red-700 border-red-200",
  INGREDIENT_DELETED: "bg-red-50 text-red-700 border-red-200",
  STAFF_DELETED: "bg-red-50 text-red-700 border-red-200",
  LOGIN_FAILED: "bg-red-50 text-red-700 border-red-200",
  ORDER_CANCELLED: "bg-red-50 text-red-700 border-red-200",
  ORDER_DELETED: "bg-red-50 text-red-700 border-red-200",

  PRODUCT_UPDATED: "bg-blue-50 text-blue-700 border-blue-200",
  CATEGORY_UPDATED: "bg-blue-50 text-blue-700 border-blue-200",
  INGREDIENT_UPDATED: "bg-blue-50 text-blue-700 border-blue-200",
  STAFF_UPDATED: "bg-blue-50 text-blue-700 border-blue-200",
  PRODUCT_VARIANTS_UPDATED: "bg-blue-50 text-blue-700 border-blue-200",
  PRODUCT_DEACTIVATED: "bg-blue-50 text-blue-700 border-blue-200",
  INGREDIENT_ARCHIVED: "bg-blue-50 text-blue-700 border-blue-200",
  ORDER_ACCEPTED: "bg-blue-50 text-blue-700 border-blue-200",
  ORDER_COMPLETED: "bg-blue-50 text-blue-700 border-blue-200",
  SETTINGS_UPDATED: "bg-blue-50 text-blue-700 border-blue-200",
  FORECAST_RUN: "bg-blue-50 text-blue-700 border-blue-200",
  MBA_RUN: "bg-blue-50 text-blue-700 border-blue-200",

  STAFF_PIN_RESET: "bg-amber-50 text-amber-700 border-amber-200",
  STAFF_PASSWORD_RESET: "bg-amber-50 text-amber-700 border-amber-200",
  STOCK_RESTOCKED: "bg-amber-50 text-amber-700 border-amber-200",
  STOCK_LOSS_DECLARED: "bg-amber-50 text-amber-700 border-amber-200",
  LOGOUT: "bg-amber-50 text-amber-700 border-amber-200",
  PASSWORD_CHANGED: "bg-amber-50 text-amber-700 border-amber-200",
  PIN_CHANGED: "bg-amber-50 text-amber-700 border-amber-200",
};

const ROW_BORDER_COLORS = {
  PRODUCT_CREATED: "border-l-green-500",
  CATEGORY_CREATED: "border-l-green-500",
  INGREDIENT_CREATED: "border-l-green-500",
  STAFF_CREATED: "border-l-green-500",
  ORDER_CREATED: "border-l-green-500",
  LOGIN_SUCCESS: "border-l-green-500",
  OTP_VERIFIED: "border-l-green-500",
  PRODUCT_ACTIVATED: "border-l-green-500",
  STAFF_ACTIVATED: "border-l-green-500",
  INGREDIENT_RESTORED: "border-l-green-500",

  PRODUCT_DELETED: "border-l-red-500",
  CATEGORY_DELETED: "border-l-red-500",
  INGREDIENT_DELETED: "border-l-red-500",
  STAFF_DELETED: "border-l-red-500",
  LOGIN_FAILED: "border-l-red-500",
  ORDER_CANCELLED: "border-l-red-500",
  ORDER_DELETED: "border-l-red-500",

  PRODUCT_UPDATED: "border-l-blue-500",
  CATEGORY_UPDATED: "border-l-blue-500",
  INGREDIENT_UPDATED: "border-l-blue-500",
  STAFF_UPDATED: "border-l-blue-500",
  PRODUCT_VARIANTS_UPDATED: "border-l-blue-500",
  PRODUCT_DEACTIVATED: "border-l-blue-500",
  INGREDIENT_ARCHIVED: "border-l-blue-500",
  ORDER_ACCEPTED: "border-l-blue-500",
  ORDER_COMPLETED: "border-l-blue-500",
  SETTINGS_UPDATED: "border-l-blue-500",
  FORECAST_RUN: "border-l-blue-500",
  MBA_RUN: "border-l-blue-500",

  STAFF_PIN_RESET: "border-l-amber-500",
  STAFF_PASSWORD_RESET: "border-l-amber-500",
  STOCK_RESTOCKED: "border-l-amber-500",
  STOCK_LOSS_DECLARED: "border-l-amber-500",
  LOGOUT: "border-l-amber-500",
  PASSWORD_CHANGED: "border-l-amber-500",
  PIN_CHANGED: "border-l-amber-500",
};

function formatAction(action) {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDescription(log) {
  const d = log.details || {};
  const name = d.name || "";
  const email = d.email || "";
  const total = d.total != null ? `\u20B1${Number(d.total).toLocaleString()}` : "";
  const source = d.source || "";
  const reason = d.reason || "";
  const fields = d.fields || [];
  const role = d.role || "";
  const unit = d.unit || "";
  const quantity = d.quantity != null ? String(d.quantity) : "";
  const quantityLost = d.quantity_lost != null ? String(d.quantity_lost) : "";
  const lossType = d.loss_type || "";
  const costPerUnit = d.cost_per_unit != null ? `\u20B1${d.cost_per_unit}` : "";
  const userId = d.userId || "";

  switch (log.action) {
    case "CATEGORY_CREATED": return `Created "${name}"`;
    case "CATEGORY_UPDATED": return `Updated "${name}"`;
    case "CATEGORY_DELETED": return `Deleted "${name}"`;

    case "PRODUCT_CREATED": return `Created "${name}"`;
    case "PRODUCT_UPDATED": return `Updated "${name}"`;
    case "PRODUCT_VARIANTS_UPDATED": return `Updated "${name}" variants${fields.length ? ` (${fields.join(", ")})` : ""}`;
    case "PRODUCT_ACTIVATED": return `Activated "${name}"`;
    case "PRODUCT_DEACTIVATED": return `Deactivated "${name}"`;
    case "PRODUCT_DELETED": return `Deleted "${name}"`;

    case "INGREDIENT_CREATED": return `Created "${name}"${unit ? ` (${unit})` : ""}`;
    case "INGREDIENT_UPDATED": return `Updated "${name}"${fields.length ? ` (${fields.join(", ")})` : ""}`;
    case "INGREDIENT_ARCHIVED": return `Archived "${name}"`;
    case "INGREDIENT_RESTORED": return `Restored "${name}"`;
    case "INGREDIENT_DELETED": return `Deleted "${name}"`;
    case "STOCK_RESTOCKED": return `Restocked "${name}" \u2014 ${quantity} ${unit}${costPerUnit ? ` @ ${costPerUnit}/unit` : ""}`;
    case "STOCK_LOSS_DECLARED": return `Loss: "${name}" \u2014 ${quantityLost} ${unit}${lossType ? ` (${lossType})` : ""}`;

    case "STAFF_CREATED": return `Created ${name}${role ? ` (${role})` : ""}`;
    case "STAFF_UPDATED": return `Updated ${name}${fields.length ? ` (${fields.join(", ")})` : ""}`;
    case "STAFF_ACTIVATED": return `Activated ${name}`;
    case "STAFF_DEACTIVATED": return `Deactivated ${name}`;
    case "STAFF_PIN_RESET": return `Reset PIN for ${name}`;
    case "STAFF_PASSWORD_RESET": return `Reset password for ${name}`;
    case "STAFF_DELETED": return `Deleted ${name}`;

    case "LOGIN_SUCCESS": return `Logged in${role ? ` (${role})` : ""}`;
    case "LOGIN_FAILED": return `Failed login attempt${email ? ` \u2014 ${email}` : ""}${userId ? ` \u2014 User ${userId.slice(0, 8)}` : ""}${reason ? ` (${reason})` : ""}`;
    case "LOGOUT": return "Logged out";
    case "OTP_VERIFIED": return "OTP verified";
    case "PIN_CHANGED": return "PIN changed";
    case "PASSWORD_CHANGED": return "Password changed";

    case "ORDER_CREATED": return `Created order${total ? ` \u00B7 ${total}` : ""}${source ? ` \u00B7 ${source}` : ""}`;
    case "ORDER_ACCEPTED": return `Accepted order${total ? ` \u00B7 ${total}` : ""}${source ? ` \u00B7 ${source}` : ""}`;
    case "ORDER_COMPLETED": return `Completed order${total ? ` \u00B7 ${total}` : ""}`;
    case "ORDER_CANCELLED": return `Cancelled order${reason ? ` \u2014 ${reason}` : ""}`;
    case "ORDER_DELETED": return `Deleted order${total ? ` \u00B7 ${total}` : ""}`;

    case "SETTINGS_UPDATED": return `Updated settings${fields.length ? ` (${fields.join(", ")})` : ""}`;
    case "FORECAST_RUN": return "Ran demand forecast";
    case "MBA_RUN": return "Ran market basket analysis";

    default: return formatAction(log.action);
  }
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const resolvedActions = useMemo(() => ACTION_GROUP_MAP[actionFilter] || [], [actionFilter]);
  const queryParams = useMemo(() => ({
    page,
    limit,
    ...(search && { search }),
    ...(resolvedActions.length === 1 && { action: resolvedActions[0] }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  }), [page, limit, search, resolvedActions, startDate, endDate]);

  const { data, isLoading } = useAuditLogs(queryParams);
  const logs = data?.logs || [];
  const pagination = data?.pagination || { page: 1, limit: 50, totalItems: 0, totalPages: 0 };

  const filteredLogs = resolvedActions.length > 1
    ? logs.filter((log) => resolvedActions.includes(log.action))
    : logs;

  const grouped = useMemo(() => {
    const groups = [];
    let currentDate = null;
    for (const log of filteredLogs) {
      const dateKey = new Date(log.createdAt).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "Asia/Manila",
      });
      if (dateKey !== currentDate) {
        currentDate = dateKey;
        groups.push({ type: "date", date: dateKey, key: dateKey });
      }
      groups.push({ type: "log", log, key: log.id });
    }
    return groups;
  }, [filteredLogs]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <div className="w-64">
          <SearchBar
            value={search}
            onChange={(val) => { setSearch(val); setPage(1); }}
            placeholder="Search actions, targets..."
          />
        </div>
        <div className="w-44">
          <DropDown
            options={ACTION_GROUPS}
            value={actionFilter}
            onChange={(val) => { setActionFilter(val); setPage(1); }}
            size="sm"
            placeholder="All Actions"
          />
        </div>
        <DateRangeFilter
          dateFrom={startDate || null}
          dateTo={endDate || null}
          onDateChange={(from, to) => {
            setStartDate(from || "");
            setEndDate(to || "");
            setPage(1);
          }}
        />
      </div>

      <div className="flex flex-col border border-border rounded-xl overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-16 text-center">
              <Icon name="search" size={40} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No audit logs found</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="py-2.5 pl-4 pr-3 w-[100px]">Time</th>
                  <th className="py-2.5 pr-3">User</th>
                  <th className="py-2.5 pr-3 w-[160px]">Action</th>
                  <th className="py-2.5 pr-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((item) => {
                  if (item.type === "date") {
                    return (
                      <tr key={item.key} className="border-b border-border">
                        <td
                          colSpan={4}
                          className="border-l-[3px] border-l-transparent bg-muted/30 px-4 py-1.5 text-xs font-semibold text-muted-foreground"
                        >
                          {item.date}
                        </td>
                      </tr>
                    );
                  }

                  const log = item.log;
                  const borderClass = ROW_BORDER_COLORS[log.action] || "border-l-muted-foreground/20";
                  const badgeClass = BADGE_STYLES[log.action] || "bg-muted text-muted-foreground border-border";

                  return (
                    <tr
                      key={item.key}
                      className={`border-b border-border last:border-0 border-l-[3px] ${borderClass} hover:bg-muted/30 transition-colors`}
                    >
                      <td className="py-2.5 pl-4 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="py-2.5 pr-3">
                        {log.user ? (
                          <span className="text-sm">
                            <span className="font-medium text-foreground">{log.user.name}</span>
                            <span className="ml-1 text-xs text-muted-foreground capitalize">({log.user.role})</span>
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">System</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-sm text-muted-foreground">
                        {formatDescription(log)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
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
    </div>
  );
}
