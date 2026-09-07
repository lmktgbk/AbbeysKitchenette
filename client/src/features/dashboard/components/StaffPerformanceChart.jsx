import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

function StaffPerformanceChart({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-4">
          <Skeleton className="h-[220px] w-full" />
        </div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="users" size={28} className="text-muted-foreground/30" />
          <p className="font-medium">No staff data</p>
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.name.length > 12 ? d.name.slice(0, 12) + "…" : d.name,
    fullName: d.name,
    role: d.role,
    orders: d.orders,
    revenue: d.revenue,
  }));

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Staff Performance</h3>
      </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--color-foreground)",
              }}
              formatter={(value, name) => {
                if (name === "orders") return [value, "Orders"];
                return [`₱${Number(value).toLocaleString()}`, "Revenue"];
              }}
              labelFormatter={(label) => {
                const item = chartData.find((d) => d.name === label);
                return item ? `${item.fullName} (${item.role})` : label;
              }}
            />
            <Bar dataKey="orders" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default React.memo(StaffPerformanceChart);
