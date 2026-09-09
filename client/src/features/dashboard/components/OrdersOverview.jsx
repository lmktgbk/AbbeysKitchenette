import React, { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_COLORS = {
  pending: "#f59e0b",
  accepted: "#3b82f6",
  preparing: "#f97316",
  completed: "#22c55e",
  cancelled: "#ef4444",
};

const STATUS_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * OrdersOverview — side-by-side order status donut + order source bar chart.
 *
 * @param {Object} props
 * @param {object} props.statusData - { pending, accepted, preparing, completed, cancelled }
 * @param {Array} props.sourceData - [{ source, count }]
 * @param {boolean} props.isLoading
 */
function OrdersOverview({ statusData, sourceData, isLoading }) {
  const pieData = useMemo(() => {
    if (!statusData) return [];
    return Object.entries(statusData)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: STATUS_COLORS[status] || "#888",
      }));
  }, [statusData]);

  const barData = useMemo(() => {
    if (!sourceData?.length) return [];
    return sourceData.map((d) => ({
      name: d.source === "walk_in" ? "Walk-in" : "Online",
      count: d.count,
    }));
  }, [sourceData]);

  if (isLoading) {
    return (
      <>
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex items-center justify-center p-6">
            <Skeleton className="h-[200px] w-[200px] rounded-full" />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="p-6">
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Order Status Donut */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Order Status</h3>
        </div>
        {pieData.length === 0 ? (
          <div className="flex h-[252px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Icon name="receipt" size={32} className="text-muted-foreground/30" />
            <p className="font-medium text-foreground/70">No orders</p>
          </div>
        ) : (
          <div className="flex items-center gap-4 p-4">
            <ResponsiveContainer width="50%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "var(--color-foreground)",
                  }}
                  formatter={(value) => [value, "Orders"]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-1.5 text-xs">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground">{entry.name}</span>
                  <span className="font-semibold text-foreground ml-auto">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Order Source Bar */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Orders by Source</h3>
        </div>
        {barData.length === 0 ? (
          <div className="flex h-[252px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Icon name="barChart2" size={32} className="text-muted-foreground/30" />
            <p className="font-medium text-foreground/70">No data</p>
          </div>
        ) : (
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
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
                  formatter={(value) => [value, "Orders"]}
                />
                <Bar dataKey="count" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </>
  );
}

export default React.memo(OrdersOverview);
