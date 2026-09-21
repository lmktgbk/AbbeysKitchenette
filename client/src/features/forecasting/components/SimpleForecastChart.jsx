import React, { useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

function formatDayLabel(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
}

export default function SimpleForecastChart({ results, isLoading }) {
  const chartData = useMemo(() => {
    if (!results?.length) return [];
    const map = new Map();
    for (const v of results) {
      for (const day of v.daily_data) {
        const cur = map.get(day.date) || { date: day.date, units: 0, revenue: 0 };
        cur.units += day.units;
        cur.revenue += day.revenue;
        map.set(day.date, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
  }, [results]);

  const totals = useMemo(() => {
    return chartData.reduce((acc, d) => ({ units: acc.units + d.units, revenue: acc.revenue + d.revenue }), { units: 0, revenue: 0 });
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="h-[300px] animate-pulse bg-muted rounded-lg" />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No forecast data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">7-Day Plan</h3>
        <p className="text-xs text-muted-foreground">How many to prepare each day — bars show servings, line shows expected sales</p>
      </div>
      <div className="px-4 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={formatDayLabel}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v) => `${v}`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              tickFormatter={(v) => `₱${v.toLocaleString()}`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "12px" }}
              formatter={(value, name) => {
                if (name === "units") return [`${value} servings`, "To Prepare"];
                return [`₱${Number(value).toLocaleString()}`, "Expected Sales"];
              }}
              labelFormatter={formatDayLabel}
            />
            <Legend verticalAlign="top" height={24} iconType="rect" wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="units" name="To Prepare" fill="var(--color-primary)" radius={[4, 4, 0, 0]} barSize={22} />
            <Line yAxisId="right" type="monotone" dataKey="revenue" name="Expected Sales" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: "#f59e0b", stroke: "var(--color-card)", strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Total next 7 days: {totals.units.toLocaleString()} servings · ₱{totals.revenue.toLocaleString()} sales
        </p>
      </div>
    </div>
  );
}
