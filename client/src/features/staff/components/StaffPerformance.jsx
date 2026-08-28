import { useState } from "react";
import { useStaffPerformance } from "../query";
import { ROLE_CONFIG } from "../staffValidation";
import { formatDate } from "@/lib/date";
import { DropDown } from "@/components/filters/DropDown";
import DateRangeFilter from "@/components/filters/DateRangeFilter";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import Icon from "@/components/ui/icon";

/**
 * StaffPerformance
 *
 * Comparative analytics view showing staff metrics.
 * Filters: date range, role.
 */
export default function StaffPerformance() {
  const [roleFilter, setRoleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryParams = {
    role: roleFilter,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data, isLoading } = useStaffPerformance(queryParams);
  const performance = data?.data?.performance ?? [];

  // Group by role
  const grouped = {};
  for (const p of performance) {
    if (!grouped[p.role]) grouped[p.role] = [];
    grouped[p.role].push(p);
  }

  const ROLE_FILTER_OPTIONS = [
    { value: "all", label: "All Roles" },
    { value: "cashier", label: "Cashier" },
    { value: "kitchen", label: "Kitchen" },
    { value: "admin", label: "Admin" },
  ];

  const roleOrder = ["admin", "cashier", "kitchen"];

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <DropDown
          options={ROLE_FILTER_OPTIONS}
          value={roleFilter}
          onChange={setRoleFilter}
          placeholder="All Roles"
          size="sm"
        />

        <DateRangeFilter
          dateFrom={dateFrom || null}
          dateTo={dateTo || null}
          onDateChange={(from, to) => {
            setDateFrom(from || "");
            setDateTo(to || "");
          }}
        />

        {(dateFrom || dateTo || roleFilter !== "all") && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setRoleFilter("all");
            }}
            className="text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Performance by Role */}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8">
          <div className="flex flex-col items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-3 text-sm text-muted-foreground">Loading performance data...</p>
          </div>
        </div>
      ) : performance.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Icon name="users" size={48} className="mx-auto text-muted-foreground/30" />
          <p className="mt-4 text-sm font-medium text-muted-foreground">No staff data available</p>
        </div>
      ) : (
        roleOrder
          .filter((role) => grouped[role]?.length > 0)
          .map((role) => {
            const config = ROLE_CONFIG[role];
            const members = grouped[role];

            return (
              <div key={role} className="rounded-xl border border-border bg-card">
                {/* Role Header */}
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Badge variant={config.variant}>{config.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {members.length} member{members.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Performance Table */}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Name</TableHead>
                      <TableHead className="text-center">Created</TableHead>
                      <TableHead className="text-center">Accepted</TableHead>
                      <TableHead className="text-center">Processed</TableHead>
                      <TableHead className="text-center">Completed</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-center">Restocks</TableHead>
                      <TableHead className="text-center">Losses</TableHead>
                      <TableHead className="text-center">Avg Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.user_id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{m.name}</p>
                            <p className="text-xs text-muted-foreground">{m.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {m.orders_created}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {m.orders_accepted}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {m.orders_processed}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {m.orders_completed}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          ₱{Number(m.total_revenue).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {m.restocks_done}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {m.losses_declared}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {m.avg_completion_minutes != null
                            ? `${m.avg_completion_minutes} min`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })
      )}
    </div>
  );
}
