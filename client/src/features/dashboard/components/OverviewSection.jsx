import React, { useMemo } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import RevenueChart from "./RevenueChart";

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

const STOCK_COLORS = {
  healthy: "#22c55e",
  low: "#f59e0b",
  out: "#ef4444",
};

const STOCK_LABELS = {
  healthy: "Healthy",
  low: "Low Stock",
  out: "Out",
};

function OverviewSection({ data, isLoading }) {
  const d = data;

  const orderPieData = useMemo(() => {
    if (!d?.ordersByStatus) return [];
    return Object.entries(d.ordersByStatus)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        color: STATUS_COLORS[status] || "#6b7280",
      }));
  }, [d?.ordersByStatus]);

  const stockPieData = useMemo(() => {
    if (!d?.ingredientStatus) return [];
    return Object.entries(STOCK_COLORS)
      .filter(([key]) => (d.ingredientStatus[key] || 0) > 0)
      .map(([key, color]) => ({
        name: STOCK_LABELS[key],
        value: d.ingredientStatus[key],
        color,
      }));
  }, [d?.ingredientStatus]);

  const top5Products = useMemo(() => {
    if (!d?.topProducts) return [];
    return d.topProducts.slice(0, 5);
  }, [d?.topProducts]);

  const least5Products = useMemo(() => {
    if (!d?.topProducts) return [];
    return [...d.topProducts].reverse().slice(0, 5);
  }, [d?.topProducts]);

  const top3Staff = useMemo(() => {
    if (!d?.staffPerformance) return [];
    return d.staffPerformance.slice(0, 3);
  }, [d?.staffPerformance]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-[250px] w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-[200px] rounded-lg" />
          <Skeleton className="h-[200px] rounded-lg" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-[180px] rounded-lg" />
          <Skeleton className="h-[180px] rounded-lg" />
          <Skeleton className="h-[180px] rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RevenueChart data={d?.revenueTrend} isLoading={false} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Top 5 Most Sold</h3>
          </div>
          <div className="p-3">
            {top5Products.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No data</p>
            ) : (
              <div className="space-y-1.5">
                {top5Products.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      <span className="text-xs font-medium text-foreground truncate">{p.productName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-muted-foreground">{p.unitsSold} units</span>
                      <span className="text-xs font-semibold text-foreground">₱{Number(p.revenue || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Top 5 Least Sold</h3>
          </div>
          <div className="p-3">
            {least5Products.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No data</p>
            ) : (
              <div className="space-y-1.5">
                {least5Products.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                      <span className="text-xs font-medium text-foreground truncate">{p.productName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-muted-foreground">{p.unitsSold} units</span>
                      <span className="text-xs font-semibold text-foreground">₱{Number(p.revenue || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Order Status</h3>
          </div>
          <div className="flex items-center justify-center p-4">
            {orderPieData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie
                      data={orderPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {orderPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        return (
                          <div className="rounded-md border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
                            <span className="font-medium">{payload[0].name}: {payload[0].value}</span>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1">
                  {orderPieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-semibold text-foreground ml-auto">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Stock Status</h3>
          </div>
          <div className="flex items-center justify-center p-4">
            {stockPieData.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie
                      data={stockPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {stockPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        return (
                          <div className="rounded-md border border-border bg-card px-3 py-1.5 text-xs shadow-sm">
                            <span className="font-medium">{payload[0].name}: {payload[0].value}</span>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1">
                  {stockPieData.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-muted-foreground">{entry.name}</span>
                      <span className="font-semibold text-foreground ml-auto">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Fulfillment Time</h3>
          </div>
          <div className="p-4">
            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-bold text-foreground">
                {d?.fulfillmentTime?.avgMinutes || 0}
              </span>
              <span className="text-sm text-muted-foreground mb-1">min avg</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Median</span>
                <span className="font-semibold text-foreground">{d?.fulfillmentTime?.medianMinutes || 0} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Orders</span>
                <span className="font-semibold text-foreground">{d?.fulfillmentTime?.count || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Top Staff</h3>
        </div>
        <div className="p-3">
          {top3Staff.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No data</p>
          ) : (
            <div className="flex gap-3">
              {top3Staff.map((s, i) => (
                <div key={i} className="flex-1 rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                    <span className="text-sm font-semibold text-foreground">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary capitalize">
                      {s.role}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.orders} orders</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-foreground">₱{Number(s.revenue || 0).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(OverviewSection);
