import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * StockVsForecastChart — grouped bar chart of current stock vs forecasted weekly usage.
 *
 * @param {Object} props
 * @param {Array} props.data - [{ name, stock, weeklyUsage, daysCovered, unit }]
 * @param {boolean} props.isLoading
 */
function StockVsForecastChart({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="p-4">
          <Skeleton className="h-[250px] w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="barChart2" size={32} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No forecast data</p>
          <p className="max-w-sm text-center text-xs">
            Run a demand forecast to see stock vs usage projections.
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.slice(0, 12).map((d) => ({
    name: d.name.length > 15 ? d.name.slice(0, 15) + "…" : d.name,
    fullName: d.name,
    stock: d.stock,
    weeklyUsage: d.weeklyUsage,
    daysCovered: d.daysCovered,
    unit: d.unit,
  }));

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Stock vs Forecasted Usage</h3>
      </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
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
                const label = name === "stock" ? "Current Stock" : "Weekly Usage";
                const item = chartData.find((d) => d[name] === value);
                return [`${value} ${item?.unit || ""}`, label];
              }}
              labelFormatter={(label) => {
                const item = chartData.find((d) => d.name === label);
                return item?.fullName || label;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", color: "var(--color-muted-foreground)" }}
            />
            <Bar dataKey="stock" name="Current Stock" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="weeklyUsage" name="Weekly Usage" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default React.memo(StockVsForecastChart);
