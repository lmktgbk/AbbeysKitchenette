import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * TopProductsChart — horizontal bar chart of top selling products.
 *
 * @param {Object} props
 * @param {Array} props.data - [{ productName, unitsSold, revenue }]
 * @param {boolean} props.isLoading
 */
function TopProductsChart({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="p-4">
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
          <p className="font-medium text-foreground/70">No product data</p>
          <p className="max-w-sm text-center text-xs">
            No completed orders found for the selected period.
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.productName.length > 20 ? d.productName.slice(0, 20) + "…" : d.productName,
    fullName: d.productName,
    revenue: d.revenue,
    units: d.unitsSold,
  }));

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Top Selling Products</h3>
      </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36 + 20)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v) => `₱${v.toLocaleString()}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              width={140}
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
                if (name === "revenue") return [`₱${Number(value).toLocaleString()}`, "Revenue"];
                return [value, "Units Sold"];
              }}
              labelFormatter={(label) => {
                const item = chartData.find((d) => d.name === label);
                return item?.fullName || label;
              }}
            />
            <Bar dataKey="revenue" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default React.memo(TopProductsChart);
