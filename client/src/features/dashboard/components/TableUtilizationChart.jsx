import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

function TableUtilizationChart({ data, isLoading }) {
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
          <Icon name="layoutGrid" size={28} className="text-muted-foreground/30" />
          <p className="font-medium">No table data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Table Utilization</h3>
      </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 15, left: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="table"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              width={70}
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
            <Bar dataKey="orders" fill="var(--color-chart-3)" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default React.memo(TableUtilizationChart);
