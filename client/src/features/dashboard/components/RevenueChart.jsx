import React, { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * RevenueChart — daily revenue area chart with gradient fill.
 *
 * @param {Object} props
 * @param {Array} props.data - [{ date, revenue, orders }]
 * @param {boolean} props.isLoading
 */
function RevenueChart({ data, isLoading }) {
  const totals = useMemo(() => {
    if (!data?.length) return { revenue: 0, orders: 0 };
    return data.reduce(
      (acc, d) => ({ revenue: acc.revenue + d.revenue, orders: acc.orders + d.orders }),
      { revenue: 0, orders: 0 }
    );
  }, [data]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="px-4 pt-3 pb-4">
          <Skeleton className="h-[300px] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="barChart2" size={32} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No revenue data</p>
          <p className="max-w-sm text-center text-xs">
            No completed orders found for the selected period.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Revenue Trend</h3>
        <span className="text-xs font-medium text-muted-foreground">
          ₱{totals.revenue.toLocaleString()} total
        </span>
      </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" style={{ stopColor: "var(--color-primary)" }} stopOpacity={0.35} />
                <stop offset="95%" style={{ stopColor: "var(--color-primary)" }} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v) => {
                const d = new Date(v + "T00:00:00");
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v) => `₱${v.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--color-foreground)",
              }}
              formatter={(value) => [`₱${Number(value).toLocaleString()}`, "Revenue"]}
              labelFormatter={(label) => {
                const d = new Date(label + "T00:00:00");
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#colorRevenue)"
              dot={false}
              activeDot={{ r: 4, fill: "var(--color-primary)", stroke: "var(--color-card)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default React.memo(RevenueChart);
