import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * IngredientCostChart — bar chart of top ingredients by cost.
 *
 * @param {Object} props
 * @param {Array} props.data - [{ name, totalCost, unit }]
 * @param {boolean} props.isLoading
 */
function IngredientCostChart({ data, isLoading }) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
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
          <Icon name="dollarSign" size={32} className="text-muted-foreground/30" />
          <p className="font-medium text-foreground/70">No cost data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Ingredient Costs</h3>
      </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
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
              formatter={(value) => [`₱${Number(value).toLocaleString()}`, "Total Cost"]}
            />
            <Bar dataKey="totalCost" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default React.memo(IngredientCostChart);
