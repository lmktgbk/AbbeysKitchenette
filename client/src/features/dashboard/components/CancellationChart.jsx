import React, { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "#f97316",
];

function CancellationChart({ data, isLoading }) {
  const pieData = useMemo(() => {
    if (!data?.length) return [];
    return data.map((d, i) => ({
      name: d.reason,
      value: d.count,
      color: COLORS[i % COLORS.length],
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex items-center justify-center p-6">
          <Skeleton className="h-[180px] w-[180px] rounded-full" />
        </div>
      </div>
    );
  }

  if (!pieData.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex h-[230px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          <Icon name="checkCircle" size={28} className="text-emerald-500/50" />
          <p className="font-medium">No cancellations</p>
          <p className="text-xs">No orders were cancelled in this period.</p>
        </div>
      </div>
    );
  }

  const total = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Cancellation Reasons</h3>
      </div>
      <div className="flex items-center gap-4 p-4">
        <ResponsiveContainer width="45%" height={180}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={70}
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
              formatter={(value) => [`${value} (${Math.round((value / total) * 100)}%)`, "Orders"]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-1.5 text-xs flex-1">
          {pieData.map((entry) => (
            <div key={entry.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-muted-foreground truncate flex-1">{entry.name}</span>
              <span className="font-semibold text-foreground">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default React.memo(CancellationChart);
