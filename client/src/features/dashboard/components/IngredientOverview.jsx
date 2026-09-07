import React, { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_CONFIG = {
  healthy: { label: "Healthy", color: "#22c55e" },
  low: { label: "Low Stock", color: "#f59e0b" },
  out: { label: "Out of Stock", color: "#ef4444" },
};

/**
 * IngredientOverview — side-by-side stock status donut + low stock alerts list.
 *
 * @param {Object} props
 * @param {object} props.statusData - { total, healthy, low, out }
 * @param {Array} props.lowStockData - [{ name, stock, threshold, unit }]
 * @param {boolean} props.isLoading
 */
function IngredientOverview({ statusData, lowStockData, isLoading }) {
  const pieData = useMemo(() => {
    if (!statusData) return [];
    return Object.entries(STATUS_CONFIG)
      .filter(([key]) => (statusData[key] || 0) > 0)
      .map(([key, config]) => ({
        name: config.label,
        value: statusData[key],
        color: config.color,
      }));
  }, [statusData]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Stock Status Donut */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Stock Status</h3>
        </div>
        {pieData.length === 0 ? (
          <div className="flex h-[252px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Icon name="warehouse" size={32} className="text-muted-foreground/30" />
            <p className="font-medium text-foreground/70">No ingredients</p>
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
                  formatter={(value) => [value, "Ingredients"]}
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

      {/* Low Stock Alerts */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Low Stock Alerts</h3>
        </div>
        {!lowStockData?.length ? (
          <div className="flex h-[252px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Icon name="checkCircle" size={32} className="text-green-500/50" />
            <p className="font-medium text-foreground/70">All stocked up</p>
            <p className="max-w-sm text-center text-xs">
              All ingredients are above their minimum threshold.
            </p>
          </div>
        ) : (
          <div className="max-h-[252px] overflow-y-auto p-2">
            {lowStockData.map((item) => {
              const isOut = item.stock <= 0;
              return (
                <div
                  key={item.name}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      isOut
                        ? "bg-red-100 dark:bg-red-900/30"
                        : "bg-yellow-100 dark:bg-yellow-900/30"
                    }`}
                  >
                    <Icon
                      name={isOut ? "alertCircle" : "alertTriangle"}
                      size={16}
                      className={isOut ? "text-red-600 dark:text-red-400" : "text-yellow-600 dark:text-yellow-400"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isOut ? "Out of stock" : `${item.stock} ${item.unit} remaining`}
                      {" · "}
                      Threshold: {item.threshold} {item.unit}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isOut
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    }`}
                  >
                    {isOut ? "Out" : "Low"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(IngredientOverview);
