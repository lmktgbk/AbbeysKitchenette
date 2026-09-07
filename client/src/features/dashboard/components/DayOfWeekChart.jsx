import React, { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayOfWeekChart({ data, isLoading }) {
  const chartData = useMemo(() => {
    if (!data?.length) return [];
    return DAY_ORDER.map((name) => {
      const found = data.find((d) => d.dayName === name);
      return {
        day: name,
        orders: found?.orders || 0,
        revenue: found?.revenue || 0,
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="p-4">
          <Skeleton className="h-[220px] w-full" />
        </div>
      </div>
    );
  }

  if (!chartData.length || chartData.every((d) => d.orders === 0)) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="calendar" size={28} className="text-muted-foreground/30" />
          <p className="font-medium">No day-of-week data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Day of Week</h3>
      </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="day"
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
            />
            <Bar dataKey="orders" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default React.memo(DayOfWeekChart);
