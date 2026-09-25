import React, { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatPeso } from "../utils/dashboardUtils";

const GRANULARITY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function RevenueChart({ data, isLoading, granularity = "daily", onGranularityChange }) {
  const totals = useMemo(() => {
    if (!data?.length) return { revenue: 0, gross: 0, profit: 0, orders: 0 };
    return data.reduce(
      (acc, d) => ({ revenue: acc.revenue + Number(d.revenue || 0), gross: acc.gross + Number(d.gross || 0), profit: acc.profit + Number(d.profit || 0), orders: acc.orders + d.orders }),
      { revenue: 0, gross: 0, profit: 0, orders: 0 }
    );
  }, [data]);

  const formatTick = (v) => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    if (granularity === "monthly") {
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
    if (granularity === "weekly") {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatTooltipLabel = (v) => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return "";
    if (granularity === "monthly") {
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (granularity === "weekly") {
      return `Week of ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="px-4 pt-3 pb-4">
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
          <p className="font-medium text-foreground/70">No revenue data</p>
          <p className="max-w-sm text-center text-xs">
            No completed orders found for the selected period.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Revenue Trend</h3>
          {totals.gross > 0 && (
            <p className="text-xs text-muted-foreground">
              Gross {formatPeso(totals.gross)} · <span className="text-amber-600 font-medium">Gross Profit {formatPeso(totals.profit)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-md border border-border bg-muted p-0.5">
            {GRANULARITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onGranularityChange?.(opt.value)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-[5px] transition-colors",
                  granularity === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="relative">
        <div className="absolute top-2 right-4 z-10 hidden sm:flex items-center gap-3 text-xs bg-card/80 backdrop-blur px-2 py-1 rounded-md border border-border">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" /> Gross</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Gross Profit</span>
        </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" style={{ stopColor: "var(--color-primary)" }} stopOpacity={0.35} />
                <stop offset="95%" style={{ stopColor: "var(--color-primary)" }} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" style={{ stopColor: "#f59e0b" }} stopOpacity={0.25} />
                <stop offset="95%" style={{ stopColor: "#f59e0b" }} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={formatTick}
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
              formatter={(value, name) => [`₱${Number(value).toLocaleString()}`, name === "Gross" ? "Gross" : "Gross Profit"]}
              labelFormatter={formatTooltipLabel}
            />
            <Area type="monotone" dataKey="gross" name="Gross" stroke="var(--color-primary)" strokeWidth={2} fill="url(#colorGross)" dot={{ r: 3, fill: "var(--color-primary)", stroke: "var(--color-card)", strokeWidth: 1.5 }} activeDot={{ r: 5, fill: "var(--color-primary)", stroke: "var(--color-card)", strokeWidth: 2 }} />
            <Area type="monotone" dataKey="profit" name="Gross Profit" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 4" fill="url(#colorProfit)" dot={{ r: 3, fill: "#f59e0b", stroke: "var(--color-card)", strokeWidth: 1.5 }} activeDot={{ r: 5, fill: "#f59e0b", stroke: "var(--color-card)", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default React.memo(RevenueChart);
